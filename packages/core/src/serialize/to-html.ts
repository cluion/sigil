import type { ComponentNode, ResponsiveBreakpoint, SigilDoc, Style } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import { RESPONSIVE_BREAKPOINT_WIDTHS } from '../model/responsive-style.js'
import { escapeHtml } from '../policy/index.js'
import type { SanitizeFn } from '../policy/index.js'
import type { ShortcodeResolver } from '../renderer/shortcode-resolver.js'
import type { RichTextResolver } from '../renderer/rich-text-resolver.js'

export type HtmlMode = 'static' | 'hydrated'

export interface ToHtmlOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
  richTextResolver?: RichTextResolver
  sanitize?: SanitizeFn
  mode?: HtmlMode
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const SKIP_ATTR = new Set(['data-sigil-id', 'data-sigil-r', 'data-shortcode', 'data-props'])

const BREAKPOINTS: ResponsiveBreakpoint[] = ['tablet', 'mobile']
const CSS_PROPERTY = /^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/

interface ResponsiveOutput {
  keys: Map<ComponentNode, string>
  css: string
}

/**
 * 把 SigilDoc 樹序列化成 HTML 字串
 *
 * static 展開 shortcode
 * hydrated 保留 hydrate host
 */
export function toHTML(doc: SigilDoc, opts: ToHtmlOptions = {}): string {
  const registry = opts.registry ?? createTypeRegistry()
  const mode = opts.mode ?? 'static'
  const responsive = createResponsiveOutput(doc.root)
  const html = renderNode(
    doc.root,
    registry,
    opts.shortcodeResolver,
    opts.richTextResolver,
    opts.sanitize,
    mode,
    responsive.keys,
  )
  return responsive.css ? `<style data-sigil-responsive>${responsive.css}</style>${html}` : html
}

function renderNode(
  node: ComponentNode,
  registry: TypeRegistry,
  shortcodeResolver: ShortcodeResolver | undefined,
  richTextResolver: RichTextResolver | undefined,
  sanitize: SanitizeFn | undefined,
  mode: HtmlMode,
  responsiveKeys: Map<ComponentNode, string>,
): string {
  if (node.shortcode) {
    const tmpl = shortcodeResolver?.renderStatic?.(node) ?? ''
    let inner = tmpl
    if (node.children?.length) {
      const childrenHtml = node.children
        .map((c) =>
          renderNode(
            c,
            registry,
            shortcodeResolver,
            richTextResolver,
            sanitize,
            mode,
            responsiveKeys,
          ),
        )
        .join('')
      inner = tmpl.replace(/<slot\b[^>]*>[\s\S]*?<\/slot>|<slot\b[^>]*\/>/, childrenHtml)
    }
    if (mode === 'hydrated') {
      const props = JSON.stringify(node.shortcode.props)
      const parts = [
        `<div data-sigil-id="${escapeHtml(node.id)}"`,
        ` data-shortcode="${escapeHtml(node.shortcode.name)}"`,
        ` data-props="${escapeHtml(props)}"`,
      ]
      appendPresentationAttributes(parts, node, responsiveKeys.get(node))
      parts.push('>', inner, '</div>')
      return parts.join('')
    }
    if (needsStaticShortcodeHost(node, responsiveKeys.get(node))) {
      const parts = ['<div']
      appendPresentationAttributes(parts, node, responsiveKeys.get(node))
      parts.push('>', inner, '</div>')
      return parts.join('')
    }
    return inner
  }

  const tag = node.tagName ?? registry.get(node.type)?.tagName ?? 'div'
  const parts: string[] = ['<', tag]
  appendPresentationAttributes(parts, node, responsiveKeys.get(node))

  if (VOID.has(tag)) {
    parts.push('>')
    return parts.join('')
  }

  parts.push('>')
  if (richTextResolver?.supports(node)) {
    const markup = richTextResolver.read(node)
    parts.push(sanitize ? sanitize(markup) : escapeHtml(markup))
  } else if (node.content !== undefined) {
    parts.push(escapeHtml(node.content))
  }
  if (node.children) {
    for (const c of node.children) {
      parts.push(
        renderNode(
          c,
          registry,
          shortcodeResolver,
          richTextResolver,
          sanitize,
          mode,
          responsiveKeys,
        ),
      )
    }
  }
  parts.push('</', tag, '>')
  return parts.join('')
}

