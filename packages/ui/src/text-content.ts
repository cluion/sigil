import { findNode, type ComponentNode, type Engine, type I18n } from '@cluion/sigil-core'
import { documentTag, hasDocumentChildren } from './component-path.js'
import { uiText } from './i18n.js'

export function canEditPlainContent(node: ComponentNode, tag = documentTag(node)): boolean {
  return (
    !node.shortcode &&
    node.type !== 'shortcode' &&
    hasDocumentChildren(tag) &&
    (node.type === 'text' || node.type === 'button' || tag === 'a')
  )
}

/** 在同一個控制項同步原生文字與按鈕內容。 */
export function createTextContent(
  engine: Engine,
  node: ComponentNode,
  i18n: I18n | undefined,
  leafLabel: () => string,
) {
  const input = document.createElement('input')
  input.className = 'sigil-text-content'
  const caption = document.createTextNode('')
  let leading = !!node.children?.length
  function refreshLocale() {
    caption.data = leading ? uiText(i18n, 'props.leading_text', '開頭文字') : leafLabel()
    input.toggleAttribute('data-leading-text', leading)
  }
  refreshLocale()
  let content = node.content ?? ''
  input.value = content
  input.disabled = !!node.locked
  let compositionStart: string | null = null
  let deferredContent = false

  function sync() {
    if (input.value === content) return
    const focused = input.ownerDocument.activeElement === input
    const start = input.selectionStart
    const end = input.selectionEnd
    const direction = input.selectionDirection
    input.value = content
    if (focused && start !== null && end !== null)
      input.setSelectionRange(start, end, direction ?? undefined)
  }
  function write() {
    if (compositionStart !== null || input.disabled || engine.getSelection() !== node.id) return
    if (input.value !== content) engine.update(node.id, { content: input.value })
  }
  const events = new AbortController()
  const { signal } = events
  input.addEventListener('input', write, { signal })
  input.addEventListener(
    'compositionstart',
    () => {
      compositionStart = input.value
      deferredContent = false
    },
    { signal },
  )
  input.addEventListener(
    'compositionend',
    () => {
      if (compositionStart === null) return
      const cancelled = input.value === compositionStart
      compositionStart = null
      if (cancelled && deferredContent) sync()
      else write()
    },
    { signal },
  )
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch') return
    const patch = event.patch
    if (patch.type !== 'update') {
      const hasChildren = !!findNode(engine.getTree(), node.id)?.children?.length
      if (leading !== hasChildren) {
        leading = hasChildren
        refreshLocale()
      }
      return
    }
    if (patch.id !== node.id) return
    if (patch.locked !== undefined) {
      input.disabled = patch.locked
      if (input.disabled) compositionStart = null
    }
    if (patch.content !== undefined) content = patch.content
    if (patch.content === undefined && patch.locked === undefined) return
    if (compositionStart === null) sync()
    else if (input.value !== content) deferredContent = true
  })
  return {
    input,
    caption,
    refreshLocale,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
