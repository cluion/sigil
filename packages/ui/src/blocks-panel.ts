import type { Engine, ComponentNode, I18n } from '@cluion/sigil-core'
import { openContextMenu } from './context-menu.js'
import { startInsertDrag } from './dnd.js'
import { subscribeLocale, uiText } from './i18n.js'

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
}

function normalize(input: BlocksInput): BlockDef[] {
  if (Array.isArray(input)) return input.map((d) => ({ ...d }))
  return Object.entries(input).map(([label, create]) => ({
    id: label,
    label,
    create,
  }))
}

function matches(def: BlockDef, q: string, defaultCategory: string): boolean {
  if (!q) return true
  const hay = [def.label, def.id, def.category ?? defaultCategory, ...(def.keywords ?? [])]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
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

  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'sigil-input'
  search.placeholder = uiText(opts?.i18n, 'blocks.search_placeholder', '搜尋區塊…')
  search.setAttribute('aria-label', uiText(opts?.i18n, 'blocks.search_label', '搜尋區塊'))
  container.appendChild(search)

  const status = document.createElement('div')
  status.className = 'sigil-blocks-status'
  status.hidden = true
  container.appendChild(status)

  const list = document.createElement('div')
  list.className = 'sigil-blocks-list'
  container.appendChild(list)

  let source = blocks
  let defs = normalize(source)
  let currentStatus: BlocksPanelStatus | null = null
  let pendingActions = 0
  let localeRefreshPending = false
  let destroyed = false
  let closeActionsMenu: (() => void) | null = null

  function defaultCategory(): string {
    return uiText(opts?.i18n, 'blocks.default_category', '一般')
  }

  function renderList(filter: string): void {
    closeActionsMenu?.()
    closeActionsMenu = null
    list.replaceChildren()
    const q = filter.trim().toLowerCase()
    const fallbackCategory = defaultCategory()
    const filtered = defs.filter((d) => matches(d, q, fallbackCategory))

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
        const item = document.createElement('div')
        item.className = 'sigil-block-item'
        item.dataset.blockId = def.id
        item.setAttribute('role', 'button')
        item.setAttribute(
          'aria-label',
          `${uiText(opts?.i18n, 'blocks.insert', '插入')} ${def.label}`,
        )
        item.tabIndex = 0
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
          trigger.title = idleLabel()
          trigger.setAttribute('aria-label', idleLabel())
          trigger.setAttribute('aria-haspopup', 'menu')
          trigger.setAttribute('aria-expanded', 'false')
          trigger.setAttribute('aria-busy', 'false')
          trigger.setAttribute('aria-disabled', 'false')
          let pending = false

          function setPending(next: boolean): void {
            if (pending === next) return
            pending = next
            pendingActions += next ? 1 : -1
            item.setAttribute('aria-busy', String(next))
            trigger.setAttribute('aria-busy', String(next))
            trigger.setAttribute('aria-disabled', String(next))
            trigger.textContent = next ? '…' : '⋯'
            const label = next
              ? `${uiText(opts?.i18n, 'blocks.pending', '處理中')} ${def.label}`
              : idleLabel()
            trigger.title = label
            trigger.setAttribute('aria-label', label)
            if (!destroyed && !next && pendingActions === 0 && localeRefreshPending) {
              localeRefreshPending = false
              refreshLocale()
            }
          }

          async function runAction(
            kind: BlockItemActionKind,
            run: () => void | Promise<void>,
          ): Promise<void> {
            if (pending) return
            setPending(true)
            try {
              await run()
            } catch (error) {
              opts?.onItemActionError?.(error, kind, def)
            } finally {
              setPending(false)
            }
          }

          openItemActions = (x, y, focusTarget?: HTMLElement) => {
            if (pending) return
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

        item.addEventListener('pointerdown', (e: PointerEvent) => {
          e.preventDefault()
          startInsertDrag({ engine, iframe, node: def.create(), pointerId: e.pointerId })
        })
        item.addEventListener('contextmenu', (e) => {
          if (!openItemActions) return
          e.preventDefault()
          openItemActions(e.clientX, e.clientY, item)
        })
        item.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.target !== item) return
          if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            if (!openItemActions) return
            e.preventDefault()
            const rect = item.getBoundingClientRect()
            openItemActions(rect.left, rect.bottom, item)
            return
          }
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          const node = def.create()
          engine.insert(engine.getTree().id, node)
          engine.select(node.id)
        })
        list.appendChild(row)
      }
    }

    if (!filtered.length) {
      const empty = document.createElement('p')
      empty.className = 'sigil-muted'
      empty.textContent = uiText(opts?.i18n, 'blocks.empty', '無符合區塊')
      list.appendChild(empty)
    }
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
    if (pendingActions > 0) {
      localeRefreshPending = true
      return
    }
    renderList(search.value)
    renderStatus()
  }

  search.addEventListener('input', () => renderList(search.value))
  const unsubLocale = subscribeLocale(opts?.i18n, refreshLocale)
  renderList('')
  return {
    destroy() {
      destroyed = true
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
  }
}
