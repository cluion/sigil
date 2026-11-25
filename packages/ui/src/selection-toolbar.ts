import {
  createCommandRegistry,
  createDefaultEditingCommands,
  findNode,
  findParent,
  type CommandContext,
  type CommandRegistry,
  type ComponentNode,
  type Engine,
} from '@cluion/sigil-core'
import type { CanvasOptions } from './canvas.js'
import { getCanvasTargetVisibility, revealCanvasTarget } from './canvas-visibility.js'
import { uiText } from './i18n.js'
import { supportsImageFraming } from './image-framing.js'
import { readImageLink } from './image-link.js'
import { imageLinkLabel } from './image-link-label.js'
import { createInlineEditControls, type InlineEditControlHandlers } from './inline-edit-controls.js'
import { isNativeLink } from './link-fields.js'
import { canMoveComponent, openMoveDialog } from './move-dialog.js'

export interface CanvasSelectionCommands {
  registry: CommandRegistry
  context: () => CommandContext
}

const editTextPath = 'm14 5 5 5M3 21l5-1 13-13a2 2 0 0 0-5-5L3 15z'
const linkPath =
  'M10 13a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.7-5.7l-2 2M14 11a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.7 5.7l2-2'
const actions = [
  {
    id: 'edit-text',
    key: 'canvas.edit_text',
    label: '編輯文字',
    path: editTextPath,
  },
  {
    id: 'edit-leading-text',
    key: 'canvas.edit_leading_text',
    label: '編輯開頭文字',
    path: editTextPath,
  },
  {
    id: 'replace-image',
    key: 'canvas.replace_image',
    label: '更換圖片',
    path: 'M3 4h18v16H3zM4 17l5-6 4 4 3-3 4 5',
  },
  {
    id: 'image-link',
    key: 'image.link',
    label: '圖片連結',
    path: linkPath,
  },
  {
    id: 'frame-image',
    key: 'image.framing_action',
    label: '調整圖片構圖',
    path: 'M6 3v15h15M3 6h15v15',
  },
  {
    id: 'edit-link',
    key: 'link.edit',
    label: '編輯連結',
    path: linkPath,
  },
  {
    id: 'edit-typography',
    key: 'typography.edit',
    label: '調整文字排版',
    path: 'M3 6V4h12v2M9 4v15m-3 0h6m2-7v-2h8v2m-4-2v9m-2 0h4',
  },
  {
    id: 'move-to',
    key: 'move.title',
    label: '移動元件',
    path: 'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',
  },
  {
    id: 'insert-after',
    key: 'canvas.insert_after',
    label: '在下方新增區塊',
    path: 'M4 6h16M12 10v10m-5-5h10',
  },
  {
    id: 'select-parent',
    key: 'canvas.select_parent',
    label: '選取父層',
    path: 'M19 18v-5a3 3 0 0 0-3-3H5m6-6-6 6 6 6',
  },
  {
    id: 'duplicate',
    key: 'canvas.duplicate',
    label: '複製元件',
    path: 'M9 9h11v12H9zM16 9V3H3v12h6',
  },
  {
    id: 'delete',
    key: 'canvas.delete',
    label: '刪除元件',
    path: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  },
] as const