function appendPresentationAttributes(
  parts: string[],
  node: ComponentNode,
  responsiveKey: string | undefined,
): void {
  if (node.attributes) {
    for (const [key, value] of Object.entries(node.attributes)) {
      if (SKIP_ATTR.has(key)) continue
      parts.push(' ', key, '="', escapeHtml(value), '"')
    }
  }
  if (responsiveKey) parts.push(' data-sigil-r="', responsiveKey, '"')
  if (node.className) parts.push(' class="', escapeHtml(node.className), '"')

  const style: Style = responsiveKey ? {} : { ...node.style }
  if (node.hidden) style.display = 'none'
  const css = serializeInlineDeclarations(style)
  if (css) parts.push(' style="', css, '"')
}

function needsStaticShortcodeHost(node: ComponentNode, responsiveKey: string | undefined): boolean {
  return Boolean(
    responsiveKey ||
    node.className ||
    node.hidden ||
    Object.keys(node.attributes ?? {}).some((key) => !SKIP_ATTR.has(key)) ||
    Object.keys(node.style ?? {}).length,
  )
}

function createResponsiveOutput(root: ComponentNode): ResponsiveOutput {
  const keys = new Map<ComponentNode, string>()
  const selectors = new Map<string, string>()
  const cssRules: string[] = []
  const mediaRules: Record<ResponsiveBreakpoint, string[]> = { tablet: [], mobile: [] }
  walk(root, (node) => {
    if (!node.responsiveStyles) return
    const tablet = serializeDeclarations(node.responsiveStyles.tablet)
    const mobile = serializeDeclarations(node.responsiveStyles.mobile)
    if (!tablet && !mobile) return
    const desktop = serializeDeclarations(node.style)
    const signature = JSON.stringify([desktop, tablet, mobile])
    let key = selectors.get(signature)
    if (!key) {
      key = responsiveKey(signature)
      selectors.set(signature, key)
      const selector = `[data-sigil-r="${key}"]`
      if (desktop) cssRules.push(`${selector}{${desktop}}`)
      if (tablet) mediaRules.tablet.push(`${selector}{${tablet}}`)
      if (mobile) mediaRules.mobile.push(`${selector}{${mobile}}`)
    }
    keys.set(node, key)
  })

  for (const breakpoint of BREAKPOINTS) {
    const rules = mediaRules[breakpoint]
    if (rules.length) {
      cssRules.push(
        `@media (max-width:${RESPONSIVE_BREAKPOINT_WIDTHS[breakpoint]}px){${rules.join('')}}`,
      )
    }
  }

  return { keys, css: cssRules.join('') }
}

// 用樣式內容產生穩定的 64 位識別碼，供多份匯出片段共用同一頁。
function responsiveKey(signature: string): string {
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < signature.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(signature.charCodeAt(i))) * 0x100000001b3n)
  }
  return `r${hash.toString(36)}`
}

function serializeDeclarations(style: Style | undefined): string {
  if (!style) return ''
  const declarations: string[] = []
  for (const [property, value] of Object.entries(style)) {
    if (!CSS_PROPERTY.test(property) || value === '') continue
    declarations.push(`${property}:${escapeCssValue(value)}`)
  }
  return declarations.join(';')
}

function serializeInlineDeclarations(style: Style): string {
  const declarations: string[] = []
  for (const [property, value] of Object.entries(style)) {
    if (!CSS_PROPERTY.test(property) || value === '') continue
    declarations.push(`${property}:${escapeHtml(value)}`)
  }
  return declarations.join(';')
}

function escapeCssValue(value: string): string {
  return value.replace(/[\\<>{};]/g, (char) => `\\${char.codePointAt(0)!.toString(16)} `)
}

function walk(node: ComponentNode, visit: (node: ComponentNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
