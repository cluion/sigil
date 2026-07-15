import type { Engine, ComponentNode } from '@cluion/sigil-core'

/**
 * 建立 layers 面板 — 節點樹、選取同步、重命名／鎖定／隱藏
 */
export function createLayersPanel(engine: Engine, container: HTMLElement): {
  destroy: () => void
} {
  container.classList.add('sigil-layers-panel')

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
  return {
    destroy() {
      unsub()
    },
  }
}

function typeLabel(node: ComponentNode): string {
  if (node.name?.trim()) return node.name.trim()
  if (node.type === 'shortcode' && node.shortcode?.name) return `sc:${node.shortcode.name}`
  return node.type
}

function iconBtn(
  label: string,
  title: string,
  active: boolean,
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'sigil-layer-icon-btn'
  b.textContent = label
  b.title = title
  b.setAttribute('aria-label', title)
  b.setAttribute('aria-pressed', String(active))
  b.style.cssText = [
    'appearance:none;border:none;background:transparent',
    'padding:0 3px;margin:0;cursor:pointer;font-size:12px;line-height:1',
    'opacity:' + (active ? '1' : '0.45'),
    'border-radius:3px',
  ].join(';')
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick(e)
  })
  return b
}

/**
 * 渲染節點列與子樹
 */
function renderNode(
  node: ComponentNode,
  sel: string | null,
  depth: number,
  engine: Engine,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-layer-node'
  wrap.dataset.layerId = node.id

  const row = document.createElement('div')
  row.className = 'sigil-layer-row'
  if (node.id === sel) row.classList.add('sigil-layer-row--active')
  if (node.locked) row.classList.add('sigil-layer-row--locked')
  if (node.hidden) row.classList.add('sigil-layer-row--hidden')
  row.dataset.layerId = node.id
  row.style.cssText = [
    'display:flex;align-items:center;gap:2px',
    `padding:3px 4px;padding-left:${depth * 12 + 4}px`,
    'cursor:pointer;border-radius:4px',
    'font-size:12px;line-height:1.35',
    node.id === sel
      ? 'background:rgba(79,70,229,0.12);color:#4f46e5;font-weight:600'
      : 'background:transparent;color:inherit',
    node.hidden ? 'opacity:0.55' : '',
  ]
    .filter(Boolean)
    .join(';')

  const label = document.createElement('span')
  label.className = 'sigil-layer-label'
  label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0'
  label.textContent = typeLabel(node)
  label.title = `${typeLabel(node)} · ${node.id}`

  const actions = document.createElement('span')
  actions.className = 'sigil-layer-actions'
  actions.style.cssText = 'display:flex;flex-shrink:0;align-items:center'

  // 隱藏
  actions.appendChild(
    iconBtn(node.hidden ? '○' : '●', node.hidden ? '顯示' : '隱藏', !!node.hidden, () => {
      engine.update(node.id, { hidden: !node.hidden })
    }),
  )
  // 鎖定
  actions.appendChild(
    iconBtn(node.locked ? '🔒' : '🔓', node.locked ? '解鎖' : '鎖定', !!node.locked, () => {
      engine.update(node.id, { locked: !node.locked })
    }),
  )

  row.append(label, actions)

  row.addEventListener('click', () => engine.select(node.id))
  row.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()
    // 鎖定時仍可重命名
    const current = node.name ?? ''
    const next = window.prompt('圖層名稱', current)
    if (next === null) return
    engine.update(node.id, { name: next })
  })
  row.addEventListener('mouseenter', () => {
    if (node.id !== sel) row.style.background = 'rgba(15,23,42,0.04)'
  })
  row.addEventListener('mouseleave', () => {
    row.style.background =
      node.id === sel ? 'rgba(79,70,229,0.12)' : 'transparent'
  })

  wrap.appendChild(row)

  for (const c of node.children ?? []) {
    wrap.appendChild(renderNode(c, sel, depth + 1, engine))
  }
  return wrap
}
