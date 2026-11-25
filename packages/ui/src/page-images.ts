import type { AssetItem, ComponentNode, RichTextResolver } from '@cluion/sigil-core'
import { documentTag, hasDocumentChildren } from './component-path.js'
import { attribute } from './link-destination.js'

export interface PageImage extends AssetItem {
  uses: number
  searchTerms: readonly string[]
}

function filename(src: string): string {
  if (/^\s*(?:data|blob):/i.test(src)) return ''
  let basename: string
  try {
    const { pathname } = new URL(src, 'https://example.invalid/')
    basename = pathname.slice(pathname.lastIndexOf('/') + 1)
  } catch {
    return ''
  }
  try {
    return decodeURIComponent(basename)
  } catch {
    return basename
  }
}

/** Collect native image sources in document order, retaining names from every use. */
export function collectPageImages(
  root: ComponentNode,
  richText?: Pick<RichTextResolver, 'supports'>,
): PageImage[] {
  const sources = new Map<string, { id: string; name: string; uses: number; terms: Set<string> }>()
  function visit(node: ComponentNode): void {
    if (
      node.shortcode ||
      node.type === 'shortcode' ||
      node.type === 'rich-text' ||
      richText?.supports(node)
    )
      return
    const tag = documentTag(node)
    if (tag === 'img') {
      const src = attribute(node, 'src')
      if (!src?.trim()) return
      const name = node.name?.trim()
      const alt = attribute(node, 'alt')?.trim()
      let source = sources.get(src)
      if (!source) {
        const file = filename(src)
        source = {
          id: node.id,
          name: name || alt || file || node.id,
          uses: 0,
          terms: new Set(file ? [file] : []),
        }
        sources.set(src, source)
      }
      source.uses++
      if (name) source.terms.add(name)
      if (alt) source.terms.add(alt)
      return
    }
    if (hasDocumentChildren(tag)) {
      for (const child of node.children ?? []) visit(child)
    }
  }
  visit(root)
  return Array.from(sources, ([url, { id, name, uses, terms }]) => ({
    id,
    url,
    name,
    uses,
    searchTerms: [...terms],
  }))
}
