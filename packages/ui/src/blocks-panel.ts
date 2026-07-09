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
  for (const [name, factory] of Object.entries(blocks)) {
    const item = document.createElement('div')
    item.textContent = name
    item.style.cssText =
      'padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:grab;user-select:none;background:#fafafa'
    item.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      startInsertDrag({ engine, iframe, node: factory(), pointerId: e.pointerId })
    })
    container.appendChild(item)
  }
  return { destroy() {} }
}
