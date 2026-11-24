import {
  createCommandRegistry,
  createDefaultEditingCommands,
  findNode,
  findParent,
  type CommandContext,
  type CommandRegistry,
  type ComponentNode,
  type Engine,
  type I18n,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'

export interface CanvasSelectionCommands {
  registry: CommandRegistry
  context: () => CommandContext
}

const actions = [
  {
    id: 'replace-image',
    key: 'canvas.replace_image',
    label: '更換圖片',
    path: 'M3 4h18v16H3zM4 17l5-6 4 4 3-3 4 5',
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
.sigil-selection-toolbar button[data-image-action]:not([hidden]) {
  display: flex;
  align-items: center;
  gap: 4px;
  width: auto;
  padding: 0 6px;
  font: inherit;
  white-space: nowrap;
}
.sigil-selection-toolbar svg { width: 16px; height: 16px; pointer-events: none; }
.sigil-selection-toolbar [role=status]:not(:empty) { padding: 0 6px; }
@media (pointer: coarse) {
  .sigil-selection-toolbar button { width: 44px; height: 44px; }
}
`

export function createSelectionToolbar(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  engine: Engine,
  i18n?: I18n,
  commands?: CanvasSelectionCommands,
  onReplaceImage?: (id: string, trigger: HTMLElement) => void | (() => void),
) {
  const doc = container.ownerDocument
  const style = doc.createElement('style')
  style.textContent = styles
  const bar = doc.createElement('div')
  bar.className = 'sigil-selection-toolbar'
  bar.setAttribute('role', 'toolbar')
  bar.tabIndex = -1
  bar.hidden = true
  const label = doc.createElement('span')
  label.dataset.sigilTypeBadge = '1'
  const status = doc.createElement('span')
  status.setAttribute('role', 'status')
  bar.append(label)
  container.append(style, bar)

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
  let pendingFrame = 0
  let destroyed = false
  let closeImagePicker: (() => void) | undefined
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(container)
  observer?.observe(iframe)
  const buttons = actions.map((action) => {
    const button = doc.createElement('button')
    button.type = 'button'
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('aria-hidden', 'true')
    const path = doc.createElementNS(icon.namespaceURI!, 'path')
    path.setAttribute('d', action.path)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.75')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    icon.append(path)
    button.append(icon)
    if (action.id === 'replace-image') {
      button.dataset.imageAction = 'replace'
      button.append(doc.createElement('span'))
    }
    button.addEventListener('click', async () => {
      const id = engine.getSelection()
      if (!id || !target || button.hidden || button.disabled) return
      const hadFocus = bar.contains(doc.activeElement)
      const parent = action.id === 'delete' ? findParent(engine.getTree(), id) : null
      status.textContent = ''
      try {
        if (action.id === 'replace-image') {
          closeImagePicker = onReplaceImage?.(id, button) ?? undefined
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
        if (action.id === 'duplicate' && target) {
          const rect = target.getBoundingClientRect()
          if (rect.top >= iframe.clientHeight || rect.bottom <= 0)
            iframe.contentWindow?.scrollBy(0, rect.top - 48)
        }
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
        status.textContent = uiText(i18n, 'canvas.command_failed', '操作失敗，請再試一次。')
      }
    })
    bar.append(button)
    return button
  })
  const imageButton = buttons.find((button) => button.dataset.imageAction === 'replace')!
  bar.append(status)
  bar.addEventListener('focusin', (event) => {
    if (buttons.some((button) => button === event.target)) {
      for (const button of buttons) button.tabIndex = button === event.target ? 0 : -1
    }
  })
  bar.addEventListener('keydown', (event) => {
    const enabled = buttons.filter((button) => !button.hidden && !button.disabled)
    const index = enabled.indexOf(doc.activeElement as HTMLButtonElement)
    if (index < 0) return
    let next: HTMLButtonElement | undefined
    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length]
    if (event.key === 'ArrowLeft') next = enabled[(index + enabled.length - 1) % enabled.length]
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
    const box = target.getBoundingClientRect()
    const frameX = iframe.offsetLeft + iframe.clientLeft
    const frameY = iframe.offsetTop + iframe.clientTop
    const left = Math.max(container.scrollLeft, frameX) + 2
    const top = Math.max(container.scrollTop, frameY) + 2
    const right =
      Math.min(container.scrollLeft + container.clientWidth, frameX + iframe.clientWidth) - 2
    const bottom =
      Math.min(container.scrollTop + container.clientHeight, frameY + iframe.clientHeight) - 2
    if (
      frameX + box.right < left ||
      frameX + box.left > right ||
      frameY + box.bottom < top ||
      frameY + box.top > bottom
    ) {
      bar.hidden = true
      return
    }
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

  function translate(): void {
    bar.setAttribute('aria-label', uiText(i18n, 'canvas.component_actions', '元件操作'))
    if (status.textContent)
      status.textContent = uiText(i18n, 'canvas.command_failed', '操作失敗，請再試一次。')
    actions.forEach((action, index) => {
      const caption = uiText(i18n, action.key, action.label)
      const button = buttons[index]!
      button.title = caption
      button.setAttribute('aria-label', caption)
      if (action.id === 'replace-image') button.querySelector('span')!.textContent = caption
    })
  }
  translate()
  container.addEventListener('scroll', schedule)
  doc.defaultView?.addEventListener('resize', schedule)

  return {
    translate,
    schedule,
    replaceImage() {
      position()
      imageButton.click()
    },
    bindFrame(next: Document | null) {
      frameDocument?.removeEventListener('scroll', schedule, true)
      frameDocument = next
      frameDocument?.addEventListener('scroll', schedule, true)
    },
    show(node: ComponentNode | null, element: Element | null) {
      if (target !== element || node?.type !== 'image' || node.shortcode || node.locked) {
        closeImagePicker?.()
        closeImagePicker = undefined
      }
      if (target !== element) {
        if (target) observer?.unobserve(target)
        target = element
        if (target) observer?.observe(target)
        status.textContent = ''
      }
      if (!node || !element) {
        bar.hidden = true
        return
      }
      const name =
        node.name?.trim() || (node.shortcode ? `shortcode:${node.shortcode.name}` : node.type)
      label.textContent = name
      label.title = name
      const root = node.id === engine.getTree().id
      const ctx = context()
      actions.forEach((action, index) => {
        const button = buttons[index]!
        if (action.id === 'replace-image') {
          button.hidden = !onReplaceImage || node.type !== 'image' || !!node.shortcode
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
      const tabStop =
        buttons.find((button) => !button.disabled && button.tabIndex === 0) ??
        buttons.find((button) => !button.disabled)
      for (const button of buttons) button.tabIndex = button === tabStop ? 0 : -1
      schedule()
    },
    destroy() {
      destroyed = true
      closeImagePicker?.()
      if (pendingFrame) cancelAnimationFrame(pendingFrame)
      observer?.disconnect()
      frameDocument?.removeEventListener('scroll', schedule, true)
      container.removeEventListener('scroll', schedule)
      doc.defaultView?.removeEventListener('resize', schedule)
      target = null
      bar.remove()
      style.remove()
    },
  }
}
