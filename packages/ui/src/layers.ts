import { createId, findNode, type Engine, type ComponentNode, type I18n } from '@cluion/sigil-core'
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

  let renderedTree = engine.getTree()
  const expanded = initialExpansion(renderedTree)
  const rows = new Map<string, HTMLElement>()
  let tabStop: HTMLElement | null = null
  let selectedId = engine.getSelection()

  function setTabStop(next: HTMLElement | undefined): void {
    if (tabStop === next) return
    if (tabStop) setRowTabIndex(tabStop, -1)
    tabStop = next ?? null
    if (tabStop) setRowTabIndex(tabStop, 0)
  }

  function paintRow(row: HTMLElement, node: ComponentNode): void {
    const label = row.querySelector<HTMLElement>('.sigil-layer-label')!
    const title = typeLabel(node)
    row.setAttribute('aria-label', title)
    label.textContent = title
    label.title = `${title} · ${node.id}`
    row.classList.toggle('sigil-layer-row--hidden', !!node.hidden)
    row.classList.toggle('sigil-layer-row--locked', !!node.locked)
    setAction(
      row,
      'visibility',
      !!node.hidden,
      node.hidden
        ? uiText(opts?.i18n, 'layers.show', '顯示')
        : uiText(opts?.i18n, 'layers.hide', '隱藏'),
    )
    setAction(
      row,
      'lock',
      !!node.locked,
      node.locked
        ? uiText(opts?.i18n, 'layers.unlock', '解鎖')
        : uiText(opts?.i18n, 'layers.lock', '鎖定'),
    )
    if (node.children?.length) paintDisclosure(row, title)
  }

  function paintDisclosure(row: HTMLElement, title: string): void {
    const open = expanded.has(row.dataset.layerId!)
    const button = row.querySelector<HTMLButtonElement>('[data-layer-action="toggle"]')!
    const action = open
      ? uiText(opts?.i18n, 'layers.collapse', '收合子圖層')
      : uiText(opts?.i18n, 'layers.expand', '展開子圖層')
    const name = `${action} · ${title}`
    button.textContent = open ? '▾' : '▸'
    button.title = name
    button.setAttribute('aria-label', name)
    row.setAttribute('aria-expanded', String(open))
  }

  function renderNode(node: ComponentNode, depth: number): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-layer-node'
    wrap.dataset.layerId = node.id
    wrap.setAttribute('role', 'none')
    const row = document.createElement('div')
    row.className = 'sigil-layer-row'
    row.dataset.layerId = node.id
    row.style.cssText = `display:flex;align-items:center;padding-inline-start:${4 + Math.min(depth, 6) * 9}px`
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(depth + 1))
    row.tabIndex = -1
    rows.set(node.id, row)

    if (node.children?.length) {
      const toggle = actionButton('toggle')
      toggle.className = 'sigil-layer-toggle'
      row.appendChild(toggle)
    } else {
      const spacer = document.createElement('span')
      spacer.className = 'sigil-layer-leaf'
      spacer.setAttribute('aria-hidden', 'true')
      row.appendChild(spacer)
    }
    const label = document.createElement('span')
    label.className = 'sigil-layer-label'
    label.style.cssText = 'flex:1;min-width:0'
    const actions = document.createElement('span')
    actions.className = 'sigil-layer-actions'
    actions.append(actionButton('visibility'), actionButton('lock'))
    row.append(label, actions)
    paintRow(row, node)
    paintSelection(row, node.id === selectedId)
    wrap.appendChild(row)
    if (node.children?.length && expanded.has(node.id)) appendChildren(wrap, row, node, depth)
    return wrap
  }

  function appendChildren(wrap: HTMLElement, row: HTMLElement, node: ComponentNode, depth: number) {
    const group = document.createElement('div')
    group.setAttribute('role', 'group')
    group.id = `sigil-layer-group-${createId()}`
    row.setAttribute('aria-owns', group.id)
    for (const child of node.children ?? []) group.appendChild(renderNode(child, depth + 1))
    wrap.appendChild(group)
  }

  function toggleBranch(node: ComponentNode, open: boolean): void {
    const row = rows.get(node.id)
    if (!row || !node.children?.length || expanded.has(node.id) === open) return
    if (open) {
      expanded.add(node.id)
      appendChildren(row.parentElement!, row, node, Number(row.getAttribute('aria-level')) - 1)
    } else {
      expanded.delete(node.id)
      const group = row.nextElementSibling!
      if (group.contains(document.activeElement)) row.focus({ preventScroll: true })
      if (group.contains(tabStop)) setTabStop(row)
      for (const child of group.querySelectorAll<HTMLElement>('[role="treeitem"]'))
        rows.delete(child.dataset.layerId!)
      group.remove()
      row.removeAttribute('aria-owns')
    }
    paintDisclosure(row, typeLabel(node))
  }

  function reveal(id: string): void {
    if (rows.has(id)) return
    const ancestors: ComponentNode[] = []
    if (findAncestors(engine.getTree(), id, ancestors)) {
      for (const node of ancestors) toggleBranch(node, true)
    }
  }

  function syncSelection(): void {
    const nextId = engine.getSelection()
    if (nextId) reveal(nextId)
    const previous = selectedId ? rows.get(selectedId) : undefined
    const next = nextId ? rows.get(nextId) : undefined
    if (selectedId !== nextId) {
      if (previous) paintSelection(previous, false)
      if (next) paintSelection(next, true)
    }
    selectedId = nextId
    setTabStop(rowFor(document.activeElement) ?? next ?? rows.values().next().value)
    if (next && container.clientHeight && container.scrollHeight > container.clientHeight) {
      const bounds = container.getBoundingClientRect()
      const item = next.getBoundingClientRect()
      if (item.top < bounds.top) container.scrollTop += item.top - bounds.top
      else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom
    }
  }

  function refreshChangedNode(expectedId?: string): boolean {
    const tree = engine.getTree()
    if (renderedTree === tree) return true
    const changed = singleChangedNode(renderedTree, tree)
    if (!changed || (expectedId && changed.id !== expectedId)) return false
    const row = rows.get(changed.id)
    if (
      row &&
      (row.getAttribute('aria-label') !== typeLabel(changed) ||
        row.classList.contains('sigil-layer-row--hidden') !== !!changed.hidden ||
        row.classList.contains('sigil-layer-row--locked') !== !!changed.locked)
    )
      paintRow(row, changed)
    renderedTree = tree
    return true
  }

  function render(revealSelection: boolean): void {
    const focused = document.activeElement
    const focusedId = rowFor(focused)?.dataset.layerId
    const focusedAction = focused instanceof HTMLElement ? focused.dataset.layerAction : undefined
    renderedTree = engine.getTree()
    selectedId = engine.getSelection()
    rows.clear()
    tabStop = null
    container.replaceChildren(renderNode(renderedTree, 0))
    if (revealSelection && selectedId) reveal(selectedId)
    const focusedRow = focusedId ? rows.get(focusedId) : undefined
    setTabStop(
      focusedRow ?? (selectedId ? rows.get(selectedId) : undefined) ?? rows.values().next().value,
    )
    if (focusedRow) {
      const action = focusedAction
        ? focusedRow.querySelector<HTMLElement>(`[data-layer-action="${focusedAction}"]`)
        : null
      ;(action ?? focusedRow).focus({ preventScroll: true })
    }
  }

  function rowFor(target: EventTarget | null): HTMLElement | undefined {
    const row = target instanceof Element ? target.closest<HTMLElement>('.sigil-layer-row') : null
    return row && container.contains(row) ? row : undefined
  }

  function onClick(event: MouseEvent): void {
    const row = rowFor(event.target)
    if (!row) return
    const id = row.dataset.layerId!
    const action =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-layer-action]')?.dataset.layerAction
        : null
    if (action) {
      event.stopPropagation()
      const node = findNode(engine.getTree(), id)
      if (!node) return
      if (action === 'toggle') {
        toggleBranch(node, !expanded.has(id))
        if (event.detail || row.contains(document.activeElement)) row.focus({ preventScroll: true })
      } else if (action === 'lock') engine.update(id, { locked: !node.locked })
      else if (action === 'visibility') engine.update(id, { hidden: !node.hidden })
      return
    }
    row.focus()
    engine.select(id)
  }

  function onDoubleClick(event: MouseEvent): void {
    const row = rowFor(event.target)
    if (!row || (event.target instanceof Element && event.target.closest('button'))) return
    event.preventDefault()
    event.stopPropagation()
    const node = findNode(engine.getTree(), row.dataset.layerId!)
    if (node) renameNode(engine, node, opts?.i18n)
  }

  function onContextMenu(event: MouseEvent): void {
    const row = rowFor(event.target)
    if (!row || !opts?.onContextMenu) return
    event.preventDefault()
    engine.select(row.dataset.layerId!)
    opts.onContextMenu(row.dataset.layerId!, event.clientX, event.clientY)
  }

  function onKeyDown(event: KeyboardEvent): void {
    const row = rowFor(event.target)
    if (!row || row !== event.target) return
    const id = row.dataset.layerId!
    let next: HTMLElement | undefined
    switch (event.key) {
      case 'Enter':
      case ' ':
        engine.select(id)
        break
      case 'F2': {
        const node = findNode(engine.getTree(), id)
        if (node) renameNode(engine, node, opts?.i18n)
        break
      }
      case 'ContextMenu':
      case 'F10': {
        if (!opts?.onContextMenu || (event.key === 'F10' && !event.shiftKey)) return
        const rect = row.getBoundingClientRect()
        engine.select(id)
        opts.onContextMenu(id, rect.left, rect.bottom)
        break
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        const right = event.key === 'ArrowRight'
        const state = row.getAttribute('aria-expanded')
        if ((right && state === 'false') || (!right && state === 'true')) {
          const node = findNode(engine.getTree(), id)
          if (node) toggleBranch(node, right)
        } else if (right && state === 'true') {
          next =
            row.nextElementSibling?.querySelector<HTMLElement>('[role="treeitem"]') ?? undefined
        } else if (!right) {
          const parent = row.closest('[role="group"]')?.previousElementSibling
          if (parent instanceof HTMLElement) next = parent
        }
        break
      }
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        const visible = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')]
        if (event.key === 'Home') next = visible[0]
        else if (event.key === 'End') next = visible.at(-1)
        else next = visible[visible.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)]
        break
      }
      default:
        return
    }
    event.preventDefault()
    if (next) next.focus()
  }

  function onFocus(event: FocusEvent): void {
    const row = rowFor(event.target)
    if (row) setTabStop(row)
  }
  container.addEventListener('click', onClick)
  container.addEventListener('dblclick', onDoubleClick)
  container.addEventListener('contextmenu', onContextMenu)
  container.addEventListener('keydown', onKeyDown)
  container.addEventListener('focusin', onFocus)
  const unsub = engine.subscribe((event) => {
    if (event.type === 'selection') syncSelection()
    else if (
      (event.type === 'patch' &&
        (event.patch.type !== 'update' || !refreshChangedNode(event.patch.id))) ||
      (event.type === 'tree' && !refreshChangedNode())
    ) {
      render(!!(selectedId && rows.has(selectedId)))
    }
  })
  const unsubLocale = subscribeLocale(opts?.i18n, () => {
    refreshLabel()
    render(false)
  })
  render(true)
  return {
    destroy() {
      unsub()
      unsubLocale()
      container.removeEventListener('click', onClick)
      container.removeEventListener('dblclick', onDoubleClick)
      container.removeEventListener('contextmenu', onContextMenu)
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('focusin', onFocus)
    },
  }
}

