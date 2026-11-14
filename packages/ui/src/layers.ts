import { findNode, type Engine, type ComponentNode, type I18n } from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'

export interface LayersPanelOptions {
  i18n?: I18n
  /** 圖層樹的無障礙名稱 */
  ariaLabel?: string
  /** 右鍵選單命中節點與游標座標 */
  onContextMenu?: (id: string, x: number, y: number) => void
}

/**
 * 建立 layers 面板 — 節點樹、選取同步、重命名／鎖定／隱藏
 */
export function createLayersPanel(
  engine: Engine,
  container: HTMLElement,
  opts?: LayersPanelOptions,
): {
  destroy: () => void
} {
  container.classList.add('sigil-layers-panel')
  container.setAttribute('role', 'tree')
  function refreshLabel(): void {
    container.setAttribute(
      'aria-label',
      opts?.ariaLabel ?? uiText(opts?.i18n, 'layers.title', '圖層'),
    )
  }
  refreshLabel()

  const rowById = new Map<string, HTMLElement>()
  let renderedTree = engine.getTree()
  let selectedId = engine.getSelection()
  let tabStop: HTMLElement | null = null

  function paintSelection(row: HTMLElement, selected: boolean): void {
    row.classList.toggle('sigil-layer-row--active', selected)
    row.setAttribute('aria-selected', String(selected))
    row.style.background = selected ? 'rgba(79,70,229,0.12)' : 'transparent'
    row.style.color = selected ? '#4f46e5' : 'inherit'
    row.style.fontWeight = selected ? '600' : ''
  }

  function syncSelection(): void {
    const nextId = engine.getSelection()
    if (selectedId !== nextId) {
      const previous = selectedId ? rowById.get(selectedId) : null
      if (previous) paintSelection(previous, false)
      const next = nextId ? rowById.get(nextId) : null
      if (next) paintSelection(next, true)
      selectedId = nextId
    }

    const active = document.activeElement
    const focusedRow =
      active instanceof HTMLElement
        ? active.closest<HTMLElement>('.sigil-layer-row[data-layer-id]')
        : null
    const focusedId =
      focusedRow && container.contains(focusedRow) ? focusedRow.dataset.layerId : null
    const nextTabStop =
      (focusedId ? rowById.get(focusedId) : null) ??
      (nextId ? rowById.get(nextId) : null) ??
      rowById.values().next().value
    if (nextTabStop && tabStop !== nextTabStop) {
      if (tabStop) tabStop.tabIndex = -1
      nextTabStop.tabIndex = 0
      tabStop = nextTabStop
    }
  }

  function refreshRow(node: ComponentNode): boolean {
    const row = rowById.get(node.id)
    if (!row) return false
    const label = row.querySelector<HTMLElement>('.sigil-layer-label')
    const visibility = row.querySelector<HTMLButtonElement>('[data-layer-action="visibility"]')
    const lock = row.querySelector<HTMLButtonElement>('[data-layer-action="lock"]')
    if (!label || !visibility || !lock) return false
    const name = typeLabel(node)
    label.textContent = name
    label.title = `${name} · ${node.id}`
    row.setAttribute('aria-label', name)
    row.classList.toggle('sigil-layer-row--hidden', !!node.hidden)
    row.classList.toggle('sigil-layer-row--locked', !!node.locked)
    row.style.opacity = node.hidden ? '0.55' : ''
    visibility.textContent = node.hidden ? '○' : '●'
    const visibilityTitle = node.hidden
      ? uiText(opts?.i18n, 'layers.show', '顯示')
      : uiText(opts?.i18n, 'layers.hide', '隱藏')
    visibility.title = visibilityTitle
    visibility.setAttribute('aria-label', visibilityTitle)
    visibility.setAttribute('aria-pressed', String(!!node.hidden))
    visibility.style.opacity = node.hidden ? '1' : '0.45'
    lock.textContent = node.locked ? '🔒' : '🔓'
    const lockTitle = node.locked
      ? uiText(opts?.i18n, 'layers.unlock', '解鎖')
      : uiText(opts?.i18n, 'layers.lock', '鎖定')
    lock.title = lockTitle
    lock.setAttribute('aria-label', lockTitle)
    lock.setAttribute('aria-pressed', String(!!node.locked))
    lock.style.opacity = node.locked ? '1' : '0.45'
    return true
  }

  function refreshChangedNode(expectedId?: string): boolean {
    const tree = engine.getTree()
    if (renderedTree === tree) return true
    const changed = singleChangedNode(renderedTree, tree)
    if (!changed || (expectedId && changed.id !== expectedId) || !refreshRow(changed)) {
      return false
    }
    renderedTree = tree
    return true
  }

  function render(): void {
    const active = document.activeElement
    const focusedRow =
      active instanceof HTMLElement
        ? active.closest<HTMLElement>('.sigil-layer-row[data-layer-id]')
        : null
    const focusedId =
      focusedRow && container.contains(focusedRow) ? focusedRow.dataset.layerId : null
    const focusedAction =
      focusedId && active instanceof HTMLButtonElement ? active.dataset.layerAction : null
    const tree = engine.getTree()
    const sel = engine.getSelection()
    container.replaceChildren()
    container.appendChild(
      renderNode(tree, sel, 0, engine, opts?.i18n, opts?.onContextMenu, (row) => {
        tabStop = row
      }),
    )

    const rows = [...container.querySelectorAll<HTMLElement>('.sigil-layer-row[data-layer-id]')]
    rowById.clear()
    for (const row of rows) rowById.set(row.dataset.layerId!, row)
    const nextTabStop =
      rows.find((row) => row.dataset.layerId === focusedId) ??
      rows.find((row) => row.dataset.layerId === sel) ??
      rows[0]
    for (const row of rows) row.tabIndex = row === nextTabStop ? 0 : -1
    tabStop = nextTabStop ?? null
    renderedTree = tree
    selectedId = sel

    if (focusedId) {
      const nextRow = rows.find((row) => row.dataset.layerId === focusedId)
      const nextFocus = focusedAction
        ? nextRow?.querySelector<HTMLElement>(`[data-layer-action="${focusedAction}"]`)
        : nextRow
      nextFocus?.focus()
    }
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection') syncSelection()
    else if (ev.type === 'patch') {
      if (ev.patch.type !== 'update' || !refreshChangedNode(ev.patch.id)) render()
    } else if (ev.type === 'tree' && !refreshChangedNode()) render()
  })
  const unsubLocale = subscribeLocale(opts?.i18n, () => {
    refreshLabel()
    render()
  })
  render()
  return {
    destroy() {
      unsub()
      unsubLocale()
    },
  }
}

