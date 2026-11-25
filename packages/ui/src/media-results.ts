import { createId, type AssetItem, type I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import type { PageImage } from './page-images.js'

const PAGE_SIZE = 36

interface Result {
  item: AssetItem
  keywords: string
  uses?: number
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim()
}

export function indexAsset(item: AssetItem, page?: PageImage): Result {
  return {
    item,
    keywords: normalize([item.name ?? item.id, ...(page?.searchTerms ?? [])].join(' ')),
    uses: page?.uses,
  }
}

export function createMediaResults(
  currentUrl: string | undefined,
  i18n: I18n | undefined,
  onPick: (item: AssetItem) => void,
  signal: AbortSignal,
) {
  const grid = document.createElement('div')
  grid.className = 'sigil-media-grid'
  grid.id = 'sigil-media-results-' + createId()
  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'sigil-btn sigil-media-more'
  more.setAttribute('aria-controls', grid.id)
  more.hidden = true
  let matches: Result[] = []
  let current: Result | undefined

  function pageUses(count: number) {
    return uiText(i18n, 'media.page_uses', '本頁使用 {count} 次').replace('{count}', String(count))
  }

  function append(from: number, to: number) {
    const fragment = document.createDocumentFragment()
    for (let index = from; index < Math.min(matches.length, to); index++) {
      const { item, uses } = matches[index]!
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'sigil-media-card'
      card.dataset.mediaIndex = String(index)
      const img = document.createElement('img')
      img.src = item.thumbUrl ?? item.url
      img.alt = ''
      img.loading = 'lazy'
      const label = document.createElement('span')
      label.className = 'sigil-media-name'
      label.textContent = item.name ?? item.id
      card.append(img, label)
      if (uses !== undefined) {
        label.id = grid.id + '-name-' + index
        const usage = document.createElement('span')
        usage.id = grid.id + '-uses-' + index
        usage.className = 'sigil-media-uses'
        usage.textContent = pageUses(uses)
        card.setAttribute('aria-labelledby', label.id)
        card.setAttribute('aria-describedby', usage.id)
        card.append(usage)
      }
      if (matches[index] === current) {
        card.classList.add('sigil-media-card--active')
        card.setAttribute('aria-current', 'true')
        const badge = document.createElement('span')
        badge.className = 'sigil-media-current'
        badge.setAttribute('aria-hidden', 'true')
        badge.textContent = uiText(i18n, 'media.current', '使用中')
        card.append(badge)
      }
      fragment.append(card)
    }
    grid.append(fragment)
    more.hidden = grid.childElementCount >= matches.length
  }

  more.addEventListener(
    'click',
    () => {
      const start = grid.childElementCount
      if (more.hidden) return
      append(start, start + PAGE_SIZE)
      const firstAdded = grid.children[start] as HTMLButtonElement
      firstAdded.focus()
    },
    { signal },
  )
  grid.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        'button[data-media-index]',
      )
      if (!button || !grid.contains(button)) return
      const selected = matches[Number(button.dataset.mediaIndex)]
      if (selected) onPick(selected.item)
    },
    { signal },
  )

  function refreshLocale() {
    more.textContent = uiText(i18n, 'media.more', '顯示更多圖片')
    for (const card of grid.querySelectorAll<HTMLButtonElement>('button[data-media-index]')) {
      const usage = card.querySelector('.sigil-media-uses')
      if (usage) usage.textContent = pageUses(matches[Number(card.dataset.mediaIndex)]!.uses!)
      const badge = card.querySelector('.sigil-media-current')
      if (badge) badge.textContent = uiText(i18n, 'media.current', '使用中')
    }
  }
  return {
    grid,
    more,
    refreshLocale,
    render(items: Result[], query: string, limit = PAGE_SIZE): number {
      const terms = normalize(query).split(/\s+/u).filter(Boolean)
      current =
        currentUrl === undefined ? undefined : items.find(({ item }) => item.url === currentUrl)
      matches = terms.length
        ? items.filter((result) => terms.every((term) => result.keywords.includes(term)))
        : items
      grid.replaceChildren()
      append(0, Math.max(PAGE_SIZE, limit))
      return matches.length
    },
  }
}
