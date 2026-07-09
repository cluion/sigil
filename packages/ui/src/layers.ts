import type { Engine, ComponentNode } from '@cluion/sigil-core'

/**
 * 建立 layers 面板 — 顯示節點樹,點選與 canvas 雙向同步
 *
 * 訂閱 selection／patch／tree 即時更新(無 input,重建無失焦問題)
 */
export function createLayersPanel(engine: Engine, container: HTMLElement): {
  destroy: () => void
} {
  function render(): void {
    const tree = engine.getTree()
    const sel = engine.getSelection()
    container.replaceChildren()
    container.appendChild(renderNode(tree, sel, 0, engine))
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'patch' || ev.type === 'tree') render()
  })
  render()
  return { destroy() { unsub() } }
}

/**
 * 渲染單一節點列(含縮排)與其子樹
 */
function renderNode(
  node: ComponentNode,
  sel: string | null,
  depth: number,
  engine: Engine,
): HTMLElement {
  const wrap = document.createElement('div')

  const row = document.createElement('div')
  row.style.cssText = `padding:2px 4px;padding-left:${depth * 12 + 4}px;cursor:pointer;white-space:nowrap;border-radius:3px`
  if (node.id === sel) row.style.background = '#dbeafe'
  row.textContent = `${node.type}（${node.id}）`
  row.addEventListener('click', () => engine.select(node.id))
  wrap.appendChild(row)

  for (const c of node.children ?? []) {
    wrap.appendChild(renderNode(c, sel, depth + 1, engine))
  }
  return wrap
}
