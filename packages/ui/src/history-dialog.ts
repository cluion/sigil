import {
  createId,
  type HistoryEngine,
  type HistoryKind,
  type I18n,
  type ReactiveI18n,
} from '@cluion/sigil-core'
import { subscribeLocale } from './i18n.js'

const pageSize = 40
const captions = {
  title: ['編輯歷程', 'Edit history'],
  list: ['歷程步驟', 'History steps'],
  first: ['最早一步', 'First step'],
  current_step: ['目前步驟', 'Current step'],
  last_saved: ['上次儲存', 'Last saved'],
  earlier: ['較早步驟', 'Earlier steps'],
  later: ['較新步驟', 'Later steps'],
  past: ['過去', 'Past'],
  current: ['目前', 'Current'],
  redo: ['可重做', 'Can redo'],
  saved: ['已儲存', 'Saved'],
  close: ['關閉', 'Close'],
  restore: ['回到這一步', 'Restore this step'],
} as const
const kinds = {
  initial: ['開啟文件', 'Opened document'],
  insert: ['新增元件', 'Added component'],
  remove: ['移除元件', 'Removed component'],
  move: ['移動元件', 'Moved component'],
  text: ['編輯文字', 'Edited text'],
  'replace-text': ['批次取代文字', 'Replaced page text'],
  style: ['調整樣式', 'Changed styles'],
  rename: ['重新命名元件', 'Renamed component'],
  hide: ['隱藏元件', 'Hid component'],
  show: ['顯示元件', 'Showed component'],
  lock: ['鎖定元件', 'Locked component'],
  unlock: ['解除鎖定', 'Unlocked component'],
  update: ['更新元件', 'Updated component'],
  group: ['多項變更', 'Multiple changes'],
} as const satisfies Record<HistoryKind, readonly [string, string]>

const styles = `
.sigil-history-dialog {
  color-scheme: light;
  --history-surface: var(--sigil-color-surface, #fff);
  --history-text: var(--sigil-color-text, #172033);
  --history-muted: var(--sigil-color-muted, #475569);
  --history-border: var(--sigil-color-border, #cbd5e1);
  --history-tint: var(--sigil-color-accent-soft, #eef2ff);
  --history-accent: var(--sigil-color-accent, #4f46e5);
  --history-action-text: #fff;
  box-sizing: border-box;
  width: min(32rem, calc(100% - 24px)); max-width: 100%;
  max-height: calc(100dvh - 24px); padding: 0; overflow: auto;
  border: 1px solid var(--history-border); border-radius: var(--sigil-radius-md, 10px);
  background: var(--history-surface); color: var(--history-text);
  font: 14px/1.45 var(--sigil-font-sans, system-ui, sans-serif);
  box-shadow: 0 16px 56px #0f172a35;
}
.sigil-history-dialog.sigil-theme-dark {
  color-scheme: dark;
  --history-surface: var(--sigil-color-surface, #1e293b);
  --history-text: var(--sigil-color-text, #f1f5f9);
  --history-muted: var(--sigil-color-muted, #b6c2d3);
  --history-border: var(--sigil-color-border-strong, #475569);
  --history-tint: var(--sigil-color-accent-soft, #343557);
  --history-accent: var(--sigil-color-accent, #a5b4fc);
  --history-action-text: #111827;
}
.sigil-history-dialog::backdrop { background: #0f172a70; }
.sigil-history-dialog .sigil-history-panel {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; min-width: 0; width: auto;
  max-height: calc(100dvh - 26px); padding: 16px; margin: 0; overflow: auto;
  box-shadow: none; background: transparent; color: inherit;
}
.sigil-history-panel h2 { margin: 0; font-size: 1.125rem; line-height: 1.3; }
.sigil-history-pages, .sigil-history-actions { flex: none; display: flex; gap: 6px; flex-wrap: wrap; }
.sigil-history-pages[hidden] { display: none; }
.sigil-history-actions { justify-content: flex-end; }
.sigil-history-dialog button {
  min-height: 32px; padding: 4px 10px; border: 1px solid var(--history-border); border-radius: 6px;
  background: var(--history-surface); color: inherit; font: inherit; cursor: pointer;
}
.sigil-history-dialog button:not(:disabled):hover { background: var(--history-tint); }
.sigil-history-dialog :is(button, [role="listbox"]):focus-visible {
  outline: 2px solid var(--sigil-color-focus, var(--history-accent)); outline-offset: 1px;
}
.sigil-history-dialog .sigil-history-restore:not(:disabled) {
  background: var(--history-accent); border-color: var(--history-accent); color: var(--history-action-text);
}
.sigil-history-dialog button:disabled { opacity: .55; cursor: default; }
.sigil-history-list {
  min-width: 0; min-height: 0; max-height: min(50dvh, 24rem); overflow: auto; overscroll-behavior: contain;
  border: 1px solid var(--history-border); border-radius: 6px;
}
.sigil-history-entry {
  box-sizing: border-box; min-height: 38px; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; column-gap: 10px; padding: 6px 10px; cursor: pointer;
  border-inline-start: 3px solid transparent;
}
.sigil-history-entry + .sigil-history-entry { border-top: 1px solid var(--history-border); }
.sigil-history-entry[aria-selected="true"] { border-inline-start-color: var(--history-accent); background: var(--history-tint); }
.sigil-history-description { min-width: 0; display: grid; overflow-wrap: anywhere; }
.sigil-history-label { font-weight: 600; }
.sigil-history-target, .sigil-history-detail { font-size: .875em; color: var(--history-muted); }
.sigil-history-states { display: grid; justify-items: end; gap: 2px; white-space: nowrap; }
.sigil-history-status, .sigil-history-saved { color: var(--history-muted); font-size: .875em; }
.sigil-history-entry[data-history-state="past"] .sigil-history-status {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
}
.sigil-history-saved { border: 1px solid var(--history-border); border-radius: 4px; padding: 0 4px; }
.sigil-history-entry[aria-current="step"] .sigil-history-status { color: var(--history-text); font-weight: 700; }
@media (pointer: coarse) {
  .sigil-history-dialog button, .sigil-history-entry { min-height: 44px; }
}
@media (max-width: 480px) {
  .sigil-history-pages:not([hidden]) { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sigil-history-pages button { grid-column: span 2; padding-inline: 4px; font-size: .875em; }
  .sigil-history-pages :is(.sigil-history-earlier, .sigil-history-later),
  .sigil-history-pages:has(.sigil-history-last_saved[hidden]) button { grid-column: span 3; }
}
@media (max-height: 440px) { .sigil-history-list { max-height: 36dvh; } }
`