function sameOwnFields(before: ComponentNode, after: ComponentNode): boolean {
  return (
    before.type === after.type &&
    before.tagName === after.tagName &&
    before.attributes === after.attributes &&
    before.style === after.style &&
    before.responsiveStyles === after.responsiveStyles &&
    before.className === after.className &&
    before.content === after.content &&
    before.shortcode === after.shortcode &&
    before.name === after.name &&
    before.locked === after.locked &&
    before.hidden === after.hidden
  )
}

function singleChangedNode(before: ComponentNode, after: ComponentNode): ComponentNode | null {
  if (before.id !== after.id) return null
  const oldChildren = before.children ?? []
  const newChildren = after.children ?? []
  if (oldChildren.length !== newChildren.length) return null
  let changed: ComponentNode | null = null
  for (let index = 0; index < oldChildren.length; index++) {
    const oldChild = oldChildren[index]!
    const newChild = newChildren[index]!
    if (oldChild.id !== newChild.id) return null
    if (oldChild === newChild) continue
    if (changed) return null
    changed = singleChangedNode(oldChild, newChild)
    if (!changed) return null
  }
  if (!sameOwnFields(before, after)) return changed ? null : after
  return changed
}

function typeLabel(node: ComponentNode): string {
  if (node.name?.trim()) return node.name.trim()
  if (node.type === 'shortcode' && node.shortcode?.name) return `sc:${node.shortcode.name}`
  return node.type
}

