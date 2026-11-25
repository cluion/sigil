import { createId, findNode, type ComponentNode, type Engine, type I18n } from '@cluion/sigil-core'
import { findComponentPath } from './component-path.js'
import { subscribeLocale, uiText } from './i18n.js'
import { imageLinkLabel } from './image-link-label.js'

export interface SelectionPathOptions {
  i18n?: I18n
  compact?: boolean
  /** 選取祖先後，可將畫布捲到該元件。 */
  onActivate?: (id: string) => void
}

export interface SelectionPathHandle {
  setCompact(compact: boolean): void
  setVisible(visible: boolean): void
  destroy(): void
}

interface Entry {
  id: string
  label: string
}

function pathLabel(node: ComponentNode, root: boolean, i18n?: I18n): string {
  if (node.name?.trim()) return node.name.trim()
  const imageLink = imageLinkLabel(node, i18n)
  if (imageLink) return imageLink
  const attributes = Object.entries(node.attributes ?? {})
  for (const key of ['aria-label', 'id']) {
    const value = attributes.find(([name]) => name.toLowerCase() === key)?.[1]?.trim()
    if (value) return value
  }
  if (root) return uiText(i18n, 'path.page', '頁面')
  if (node.shortcode?.name) return node.shortcode.name
  if (node.type === 'section') return uiText(i18n, 'move.section', '區段')
  if (node.type === 'column') return uiText(i18n, 'move.column', '欄')
  return node.tagName || node.type
}

function isLabelAttribute(key: string): boolean {
  const name = key.toLowerCase()
  return name === 'aria-label' || name === 'id' || name === 'href'
}

const styles = `
.sigil-selection-path { min-inline-size: 0; max-inline-size: 100%; color: var(--sigil-color-text, inherit); }
.sigil-selection-path[hidden], .sigil-selection-path [hidden] { display: none; }
.sigil-selection-path ol { list-style: none; margin: 0; padding: 0; }
.sigil-selection-path button { font: inherit; cursor: pointer; color: inherit; }
.sigil-selection-path button:focus-visible, .sigil-selection-path [aria-current]:focus-visible {
  outline: 2px solid var(--sigil-color-focus, #4f46e5); outline-offset: -2px;
}
.sigil-selection-path .sigil-path-trail {
  display: flex; align-items: center; overflow-x: auto; scrollbar-width: thin;
}
.sigil-path-trail > li { display: flex; align-items: center; flex: none; }
.sigil-path-trail > li + li::before {
  content: ''; inline-size: 4px; block-size: 4px; margin-inline: 3px;
  border-block-start: 1px solid var(--sigil-color-muted, #64748b);
  border-inline-end: 1px solid var(--sigil-color-muted, #64748b); transform: rotate(45deg);
}
.sigil-path-trail button, .sigil-path-trail [aria-current] {
  display: block; box-sizing: border-box; max-inline-size: 16em; padding: 4px 6px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; border: 0; border-radius: 4px;
  background: transparent; line-height: 1.4;
}
.sigil-path-trail button { color: var(--sigil-color-muted, #475569); }
.sigil-path-trail [aria-current] { font-weight: 600; }
.sigil-selection-path button:hover { background-color: var(--sigil-color-accent-soft, #eef2ff); }
.sigil-selection-path-trigger, .sigil-path-close {
  min-inline-size: 44px; min-block-size: 44px; padding: 0 9px; white-space: nowrap;
  border: 1px solid var(--sigil-color-border-strong, #cbd5e1); border-radius: 6px;
  background: var(--sigil-color-surface, #fff);
}
.sigil-path-dialog {
  box-sizing: border-box; inline-size: min(24rem, calc(100% - 2rem)); max-inline-size: 100%;
  max-block-size: calc(100dvh - 2rem); overflow: auto; overscroll-behavior: contain;
  margin: auto; padding: 0; border: 1px solid var(--sigil-color-border-strong, #cbd5e1);
  border-radius: 12px; color: var(--sigil-color-text, #172033);
  background: var(--sigil-color-surface, #fff); box-shadow: 0 18px 60px #0f172a40;
  font: 400 14px/1.4 var(--sigil-font-sans, system-ui, sans-serif);
}
.sigil-path-dialog::backdrop { background: rgb(15 23 42 / 42%); }
.sigil-path-dialog header {
  position: sticky; inset-block-start: 0; z-index: 1; display: flex; align-items: center;
  justify-content: space-between; gap: 12px; padding: 10px 14px;
  border-block-end: 1px solid var(--sigil-color-border, #e2e8f0);
  background: var(--sigil-color-surface, #fff);
}
.sigil-path-dialog h2 { margin: 0; font: 600 1.1rem/1.3 var(--sigil-font-sans, system-ui, sans-serif); }
.sigil-path-dialog ol { padding: 8px; }
.sigil-path-dialog li + li { border-block-start: 1px solid var(--sigil-color-border, #e2e8f0); }
.sigil-path-dialog li > * {
  display: flex; align-items: center; box-sizing: border-box; inline-size: 100%; min-block-size: 44px;
  padding: 8px 10px; overflow-wrap: anywhere; text-align: start; border: 0; border-radius: 4px;
  background: transparent;
}
.sigil-path-dialog li + li > * { padding-inline-start: calc(10px + var(--sigil-path-inset, 0px)); }
.sigil-path-dialog li + li > *::before {
  content: ''; flex: none; inline-size: 7px; block-size: 8px;
  margin-inline-end: 9px; margin-block-start: -4px;
  border-inline-start: 1px solid var(--sigil-color-border-strong, #94a3b8);
  border-block-end: 1px solid var(--sigil-color-border-strong, #94a3b8);
}
.sigil-path-dialog [aria-current] {
  font-weight: 600; color: var(--sigil-color-accent, #4338ca);
  background: var(--sigil-color-accent-soft, #eef2ff);
}
`

