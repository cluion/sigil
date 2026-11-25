import type { I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'

export interface InlineEditControlHandlers {
  end(action: 'commit' | 'cancel'): void
  resume(): void
  leave(): void
}

export function createInlineEditControls(
  dock: HTMLElement,
  iframe: HTMLIFrameElement,
  i18n: I18n | undefined,
  handlers: InlineEditControlHandlers,
) {
  const doc = dock.ownerDocument
  const group = doc.createElement('div')
  group.className = 'sigil-inline-edit-controls'
  group.setAttribute('role', 'group')
  group.hidden = true
  const identity = doc.createElement('div')
  const mode = doc.createElement('span')
  const label = doc.createElement('strong')
  identity.append(mode, label)
  const finish = doc.createElement('button')
  const cancel = doc.createElement('button')
  const status = doc.createElement('span')
  status.setAttribute('role', 'status')
  for (const button of [finish, cancel]) {
    button.type = 'button'
    // Keep the caret and the draft alive through a pointer activation outside the iframe.
    button.addEventListener('mousedown', (event) => event.preventDefault())
  }
  finish.addEventListener('click', () => handlers.end('commit'))
  cancel.addEventListener('click', () => handlers.end('cancel'))
  group.append(identity, finish, cancel, status)
  dock.append(group)

  let pendingLeave: number | undefined
  function cancelPendingLeave() {
    doc.defaultView?.clearTimeout(pendingLeave)
    pendingLeave = undefined
  }
  group.addEventListener('focusin', cancelPendingLeave)
  group.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return
    if (event.key === 'Tab' && event.shiftKey && event.target === finish) {
      event.preventDefault()
      handlers.resume()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      handlers.end('cancel')
    }
  })
  group.addEventListener('focusout', (event) => {
    const destination = event.relatedTarget as Node | null
    if (destination === iframe || (destination && group.contains(destination))) return
    // A cross-document transfer may report a null target until focusin has finished.
    cancelPendingLeave()
    pendingLeave = doc.defaultView?.setTimeout(() => {
      pendingLeave = undefined
      if (!group.isConnected || group.hidden || group.contains(doc.activeElement)) return
      if (doc.activeElement !== iframe) handlers.leave()
    }, 0)
  })

  function showError() {
    status.textContent = uiText(
      i18n,
      'canvas.text_commit_failed',
      '未能完成編輯。草稿已保留，請再試一次。',
    )
  }
  return {
    translate() {
      mode.textContent = uiText(i18n, 'canvas.editing_text', '正在編輯文字')
      group.setAttribute('aria-label', mode.textContent)
      finish.textContent = uiText(i18n, 'canvas.finish_editing', '完成編輯')
      cancel.textContent = uiText(i18n, 'canvas.cancel_editing', '取消編輯')
      if (status.textContent) showError()
    },
    show(name: string) {
      cancelPendingLeave()
      label.textContent = name
      label.title = name
      status.textContent = ''
      group.hidden = false
    },
    hide() {
      cancelPendingLeave()
      group.hidden = true
    },
    setComposing(composing: boolean) {
      finish.disabled = composing
      cancel.disabled = composing
    },
    focus() {
      if (group.hidden || finish.disabled) return false
      finish.focus({ preventScroll: true })
      return doc.activeElement === finish
    },
    hasFocus: () => !group.hidden && group.contains(doc.activeElement),
    showError,
    destroy() {
      cancelPendingLeave()
      group.remove()
    },
  }
}
