import type { Engine, ComponentNode } from '@cluion/sigil-core'
import { startInsertDrag } from './dnd.js'

export type BlockFactory = () => ComponentNode

/**
 * 建立區塊面板 — 列出可拖入 canvas 的區塊
 *
 * pointerdown 啟動拖入；panel 與 canvas（iframe）在同一主文檔
 */
export function createBlocksPanel(
  engine: Engine,
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  blocks: Record<string, BlockFactory>,
): { destroy: () => void } {
  container.replaceChildren()
  container.classList.add('sigil-blocks-panel')

  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'sigil-input'
  search.placeholder = '搜尋區塊…'
  search.setAttribute('aria-label', '搜尋區塊')
  container.appendChild(search)

  const list = document.createElement('div')
  list.className = 'sigil-blocks-list'
  container.appendChild(list)

  const entries = Object.entries(blocks)

  function renderList(filter: string): void {
    list.replaceChildren()
    const q = filter.trim().toLowerCase()
    for (const [name, factory] of entries) {
      if (q && !name.toLowerCase().includes(q)) continue
      const item = document.createElement('div')
      item.className = 'sigil-block-item'
      item.textContent = name
      item.setAttribute('role', 'button')
      item.setAttribute('aria-label', `拖入 ${name}`)
      item.tabIndex = 0
      item.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault()
        startInsertDrag({ engine, iframe, node: factory(), pointerId: e.pointerId })
      })
      list.appendChild(item)
    }
    if (!list.childElementCount) {
      const empty = document.createElement('p')
      empty.className = 'sigil-muted'
      empty.textContent = '無符合區塊'
      list.appendChild(empty)
    }
  }

  search.addEventListener('input', () => renderList(search.value))
  renderList('')
  return { destroy() {} }
}
