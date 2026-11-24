import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'
import placeholder from '../../public/placeholder.svg?raw'

const MiB = 1024 * 1024
const mediaPath = /^\/sigil\/media\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/
const placeholderData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(placeholder)
const placeholderSize = new TextEncoder().encode(placeholder).length

function sameOriginUrl(src: string, origin: string): URL | undefined {
  if (
    (!src.startsWith('/') && !/^https?:\/\//i.test(src)) ||
    src.startsWith('//') ||
    src.includes('\\')
  )
    return
  try {
    const url = new URL(src, origin)
    if (url.origin === origin && !url.username && !url.password) return url
  } catch {
    // User-entered URLs remain part of the document.
  }
}

async function readImage(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new Error('Missing image body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  function cancel(): void {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    for (;;) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Image exceeds download limit')
      chunks.push(value)
    }
    if (!size) throw new Error('Empty image')
  } catch (error) {
    cancel()
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function imageType(bytes: Uint8Array): string | undefined {
  const prefix = String.fromCharCode(...bytes.subarray(0, 12))
  if (prefix.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png'
  if (prefix.startsWith('\xff\xd8\xff')) return 'image/jpeg'
  if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return 'image/webp'
}

async function loadImage(url: string, limit: number, signal: AbortSignal, request: typeof fetch) {
  const response = await request(url, {
    mode: 'same-origin',
    credentials: 'omit',
    redirect: 'error',
    signal,
  })
  const mime = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (
    response.status !== 200 ||
    response.redirected ||
    (response.url && response.url !== url) ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
    Number(response.headers.get('Content-Length')) > limit
  ) {
    await response.body?.cancel()
    throw new Error('Invalid image response')
  }
  const bytes = await readImage(response, limit, signal)
  if (imageType(bytes) !== mime) throw new Error('Image type mismatch')
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
  bitmap.close()
  signal.throwIfAborted()
  const parts: string[] = []
  // Whole groups of three keep separately encoded chunks free of intermediate padding.
  for (let pos = 0; pos < bytes.length; pos += 24576)
    parts.push(btoa(String.fromCharCode(...bytes.subarray(pos, pos + 24576))))
  return { data: `data:${mime};base64,${parts.join('')}`, size: bytes.length }
}

export function createActivityDownload(options: {
  origin: string
  coverUrl: string
  laravelMedia?: boolean
  fetch?: typeof fetch
}) {
  const origin = new URL(options.origin).origin
  const cover = sameOriginUrl(options.coverUrl, origin)?.href
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)

  return async (doc: SigilDoc, signal: AbortSignal): Promise<SigilDoc> => {
    signal.throwIfAborted()
    const prepared = structuredClone(doc)
    const sources = new Map<string, ComponentNode[]>()
    let remaining = 16 * MiB
    function collect(node: ComponentNode): void {
      if (node.tagName === 'hr' || node.tagName === 'br') return
      if ((node.tagName ?? (node.type === 'image' ? 'img' : '')) === 'img') {
        const url = sameOriginUrl(node.attributes?.src ?? '', origin)
        if (!url) return
        const managed = options.laravelMedia && !url.search && !url.hash
        if (managed && url.pathname === '/placeholder.svg') {
          remaining -= placeholderSize
          if (remaining < 0) throw new Error('Image budget exhausted')
          node.attributes!.src = placeholderData
        } else if (url.href === cover || (managed && mediaPath.test(url.pathname))) {
          const references = sources.get(url.href)
          if (references) references.push(node)
          else sources.set(url.href, [node])
        }
        return
      }
      for (const child of node.children ?? []) collect(child)
    }
    collect(prepared.root)
    for (const [url, nodes] of sources) {
      signal.throwIfAborted()
      const limit = Math.min(4 * MiB, Math.floor(remaining / nodes.length))
      if (limit < 1) throw new Error('Image budget exhausted')
      const image = await loadImage(url, limit, signal, request)
      remaining -= image.size * nodes.length
      for (const node of nodes) node.attributes!.src = image.data
    }
    return prepared
  }
}
