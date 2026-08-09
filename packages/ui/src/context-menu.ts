export interface MenuActionItem {
  id: string
  label: string
  run: () => void
  disabled?: boolean
  separator?: false
}

export interface MenuSeparatorItem {
  separator: true
}

export type MenuItem = MenuActionItem | MenuSeparatorItem

export interface ContextMenuOptions {
  items: MenuItem[]
  x: number
  y: number
  theme?: 'light' | 'dark'
  ariaLabel?: string
  onClose?: () => void
}

/**
 * 開啟右鍵選單浮層
 *
 * 定位於游標座標並避開 viewport 邊界
 * 點項目執行 run 後關閉，點外部或 Esc 關閉
 */
export function openContextMenu(opts: ContextMenuOptions): () => void {
  const previousFocus = document.activeElement
  const menu = document.createElement('div')
  menu.className = 'sigil-context-menu'
  menu.classList.toggle('sigil-theme-dark', opts.theme === 'dark')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', opts.ariaLabel ?? 'Context menu')
  menu.tabIndex = -1
  const buttons: HTMLButtonElement[] = []

  for (const item of opts.items) {
    if (item.separator) {
      const sep = document.createElement('div')
      sep.className = 'sigil-context-menu-sep'
      sep.setAttribute('role', 'separator')
      menu.appendChild(sep)
      continue
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sigil-context-menu-item'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.menuItemId = item.id
    btn.textContent = item.label
    btn.tabIndex = -1
    if (item.disabled) {
      btn.disabled = true
    } else {
      btn.addEventListener('click', () => {
        close()
        item.run()
      })
    }
    menu.appendChild(btn)
    buttons.push(btn)
  }

  // 先放到畫面外量寬高
  menu.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:10001'
  document.body.appendChild(menu)
  const w = menu.offsetWidth || 160
  const h = menu.offsetHeight || 100
  const vw = window.innerWidth
  const vh = window.innerHeight
  const preferredLeft = opts.x + w > vw - 4 ? opts.x - w : opts.x
  const preferredTop = opts.y + h > vh - 4 ? opts.y - h : opts.y
  const left = Math.min(Math.max(4, vw - w - 4), Math.max(4, preferredLeft))
  const top = Math.min(Math.max(4, vh - h - 4), Math.max(4, preferredTop))
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  const enabledButtons = buttons.filter((button) => !button.disabled)
  enabledButtons[0]?.focus()
  if (!enabledButtons.length) menu.focus()

  let closed = false

  function onDocClick(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) close()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }

    if (!enabledButtons.length) return
    const current = enabledButtons.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % enabledButtons.length
    else if (e.key === 'ArrowUp') {
      next =
        current < 0
          ? enabledButtons.length - 1
          : (current - 1 + enabledButtons.length) % enabledButtons.length
    } else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabledButtons.length - 1
    else return

    e.preventDefault()
    enabledButtons[next]?.focus()
  }

  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)

  function close(): void {
    if (closed) return
    closed = true
    document.removeEventListener('click', onDocClick, true)
    document.removeEventListener('keydown', onKey)
    menu.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    opts.onClose?.()
  }

  return close
}
