import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openContextMenu } from '../src/context-menu.js'

describe('openContextMenu', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.body.replaceChildren()
  })

  it('渲染項目並點擊執行 run', () => {
    const run = vi.fn()
    openContextMenu({
      items: [
        { id: 'copy', label: '複製', run },
        { id: 'paste', label: '貼上', run: vi.fn() },
      ],
      x: 100,
      y: 100,
    })

    const menu = document.querySelector('.sigil-context-menu') as HTMLElement
    const items = menu.querySelectorAll<HTMLButtonElement>('.sigil-context-menu-item')
    expect(menu).toBeTruthy()
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toBe('複製')
    expect(items[0]!.dataset.menuItemId).toBe('copy')
    items[0]!.click()
    expect(run).toHaveBeenCalledOnce()
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
  })

  it('separator 渲染分隔線', () => {
    openContextMenu({
      items: [
        { id: 'a', label: 'A', run: vi.fn() },
        { separator: true },
        { id: 'b', label: 'B', run: vi.fn() },
      ],
      x: 100,
      y: 100,
    })

    const seps = document.querySelectorAll('.sigil-context-menu-sep')
    expect(seps).toHaveLength(1)
    expect(seps[0]!.getAttribute('role')).toBe('separator')
  })

  it('disabled 項目不執行且跳過初始焦點', () => {
    const run = vi.fn()
    openContextMenu({
      items: [
        { id: 'x', label: 'X', run, disabled: true },
        { id: 'y', label: 'Y', run: vi.fn() },
      ],
      x: 100,
      y: 100,
    })

    const buttons = document.querySelectorAll<HTMLButtonElement>('.sigil-context-menu-item')
    expect(buttons[0]!.disabled).toBe(true)
    expect(document.activeElement).toBe(buttons[1])
    buttons[0]!.click()
    expect(run).not.toHaveBeenCalled()
  })

  it('方向鍵 Home 與 End 移動焦點', () => {
    openContextMenu({
      items: [
        { id: 'a', label: 'A', run: vi.fn() },
        { id: 'b', label: 'B', run: vi.fn() },
        { id: 'c', label: 'C', run: vi.fn() },
      ],
      x: 100,
      y: 100,
    })

    const buttons = document.querySelectorAll<HTMLButtonElement>('.sigil-context-menu-item')
    expect(document.activeElement).toBe(buttons[0])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(document.activeElement).toBe(buttons[1])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
    expect(document.activeElement).toBe(buttons[2])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(document.activeElement).toBe(buttons[0])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(document.activeElement).toBe(buttons[0])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(document.activeElement).toBe(buttons[2])
  })

  it('套用主題與無障礙名稱', () => {
    openContextMenu({
      items: [{ id: 'a', label: 'A', run: vi.fn() }],
      x: 100,
      y: 100,
      theme: 'dark',
      ariaLabel: '節點操作',
    })

    const menu = document.querySelector('.sigil-context-menu') as HTMLElement
    expect(menu.classList.contains('sigil-theme-dark')).toBe(true)
    expect(menu.getAttribute('aria-label')).toBe('節點操作')
  })

  it('close 可重複呼叫且只通知一次', () => {
    const onClose = vi.fn()
    const close = openContextMenu({
      items: [{ id: 'a', label: 'A', run: vi.fn() }],
      x: 100,
      y: 100,
      onClose,
    })

    close()
    close()
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc 關閉選單並恢復焦點', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    openContextMenu({
      items: [{ id: 'a', label: 'A', run: vi.fn() }],
      x: 100,
      y: 100,
    })

    expect(document.activeElement).not.toBe(trigger)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('點外部關閉選單', () => {
    openContextMenu({
      items: [{ id: 'a', label: 'A', run: vi.fn() }],
      x: 100,
      y: 100,
    })

    document.body.click()
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
  })
})
