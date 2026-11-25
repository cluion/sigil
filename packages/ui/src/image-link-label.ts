import type { ComponentNode, I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { attribute } from './link-destination.js'

export function imageLinkLabel(node: ComponentNode, i18n?: I18n): string | undefined {
  if (
    node.tagName?.toLowerCase() !== 'a' ||
    node.shortcode ||
    node.content?.trim() ||
    node.children?.length !== 1 ||
    attribute(node, 'href') === undefined
  )
    return
  const image = node.children[0]!
  if (image.type !== 'image' || image.shortcode || (image.tagName ?? 'img').toLowerCase() !== 'img')
    return
  return (
    node.name?.trim() ||
    attribute(node, 'aria-label')?.trim() ||
    uiText(i18n, 'image.link', '圖片連結')
  )
}
