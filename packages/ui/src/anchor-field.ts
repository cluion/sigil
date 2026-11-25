import {
  createId,
  getHtmlAnchorInfo,
  renameHtmlAnchor,
  type ComponentNode,
  type Engine,
  type I18n,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'

type Failure = Extract<ReturnType<typeof renameHtmlAnchor>, { ok: false }>['reason']
type Feedback = Failure | 'updated' | 'copied' | 'manual'
const feedbackLabels: Record<Feedback, string> = {
  updated: '已更新頁內錨點。',
  copied: '已複製頁內連結。',
  manual: '請手動複製已選取的頁內連結。',
  missing: '找不到目前元件，請重新選取。',
  locked: '請先解鎖這個元件。',
  invalid: '請輸入有效的錨點名稱，例如 event-info 或 活動資訊。',
  conflict: '這個名稱已被使用，請選擇其他名稱。',
  referenced: '請先移除或重新指定指向此錨點的參照。',
  'locked-reference': '請先解鎖包含此錨點參照的元件。',
}

export function createAnchorField(engine: Engine, node: ComponentNode, i18n?: I18n) {
  const events = new AbortController()
  const { signal } = events
  const t = (key: string, fallback: string) => uiText(i18n, 'anchor.' + key, fallback)
  const id = 'sigil-anchor-' + createId()
  const el = document.createElement('div')
  el.className = 'sigil-anchor-field'
  el.setAttribute('role', 'group')
  const title = document.createElement('h4')
  title.className = 'sigil-section-title'
  title.id = id + '-title'
  el.setAttribute('aria-labelledby', title.id)

  const nameLabel = document.createElement('label')
  nameLabel.className = 'sigil-field-label'
  const name = document.createElement('input')
  name.id = nameLabel.htmlFor = id + '-name'
  name.className = 'sigil-input'
  name.dataset.anchorName = ''
  name.type = 'text'
  name.spellcheck = false
  name.autocomplete = 'off'
  name.autocapitalize = 'none'
  name.placeholder = 'event-info'

  const references = document.createElement('p')
  references.id = id + '-references'
  references.className = 'sigil-muted sigil-anchor-references'
  const actions = document.createElement('div')
  actions.className = 'sigil-anchor-actions'
  const apply = document.createElement('button')
  const copy = document.createElement('button')
  apply.type = copy.type = 'button'
  apply.className = 'sigil-btn'
  copy.className = 'sigil-btn sigil-btn--ghost'
  actions.append(apply, copy)

  const feedback = document.createElement('p')
  feedback.id = id + '-feedback'
  feedback.className = 'sigil-anchor-feedback'
  feedback.setAttribute('role', 'status')
  name.setAttribute('aria-describedby', references.id + ' ' + feedback.id)
  const manual = document.createElement('div')
  const fragmentLabel = document.createElement('label')
  fragmentLabel.className = 'sigil-field-label'
  const fragment = document.createElement('input')
  fragment.id = fragmentLabel.htmlFor = id + '-fragment'
  fragment.className = 'sigil-input'
  fragment.readOnly = true
  manual.append(fragmentLabel, fragment)
  el.append(title, nameLabel, name, references, actions, feedback, manual)

  let info: ReturnType<typeof getHtmlAnchorInfo>
  let message: Feedback | undefined
  let copyAttempt = 0
  let pending = false
  let applying = false

  function render(): void {
    const dirty = name.value !== (info?.name ?? '')
    name.disabled = !info || info.locked
    apply.disabled = name.disabled || !dirty
    copy.disabled = !info?.fragment || dirty
    manual.hidden = message !== 'manual'
    fragment.value = info?.fragment ?? ''
    feedback.textContent = message ? t(message, feedbackLabels[message]) : ''
    feedback.hidden = !message
    const invalid = message && message !== 'updated' && message !== 'copied' && message !== 'manual'
    if (invalid) name.setAttribute('aria-invalid', 'true')
    else name.removeAttribute('aria-invalid')
    feedback.classList.toggle('sigil-anchor-error', !!invalid)
    if (info?.duplicate)
      references.textContent = t('duplicate', '這個名稱由多個元件共用。改名會保留既有參照。')
    else if (info?.name && !info.fragment)
      references.textContent = t('unavailable', '請更換名稱，以取得此元件專用的頁內連結。')
    else if (info?.referenceCount)
      references.textContent = t('references', '此頁有 {count} 處參照此錨點。').replace(
        '{count}',
        String(info.referenceCount),
      )
    else references.textContent = ''
    references.hidden = !references.textContent
  }

  function sync(): void {
    const next =
      !signal.aborted && engine.getSelection() === node.id
        ? getHtmlAnchorInfo(engine.getTree(), node.id)
        : undefined
    if (next?.name !== info?.name || next?.locked !== info?.locked) {
      name.value = next?.name ?? ''
      copyAttempt++
      message = undefined
    } else if (next?.fragment !== info?.fragment) {
      copyAttempt++
      message = undefined
    }
    info = next
    render()
  }

  function save(): void {
    if (signal.aborted || apply.disabled || engine.getSelection() !== node.id) return
    sync()
    if (apply.disabled) return
    applying = true
    try {
      const result = renameHtmlAnchor(engine, node.id, name.value)
      sync()
      message = result.ok ? 'updated' : result.reason
      render()
      if (!result.ok && !name.disabled) name.focus()
    } finally {
      applying = false
    }
  }

  async function copyFragment(): Promise<void> {
    if (signal.aborted || copy.disabled || engine.getSelection() !== node.id) return
    sync()
    const value = info?.fragment
    if (copy.disabled || !value) return
    const attempt = ++copyAttempt
    const previousFocus = el.ownerDocument.activeElement
    let copied = false
    try {
      const clipboard = el.ownerDocument.defaultView?.navigator.clipboard
      if (clipboard?.writeText) {
        await clipboard.writeText(value)
        copied = true
      }
    } catch {
      // Leave the saved fragment selected for the user's native copy command.
    }
    if (signal.aborted || attempt !== copyAttempt || engine.getSelection() !== node.id) return
    message = copied ? 'copied' : 'manual'
    render()
    if (!copied && el.ownerDocument.activeElement === previousFocus) {
      fragment.focus()
      fragment.select()
    }
  }

  name.addEventListener(
    'input',
    () => {
      copyAttempt++
      message = undefined
      render()
    },
    { signal },
  )
  name.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault()
        save()
      }
    },
    { signal },
  )
  apply.addEventListener('click', save, { signal })
  copy.addEventListener('click', () => void copyFragment(), { signal })
  const unsubscribe = engine.subscribe((event) => {
    if (signal.aborted || applying || pending || event.type === 'history') return
    if (
      event.type === 'patch' &&
      event.patch.type === 'update' &&
      !event.patch.attrs &&
      !event.patch.removeAttributes?.length &&
      event.patch.locked === undefined &&
      event.patch.shortcode === undefined
    )
      return
    pending = true
    queueMicrotask(() => {
      pending = false
      if (!signal.aborted) sync()
    })
  })

  function refreshLocale(): void {
    title.textContent = t('title', '頁內錨點')
    nameLabel.textContent = t('name', '錨點名稱')
    apply.textContent = t('apply', '套用錨點')
    copy.textContent = t('copy', '複製頁內連結')
    fragmentLabel.textContent = t('fragment', '頁內連結')
    render()
  }
  sync()
  refreshLocale()
  return {
    el,
    refreshLocale,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
