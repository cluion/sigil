import type { Engine, ComponentNode } from '@cluion/sigil-core'
import { startInsertDrag } from './dnd.js'

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

function normalize(input: BlocksInput): BlockDef[] {
  if (Array.isArray(input)) {
    return input.map((d) => ({ category: '一般', ...d }))
  }
  return Object.entries(input).map(([label, create]) => ({
    id: label,
    label,
    category: '一般',
    create,
  }))
}

function matches(def: BlockDef, q: string): boolean {
  if (!q) return true
  const hay = [def.label, def.id, def.category ?? '', ...(def.keywords ?? [])]
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
): { destroy: () => void; reload: (blocks?: BlocksInput) => void } {
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

  let defs = normalize(blocks)

  function renderList(filter: string): void {
    list.replaceChildren()
    const q = filter.trim().toLowerCase()
    const filtered = defs.filter((d) => matches(d, q))

    // 依分類分組，維持首次出現順序
    const order: string[] = []
    const groups = new Map<string, BlockDef[]>()
    for (const d of filtered) {
      const cat = d.category ?? '一般'
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
        const item = document.createElement('div')
        item.className = 'sigil-block-item'
        item.setAttribute('role', 'button')
        item.setAttribute('aria-label', `拖入 ${def.label}`)
        item.tabIndex = 0

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

        item.addEventListener('pointerdown', (e: PointerEvent) => {
          e.preventDefault()
          startInsertDrag({ engine, iframe, node: def.create(), pointerId: e.pointerId })
        })
        list.appendChild(item)
      }
    }

    if (!filtered.length) {
      const empty = document.createElement('p')
      empty.className = 'sigil-muted'
      empty.textContent = '無符合區塊'
      list.appendChild(empty)
    }
  }

  search.addEventListener('input', () => renderList(search.value))
  renderList('')
  return {
    destroy() {},
    reload(next?: BlocksInput) {
      if (next !== undefined) defs = normalize(next)
      renderList(search.value)
    },
  }
}
