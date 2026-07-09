import type { ComponentNode, SigilDoc } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import { escapeHtml } from '../policy/index.js'
import type { ShortcodeResolver } from '../renderer/shortcode-resolver.js'

export interface ToHtmlOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const SKIP_ATTR = new Set(['data-sigil-id', 'data-shortcode'])

/**
 * 把 SigilDoc 樹序列化成純 HTML 字串(static 輸出)
 *
 * 純函式、零依賴、不需 DOM。動態值一律 escapeHtml;
 * shortcode 節點交給 shortcodeResolver.renderStatic,無時回空字串
 */
export function toHTML(doc: SigilDoc, opts: ToHtmlOptions = {}): string {
  const registry = opts.registry ?? createTypeRegistry()
  return renderNode(doc.root, registry, opts.shortcodeResolver)
}

function renderNode(
  node: ComponentNode,
  registry: TypeRegistry,
  resolver?: ShortcodeResolver,
): string {
  if (node.shortcode) {
    return resolver?.renderStatic?.(node) ?? ''
  }

  const tag = node.tagName ?? registry.get(node.type)?.tagName ?? 'div'
  const parts: string[] = ['<', tag]

  if (node.attributes) {
    for (const [k, v] of Object.entries(node.attributes)) {
      if (SKIP_ATTR.has(k)) continue
      parts.push(' ', k, '="', escapeHtml(v), '"')
    }
  }
  if (node.className) {
    parts.push(' class="', escapeHtml(node.className), '"')
  }
  if (node.style) {
    const css = Object.entries(node.style)
      .map(([k, v]) => `${k}:${escapeHtml(v)}`)
      .join(';')
    if (css) parts.push(' style="', css, '"')
  }

  if (VOID.has(tag)) {
    parts.push('>')
    return parts.join('')
  }

  parts.push('>')
  if (node.content !== undefined) parts.push(escapeHtml(node.content))
  if (node.children) {
    for (const c of node.children) parts.push(renderNode(c, registry, resolver))
  }
  parts.push('</', tag, '>')
  return parts.join('')
}
