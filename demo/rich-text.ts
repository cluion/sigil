import type { RichTextAdapter } from '@cluion/sigil-app'

const ALLOWED_ELEMENTS = new Set(['p', 'strong', 'em', 'a', 'br'])
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'])

type ParsePolicy = { createHTML: (input: string) => unknown }
type TrustedTypesFactory = {
  createPolicy: (name: string, rules: { createHTML: (input: string) => string }) => ParsePolicy
}
const parserPolicies = new WeakMap<TrustedTypesFactory, ParsePolicy>()

/**
 * Demo 專用 allowlist sanitizer
 */
export function sanitizeDemoRichText(input: string): string {
  const parsed = parseRichTextInput(input)
  const output = document.createElement('div')
  for (const child of parsed.childNodes) {
    output.appendChild(sanitizeNode(child, output.ownerDocument))
  }
  return output.innerHTML
}

function parseRichTextInput(input: string): ParentNode {
  const container = document.createElement('div') as HTMLDivElement & {
    setHTML?: (untrusted: string) => void
  }
  if (typeof container.setHTML === 'function') {
    container.setHTML(input)
    return container
  }
  const tt = (globalThis as unknown as { trustedTypes?: TrustedTypesFactory }).trustedTypes
  let policy = tt ? parserPolicies.get(tt) : undefined
  if (tt && !policy) {
    // This private policy only permits parsing into an inert document. Its output
    // is still untrusted: sanitizeNode rebuilds the allowlist before any live DOM use.
    policy = tt.createPolicy('sigil-demo#parse', { createHTML: (value) => value })
    parserPolicies.set(tt, policy)
  }
  const parserInput = policy ? policy.createHTML(input) : input
  return new DOMParser().parseFromString(parserInput as string, 'text/html').body
}

function sanitizeNode(node: Node, target: Document): Node {
  if (node.nodeType === Node.TEXT_NODE) return target.createTextNode(node.textContent ?? '')
  const fragment = target.createDocumentFragment()
  if (node.nodeType !== Node.ELEMENT_NODE) return fragment

  const source = node as Element
  const tag = source.tagName.toLowerCase()
  if (DROP_CONTENT.has(tag)) return fragment

  const output: Node = ALLOWED_ELEMENTS.has(tag) ? target.createElement(tag) : fragment
  if (output instanceof HTMLElement && tag === 'a') {
    const href = safeHref(source.getAttribute('href'))
    if (href) output.setAttribute('href', href)
  }
  for (const child of source.childNodes) output.appendChild(sanitizeNode(child, target))
  return output
}

function safeHref(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value, 'https://sigil.local/')
    return url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * Demo 專用零依賴 contenteditable adapter
 */
export const demoRichTextAdapter: RichTextAdapter = {
  resolver: {
    supports: (node) => node.type === 'rich-text',
    read: (node) => node.content ?? '',
  },
  start(context) {
    const { document: doc, element } = context
    const previous = {
      contenteditable: element.getAttribute('contenteditable'),
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      ariaMultiline: element.getAttribute('aria-multiline'),
    }
    element.setAttribute('contenteditable', 'true')
    element.setAttribute('role', 'textbox')
    element.setAttribute('aria-label', '富文字內容')
    element.setAttribute('aria-multiline', 'true')

    const toolbar = doc.createElement('div')
    toolbar.dataset.demoRichTextToolbar = 'true'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', '富文字工具列')
    toolbar.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:12px',
      'transform:translateX(-50%)',
      'z-index:10001',
      'display:flex',
      'gap:6px',
      'padding:6px',
      'background:#fff',
      'border:1px solid #cbd5e1',
      'border-radius:6px',
      'box-shadow:0 4px 12px rgba(15,23,42,.18)',
    ].join(';')

    toolbar.append(
      toolbarButton(doc, '粗體', () => wrapSelection(doc, element, 'strong')),
      toolbarButton(doc, '斜體', () => wrapSelection(doc, element, 'em')),
      toolbarButton(doc, '安全連結', () =>
        wrapSelection(doc, element, 'a', { href: 'https://example.com/' }),
      ),
      toolbarButton(doc, '完成', context.requestCommit),
      toolbarButton(doc, '取消', context.requestCancel),
    )
    doc.body.appendChild(toolbar)

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        context.requestCommit()
      }
    }
    element.addEventListener('keydown', onKeyDown)

    let destroyed = false
    return {
      focus() {
        element.focus({ preventScroll: true })
        const selection = doc.getSelection()
        if (!selection) return
        const range = doc.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      },
      getValue() {
        return element.innerHTML
      },
      destroy() {
        if (destroyed) return
        destroyed = true
        element.removeEventListener('keydown', onKeyDown)
        restoreAttribute(element, 'contenteditable', previous.contenteditable)
        restoreAttribute(element, 'role', previous.role)
        restoreAttribute(element, 'aria-label', previous.ariaLabel)
        restoreAttribute(element, 'aria-multiline', previous.ariaMultiline)
        toolbar.remove()
      },
    }
  },
}

function toolbarButton(doc: Document, label: string, action: () => void): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.setAttribute('aria-label', label)
  button.style.cssText =
    'border:1px solid #cbd5e1;border-radius:4px;background:#f8fafc;padding:4px 8px;cursor:pointer'
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', action)
  return button
}

function wrapSelection(
  doc: Document,
  element: HTMLElement,
  tag: 'strong' | 'em' | 'a',
  attributes?: Record<string, string>,
): void {
  const selection = doc.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (range.collapsed || !element.contains(range.commonAncestorContainer)) return

  const wrapper = doc.createElement(tag)
  for (const [name, value] of Object.entries(attributes ?? {})) wrapper.setAttribute(name, value)
  wrapper.appendChild(range.extractContents())
  range.insertNode(wrapper)
  range.selectNodeContents(wrapper)
  selection.removeAllRanges()
  selection.addRange(range)
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}