const styles = `
.sigil-selection-toolbar {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: max-content;
  max-width: 100%;
  padding: 2px;
  border-radius: 6px;
  background: #4338ca;
  color: white;
  box-shadow: 0 2px 6px #17255430;
  font: 600 12px/1.25 system-ui, sans-serif;
}
.sigil-selection-toolbar[hidden], .sigil-selection-toolbar [hidden] { display: none; }
.sigil-selection-toolbar [data-sigil-type-badge] {
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
}
.sigil-selection-toolbar button {
  appearance: none;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: white;
  cursor: pointer;
}
.sigil-selection-toolbar button:hover:not(:disabled), .sigil-selection-toolbar button:focus-visible {
  background: #ffffff30;
}
.sigil-selection-toolbar button:focus-visible { outline: 2px solid white; outline-offset: -2px; }
.sigil-selection-toolbar button:disabled { opacity: .45; cursor: default; }
.sigil-selection-toolbar button:has(span):not([hidden]) {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  min-width: 28px;
  width: auto;
  padding: 0 6px;
  font: inherit;
  white-space: nowrap;
}
.sigil-selection-toolbar button span { overflow: hidden; text-overflow: ellipsis; }
.sigil-selection-toolbar svg { flex: none; width: 16px; height: 16px; pointer-events: none; }
.sigil-selection-toolbar [role=status]:not(:empty) { padding: 0 6px; }
@media (pointer: coarse) {
  .sigil-selection-toolbar button { width: 44px; height: 44px; }
  .sigil-selection-toolbar button:has(span):not([hidden]) { min-width: 44px; }
}
.sigil-selection-toolbar--docked {
  position: static;
  width: 100%;
  flex-wrap: wrap;
  container-type: inline-size;
  padding: 3px;
  border: 1px solid var(--sigil-color-border, #cbd5e1);
  background: var(--sigil-color-surface, white);
  color: var(--sigil-color-text, #0f172a);
  box-shadow: none;
}
.sigil-selection-toolbar--docked button { color: inherit; }
.sigil-selection-toolbar--docked button:hover:not(:disabled),
.sigil-selection-toolbar--docked button:focus-visible {
  background: var(--sigil-color-accent-soft, #eef2ff);
  color: var(--sigil-color-accent-hover, #4338ca);
}
.sigil-selection-toolbar--docked button:focus-visible {
  outline-color: var(--sigil-color-focus, #4f46e5);
}
.sigil-selection-identity {
  display: flex;
  align-items: center;
  flex: 1 1 100px;
  min-width: 0;
  min-height: 24px;
}
.sigil-selection-identity [data-sigil-type-badge] {
  max-width: 100%;
  border-inline-start: 3px solid var(--sigil-color-accent, #4f46e5);
}
.sigil-selection-identity button:has(span):not([hidden]) {
  flex: 0 0 auto;
  max-width: 45%;
}
.sigil-selection-commands { display: flex; flex-wrap: wrap; max-width: 100%; }
.sigil-selection-identity button[data-primary-action] {
  margin-inline-start: auto;
  background: var(--sigil-color-accent-soft, #eef2ff);
  color: var(--sigil-color-accent-hover, #4338ca);
}
.sigil-selection-toolbar--docked [data-sigil-locate] {
  color: var(--sigil-color-accent-hover, #4338ca);
}
@container (max-width: 520px) {
  .sigil-selection-identity { flex-basis: 100%; }
  .sigil-selection-commands { width: 100%; justify-content: space-around; }
  .sigil-selection-identity:has([data-sigil-locate]:not([hidden]))
    [data-edit-link]:not([data-primary-action]) span { display: none; }
  .sigil-selection-commands button:has(span):not([hidden]) {
    flex: none;
    justify-content: center;
    padding: 0;
    width: 28px;
  }
  .sigil-selection-commands button span { display: none; }
}
.sigil-inline-edit-controls {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--sigil-color-border, #cbd5e1);
  border-radius: 6px;
  background: var(--sigil-color-surface, white);
  color: var(--sigil-color-text, #0f172a);
  font: 600 12px/1.3 system-ui, sans-serif;
}
.sigil-inline-edit-controls[hidden] { display: none; }
.sigil-inline-edit-controls > div {
  flex: 1 1 80px;
  min-width: 0;
  padding-inline-start: 7px;
  border-inline-start: 3px solid var(--sigil-color-accent, #4f46e5);
}
.sigil-inline-edit-controls span { color: var(--sigil-color-muted, #475569); }
.sigil-inline-edit-controls [role=status]:empty { display: none; }
.sigil-inline-edit-controls [role=status]:not(:empty) {
  flex-basis: 100%;
  padding: 2px 7px;
  color: inherit;
}
.sigil-inline-edit-controls strong {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sigil-inline-edit-controls button {
  appearance: none;
  min-height: 30px;
  padding: 0 10px;
  color: inherit;
  background: transparent;
  border: 1px solid var(--sigil-color-border-strong, #cbd5e1);
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
}
.sigil-inline-edit-controls button:first-of-type {
  border-color: transparent;
  background: var(--sigil-color-accent, #4f46e5);
  color: var(--sigil-color-surface, white);
}
.sigil-inline-edit-controls button:focus-visible {
  outline: 2px solid var(--sigil-color-text, #0f172a);
  outline-offset: -3px;
}
.sigil-inline-edit-controls button:hover:not(:disabled) { filter: brightness(.92); }
.sigil-inline-edit-controls button:disabled { opacity: .55; cursor: default; }
@media (pointer: coarse) {
  .sigil-inline-edit-controls button { min-height: 44px; min-width: 44px; }
}
`

