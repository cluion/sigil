import type { Engine, ComponentNode, I18n } from '@cluion/sigil-core'
import { createId, findParent, resolveHtmlIdConflicts } from '@cluion/sigil-core'
import { openContextMenu } from './context-menu.js'
import { startInsertDrag } from './dnd.js'
import { subscribeLocale, uiText } from './i18n.js'
import { createBlockPins } from './block-pins.js'
import { searchBlocks } from './block-search.js'

export type BlockFactory = () => ComponentNode

/** 與 @cluion/sigil-blocks BlockDefinition 對齊的精簡形狀 */
export interface BlockDef {
  id: string
  label: string
  category?: string
  icon?: string
  keywords?: string[]
  create: () => ComponentNode
}

export type BlocksInput = Record<string, BlockFactory> | BlockDef[]

export type BlockItemActionKind = 'rename' | 'remove'

export interface BlockItemActions {
  rename?: (label: string) => void | Promise<void>
  remove?: () => void | Promise<void>
}

export interface BlocksPanelOptions {
  i18n?: I18n
  /** 使用指定 localStorage 鍵保留釘選，false 時只在本面板保留。 */
  blockPinStorageKey?: string | false
  /** 回傳指定區塊可用的管理動作；未回傳時不顯示操作入口 */
  itemActions?: (block: BlockDef) => BlockItemActions | undefined
  onItemActionError?: (error: unknown, action: BlockItemActionKind, block: BlockDef) => void
}

export interface BlocksPanelStatus {
  kind: 'loading' | 'error'
  message: string
  retryLabel?: string
  retry?: () => void
}

export interface BlocksPanelHandle {
  destroy: () => void
  reload: (blocks?: BlocksInput) => void
  setStatus: (status: BlocksPanelStatus | null) => void
  /** 開啟同層插入選擇，onFinish 回報是否已插入。 */
  beginInsertAfter?: (id: string, onFinish: (inserted: boolean) => void) => void
  cancelInsertAfter?: () => void
}

function normalize(input: BlocksInput): BlockDef[] {
  if (Array.isArray(input)) return input.map((d) => ({ ...d }))
  return Object.entries(input).map(([label, create]) => ({
    id: label,
    label,
    create,
  }))
}

/**
 * 建立支援分類與搜尋的區塊面板
 */
