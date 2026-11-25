import {
  createId,
  type Engine,
  type I18n,
  type ReactiveI18n,
  type ResponsiveDevice,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { subscribeLocale } from './i18n.js'
import { replaceAll, replaceOne, searchPageText, type PageTextMatch } from './page-text-search.js'

const pageSize = 30
const captions = {
  title: ['尋找與取代', 'Find and replace'],
  query: ['尋找文字', 'Find text'],
  replacement: ['取代為', 'Replace with'],
  match_case: ['區分大小寫', 'Match case'],
  list: ['搜尋結果', 'Search results'],
  count: ['找到 {count} 處', 'Matches ({count})'],
  locked_count: ['已鎖定 {count} 處', 'Locked ({count})'],
  locked: ['已鎖定', 'Locked'],
  empty: ['找不到相符文字', 'No matches'],
  prompt: ['輸入要尋找的文字', 'Enter text to find'],
  previous: ['上一批結果', 'Previous results'],
  next: ['下一批結果', 'Next results'],
  reveal: ['跳到畫布', 'Show on canvas'],
  replace_one: ['取代一處', 'Replace one'],
  replace_all: ['全部取代', 'Replace all'],
  confirm_replace: ['確認取代 {count} 處', 'Confirm {count} replacements'],
  confirm_delete: ['確認刪除 {count} 處', 'Confirm {count} deletions'],
  replaced: ['已取代 {count} 處', 'Replaced ({count})'],
  deleted: ['已刪除 {count} 處', 'Deleted ({count})'],
  back: ['返回', 'Back'],
  cancel: ['取消', 'Cancel'],
} as const

const styles = `
.sigil-page-text-dialog {
  color-scheme: light;
  --find-bg: var(--sigil-color-surface, #fff); --find-text: var(--sigil-color-text, #172033);
  --find-muted: var(--sigil-color-muted, #475569); --find-border: var(--sigil-color-border, #cbd5e1);
  --find-tint: var(--sigil-color-accent-soft, #eef2ff); --find-accent: var(--sigil-color-accent, #4f46e5);
  --find-on-accent: #fff; --find-mark: #fff0af; --find-mark-text: #4b3500;
  width: min(36rem, calc(100% - 24px)); max-width: 100%; box-sizing: border-box;
  max-height: calc(100dvh - 24px); padding: 0; overflow: auto;
  color: var(--find-text); background: var(--find-bg); border: 1px solid var(--find-border);
  border-radius: var(--sigil-radius-md, 10px); box-shadow: 0 16px 56px #0f172a35;
  font: 14px/1.4 var(--sigil-font-sans, system-ui, sans-serif);
}
.sigil-page-text-dialog.sigil-theme-dark {
  color-scheme: dark;
  --find-bg: var(--sigil-color-surface, #1e293b); --find-text: var(--sigil-color-text, #f1f5f9);
  --find-muted: var(--sigil-color-muted, #b6c2d3); --find-border: var(--sigil-color-border-strong, #596980);
  --find-tint: var(--sigil-color-accent-soft, #343557); --find-accent: var(--sigil-color-accent, #a5b4fc);
  --find-on-accent: #111827; --find-mark: #675227; --find-mark-text: #fff5c2;
}
.sigil-page-text-dialog::backdrop { background: #0f172a70; }
.sigil-page-text-panel { display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; max-height: calc(100dvh - 26px); padding: 16px; overflow-y: auto; }
.sigil-page-text-dialog [hidden] { display: none; }
.sigil-page-text-head, .sigil-page-text-summary, .sigil-page-text-pages, .sigil-page-text-actions {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: none;
}
.sigil-page-text-head, .sigil-page-text-summary, .sigil-page-text-pages { justify-content: space-between; }
.sigil-page-text-head h2 { margin: 0; font-size: 1.125rem; line-height: 1.25; }
.sigil-page-text-fields { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
.sigil-page-text-fields label { display: grid; gap: 4px; min-width: 0; font-weight: 600; }
.sigil-page-text-dialog :is(button, input:not([type=checkbox])) {
  appearance: none; box-sizing: border-box; border: 1px solid var(--find-border); border-radius: 6px;
  background: var(--find-bg); color: inherit; font: inherit; min-height: 34px; padding: 5px 9px;
}
.sigil-page-text-dialog input:not([type=checkbox]) { min-width: 0; width: 100%; font-weight: 400; }
.sigil-page-text-case { display: inline-flex; align-items: center; gap: 6px; }
.sigil-page-text-case input { accent-color: var(--find-accent); margin: 0; }
.sigil-page-text-status { color: var(--find-muted); overflow-wrap: anywhere; }
.sigil-page-text-dialog button { cursor: pointer; }
.sigil-page-text-dialog button:not(:disabled):hover { background: var(--find-tint); }
.sigil-page-text-dialog :is(button, input, [role=listbox]):focus-visible { outline: 2px solid var(--sigil-color-focus, var(--find-accent)); outline-offset: 1px; }
.sigil-page-text-dialog button:disabled { opacity: .55; cursor: default; }
.sigil-page-text-list { min-height: 64px; max-height: min(36dvh, 20rem); overflow: auto; overscroll-behavior: contain; border: 1px solid var(--find-border); border-radius: 6px; }
.sigil-page-text-row { box-sizing: border-box; display: grid; gap: 2px; padding: 6px 10px; border-inline-start: 3px solid transparent; overflow-wrap: anywhere; cursor: pointer; }
.sigil-page-text-row + .sigil-page-text-row { border-top: 1px solid var(--find-border); }
.sigil-page-text-row[aria-selected=true] { background: var(--find-tint); border-inline-start-color: var(--find-accent); }
.sigil-page-text-name { font-weight: 600; }
.sigil-page-text-locked { margin-inline-start: 8px; font-size: .875em; font-weight: 400; color: var(--find-muted); }
.sigil-page-text-context { color: var(--find-muted); white-space: pre-wrap; }
.sigil-page-text-context mark { color: var(--find-mark-text); background: var(--find-mark); border-radius: 2px; font-weight: 700; }
.sigil-page-text-actions { justify-content: flex-end; }
.sigil-page-text-dialog button.sigil-page-text-primary:not(:disabled) { background: var(--find-accent); color: var(--find-on-accent); border-color: var(--find-accent); }
@media(max-width: 480px) {
  .sigil-page-text-panel { padding: 12px; gap: 8px; }
  .sigil-page-text-fields { grid-template-columns: minmax(0,1fr); gap: 6px; }
  .sigil-page-text-fields label { grid-template-columns: 6.5em minmax(0,1fr); align-items: center; }
  .sigil-page-text-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
  .sigil-page-text-actions [data-find-action=reveal] { grid-column: 1 / -1; }
  .sigil-page-text-actions [data-find-action=confirm] { grid-column: span 1; }
  .sigil-page-text-status { font-size: .9em; }
}
@media(pointer: coarse) {
  .sigil-page-text-dialog :is(button, input:not([type=checkbox])), .sigil-page-text-case, .sigil-page-text-row { min-height: 44px; }
}
`

interface PageTextDialogOptions {
  mount: HTMLElement
  engine: Engine
  i18n?: I18n
  richText?: Pick<RichTextResolver, 'supports'>
  device?: ResponsiveDevice
  trigger?: HTMLElement
  onClose?: () => void
  onReveal?: (nodeId: string) => void
  initialQuery?: string
  initialMatchCase?: boolean
  onQueryChange?: (query: string, matchCase: boolean) => void
}

export function openPageTextDialog(opts: PageTextDialogOptions): { close(): void } {
  const { mount, engine, i18n } = opts
  const doc = mount.ownerDocument
  const previous = opts.trigger ?? (doc.activeElement as HTMLElement | null)
  const events = new AbortController()
  const { signal } = events
  function part<T extends HTMLElement>(element: T, name: string) {
    element.className = 'sigil-page-text-' + name
    return element
  }
  function t(key: keyof typeof captions, count?: number) {
    const name = 'page_text.' + key
    const translated = i18n?.t(name)
    const locale =
      (i18n as Partial<ReactiveI18n> | undefined)?.getLocale?.() ?? doc.documentElement.lang
    const message =
      translated && translated !== name
        ? translated
        : captions[key][/^en(?:-|$)/i.test(locale) ? 1 : 0]
    return count === undefined ? message : message.replaceAll('{count}', String(count))
  }
  const dialog = part(doc.createElement('dialog'), 'dialog')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.classList.toggle(
    'sigil-theme-dark',
    !!(mount.closest('.sigil-theme-dark') || previous?.closest('.sigil-theme-dark')),
  )
  const style = doc.createElement('style')
  style.textContent = styles
  const panel = part(doc.createElement('div'), 'panel')
  const header = part(doc.createElement('div'), 'head')
  const title = doc.createElement('h2')
  title.id = 'sigil-page-text-' + createId()
  dialog.setAttribute('aria-labelledby', title.id)
  header.append(title)
  function button(parent: HTMLElement, action: string, run: () => void) {
    const control = doc.createElement('button')
    control.type = 'button'
    control.dataset.findAction = action
    control.addEventListener('click', run, { signal })
    parent.append(control)
    return control
  }
  const cancel = button(header, 'cancel', close)
  const fields = part(doc.createElement('div'), 'fields')
  function inputField(type: string) {
    const label = doc.createElement('label')
    const caption = doc.createElement('span')
    const input = doc.createElement('input')
    input.type = type
    label.append(caption, input)
    fields.append(label)
    return { input, caption }
  }
  const query = inputField('search')
  const replacement = inputField('text')
  query.input.value = opts.initialQuery ?? ''
  const summary = part(doc.createElement('div'), 'summary')
  const caseLabel = part(doc.createElement('label'), 'case')
  const matchCase = doc.createElement('input')
  matchCase.type = 'checkbox'
  matchCase.checked = !!opts.initialMatchCase
  const caseCaption = doc.createTextNode('')
  caseLabel.append(matchCase, caseCaption)
  const status = part(doc.createElement('span'), 'status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-atomic', 'true')
  summary.append(caseLabel, status)
  const list = part(doc.createElement('div'), 'list')
  list.setAttribute('role', 'listbox')
  list.tabIndex = 0
  const pages = part(doc.createElement('div'), 'pages')
  const earlier = button(pages, 'previous', () => select(Math.max(0, start - 1)))
  const range = doc.createElement('span')
  const later = button(pages, 'next', () => select(start + pageSize))
  pages.insertBefore(range, later)
  const actions = part(doc.createElement('div'), 'actions')
  const reveal = button(actions, 'reveal', showMatch)
  const one = button(actions, 'replace_one', () => apply('one'))
  const all = button(actions, 'replace_all', () => {
    if (composing || !changeable) return
    armed = true
    updateControls()
    back.focus()
  })
  one.className = 'sigil-page-text-primary'
  const back = button(actions, 'back', () => {
    armed = false
    updateControls()
    all.focus()
  })
  const confirm = button(actions, 'confirm', () => {
    if (armed) apply('all')
  })
  confirm.className = 'sigil-page-text-primary'
  panel.append(header, fields, summary, list, pages, actions)
  dialog.append(style, panel)
  mount.append(dialog)

  let matches: PageTextMatch[] = []
  let index = -1
  let start = -1
  let locked = 0
  let changeable = 0
  let armed = false
  let composing: HTMLElement | null = null
  let reported = 0
  let removed = false
  let pending = false
  let editing = false
  let closed = false
  let lastQuery = query.input.value
  let lastMatchCase = matchCase.checked
  function options() {
    return { matchCase: matchCase.checked, richText: opts.richText, device: opts.device }
  }
  function canReplace(match: PageTextMatch) {
    return !match.locked && match.content.slice(match.start, match.end) !== replacement.input.value
  }
  function updateControls() {
    const active = matches[index]
    const message = !query.input.value
      ? t('prompt')
      : !matches.length
        ? t('empty')
        : t('count', matches.length)
    const pieces = [message]
    if (locked) pieces.push(t('locked_count', locked))
    if (reported) pieces.unshift(t(removed ? 'deleted' : 'replaced', reported))
    const description = pieces.join(' · ')
    if (status.textContent !== description) status.textContent = description
    confirm.textContent = t(
      replacement.input.value ? 'confirm_replace' : 'confirm_delete',
      changeable,
    )
    back.hidden = confirm.hidden = !armed
    reveal.hidden = one.hidden = all.hidden = armed
    reveal.disabled = !active
    one.disabled = !active || !canReplace(active)
    all.disabled = !changeable
    list.hidden = !matches.length
    pages.hidden = matches.length <= pageSize
    earlier.disabled = start <= 0
    later.disabled = start + pageSize >= matches.length
    if (!pages.hidden)
      range.textContent = start + 1 + '–' + Math.min(start + pageSize, matches.length)
  }
  function renderResults(force = false) {
    const lastStart = Math.max(0, matches.length - pageSize)
    let next = Math.min(start, lastStart)
    if (next < 0 || index >= next + pageSize) next = Math.min(Math.max(0, index), lastStart)
    else if (index < next) next = Math.max(0, index - pageSize + 1)
    if (force || next !== start) {
      start = next
      const fragment = doc.createDocumentFragment()
      matches.slice(start, start + pageSize).forEach((match, offset) => {
        const at = start + offset
        const row = part(doc.createElement('div'), 'row')
        row.id = title.id + '-match-' + at
        row.dataset.matchIndex = String(at)
        row.setAttribute('role', 'option')
        row.setAttribute('aria-posinset', String(at + 1))
        row.setAttribute('aria-setsize', String(matches.length))
        const name = part(doc.createElement('div'), 'name')
        name.textContent = match.name
        if (match.locked) {
          const badge = part(doc.createElement('span'), 'locked')
          badge.textContent = t('locked')
          name.append(badge)
        }
        const context = part(doc.createElement('div'), 'context')
        const mark = doc.createElement('mark')
        const { content, start: from, end: to } = match
        mark.textContent =
          to - from > 120 ? content.slice(from, from + 120) + '…' : content.slice(from, to)
        context.append(
          (from > 32 ? '…' : '') + content.slice(Math.max(0, from - 32), from),
          mark,
          content.slice(to, to + 32) + (to + 32 < content.length ? '…' : ''),
        )
        row.append(name, context)
        fragment.append(row)
      })
      list.replaceChildren(fragment)
    }
    for (const row of list.children)
      row.setAttribute(
        'aria-selected',
        String(Number((row as HTMLElement).dataset.matchIndex) === index),
      )
    const active = list.children[index - start]
    if (active) list.setAttribute('aria-activedescendant', active.id)
    else list.removeAttribute('aria-activedescendant')
    updateControls()
  }
  function select(at: number) {
    if (!matches[at]) return
    index = at
    armed = false
    renderResults()
    list.focus({ preventScroll: true })
    list.children[index - start]?.scrollIntoView?.({ block: 'nearest' })
  }
  function search(anchor?: Pick<PageTextMatch, 'nodeId' | 'start'>, fallback = 0) {
    const focused = doc.activeElement as HTMLElement | null
    matches = searchPageText(engine.getTree(), query.input.value, options())
    locked = matches.reduce((sum, entry) => sum + Number(entry.locked), 0)
    changeable = matches.reduce((sum, entry) => sum + Number(canReplace(entry)), 0)
    const found = anchor
      ? matches.findIndex((entry) => entry.nodeId === anchor.nodeId && entry.start === anchor.start)
      : -1
    index = found >= 0 ? found : Math.min(Math.max(0, fallback), matches.length - 1)
    armed = false
    renderResults(true)
    if (
      focused &&
      dialog.contains(focused) &&
      (focused.matches(':disabled') || focused.closest('[hidden]'))
    ) {
      replacement.input.focus({ preventScroll: true })
    }
    if (doc.activeElement === list)
      list.children[index - start]?.scrollIntoView?.({ block: 'nearest' })
  }
  function apply(mode: 'one' | 'all') {
    const hit = matches[index]
    if (composing || pending || !hit) return
    const following = matches[index + 1]
    // Match offsets in the same component move when the chosen occurrence changes length.
    const anchor = following && { nodeId: following.nodeId, start: following.start }
    if (anchor && anchor.nodeId === hit.nodeId)
      anchor.start += replacement.input.value.length - (hit.end - hit.start)
    editing = true
    try {
      reported =
        mode === 'one'
          ? replaceOne(engine, query.input.value, replacement.input.value, hit, options())
          : replaceAll(engine, query.input.value, replacement.input.value, options())
    } finally {
      editing = false
    }
    removed = !replacement.input.value
    search(mode === 'one' ? anchor : undefined, index)
  }
  function showMatch() {
    const hit = matches[index]
    if (!hit || pending || composing) return
    close()
    if (opts.onReveal) opts.onReveal(hit.nodeId)
    else engine.select(hit.nodeId)
  }
  function translate() {
    title.textContent = t('title')
    query.caption.textContent = t('query')
    replacement.caption.textContent = t('replacement')
    caseCaption.data = t('match_case')
    list.setAttribute('aria-label', t('list'))
    cancel.textContent = t('cancel')
    earlier.textContent = t('previous')
    later.textContent = t('next')
    reveal.textContent = t('reveal')
    one.textContent = t('replace_one')
    all.textContent = t('replace_all')
    back.textContent = t('back')
    renderResults(true)
    if (doc.activeElement === list)
      list.children[index - start]?.scrollIntoView?.({ block: 'nearest' })
  }
  function updateInput(target: EventTarget | null) {
    reported = 0
    armed = false
    if (target === replacement.input) {
      changeable = matches.reduce((sum, entry) => sum + Number(canReplace(entry)), 0)
      updateControls()
    } else if (lastQuery !== query.input.value || lastMatchCase !== matchCase.checked) {
      lastQuery = query.input.value
      lastMatchCase = matchCase.checked
      opts.onQueryChange?.(lastQuery, lastMatchCase)
      search()
    }
  }
  for (const input of [query.input, replacement.input]) {
    input.addEventListener(
      'input',
      (event) => {
        if (!composing && !(event as InputEvent).isComposing) updateInput(input)
      },
      { signal },
    )
    input.addEventListener(
      'compositionstart',
      () => {
        composing = input
      },
      { signal },
    )
    input.addEventListener(
      'compositionend',
      () => {
        composing = null
        updateInput(input)
      },
      { signal },
    )
  }
  matchCase.addEventListener('change', () => updateInput(matchCase), { signal })
  list.addEventListener(
    'click',
    (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-match-index]')
      if (row && list.contains(row)) select(Number(row.dataset.matchIndex))
    },
    { signal },
  )
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (composing || event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.key === 'Tab') {
        const stops = Array.from(
          panel.querySelectorAll<HTMLElement>('input,button,[role=listbox]'),
        ).filter((control) => !control.matches(':disabled') && !control.closest('[hidden]'))
        const from = event.shiftKey ? stops[0] : stops.at(-1)
        if (doc.activeElement === from) {
          event.preventDefault()
          const next = event.shiftKey ? stops.at(-1) : stops[0]
          next?.focus()
        }
      } else if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.target === list) {
          const positions: Record<string, number> = {
            ArrowUp: index - 1,
            ArrowDown: index + 1,
            Home: 0,
            End: matches.length - 1,
            PageUp: index - pageSize,
            PageDown: index + pageSize,
          }
          if (Object.hasOwn(positions, event.key)) {
            event.preventDefault()
            select(Math.max(0, Math.min(matches.length - 1, positions[event.key]!)))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            showMatch()
          }
        } else if (
          event.target === query.input &&
          (event.key === 'Enter' || event.key === 'ArrowDown') &&
          matches.length
        ) {
          event.preventDefault()
          select(index)
        } else if (event.target === replacement.input && event.key === 'Enter' && !one.disabled) {
          event.preventDefault()
          apply('one')
        }
      }
    },
    { signal },
  )
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault()
      if (!composing) close()
    },
    { signal },
  )
  dialog.addEventListener('close', close, { signal })
  const stopLocale = subscribeLocale(i18n, translate)
  const stopEngine = engine.subscribe((event) => {
    if ((event.type !== 'patch' && event.type !== 'tree') || editing || pending) return
    pending = true
    queueMicrotask(() => {
      if (closed) return
      pending = false
      reported = 0
      search(matches[index], index)
    })
  })
  function close() {
    if (closed) return
    closed = true
    events.abort()
    stopEngine()
    stopLocale()
    if (dialog.open) dialog.close()
    dialog.remove()
    if (previous?.isConnected && !previous.closest('[hidden],[inert]'))
      previous.focus?.({ preventScroll: true })
    opts.onClose?.()
  }
  translate()
  search()
  dialog.showModal()
  query.input.focus({ preventScroll: true })
  if (opts.initialQuery) query.input.select()
  return { close }
}