export function createSelectionToolbar(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  engine: Engine,
  {
    i18n,
    selectionCommands: commands,
    selectionToolbarContainer: dock,
    onReplaceImage,
    onInsertAfter,
    onFrameImage,
    onEditImageLink,
    onEditLink,
    onEditTypography,
    onEditLeadingText,
    richText,
    rendererOptions,
    onComponentMoved,
  }: CanvasOptions = {},
  editing: InlineEditControlHandlers & {
    canEdit(node: ComponentNode): boolean
    canEditLeadingText(node: ComponentNode): boolean
    start(id: string): void
  },
) {
  const doc = container.ownerDocument
  const style = doc.createElement('style')
  style.textContent = styles
  const bar = doc.createElement('div')
  bar.className = 'sigil-selection-toolbar'
  bar.classList.toggle('sigil-selection-toolbar--docked', !!dock)
  bar.setAttribute('role', 'toolbar')
  bar.tabIndex = -1
  bar.hidden = true
  const label = doc.createElement('span')
  label.dataset.sigilTypeBadge = '1'
  const status = doc.createElement('span')
  status.setAttribute('role', 'status')
  function showCommandError() {
    status.textContent = uiText(i18n, 'canvas.command_failed', '操作失敗，請再試一次。')
  }
  const identity = dock ? doc.createElement('div') : bar
  const commandGroup = dock ? doc.createElement('div') : bar
  if (dock) {
    identity.className = 'sigil-selection-identity'
    commandGroup.className = 'sigil-selection-commands'
    bar.append(identity, commandGroup)
  }
  identity.append(label)
  ;(dock ?? container).append(style, bar)
  const editControls = dock && createInlineEditControls(dock, iframe, i18n, editing)

  const registry = commands?.registry ?? createCommandRegistry(createDefaultEditingCommands())
  let copied: ComponentNode | null = null
  const context =
    commands?.context ??
    (() => ({
      engine,
      getDoc: () => engine.toJSON(),
      clipboard: {
        get: () => copied,
        set: (node: ComponentNode | null) => {
          copied = node
        },
      },
    }))
  let target: Element | null = null
  let frameDocument: Document | null = null
  let intersection: IntersectionObserver | undefined
  let pendingFrame = 0
  let destroyed = false
  let closeImagePicker: (() => void) | undefined
  let closeInsertPicker: (() => void) | undefined
  let closeMoveDialog: (() => void) | undefined
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(container)
  observer?.observe(iframe)
  function iconButton(pathData: string): HTMLButtonElement {
    const button = doc.createElement('button')
    button.type = 'button'
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('aria-hidden', 'true')
    const path = doc.createElementNS(icon.namespaceURI!, 'path')
    path.setAttribute('d', pathData)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.75')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    icon.append(path)
    button.append(icon)
    return button
  }
  const locate = iconButton(
    'M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  )
  locate.dataset.sigilLocate = ''
  locate.append(doc.createElement('span'))
  locate.hidden = true
  locate.addEventListener('click', () => revealSelection({ focusToolbar: true }))
  if (dock) identity.append(locate)
  const buttons = actions.map((action) => {
    const button = iconButton(action.path)
    const opensSettings =
      action.id === 'edit-leading-text' ||
      action.id === 'frame-image' ||
      action.id === 'image-link' ||
      action.id === 'edit-link' ||
      action.id === 'edit-typography'
    if (action.id === 'edit-link' || action.id === 'image-link') button.dataset.editLink = ''
    if (action.id === 'replace-image') button.dataset.imageAction = 'replace'
    if (action.id === 'frame-image') button.dataset.imageAction = 'frame'
    if (action.id === 'move-to') button.setAttribute('aria-haspopup', 'dialog')
    if (opensSettings) button.dataset.componentSettings = ''
    if (
      action.id === 'replace-image' ||
      action.id === 'insert-after' ||
      (dock && (action.id === 'edit-text' || (opensSettings && action.id !== 'frame-image')))
    ) {
      button.append(doc.createElement('span'))
    }
    button.addEventListener('click', async () => {
      const id = engine.getSelection()
      if (!id || !target || button.hidden || button.disabled) return
      const hadFocus = bar.contains(doc.activeElement)
      const parent = action.id === 'delete' ? findParent(engine.getTree(), id) : null
      status.textContent = ''
      try {
        if (action.id === 'edit-text') {
          revealCanvasTarget(container, iframe, target)
          editing.start(id)
          return
        }
        if (action.id === 'edit-leading-text') {
          if (!destroyed && !container.closest('[inert]') && !bar.closest('[inert]'))
            onEditLeadingText?.(id, button)
          return
        }
        if (action.id === 'move-to') {
          moveSelection(button)
          return
        }
        if (action.id === 'insert-after') {
          cancelInsertAfter()
          closeInsertPicker = onInsertAfter?.(id, button) ?? undefined
          return
        }
        if (action.id === 'replace-image') {
          closeImagePicker = onReplaceImage?.(id, button) ?? undefined
          return
        }
        if (action.id === 'frame-image') {
          onFrameImage?.(id, button)
          return
        }
        if (action.id === 'image-link') {
          onEditImageLink?.(id, button)
          return
        }
        if (action.id === 'edit-link') {
          onEditLink?.(id, button)
          return
        }
        if (action.id === 'edit-typography') {
          onEditTypography?.(id, button)
          return
        }
        if (!(await registry.run(action.id, context())) || destroyed) return
        if (
          action.id === 'delete' &&
          parent &&
          !engine.getSelection() &&
          !findNode(engine.getTree(), id) &&
          findNode(engine.getTree(), parent.id)
        ) {
          engine.select(parent.id)
        }
        if (action.id === 'duplicate') revealSelection()
        if (
          hadFocus &&
          button.disabled &&
          (doc.activeElement === doc.body || bar.contains(doc.activeElement))
        ) {
          position()
          ;(buttons.find((item) => !item.hidden && !item.disabled) ?? bar).focus({
            preventScroll: true,
          })
        }
      } catch {
        showCommandError()
      }
    })
    commandGroup.append(button)
    return button
  })
  const controls = dock ? [locate, ...buttons] : buttons
  let primary: HTMLButtonElement | undefined
  const editButton = buttons[actions.findIndex((action) => action.id === 'edit-text')]!
  const leadingTextButton =
    buttons[actions.findIndex((action) => action.id === 'edit-leading-text')]!
  const editLinkButton = buttons[actions.findIndex((action) => action.id === 'edit-link')]!
  const imageLinkButton = buttons[actions.findIndex((action) => action.id === 'image-link')]!
  const imageButton = buttons.find((button) => button.dataset.imageAction === 'replace')!
  bar.append(status)
  function returnToCommands(button: HTMLButtonElement): void {
    const following = buttons
      .slice(buttons.indexOf(button) + 1)
      .find((other) => other.parentElement === commandGroup)
    commandGroup.insertBefore(button, following ?? null)
  }
  function updateTabStop(): void {
    const enabled = controls.filter((button) => !button.disabled && !button.hidden)
    const current = enabled.find((button) => button.tabIndex === 0) ?? enabled[0]
    for (const button of controls) button.tabIndex = button === current ? 0 : -1
  }
  bar.addEventListener('focusin', (event) => {
    if (controls.some((button) => button === event.target)) {
      for (const button of controls) button.tabIndex = button === event.target ? 0 : -1
    }
  })
  bar.addEventListener('keydown', (event) => {
    const enabled = controls.filter((button) => !button.hidden && !button.disabled)
    const index = enabled.indexOf(doc.activeElement as HTMLButtonElement)
    if (!enabled.length || (index < 0 && doc.activeElement !== bar)) return
    let next: HTMLButtonElement | undefined
    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length]
    if (event.key === 'ArrowLeft')
      next = enabled[((index < 0 ? 0 : index) + enabled.length - 1) % enabled.length]
    if (event.key === 'Home') next = enabled[0]
    if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next) {
      event.preventDefault()
      next.focus({ preventScroll: true })
    }
  })

  function position(): void {
    if (!target?.isConnected) {
      bar.hidden = true
      return
    }
    const visibility = getCanvasTargetVisibility(container, iframe, target)
    if (dock) {
      bar.hidden = false
      const hideLocate = visibility !== 'offscreen'
      if (locate.hidden !== hideLocate) {
        const restoreFocus = hideLocate && doc.activeElement === locate
        locate.hidden = hideLocate
        updateTabStop()
        if (restoreFocus) bar.focus({ preventScroll: true })
      }
      return
    }
    if (visibility !== 'visible') {
      bar.hidden = true
      return
    }
    const box = target.getBoundingClientRect()
    const frameX = iframe.offsetLeft + iframe.clientLeft
    const frameY = iframe.offsetTop + iframe.clientTop
    const left = Math.max(container.scrollLeft, frameX) + 2
    const top = Math.max(container.scrollTop, frameY) + 2
    const right =
      Math.min(container.scrollLeft + container.clientWidth, frameX + iframe.clientWidth) - 2
    const bottom =
      Math.min(container.scrollTop + container.clientHeight, frameY + iframe.clientHeight) - 2
    bar.hidden = false
    bar.style.maxWidth = `${Math.max(0, right - left)}px`
    const above = frameY + box.top - bar.offsetHeight - 3
    const below = frameY + box.bottom + 3
    const y = above >= top ? above : below + bar.offsetHeight <= bottom ? below : top
    bar.style.left = `${Math.max(left, Math.min(frameX + box.left, right - bar.offsetWidth))}px`
    bar.style.top = `${y}px`
  }

  function schedule(): void {
    if (!target || pendingFrame) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0
      position()
    })
  }

  function cancelInsertAfter(): void {
    const close = closeInsertPicker
    closeInsertPicker = undefined
    close?.()
  }

  function canMoveSelection(): boolean {
    const id = engine.getSelection()
    return !destroyed && !!id && canMoveComponent(engine.getTree(), id, richText?.resolver)
  }

  function moveSelection(trigger?: HTMLElement): void {
    const id = engine.getSelection()
    if (!id || !canMoveSelection()) return
    closeMoveDialog?.()
    const moveButton = buttons[actions.findIndex((action) => action.id === 'move-to')]!
    closeMoveDialog = openMoveDialog({
      engine,
      id,
      i18n,
      richText: richText?.resolver,
      trigger: trigger ?? moveButton,
      onClose(moved) {
        closeMoveDialog = undefined
        if (!moved || destroyed) return
        onComponentMoved?.(id)
        revealSelection({ focusToolbar: true })
      },
    })
  }

  function revealSelection(options?: { focusToolbar?: boolean }): void {
    if (!target?.isConnected) return
    revealCanvasTarget(container, iframe, target)
    position()
    if (options?.focusToolbar && !bar.hidden) bar.focus({ preventScroll: true })
  }

  function translate(): void {
    editControls?.translate()
    bar.setAttribute('aria-label', uiText(i18n, 'canvas.component_actions', '元件操作'))
    const locateText = uiText(i18n, 'canvas.locate_selection', '在畫布定位')
    locate.title = locateText
    locate.setAttribute('aria-label', locateText)
    locate.querySelector('span')!.textContent = locateText
    if (status.textContent) showCommandError()
    actions.forEach((action, index) => {
      const caption = uiText(i18n, action.key, action.label)
      const button = buttons[index]!
      button.title = caption
      button.setAttribute('aria-label', caption)
      const text = button.querySelector('span')
      if (text) text.textContent = caption
    })
  }
  translate()
  container.addEventListener('scroll', schedule)
  doc.defaultView?.addEventListener('resize', schedule)

  return {
    showEditing(name: string, composing = false) {
      bar.hidden = true
      editControls?.setComposing(composing)
      editControls?.show(name)
    },
    hideEditing: () => editControls?.hide(),
    showEditingError: () => editControls?.showError(),
    showCommandError,
    setComposing: (composing: boolean) => editControls?.setComposing(composing),
    hasEditingFocus: () => editControls?.hasFocus() ?? false,
    focusEditingAction: () => editControls?.focus() ?? false,
    focusEditAction() {
      position()
      if (bar.hidden || bar.closest('[inert]')) return
      ;(editButton.hidden || editButton.disabled ? bar : editButton).focus({ preventScroll: true })
    },
    translate,
    schedule,
    revealSelection,
    cancelInsertAfter,
    cancelMove: () => closeMoveDialog?.(),
    canMoveSelection,
    moveSelection,
    replaceImage() {
      position()
      imageButton.click()
    },
    bindFrame(next: Document | null) {
      frameDocument?.removeEventListener('scroll', schedule, true)
      intersection?.disconnect()
      frameDocument = next
      frameDocument?.addEventListener('scroll', schedule, true)
      intersection =
        next && typeof IntersectionObserver !== 'undefined'
          ? new IntersectionObserver(schedule, { root: next })
          : undefined
      if (target?.ownerDocument === next && target) intersection?.observe(target)
    },
    show(node: ComponentNode | null, element: Element | null) {
      if (target !== element || node?.type !== 'image' || node.shortcode || node.locked) {
        closeImagePicker?.()
        closeImagePicker = undefined
      }
      if (target !== element) {
        if (target) {
          observer?.unobserve(target)
          intersection?.unobserve(target)
        }
        target = element
        if (target) {
          observer?.observe(target)
          intersection?.observe(target)
        }
        status.textContent = ''
      }
      if (!node || !element) {
        bar.hidden = true
        return
      }
      const name =
        node.name?.trim() ||
        imageLinkLabel(node, i18n) ||
        (node.shortcode ? `shortcode:${node.shortcode.name}` : node.type)
      label.textContent = name
      label.title = name
      const root = node.id === engine.getTree().id
      const ctx = context()
      actions.forEach((action, index) => {
        const button = buttons[index]!
        if (action.id === 'edit-text') {
          button.hidden = !editing.canEdit(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        if (action.id === 'edit-leading-text') {
          button.hidden = !onEditLeadingText || !editing.canEditLeadingText(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        if (action.id === 'move-to') {
          button.hidden = root
          button.disabled = root || !canMoveSelection()
          return
        }
        if (action.id === 'insert-after') {
          button.hidden = !onInsertAfter || root
          button.disabled = button.hidden || !!findParent(engine.getTree(), node.id)?.locked
          return
        }
        if (action.id === 'replace-image') {
          button.hidden =
            !onReplaceImage || !supportsImageFraming(node) || !!richText?.resolver.supports(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        if (action.id === 'frame-image') {
          button.hidden = !onFrameImage || !supportsImageFraming(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        if (action.id === 'image-link') {
          const state =
            onEditImageLink &&
            supportsImageFraming(node) &&
            readImageLink(engine.getTree(), node.id, {
              richText: richText?.resolver ?? rendererOptions?.richTextResolver,
              registry: rendererOptions?.registry,
            })
          button.hidden = !state
          button.disabled = !state || !state.canEdit
          return
        }
        if (action.id === 'edit-link') {
          button.hidden = !onEditLink || !isNativeLink(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        if (action.id === 'edit-typography') {
          button.hidden =
            !onEditTypography ||
            (node.type !== 'text' && node.type !== 'button' && !isNativeLink(node)) ||
            !!node.shortcode ||
            !!richText?.resolver.supports(node)
          button.disabled = button.hidden || !!node.locked
          return
        }
        const cmd = registry.get(action.id)
        button.hidden = root
        button.disabled =
          root ||
          (action.id !== 'select-parent' && !!node.locked) ||
          !cmd ||
          (cmd.when ? !cmd.when(ctx) : false)
      })
      if (dock) {
        const next = buttons.find(
          (button) =>
            !button.hidden &&
            (button === editButton ||
              button === imageButton ||
              button.hasAttribute('data-component-settings')),
        )
        if (primary !== next) {
          if (primary) {
            delete primary.dataset.primaryAction
            returnToCommands(primary)
          }
          primary = next
          if (primary) {
            primary.dataset.primaryAction = ''
            identity.append(primary)
          }
        }
        for (const linkButton of [editLinkButton, imageLinkButton]) {
          if (
            primary !== linkButton &&
            !linkButton.hidden &&
            (primary === editButton || primary === leadingTextButton || primary === imageButton)
          ) {
            if (linkButton.parentElement !== identity) identity.append(linkButton)
          } else if (primary !== linkButton && linkButton.parentElement === identity) {
            returnToCommands(linkButton)
          }
        }
      }
      updateTabStop()
      schedule()
    },
    destroy() {
      destroyed = true
      closeImagePicker?.()
      closeMoveDialog?.()
      cancelInsertAfter()
      if (pendingFrame) cancelAnimationFrame(pendingFrame)
      observer?.disconnect()
      intersection?.disconnect()
      frameDocument?.removeEventListener('scroll', schedule, true)
      container.removeEventListener('scroll', schedule)
      doc.defaultView?.removeEventListener('resize', schedule)
      target = null
      editControls?.destroy()
      bar.remove()
      style.remove()
    },
  }
}
