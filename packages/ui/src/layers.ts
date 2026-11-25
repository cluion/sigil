import {
  createId,
  findNode,
  type Engine,
  type ComponentNode,
  type I18n,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'
import { createLayerSearch } from './layer-search.js'
import { createHeadingOutline } from './heading-outline.js'
import { findComponentPath } from './component-path.js'
import { imageLinkLabel } from './image-link-label.js'

export interface LayersPanelOptions {
  i18n?: I18n
  /** 圖層樹的無障礙名稱 */
  ariaLabel?: string
  /** 在圖層樹上方提供可搜尋整份文件的欄位。 */
  searchable?: boolean
  /** 提供依文件順序瀏覽原生標題的檢視。 */
  headingOutline?: boolean
  /** 大綱略過由這個 adapter 接管的內容。 */
  richText?: Pick<RichTextResolver, 'supports'>
  /** 選擇結果後保留查詢、已展開的結果頁和目前結果。 */
  preserveSearchOnActivate?: () => boolean
  /** 點選圖層或按 Enter、空白鍵確認選取後觸發。 */
  onActivate?: (id: string) => void
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
  /** 將焦點移回目前檢視的控制項，或直接移到其搜尋欄。 */
  focus: (target?: 'previous' | 'search') => void
  /** 面板隱藏時延後更新搜尋與大綱，再次顯示時同步。 */
  setSearchVisible: (visible: boolean) => void
} {
  const treeView =
    opts?.searchable || opts?.headingOutline ? document.createElement('div') : container
  treeView.classList.add('sigil-layers-panel')
  treeView.setAttribute('role', 'tree')
  function typeLabel(node: ComponentNode): string {
    if (node.name?.trim()) return node.name.trim()
    if (node.type === 'shortcode' && node.shortcode?.name) return `sc:${node.shortcode.name}`
    return imageLinkLabel(node, opts?.i18n) ?? node.type
  }
  function refreshLabel(): void {
    treeView.setAttribute(
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
  let lastControl: HTMLElement | null = null
  let pendingSelection = false
  const search = opts?.searchable
    ? createLayerSearch(engine, {
        tree: treeView,
        i18n: opts.i18n,
        labelForNode: typeLabel,
        preserveSearchOnActivate: opts.preserveSearchOnActivate,
        onShowTree: syncPendingSelection,
        onActivate(id) {
          engine.select(id)
          if (!treeView.hidden) rows.get(id)?.focus({ preventScroll: true })
          opts.onActivate?.(id)
        },
      })
    : undefined
  const outline = opts?.headingOutline
    ? createHeadingOutline(engine, {
        document: container.ownerDocument,
        i18n: opts.i18n,
        richText: opts.richText,
        onActivate(id) {
          engine.select(id)
          opts.onActivate?.(id)
        },
      })
    : undefined
  const treePane = outline ? document.createElement('div') : container
  const views = outline ? createLayerViews(treePane, outline.el, opts?.i18n) : undefined
  let visible = true
  let showingOutline = false
  let treeLocaleChanged = false

  if (search || outline) {
    if (container.classList.contains('sigil-layers-panel')) {
      container.classList.remove('sigil-layers-panel')
      container.removeAttribute('role')
      container.removeAttribute('aria-label')
    }
    treeView.classList.add('sigil-layer-tree')
    container.classList.add('sigil-layer-browser')
    treePane.replaceChildren(...(search ? [search.el, treeView] : [treeView]))
    if (views && outline) {
      treePane.className = 'sigil-layer-tree-view'
      container.replaceChildren(views.el, treePane, outline.el)
    }
  }

  function setVisible(next: boolean): void {
    visible = next
    search?.setVisible(visible && !showingOutline)
    outline?.setVisible(visible && showingOutline)
    syncPendingSelection()
  }

  function syncPendingSelection(): void {
    if (pendingSelection && visible && !showingOutline && !treeView.hidden) syncSelection()
  }

  function setOutlineActive(next: boolean): void {
    if (!views || showingOutline === next) return
    showingOutline = next
    views.setOutlineActive(next)
    treePane.hidden = next
    if (!next) {
      pendingSelection ||= selectedId !== engine.getSelection()
      if (treeLocaleChanged || !refreshChangedNode()) render(!!(selectedId && rows.has(selectedId)))
      treeLocaleChanged = false
    }
    setVisible(visible)
  }

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
    for (const ancestor of findComponentPath(engine.getTree(), id).slice(0, -1)) {
      toggleBranch(ancestor, true)
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
    pendingSelection = !!next && (!visible || treeView.hidden)
    if (!next || pendingSelection || !container.clientHeight) return
    const scrollBox = treeView.scrollHeight > treeView.clientHeight ? treeView : container
    if (scrollBox.scrollHeight > scrollBox.clientHeight) {
      const bounds = scrollBox.getBoundingClientRect()
      const item = next.getBoundingClientRect()
      if (item.top < bounds.top) scrollBox.scrollTop += item.top - bounds.top
      else if (item.bottom > bounds.bottom) scrollBox.scrollTop += item.bottom - bounds.bottom
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
    treeView.replaceChildren(renderNode(renderedTree, 0))
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
    const viewButton =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-layer-view]')
        : null
    if (viewButton && views?.el.contains(viewButton)) {
      viewButton.focus({ preventScroll: true })
      setOutlineActive(viewButton.dataset.layerView === 'outline')
      return
    }
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
    if (event.detail < 2) opts?.onActivate?.(id)
  }

  function onDoubleClick(event: MouseEvent): void {
    const row = rowFor(event.target)
    if (!row || (event.target instanceof Element && event.target.closest('button'))) return
    event.preventDefault()
    event.stopPropagation()
    const node = findNode(engine.getTree(), row.dataset.layerId!)
    if (node) renameLayer(engine, node, opts?.i18n)
  }

  function onContextMenu(event: MouseEvent): void {
    const row = rowFor(event.target)
    if (!row || !opts?.onContextMenu) return
    event.preventDefault()
    engine.select(row.dataset.layerId!)
    row.focus({ preventScroll: true })
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
        opts?.onActivate?.(id)
        break
      case 'F2': {
        const node = findNode(engine.getTree(), id)
        if (node) renameLayer(engine, node, opts?.i18n)
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
    if (event.target instanceof HTMLElement) lastControl = event.target
    const row = rowFor(event.target)
    if (row) setTabStop(row)
  }

  function focus(target: 'previous' | 'search' = 'previous'): void {
    const activeSearch = showingOutline ? outline?.el : search?.el
    if (target === 'search' && activeSearch) {
      activeSearch.querySelector('input')?.focus({ preventScroll: true })
      return
    }
    if (lastControl && container.contains(lastControl) && !lastControl.closest('[hidden]')) {
      lastControl.focus({ preventScroll: true })
      return
    }
    if (showingOutline && outline) {
      outline.focus()
      return
    }
    if (treeView.hidden && search) {
      const id = lastControl?.dataset.layerResult
      const result =
        id && search.el.querySelector<HTMLElement>(`[data-layer-result="${CSS.escape(id)}"]`)
      ;(result || search.el.querySelector('input'))?.focus({ preventScroll: true })
      return
    }
    const id = lastControl?.closest<HTMLElement>('[role="treeitem"]')?.dataset.layerId
    const row = id ? rows.get(id) : undefined
    const action = lastControl?.dataset.layerAction
    const button =
      action && row?.querySelector<HTMLElement>(`[data-layer-action="${CSS.escape(action)}"]`)
    ;(button || row || tabStop)?.focus({ preventScroll: true })
  }
  container.addEventListener('click', onClick)
  container.addEventListener('dblclick', onDoubleClick)
  container.addEventListener('contextmenu', onContextMenu)
  container.addEventListener('keydown', onKeyDown)
  container.addEventListener('focusin', onFocus)
  const unsub = engine.subscribe((event) => {
    if (event.type === 'selection') {
      outline?.syncSelection()
      if (showingOutline) pendingSelection = true
    }
    if (event.type === 'patch' || event.type === 'tree') {
      outline?.refresh(event.type === 'patch' ? event.patch : undefined)
      search?.refresh()
    }
    if (showingOutline) return
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
    search?.refreshLocale()
    outline?.refreshLocale()
    views?.refreshLocale()
    if (showingOutline) treeLocaleChanged = true
    else render(false)
  })
  render(true)
  return {
    focus,
    setSearchVisible: setVisible,
    destroy() {
      outline?.destroy()
      search?.destroy()
      views?.el.remove()
      if (outline && treePane.parentElement === container) treePane.replaceWith(treeView)
      if (search || outline) container.classList.remove('sigil-layer-browser')
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

function createLayerViews(tree: HTMLElement, outline: HTMLElement, i18n?: I18n) {
  const el = document.createElement('div')
  el.className = 'sigil-layer-views'
  el.setAttribute('role', 'group')
  function button(view: string, controls: HTMLElement) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'sigil-btn'
    item.dataset.layerView = view
    controls.id ||= `sigil-layer-${view}-${createId()}`
    item.setAttribute('aria-controls', controls.id)
    return item
  }
  const all = button('tree', tree)
  const headings = button('outline', outline)
  el.append(all, headings)
  function setOutlineActive(active: boolean) {
    all.setAttribute('aria-pressed', String(!active))
    headings.setAttribute('aria-pressed', String(active))
    all.style.fontWeight = active ? '' : '600'
    headings.style.fontWeight = active ? '600' : ''
  }
  function refreshLocale() {
    el.setAttribute('aria-label', uiText(i18n, 'layers.views', '結構檢視'))
    all.textContent = uiText(i18n, 'layers.all', '所有圖層')
    headings.textContent = uiText(i18n, 'layers.outline', '標題大綱')
  }
  setOutlineActive(false)
  refreshLocale()
  return { el, setOutlineActive, refreshLocale }
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
  if (changed && Boolean(imageLinkLabel(before)) !== Boolean(imageLinkLabel(after))) return null
  return changed
}

export function renameLayer(engine: Engine, node: ComponentNode, i18n?: I18n): void {
  // 鎖定時仍可重命名
  const current = node.name ?? ''
  const next = window.prompt(uiText(i18n, 'layers.rename_prompt', '圖層名稱'), current)
  if (next === null || next === current) return
  engine.update(node.id, { name: next })
}