/** 顯示目前選取元件的路徑，按祖先即可切換選取。 */
export function createSelectionPath(
  engine: Engine,
  container: HTMLElement,
  opts: SelectionPathOptions = {},
): SelectionPathHandle {
  const doc = container.ownerDocument
  const style = doc.createElement('style')
  style.textContent = styles
  const nav = doc.createElement('nav')
  nav.className = 'sigil-selection-path'
  const trail = doc.createElement('ol')
  trail.className = 'sigil-path-trail'
  const trigger = doc.createElement('button')
  trigger.type = 'button'
  trigger.className = 'sigil-selection-path-trigger'
  trigger.setAttribute('aria-haspopup', 'dialog')
  const dialog = doc.createElement('dialog')
  dialog.className = 'sigil-path-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.id = 'sigil-path-' + createId()
  trigger.setAttribute('aria-controls', dialog.id)
  const header = doc.createElement('header')
  const title = doc.createElement('h2')
  title.id = dialog.id + '-title'
  dialog.setAttribute('aria-labelledby', title.id)
  const close = doc.createElement('button')
  close.type = 'button'
  close.className = 'sigil-path-close'
  header.append(title, close)
  const list = doc.createElement('ol')
  dialog.append(header, list)
  nav.append(trail, trigger, dialog)
  container.append(style, nav)

  let path: Entry[] = []
  let containsAnchor = false
  let selected = engine.getSelection()
  let compact = opts.compact ?? false
  let visible = true
  let destroyed = false
  let revealPending = false

  function revealCurrent() {
    if (revealPending || compact || nav.hidden) return
    revealPending = true
    queueMicrotask(() => {
      revealPending = false
      if (destroyed || compact || nav.hidden) return
      if (!trail.contains(doc.activeElement) || doc.activeElement?.hasAttribute('aria-current'))
        trail.scrollLeft = trail.scrollWidth
    })
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealCurrent)
  observer?.observe(trail)

  function closeDialog(restore: boolean) {
    if (!dialog.open) return
    dialog.close()
    trigger.setAttribute('aria-expanded', 'false')
    list.replaceChildren()
    if (restore && !trigger.closest('[hidden], [inert]')) trigger.focus({ preventScroll: true })
  }

  function showControls() {
    nav.hidden = !visible || !path.length
    trail.hidden = compact
    trigger.hidden = !compact
    if (nav.hidden || !compact) closeDialog(false)
  }

  function fill(target: HTMLOListElement) {
    target.replaceChildren(
      ...path.map(({ id, label }, index) => {
        const li = doc.createElement('li')
        if (target === list && index > 0) {
          li.style.setProperty('--sigil-path-inset', Math.min(index - 1, 4) * 9 + 'px')
        }
        let item: HTMLElement
        if (index === path.length - 1) {
          item = doc.createElement('span')
          item.setAttribute('aria-current', 'location')
          item.tabIndex = -1
        } else {
          const button = doc.createElement('button')
          button.type = 'button'
          item = button
        }
        item.dataset.pathId = id
        item.title = label + ' · ' + id
        item.textContent = label
        li.append(item)
        return li
      }),
    )
  }

  function refresh() {
    const nodes = selected ? findComponentPath(engine.getTree(), selected) : []
    containsAnchor = nodes.some((node) => node.tagName?.toLowerCase() === 'a')
    const next = nodes.map((node, index) => ({
      id: node.id,
      label: pathLabel(node, index === 0, opts.i18n),
    }))
    if (
      next.length === path.length &&
      next.every((item, i) => item.id === path[i]!.id && item.label === path[i]!.label)
    )
      return
    const active = doc.activeElement
    const focusedId = nav.contains(active) ? active?.getAttribute('data-path-id') : null
    path = next
    if (!compact) fill(trail)
    if (dialog.open) fill(list)
    showControls()
    if (focusedId && !nav.hidden) {
      const items = (dialog.open ? list : trail).querySelectorAll<HTMLElement>('[data-path-id]')
      const target = Array.from(items).find((item) => item.dataset.pathId === focusedId)
      ;(target ?? items[items.length - 1])?.focus({ preventScroll: true })
    }
    revealCurrent()
  }

  function translate() {
    const label = uiText(opts.i18n, 'path.title', '元件路徑')
    title.textContent = trigger.textContent = label
    nav.setAttribute('aria-label', label)
    close.textContent = uiText(opts.i18n, 'path.close', '關閉')
    refresh()
  }

  trigger.setAttribute('aria-expanded', 'false')
  trigger.addEventListener('click', () => {
    if (destroyed || !compact || nav.hidden || dialog.open) return
    fill(list)
    dialog.showModal()
    trigger.setAttribute('aria-expanded', 'true')
    ;(list.querySelector<HTMLElement>('li:nth-last-child(2) > button') ?? close).focus()
  })
  close.addEventListener('click', () => closeDialog(true))
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeDialog(true)
  })
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.stopPropagation()
    closeDialog(true)
  })
  nav.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(true)
    const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>(
      'button[data-path-id]',
    )
    if (!button || nav.hidden || destroyed) return
    const id = button.dataset.pathId!
    closeDialog(true)
    engine.select(id)
    if (destroyed || !visible || selected !== id) return
    if (!compact) trail.querySelector<HTMLElement>('[aria-current]')?.focus({ preventScroll: true })
    opts.onActivate?.(id)
  })

  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'history') return
    const id = engine.getSelection()
    const patch = event.type === 'patch' ? event.patch : undefined
    const refreshLink =
      patch &&
      containsAnchor &&
      (patch.type !== 'update' ||
        patch.tagName !== undefined ||
        patch.shortcode !== undefined ||
        (patch.content !== undefined && path.some((entry) => entry.id === patch.id)))
    if (patch && selected === id && !refreshLink) {
      if (!id) return
      if (
        patch.type === 'update' &&
        patch.name === undefined &&
        patch.tagName === undefined &&
        patch.shortcode === undefined &&
        !(patch.attrs && Object.keys(patch.attrs).some(isLabelAttribute)) &&
        !patch.removeAttributes?.some(isLabelAttribute)
      )
        return
      if (patch.type === 'insert' || (patch.type === 'replace' && !path.length)) {
        if (path.length || !findNode(patch.node, id)) return
      } else if (!path.some((entry) => entry.id === patch.id)) return
    }
    if (selected !== id) closeDialog(true)
    else if (event.type === 'selection') return
    selected = id
    refresh()
  })
  const unsubscribeLocale = subscribeLocale(opts.i18n, translate)
  translate()
  showControls()

  return {
    setCompact(next) {
      if (destroyed || compact === next) return
      const hadFocus = nav.contains(doc.activeElement)
      compact = next
      if (compact) trail.replaceChildren()
      else fill(trail)
      showControls()
      revealCurrent()
      if (hadFocus && !nav.hidden) {
        const focus = compact ? trigger : trail.querySelector<HTMLElement>('[aria-current]')
        focus?.focus({ preventScroll: true })
      }
    },
    setVisible(next) {
      if (destroyed || visible === next) return
      visible = next
      showControls()
      revealCurrent()
    },
    destroy() {
      destroyed = true
      observer?.disconnect()
      unsubscribe()
      unsubscribeLocale()
      closeDialog(false)
      nav.remove()
      style.remove()
    },
  }
}
