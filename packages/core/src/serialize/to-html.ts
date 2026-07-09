import type { ComponentNode, SigilDoc } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import { escapeHtml } from '../policy/index.js'
import type { ShortcodeResolver } from '../renderer/shortcode-resolver.js'

export type HtmlMode = 'static' | 'hydrated'

export interface ToHtmlOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
  mode?: HtmlMode
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const SKIP_ATTR = new Set(['data-sigil-id', 'data-shortcode', 'data-props'])

/**
 * 把 SigilDoc 樹序列化成 HTML 字串
 *
 * mode='static'(預設):shortcode 展開成純 HTML
 * mode='hydrated':shortcode 包成帶 data-shortcode/data-props 的 host(供 hydrate)
 */
export function toHTML(doc: SigilDoc, opts: ToHtmlOptions = {}): string {
  const registry = opts.registry ?? createTypeRegistry()
  const mode = opts.mode ?? 'static'
  return renderNode(doc.root, registry, opts.shortcodeResolver, mode)
}

function renderNode(
  node: ComponentNode,
  registry: TypeRegistry,
  resolver: ShortcodeResolver | undefined,
  mode: HtmlMode,
): string {
  if (node.shortcode) {
    const tmpl = resolver?.renderStatic?.(node) ?? ''
    let inner = tmpl
    if (node.children?.length) {
      const childrenHtml = node.children
        .map((c) => renderNode(c, registry, resolver, mode))
        .join('')
      inner = tmpl.replace(/<slot\b[^>]*>[\s\S]*?<\/slot>|<slot\b[^>]*\/>/, childrenHtml)
    }
    if (mode === 'hydrated') {
      const props = JSON.stringify(node.shortcode.props)
      return (
        `<div data-sigil-id="${escapeHtml(node.id)}"` +
        ` data-shortcode="${escapeHtml(node.shortcode.name)}"` +
        ` data-props="${escapeHtml(props)}">${inner}</div>`
      )
    }
    return inner
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
    for (const c of node.children) parts.push(renderNode(c, registry, resolver, mode))
  }
  parts.push('</', tag, '>')
  return parts.join('')
}