function actionButton(action: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sigil-layer-icon-btn'
  button.dataset.layerAction = action
  button.tabIndex = -1
  return button
}

function setAction(row: HTMLElement, action: string, active: boolean, label: string): void {
  const button = row.querySelector<HTMLButtonElement>(`[data-layer-action="${action}"]`)!
  button.setAttribute('aria-pressed', String(active))
  button.setAttribute('aria-label', label)
  button.title = label
  button.textContent = label
}

function setRowTabIndex(row: HTMLElement, index: number): void {
  row.tabIndex = index
  for (const action of row.querySelectorAll<HTMLButtonElement>('.sigil-layer-icon-btn'))
    action.tabIndex = index
}

function paintSelection(row: HTMLElement, selected: boolean): void {
  row.classList.toggle('sigil-layer-row--active', selected)
  row.setAttribute('aria-selected', String(selected))
  row.style.backgroundColor = selected ? 'var(--sigil-color-accent-soft, #e9e7ff)' : ''
  row.style.color = selected ? 'var(--sigil-color-accent, #4338ca)' : ''
  row.style.fontWeight = selected ? '600' : ''
}

// 小文件直接展開。超過首屏工作量時，只先建立根和第一層。
function initialExpansion(root: ComponentNode): Set<string> {
  const branches = new Set<string>()
  const pending = [root]
  for (let count = 0; pending.length; count++) {
    if (count >= 64) return new Set([root.id])
    const node = pending.pop()!
    if (node.children?.length) {
      branches.add(node.id)
      for (const child of node.children) pending.push(child)
    }
  }
  return branches
}

function findAncestors(node: ComponentNode, id: string, path: ComponentNode[]): boolean {
  if (node.id === id) return true
  path.push(node)
  for (const child of node.children ?? []) {
    if (findAncestors(child, id, path)) return true
  }
  path.pop()
  return false
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

function renameNode(engine: Engine, node: ComponentNode, i18n?: I18n): void {
  // 鎖定時仍可重命名
  const current = node.name ?? ''
  const next = window.prompt(uiText(i18n, 'layers.rename_prompt', '圖層名稱'), current)
  if (next === null) return
  engine.update(node.id, { name: next })
}