export function createBlocksPanel(
  engine: Engine,
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  blocks: BlocksInput,
  opts?: BlocksPanelOptions,
): BlocksPanelHandle {
  container.replaceChildren()
  container.classList.add('sigil-blocks-panel')

  const filterRow = document.createElement('div')
  filterRow.className = 'sigil-blocks-filter-row'
  const pinFilter = document.createElement('button')
  pinFilter.type = 'button'
  pinFilter.className = 'sigil-blocks-pin-filter'
  pinFilter.setAttribute('aria-pressed', 'false')
  const filterLabel = document.createElement('span')
  const pinCount = document.createElement('span')
  pinCount.className = 'sigil-blocks-pin-count'
  pinCount.setAttribute('aria-hidden', 'true')
  pinFilter.append(filterLabel, pinCount)
  const resultCount = document.createElement('span')
  resultCount.className = 'sigil-blocks-results'
  resultCount.setAttribute('aria-live', 'polite')
  resultCount.setAttribute('aria-atomic', 'true')
  filterRow.append(pinFilter, resultCount)
  container.append(filterRow)
  const pinNotice = document.createElement('p')
  pinNotice.className = 'sigil-blocks-pin-notice'
  pinNotice.setAttribute('role', 'status')
  pinNotice.hidden = true
  container.append(pinNotice)

  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'sigil-input'
  search.placeholder = uiText(opts?.i18n, 'blocks.search_placeholder', '搜尋區塊…')
  search.setAttribute('aria-label', uiText(opts?.i18n, 'blocks.search_label', '搜尋區塊'))
  container.appendChild(search)

  const placementBar = document.createElement('div')
  placementBar.className = 'sigil-blocks-placement'
  const placementLabel = document.createElement('span')
  placementLabel.id = `sigil-insert-after-${createId()}`
  placementLabel.setAttribute('role', 'status')
  const cancelPlacement = document.createElement('button')
  cancelPlacement.type = 'button'
  cancelPlacement.className = 'sigil-blocks-placement-cancel'
  placementBar.append(placementLabel, cancelPlacement)

  const status = document.createElement('div')
  status.className = 'sigil-blocks-status'
  status.hidden = true
  container.appendChild(status)

  const list = document.createElement('div')
  list.className = 'sigil-blocks-list'
  container.appendChild(list)

  let source = blocks
  let defs = normalize(source)
  let pinnedOnly = false
  const visiblePins = new Map<HTMLButtonElement, BlockDef>()
  const pins = createBlockPins(
    container.ownerDocument.defaultView,
    opts?.blockPinStorageKey,
    refreshPins,
  )
  let currentStatus: BlocksPanelStatus | null = null
  const pendingActions = new Set<string>()
  const updateActionButtons = new Map<string, () => void>()
  let localeRefreshPending = false
  let destroyed = false
  let closeActionsMenu: (() => void) | null = null
  let insertDrag: ReturnType<typeof startInsertDrag> | undefined
  let placement: {
    id: string
    name: string
    onFinish: (inserted: boolean) => void
    unsubscribe: () => void
  } | null = null

  function insertionPoint(id: string) {
    const parent = findParent(engine.getTree(), id)
    if (!parent?.children || parent.locked) return null
    const index = parent.children.findIndex((node) => node.id === id)
    return { parentId: parent.id, index: index + 1, anchor: parent.children[index]! }
  }

  function refreshPlacementLabel(): void {
    if (!placement) return
    const { name } = placement
    placementLabel.textContent = uiText(
      opts?.i18n,
      'blocks.insert_after_target',
      '插入於「{name}」下方',
    ).replace('{name}', () => name)
    cancelPlacement.textContent = uiText(opts?.i18n, 'blocks.cancel_insert', '取消')
  }

  function takePlacement() {
    if (!placement) return
    const { onFinish, unsubscribe } = placement
    placement = null
    unsubscribe()
    insertDrag?.cancel()
    placementBar.remove()
    search.removeAttribute('aria-describedby')
    return onFinish
  }

  function cancelInsertAfter(): void {
    takePlacement()?.(false)
  }

  function onPlacementKeydown(event: KeyboardEvent): void {
    if (!placement || event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.stopPropagation()
    cancelInsertAfter()
  }

  function beginInsertAfter(id: string, onFinish: (inserted: boolean) => void): void {
    cancelInsertAfter()
    if (destroyed) return
    const point = insertionPoint(id)
    if (!point) {
      onFinish(false)
      return
    }
    insertDrag?.cancel()
    closeActionsMenu?.()
    const { anchor } = point
    const watchSelection = engine.getSelection() === id
    placement = {
      id,
      name:
        anchor.name?.trim() ||
        (anchor.shortcode ? `shortcode:${anchor.shortcode.name}` : anchor.type),
      onFinish,
      unsubscribe: engine.subscribe((event) => {
        if (!watchSelection || event.type !== 'selection' || event.id === id) return
        // 刪除目標會清空選取，保留指定位置讓下一次插入檢查目標是否仍存在。
        if (event.id === null && !findParent(engine.getTree(), id)) return
        cancelInsertAfter()
      }),
    }
    refreshPlacementLabel()
    container.insertBefore(placementBar, filterRow)
    search.setAttribute('aria-describedby', placementLabel.id)
    search.focus()
    search.select()
  }

  cancelPlacement.addEventListener('click', cancelInsertAfter)
  container.addEventListener('keydown', onPlacementKeydown)

  function defaultCategory(): string {
    return uiText(opts?.i18n, 'blocks.default_category', '一般')
  }

  function paintPin(pin: HTMLButtonElement, def: BlockDef): void {
    const isPinned = pins.has(def.id)
    if (pin.getAttribute('aria-pressed') === String(isPinned)) return
    pin.setAttribute('aria-pressed', String(isPinned))
    pin.querySelector('svg')!.setAttribute('fill', isPinned ? 'currentColor' : 'none')
    pin.title = isPinned
      ? uiText(opts?.i18n, 'blocks.unpin', '取消釘選 {name}').replace('{name}', () => def.label)
      : pin.getAttribute('aria-label')!
  }

  function refreshPins(): void {
    if (destroyed) return
    if (pinnedOnly) {
      renderList(search.value)
      return
    }
    refreshPinNotice()
    pinCount.textContent = String(defs.filter((def) => pins.has(def.id)).length)
    for (const [pin, def] of visiblePins) paintPin(pin, def)
  }

  function refreshPinNotice(): void {
    pinNotice.hidden = !pins.hasSessionChanges()
    const message = pinNotice.hidden
      ? ''
      : uiText(opts?.i18n, 'blocks.pins_session_only', '釘選變更僅保留於目前工作階段。')
    if (pinNotice.textContent !== message) pinNotice.textContent = message
  }

  function renderPin(def: BlockDef): HTMLButtonElement {
    const pin = document.createElement('button')
    pin.type = 'button'
    pin.className = 'sigil-block-pin'
    pin.dataset.blockPin = def.id
    pin.setAttribute(
      'aria-label',
      uiText(opts?.i18n, 'blocks.pin', '釘選 {name}').replace('{name}', () => def.label),
    )
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('width', '16')
    icon.setAttribute('height', '16')
    icon.setAttribute('stroke', 'currentColor')
    icon.setAttribute('stroke-width', '1.75')
    icon.setAttribute('stroke-linejoin', 'round')
    icon.setAttribute('aria-hidden', 'true')
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    outline.setAttribute(
      'd',
      'm12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z',
    )
    icon.append(outline)
    pin.append(icon)
    visiblePins.set(pin, def)
    paintPin(pin, def)
    pin.addEventListener('click', () => {
      if (destroyed) return
      pin.focus({ preventScroll: true })
      pins.toggle(def.id)
    })
    return pin
  }

  function rememberFocus(): (() => void) | undefined {
    const active = container.ownerDocument.activeElement
    if (!(active instanceof HTMLButtonElement) || !list.contains(active)) return
    const row = active.closest<HTMLElement>('.sigil-block-row')
    if (!row) return
    const id = row.dataset.blockId
    const index = Array.from(list.querySelectorAll('.sigil-block-row')).indexOf(row)
    const selector = active.hasAttribute('data-block-pin')
      ? '.sigil-block-pin'
      : active.hasAttribute('data-block-actions')
        ? '.sigil-block-actions-trigger'
        : '.sigil-block-item'
    return () => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.sigil-block-row'))
      const next =
        rows.find((item) => item.dataset.blockId === id) ?? rows[Math.min(index, rows.length - 1)]
      const control =
        next?.querySelector<HTMLButtonElement>(selector) ??
        next?.querySelector<HTMLButtonElement>('.sigil-block-item')
      ;(control ?? (pinnedOnly ? pinFilter : search)).focus({ preventScroll: true })
    }
  }

  function renderList(filter: string): void {
    if (destroyed) return
    refreshPinNotice()
    insertDrag?.cancel()
    insertDrag = undefined
    closeActionsMenu?.()
    closeActionsMenu = null
    const restoreFocus = rememberFocus()
    list.replaceChildren()
    updateActionButtons.clear()
    visiblePins.clear()
    const fallbackCategory = defaultCategory()
    const pinned = defs.filter((def) => pins.has(def.id))
    const filtered = searchBlocks(pinnedOnly ? pinned : defs, filter, fallbackCategory)
    filterLabel.textContent = uiText(opts?.i18n, 'blocks.pinned_only', '只看已釘選')
    pinCount.textContent = String(pinned.length)
    pinFilter.setAttribute('aria-pressed', String(pinnedOnly))
    const count = uiText(opts?.i18n, 'blocks.results', '{count} 個結果').replace(
      '{count}',
      String(filtered.length),
    )
    if (resultCount.textContent !== count) resultCount.textContent = count

    // 依分類分組，維持首次出現順序
    const order: string[] = []
    const groups = new Map<string, BlockDef[]>()
    for (const d of filtered) {
      const cat = d.category ?? fallbackCategory
      if (!groups.has(cat)) {
        groups.set(cat, [])
        order.push(cat)
      }
      groups.get(cat)!.push(d)
    }

    for (const cat of order) {
      const items = groups.get(cat)!
      const heading = document.createElement('div')
      heading.className = 'sigil-blocks-category'
      heading.textContent = cat
      list.appendChild(heading)

      for (const def of items) {
        const row = document.createElement('div')
        row.className = 'sigil-block-row'
        row.dataset.blockId = def.id
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'sigil-block-item'
        item.dataset.blockId = def.id
        item.setAttribute('role', 'button')
        item.setAttribute(
          'aria-label',
          `${uiText(opts?.i18n, 'blocks.insert', '插入')} ${def.label}`,
        )
        row.appendChild(item)

        if (def.icon) {
          const icon = document.createElement('span')
          icon.className = 'sigil-block-icon'
          icon.textContent = def.icon
          icon.setAttribute('aria-hidden', 'true')
          item.appendChild(icon)
        }
        const text = document.createElement('span')
        text.className = 'sigil-block-label'
        text.textContent = def.label
        item.appendChild(text)
        row.appendChild(renderPin(def))

        const actions = opts?.itemActions?.(def)
        let openItemActions: ((x: number, y: number, focusTarget?: HTMLElement) => void) | undefined
        if (actions?.rename || actions?.remove) {
          const rename = actions.rename
          const remove = actions.remove
          const trigger = document.createElement('button')
          trigger.type = 'button'
          trigger.className = 'sigil-block-actions-trigger'
          trigger.dataset.blockActions = def.id
          trigger.textContent = '⋯'
          const idleLabel = () => `${def.label} ${uiText(opts?.i18n, 'blocks.actions', '範本操作')}`
          trigger.setAttribute('aria-haspopup', 'menu')
          trigger.setAttribute('aria-expanded', 'false')
          function refreshPending(): void {
            const next = pendingActions.has(def.id)
            item.setAttribute('aria-busy', String(next))
            trigger.setAttribute('aria-busy', String(next))
            trigger.setAttribute('aria-disabled', String(next))
            trigger.textContent = next ? '…' : '⋯'
            const label = next
              ? `${uiText(opts?.i18n, 'blocks.pending', '處理中')} ${def.label}`
              : idleLabel()
            trigger.title = label
            trigger.setAttribute('aria-label', label)
          }
          updateActionButtons.set(def.id, refreshPending)
          refreshPending()

          async function runAction(
            kind: BlockItemActionKind,
            run: () => void | Promise<void>,
          ): Promise<void> {
            if (pendingActions.has(def.id)) return
            pendingActions.add(def.id)
            refreshPending()
            try {
              await run()
            } catch (error) {
              opts?.onItemActionError?.(error, kind, def)
            } finally {
              pendingActions.delete(def.id)
              if (!destroyed) {
                updateActionButtons.get(def.id)?.()
                if (!pendingActions.size && localeRefreshPending) {
                  localeRefreshPending = false
                  refreshLocale()
                }
              }
            }
          }

          openItemActions = (x, y, focusTarget?: HTMLElement) => {
            if (pendingActions.has(def.id)) return
            closeActionsMenu?.()
            focusTarget?.focus()
            trigger.setAttribute('aria-expanded', 'true')
            closeActionsMenu = openContextMenu({
              items: [
                ...(rename
                  ? [
                      {
                        id: 'rename',
                        label: uiText(opts?.i18n, 'blocks.rename', '重新命名'),
                        run: () => {
                          const next = window
                            .prompt(
                              uiText(opts?.i18n, 'blocks.rename_prompt', '範本名稱'),
                              def.label,
                            )
                            ?.trim()
                          if (!next || next === def.label) return
                          void runAction('rename', () => rename(next))
                        },
                      },
                    ]
                  : []),
                ...(remove
                  ? [
                      {
                        id: 'remove',
                        label: uiText(opts?.i18n, 'blocks.remove', '刪除'),
                        run: () => {
                          const message = `${uiText(
                            opts?.i18n,
                            'blocks.remove_confirm_before',
                            '確定刪除範本「',
                          )}${def.label}${uiText(
                            opts?.i18n,
                            'blocks.remove_confirm_after',
                            '」？',
                          )}`
                          if (!window.confirm(message)) return
                          void runAction('remove', remove)
                        },
                      },
                    ]
                  : []),
              ],
              x,
              y,
              theme: container.closest('.sigil-theme-dark') ? 'dark' : 'light',
              ariaLabel: idleLabel(),
              onClose: () => {
                trigger.setAttribute('aria-expanded', 'false')
                closeActionsMenu = null
              },
            })
          }

          trigger.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
          })
          trigger.addEventListener('click', (e) => {
            e.stopPropagation()
            const rect = trigger.getBoundingClientRect()
            openItemActions?.(rect.left, rect.bottom, trigger)
          })
          row.appendChild(trigger)
        }

        const createBlock = () => resolveHtmlIdConflicts(def.create(), engine.getTree())
        let dragged = false
        item.addEventListener('pointerdown', (e: PointerEvent) => {
          if (destroyed || e.button !== 0 || !e.isPrimary) return
          insertDrag?.cancel()
          dragged = false
          insertDrag = startInsertDrag({
            engine,
            iframe,
            node: createBlock,
            pointerId: e.pointerId,
            origin: { x: e.clientX, y: e.clientY },
            onDragStart: () => {
              dragged = true
            },
            onInsert: (block) => {
              const finish = takePlacement()
              engine.select(block.id)
              finish?.(true)
            },
          })
        })
        const insert = () => {
          if (destroyed) return
          const current = placement
          const node = createBlock()
          if (placement !== current || destroyed) return
          const point = current && insertionPoint(current.id)
          if (current && !point) {
            cancelInsertAfter()
            return
          }
          const finish = takePlacement()
          engine.insert(point?.parentId ?? engine.getTree().id, node, point?.index)
          engine.select(node.id)
          finish?.(true)
        }
        item.addEventListener('click', (e) => {
          if (!dragged || e.detail === 0) insert()
          dragged = false
        })
        item.addEventListener('contextmenu', (e) => {
          if (!openItemActions) return
          e.preventDefault()
          openItemActions(e.clientX, e.clientY, item)
        })
        item.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.target !== item || e.isComposing || e.keyCode === 229) return
          if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            if (!openItemActions) return
            e.preventDefault()
            const rect = item.getBoundingClientRect()
            openItemActions(rect.left, rect.bottom, item)
            return
          }
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          insert()
        })
        list.appendChild(row)
      }
    }

    if (!filtered.length) {
      const empty = document.createElement('p')
      empty.className = 'sigil-muted'
      empty.textContent =
        pinnedOnly && !pinned.length
          ? uiText(opts?.i18n, 'blocks.no_pins', '尚無已釘選區塊')
          : uiText(opts?.i18n, 'blocks.empty', '無符合區塊')
      list.appendChild(empty)
    }
    restoreFocus?.()
  }

  function renderStatus(): void {
    status.replaceChildren()
    const next = currentStatus
    if (!next) {
      status.hidden = true
      status.removeAttribute('role')
      delete status.dataset.kind
      return
    }

    status.hidden = false
    status.dataset.kind = next.kind
    status.setAttribute('role', next.kind === 'error' ? 'alert' : 'status')
    const message = document.createElement('span')
    message.textContent = next.message
    status.appendChild(message)
    if (next.retry) {
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'sigil-blocks-retry'
      retry.textContent = next.retryLabel ?? uiText(opts?.i18n, 'blocks.retry', '重試')
      retry.addEventListener('click', next.retry)
      status.appendChild(retry)
    }
  }

  function refreshLocale(): void {
    if (destroyed) return
    search.placeholder = uiText(opts?.i18n, 'blocks.search_placeholder', '搜尋區塊…')
    search.setAttribute('aria-label', uiText(opts?.i18n, 'blocks.search_label', '搜尋區塊'))
    refreshPlacementLabel()
    if (pendingActions.size) {
      refreshPinNotice()
      localeRefreshPending = true
      return
    }
    renderList(search.value)
    renderStatus()
  }

  search.addEventListener('input', () => renderList(search.value))
  function navigateResults(event: KeyboardEvent): void {
    if (
      destroyed ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const target = event.target
    if (
      target !== search &&
      !(target instanceof HTMLElement && target.matches('.sigil-block-item'))
    )
      return
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>('.sigil-block-item'))
    if (!items.length) return
    const index = items.indexOf(target as HTMLButtonElement)
    const next =
      event.key === 'ArrowDown'
        ? items[Math.min(index + 1, items.length - 1)]
        : target === search
          ? items.at(-1)
          : (items[index - 1] ?? search)
    event.preventDefault()
    next?.focus()
  }
  container.addEventListener('keydown', navigateResults)
  pinFilter.addEventListener('click', () => {
    if (destroyed) return
    pinnedOnly = !pinnedOnly
    renderList(search.value)
  })
  const unsubLocale = subscribeLocale(opts?.i18n, refreshLocale)
  renderList('')
  return {
    destroy() {
      insertDrag?.cancel()
      destroyed = true
      takePlacement()
      container.removeEventListener('keydown', onPlacementKeydown)
      container.removeEventListener('keydown', navigateResults)
      pins.destroy()
      visiblePins.clear()
      updateActionButtons.clear()
      localeRefreshPending = false
      unsubLocale()
      closeActionsMenu?.()
      closeActionsMenu = null
      status.replaceChildren()
    },
    reload(next?: BlocksInput) {
      if (next !== undefined) {
        source = next
        defs = normalize(source)
      }
      renderList(search.value)
    },
    setStatus(next) {
      currentStatus = next
      renderStatus()
    },
    beginInsertAfter,
    cancelInsertAfter,
  }
}
