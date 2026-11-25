import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'
import { assertDocument, isRecord } from '../../examples/laravel/resources/js/document-validation'
import { photosById, photosForUrls, PhotoError } from './local-photos'

function* imageNodes(node: ComponentNode): Generator<ComponentNode> {
  if (node.type === 'image') yield node
  for (const child of node.children ?? []) yield* imageNodes(child)
}

export async function encodeDraft(doc: SigilDoc): Promise<string> {
  // The snapshot passed to this adapter is detached from the editor and its export document.
  const local = Array.from(imageNodes(doc.root)).filter((node) =>
    node.attributes?.src?.startsWith('data:'),
  )
  if (!local.length) {
    assertDocument(doc)
    return JSON.stringify(doc)
  }
  const stored = await photosForUrls(local.map((node) => node.attributes!.src!))
  const byUrl = new Map(stored.map((photo) => [photo.url, photo.id]))
  const photoRefs: [string, string][] = []
  for (const node of local) {
    const attributes = node.attributes!
    const photoId = byUrl.get(attributes.src!)
    if (!photoId) throw new PhotoError('請從素材庫加入裝置照片後再存檔，本機原稿已保留。')
    delete attributes.src
    photoRefs.push([node.id, photoId])
  }
  assertDocument(doc)
  return JSON.stringify({ format: 'workshop-photos-v1', doc, photoRefs })
}

export async function decodeDraft(saved: string): Promise<SigilDoc> {
  const input: unknown = JSON.parse(saved)
  if (!isRecord(input) || input.format !== 'workshop-photos-v1') {
    assertDocument(input)
    return input
  }
  const { doc, photoRefs } = input
  assertDocument(doc)
  if (
    Object.keys(input).some((key) => !['format', 'doc', 'photoRefs'].includes(key)) ||
    !Array.isArray(photoRefs) ||
    photoRefs.length > 5000
  )
    throw new Error('Invalid local photo references')
  if (!photoRefs.length) return doc
  const images = new Map(Array.from(imageNodes(doc.root), (node) => [node.id, node]))
  const targets = new Map<ComponentNode, string>()
  for (const ref of photoRefs) {
    if (
      !Array.isArray(ref) ||
      ref.length !== 2 ||
      typeof ref[0] !== 'string' ||
      typeof ref[1] !== 'string'
    )
      throw new Error('Invalid local photo reference')
    const node = images.get(ref[0])
    if (!node || !node.attributes || 'src' in node.attributes || targets.has(node))
      throw new Error('Invalid photo destination')
    targets.set(node, ref[1])
  }
  const available = await photosById([...targets.values()])
  const byId = new Map(available.map((photo) => [photo.id, photo.url]))
  for (const [node, id] of targets) {
    node.attributes!.src = byId.get(id)!
  }
  return doc
}