interface HistoryDialogOptions {
  mount: HTMLElement
  engine: HistoryEngine
  i18n?: I18n
  trigger?: HTMLElement
  savedId?: number
  onClose?: () => void
}

export function openHistoryDialog(opts: HistoryDialogOptions): {
  close(): void
  setSavedId(id: number | undefined): void
} {
  const { mount, engine, i18n } = opts
  const doc = mount.ownerDocument
  const previous = opts.trigger ?? (doc.activeElement as HTMLElement | null)
  const dialog = doc.createElement('dialog')
  dialog.className = 'sigil-history-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.classList.toggle(
    'sigil-theme-dark',
    !!(mount.closest('.sigil-theme-dark') || previous?.closest('.sigil-theme-dark')),
  )
  dialog.setAttribute('aria-modal', 'true')
  const style = doc.createElement('style')
  style.textContent = styles
  const panel = doc.createElement('div')
  panel.className = 'sigil-dialog-panel sigil-history-panel'
  const title = doc.createElement('h2')
  title.id = 'sigil-history-' + createId()
  dialog.setAttribute('aria-labelledby', title.id)
  const pages = doc.createElement('div')
  pages.className = 'sigil-history-pages'
  const list = doc.createElement('div')
  list.className = 'sigil-history-list'
  list.tabIndex = 0
  list.setAttribute('role', 'listbox')
  const actions = doc.createElement('div')
  actions.className = 'sigil-history-actions'
  const events = new AbortController()
  const { signal } = events
  function button(parent: HTMLElement, key: keyof typeof captions, run: () => void) {
    const control = doc.createElement('button')
    control.type = 'button'
    control.className = 'sigil-history-' + key
    control.addEventListener('click', run, { signal })
    parent.append(control)
    return control
  }
  const first = button(pages, 'first', () => choose(0))
  const present = button(pages, 'current_step', () => choose(current))
  const lastSaved = button(pages, 'last_saved', () => choose(savedIndex))
  const earlier = button(pages, 'earlier', () => choose(Math.max(0, start - 1)))
  const later = button(pages, 'later', () => choose(start + pageSize))
  const dismiss = button(actions, 'close', close)
  const restore = button(actions, 'restore', () => {
    const entry = state.entries[selected]
    if (!entry || entry.id === state.currentId) return
    if (engine.goToHistory(entry.id)) close()
    else refreshHistory()
  })
  panel.append(title, pages, list, actions)
  dialog.append(style, panel)
  mount.append(dialog)

  let state = engine.getHistory()
  let current = state.entries.findIndex((entry) => entry.id === state.currentId)
  let selected = current
  let savedIndex = state.entries.findIndex((entry) => entry.id === opts.savedId)
  let savedId = state.entries[savedIndex]?.id
  let start = -1
  let closed = false
  let rendered = new Map<number, HTMLElement>()
  function translate(key: string, fallback: readonly [string, string]) {
    const name = 'history.' + key
    const value = i18n?.t(name)
    if (value && value !== name) return value
    const locale =
      (i18n as Partial<ReactiveI18n> | undefined)?.getLocale?.() ?? doc.documentElement.lang
    return fallback[/^en(?:-|$)/i.test(locale) ? 1 : 0]
  }
  function caption(key: keyof typeof captions) {
    return translate(key, captions[key])
  }
  function showSaved(row: HTMLElement, states: HTMLElement) {
    row.dataset.historySaved = 'true'
    const badge = doc.createElement('span')
    badge.className = 'sigil-history-saved'
    badge.textContent = caption('saved')
    states.append(badge)
  }
  function setSavedId(id: number | undefined) {
    if (closed || id === savedId) return
    const previousId = savedId
    savedIndex = state.entries.findIndex((entry) => entry.id === id)
    savedId = state.entries[savedIndex]?.id
    for (const [index, row] of rendered) {
      const entryId = state.entries[index]!.id
      if (entryId === previousId) {
        delete row.dataset.historySaved
        row.querySelector('.sigil-history-saved')?.remove()
      }
      if (entryId === savedId) showSaved(row, row.querySelector('.sigil-history-states')!)
    }
    const hadFocus = doc.activeElement === lastSaved
    updateSavedNavigation()
    if (hadFocus && (lastSaved.hidden || lastSaved.disabled)) list.focus({ preventScroll: true })
  }
  function updateSavedNavigation() {
    lastSaved.hidden = pages.hidden || savedIndex < 0
    lastSaved.disabled = lastSaved.hidden || savedIndex === selected
  }
  function choose(index: number) {
    if (!state.entries[index]) return
    selected = index
    render()
    list.focus({ preventScroll: true })
    rendered.get(index)?.scrollIntoView?.({ block: 'nearest' })
  }
  function render(force = false) {
    const lastStart = Math.max(0, state.entries.length - pageSize)
    let nextStart = Math.min(start, lastStart)
    if (start < 0) {
      nextStart = Math.min(lastStart, Math.max(0, selected - Math.floor(pageSize / 2)))
    } else if (selected < nextStart) {
      nextStart = Math.max(0, selected - pageSize + 1)
    } else if (selected >= nextStart + pageSize) {
      nextStart = Math.min(selected, lastStart)
    }
    if (force || nextStart !== start) {
      start = nextStart
      const fragment = doc.createDocumentFragment()
      rendered = new Map()
      state.entries.slice(start, start + pageSize).forEach((entry, offset) => {
        const index = start + offset
        const phase = index === current ? 'current' : index < current ? 'past' : 'redo'
        const option = doc.createElement('div')
        option.className = 'sigil-history-entry'
        option.id = title.id + '-step-' + entry.id
        option.dataset.historyId = String(entry.id)
        option.dataset.historyState = phase
        option.setAttribute('role', 'option')
        option.setAttribute('aria-posinset', String(index + 1))
        option.setAttribute('aria-setsize', String(state.entries.length))
        if (index === current) option.setAttribute('aria-current', 'step')
        const description = doc.createElement('span')
        description.className = 'sigil-history-description'
        const label = doc.createElement('span')
        label.className = 'sigil-history-label'
        label.textContent = translate('kind.' + entry.kind, kinds[entry.kind])
        const status = doc.createElement('span')
        status.className = 'sigil-history-status'
        status.textContent = caption(phase)
        const states = doc.createElement('span')
        states.className = 'sigil-history-states'
        states.append(status)
        if (entry.id === savedId) showSaved(option, states)
        description.append(label)
        if (entry.target) {
          const target = doc.createElement('span')
          target.className = 'sigil-history-target'
          target.textContent = entry.target
          description.append(target)
        }
        if (entry.detail && entry.detail !== entry.target && entry.detail !== label.textContent) {
          const detail = doc.createElement('span')
          detail.className = 'sigil-history-detail'
          detail.textContent = entry.detail
          description.append(detail)
        }
        option.append(description, states)
        rendered.set(index, option)
        fragment.append(option)
      })
      list.replaceChildren(fragment)
    }
    for (const [index, row] of rendered) {
      row.setAttribute('aria-selected', String(index === selected))
    }
    const active = rendered.get(selected)
    if (active) list.setAttribute('aria-activedescendant', active.id)
    else list.removeAttribute('aria-activedescendant')
    pages.hidden = state.entries.length <= pageSize
    updateSavedNavigation()
    first.disabled = selected === 0
    present.disabled = selected === current
    earlier.disabled = start === 0
    later.disabled = start + pageSize >= state.entries.length
    restore.disabled = selected < 0 || selected === current
  }
  function refreshLocale() {
    title.textContent = caption('title')
    list.setAttribute('aria-label', caption('list'))
    first.textContent = caption('first')
    present.textContent = caption('current_step')
    lastSaved.textContent = caption('last_saved')
    earlier.textContent = caption('earlier')
    later.textContent = caption('later')
    dismiss.textContent = caption('close')
    restore.textContent = caption('restore')
    render(true)
    if (doc.activeElement === list) rendered.get(selected)?.scrollIntoView?.({ block: 'nearest' })
  }
  function refreshHistory() {
    const previousId = state.entries[selected]?.id
    const followCurrent = selected === current
    state = engine.getHistory()
    current = state.entries.findIndex((entry) => entry.id === state.currentId)
    savedIndex = state.entries.findIndex((entry) => entry.id === savedId)
    savedId = state.entries[savedIndex]?.id
    const surviving = followCurrent
      ? current
      : state.entries.findIndex((entry) => entry.id === previousId)
    selected = surviving < 0 ? current : surviving
    const focused = doc.activeElement as HTMLElement | null
    render(true)
    if (
      focused &&
      dialog.contains(focused) &&
      (focused.matches('button:disabled') || focused.closest('[hidden]'))
    ) {
      list.focus({ preventScroll: true })
    }
    if (doc.activeElement === list) rendered.get(selected)?.scrollIntoView?.({ block: 'nearest' })
  }
  const stopHistory = engine.subscribe((event) => {
    if (event.type === 'history') refreshHistory()
  })
  const stopLocale = subscribeLocale(i18n, refreshLocale)
  function close() {
    if (closed) return
    closed = true
    events.abort()
    stopHistory()
    stopLocale()
    if (dialog.open) dialog.close()
    dialog.remove()
    if (previous?.isConnected && !previous.closest('[hidden],[inert]'))
      previous.focus?.({ preventScroll: true })
    opts.onClose?.()
  }
  list.addEventListener(
    'click',
    (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-history-id]')
      if (row && list.contains(row)) choose(Number(row.getAttribute('aria-posinset')) - 1)
    },
    { signal },
  )
  list.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return
      const last = state.entries.length - 1
      const keys: Record<string, number> = {
        ArrowUp: Math.max(0, selected - 1),
        ArrowDown: Math.min(last, selected + 1),
        Home: 0,
        End: last,
        PageUp: Math.max(0, selected - pageSize),
        PageDown: Math.min(last, selected + pageSize),
      }
      if (!Object.hasOwn(keys, event.key)) return
      event.preventDefault()
      choose(keys[event.key]!)
    },
    { signal },
  )
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault()
      close()
    },
    { signal },
  )
  dialog.addEventListener('close', close, { signal })
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.key === 'Tab') {
        const stops = [first, present, lastSaved, earlier, later, list, dismiss, restore].filter(
          (control) => !control.matches(':disabled') && !control.closest('[hidden]'),
        )
        const from = event.shiftKey ? stops[0] : stops.at(-1)
        if (doc.activeElement === from) {
          event.preventDefault()
          const next = event.shiftKey ? stops.at(-1) : stops[0]
          next?.focus()
        }
      }
    },
    { signal },
  )
  refreshLocale()
  dialog.showModal()
  list.focus({ preventScroll: true })
  rendered.get(selected)?.scrollIntoView?.({ block: 'nearest' })
  return { close, setSavedId }
}