function iconBtn(
  action: 'visibility' | 'lock',
  label: string,
  title: string,
  active: boolean,
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'sigil-layer-icon-btn'
  b.dataset.layerAction = action
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
  i18n?: I18n,
  onContextMenu?: (id: string, x: number, y: number) => void,
  onTabStopChange?: (row: HTMLElement) => void,
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
  row.setAttribute('role', 'treeitem')
  row.setAttribute('aria-level', String(depth + 1))
  row.setAttribute('aria-selected', String(node.id === sel))
  row.setAttribute('aria-label', typeLabel(node))
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
  label.style.cssText =
    'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0'
  label.textContent = typeLabel(node)
  label.title = `${typeLabel(node)} · ${node.id}`

  const actions = document.createElement('span')
  actions.className = 'sigil-layer-actions'
  actions.style.cssText = 'display:flex;flex-shrink:0;align-items:center'

  // 隱藏
  actions.appendChild(
    iconBtn(
      'visibility',
      node.hidden ? '○' : '●',
      node.hidden ? uiText(i18n, 'layers.show', '顯示') : uiText(i18n, 'layers.hide', '隱藏'),
      !!node.hidden,
      () => {
        const current = findNode(engine.getTree(), node.id)
        if (current) engine.update(node.id, { hidden: !current.hidden })
      },
    ),
  )
  // 鎖定
  actions.appendChild(
    iconBtn(
      'lock',
      node.locked ? '🔒' : '🔓',
      node.locked ? uiText(i18n, 'layers.unlock', '解鎖') : uiText(i18n, 'layers.lock', '鎖定'),
      !!node.locked,
      () => {
        const current = findNode(engine.getTree(), node.id)
        if (current) engine.update(node.id, { locked: !current.locked })
      },
    ),
  )

  row.append(label, actions)

  row.addEventListener('click', () => {
    row.focus()
    engine.select(node.id)
  })
  row.addEventListener('contextmenu', (e) => {
    if (!onContextMenu) return
    e.preventDefault()
    engine.select(node.id)
    onContextMenu(node.id, e.clientX, e.clientY)
  })
  row.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const current = findNode(engine.getTree(), node.id)
    if (current) renameNode(engine, current, i18n)
  })
  row.addEventListener('keydown', (e) => {
    if (e.target !== row) return

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      engine.select(node.id)
      return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      const current = findNode(engine.getTree(), node.id)
      if (current) renameNode(engine, current, i18n)
      return
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (!onContextMenu) return
      e.preventDefault()
      const rect = row.getBoundingClientRect()
      engine.select(node.id)
      onContextMenu(node.id, rect.left, rect.bottom)
      return
    }

    const rows = [
      ...containerRows(row).filter((candidate) => candidate.dataset.layerId !== undefined),
    ]
    const current = rows.indexOf(row)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = rows[current + 1]
    else if (e.key === 'ArrowUp') next = rows[current - 1]
    else if (e.key === 'Home') next = rows[0]
    else if (e.key === 'End') next = rows.at(-1)
    else if (e.key === 'ArrowRight') {
      next = rows.find(
        (candidate) =>
          Number(candidate.getAttribute('aria-level')) === depth + 2 &&
          rows.indexOf(candidate) > current,
      )
      if (next && rows.indexOf(next) > current + 1) next = undefined
    } else if (e.key === 'ArrowLeft' && depth > 0) {
      for (let index = current - 1; index >= 0; index -= 1) {
        if (rows[index]?.getAttribute('aria-level') === String(depth)) {
          next = rows[index]
          break
        }
      }
    } else return

    e.preventDefault()
    if (!next) return
    for (const candidate of rows) candidate.tabIndex = candidate === next ? 0 : -1
    onTabStopChange?.(next)
    next.focus()
  })
  row.addEventListener('mouseenter', () => {
    if (node.id !== engine.getSelection()) row.style.background = 'rgba(15,23,42,0.04)'
  })
  row.addEventListener('mouseleave', () => {
    row.style.background =
      node.id === engine.getSelection() ? 'rgba(79,70,229,0.12)' : 'transparent'
  })

  wrap.appendChild(row)

  for (const c of node.children ?? []) {
    wrap.appendChild(renderNode(c, sel, depth + 1, engine, i18n, onContextMenu, onTabStopChange))
  }
  return wrap
}

function renameNode(engine: Engine, node: ComponentNode, i18n?: I18n): void {
  // 鎖定時仍可重命名
  const current = node.name ?? ''
  const next = window.prompt(uiText(i18n, 'layers.rename_prompt', '圖層名稱'), current)
  if (next === null) return
  engine.update(node.id, { name: next })
}

function containerRows(row: HTMLElement): HTMLElement[] {
  const panel = row.closest('.sigil-layers-panel')
  return panel ? [...panel.querySelectorAll<HTMLElement>('.sigil-layer-row[data-layer-id]')] : []
}
