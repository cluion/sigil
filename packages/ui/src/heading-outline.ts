import {
  createId,
  type ComponentNode,
  type Engine,
  type I18n,
  type Patch,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'

const PAGE_SIZE = 40

interface OutlineOptions {
  document?: Document
  i18n?: I18n
  richText?: Pick<RichTextResolver, 'supports'>
  onActivate: (id: string) => void
}

interface Heading {
  id: string
  level: string
  title: string
}

function attribute(node: ComponentNode, key: string): string | undefined {
  const attrs = node.attributes
  if (!attrs) return
  if (Object.hasOwn(attrs, key)) return attrs[key]
  const spelling = Object.keys(attrs).find((name) => name.toLowerCase() === key)
  return spelling === undefined ? undefined : attrs[spelling]
}

function indexHeadings(root: ComponentNode, richText?: OutlineOptions['richText']) {
  const headings: Heading[] = []
  const titleSources = new Set<string>()

  function visit(node: ComponentNode, parentText?: string[]): void {
    if (
      node.hidden ||
      attribute(node, 'hidden') !== undefined ||
      attribute(node, 'aria-hidden')?.trim().toLowerCase() === 'true'
    )
      return
    const tag = node.tagName?.toLowerCase()
    const level = tag?.match(/^h([1-6])$/)?.[1]
    // A host resolver may switch an existing heading or branch into rich text after an edit.
    if (level || parentText || (richText && node.children?.length)) titleSources.add(node.id)
    if (
      node.shortcode ||
      node.type === 'shortcode' ||
      node.type === 'rich-text' ||
      richText?.supports(node)
    )
      return

    const entry = level ? { id: node.id, level, title: '' } : undefined
    if (entry) headings.push(entry)
    const text: string[] | undefined = entry ? [] : parentText
    if (text) {
      if (tag === 'br') text.push(' ')
      else if (tag === 'img' || (!tag && node.type === 'image'))
        text.push(attribute(node, 'alt') ?? '')
      else if (node.content) text.push(node.content)
    }
    for (const child of node.children ?? []) visit(child, text)
    if (entry && text) {
      const content = text.join('')
      parentText?.push(content)
      entry.title =
        content.replace(/\s+/g, ' ').trim() ||
        attribute(node, 'aria-label')?.trim() ||
        node.name?.trim() ||
        ''
    }
  }

  visit(root)
  return { headings, titleSources }
}

function fold(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim()
}

export function createHeadingOutline(engine: Engine, opts: OutlineOptions) {
  const doc = opts.document ?? document
  const el = doc.createElement('div')
  el.className = 'sigil-heading-outline'
  el.hidden = true
  const controls = doc.createElement('div')
  controls.className = 'sigil-layer-search-controls'
  const input = doc.createElement('input')
  input.type = 'search'
  input.className = 'sigil-input sigil-heading-outline-search'
  controls.append(input)
  const status = doc.createElement('div')
  status.className = 'sigil-heading-outline-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-atomic', 'true')
  const results = doc.createElement('div')
  results.className = 'sigil-heading-outline-results'
  const list = doc.createElement('ol')
  list.className = 'sigil-heading-outline-list'
  list.setAttribute('role', 'list')
  list.id = 'sigil-heading-list-' + createId()
  input.setAttribute('aria-controls', list.id)
  const more = doc.createElement('button')
  more.type = 'button'
  more.className = 'sigil-btn sigil-heading-outline-more'
  more.hidden = true
  results.append(list, more)
  el.append(controls, status, results)

  const events = new AbortController()
  const { signal } = events
  const items = new Map<string, ReturnType<typeof makeItem>>()
  let index: ReturnType<typeof indexHeadings> | undefined
  let limit = PAGE_SIZE
  let composing = false
  let currentButton: HTMLButtonElement | undefined
  let lastControl: HTMLElement = input
  let tabStop: HTMLButtonElement | undefined
  let untitled = ''

  function makeItem(id: string) {
    const item = doc.createElement('li')
    item.className = 'sigil-heading-outline-item'
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'sigil-heading-outline-result'
    button.dataset.headingId = id
    button.tabIndex = -1
    const badge = doc.createElement('span')
    badge.className = 'sigil-heading-outline-level'
    const title = doc.createElement('span')
    title.className = 'sigil-heading-outline-title'
    button.append(badge, title)
    item.append(button)
    return { item, button, badge, title }
  }

  function syncSelection(): void {
    if (el.hidden) return
    const id = engine.getSelection()
    const next = id ? items.get(id)?.button : undefined
    if (next === currentButton) return
    currentButton?.removeAttribute('aria-current')
    next?.setAttribute('aria-current', 'true')
    currentButton = next
  }

  function setTabStop(button?: HTMLButtonElement): void {
    if (tabStop === button) return
    if (tabStop) tabStop.tabIndex = -1
    if (button) button.tabIndex = 0
    tabStop = button
  }

  function countText(count: number, searching: boolean): string {
    if (count)
      return uiText(opts.i18n, 'layers.outline_count', '共 {count} 個標題').replace(
        '{count}',
        String(count),
      )
    return searching
      ? uiText(opts.i18n, 'layers.outline_no_matches', '找不到符合的標題')
      : uiText(opts.i18n, 'layers.outline_empty', '這個頁面還沒有標題')
  }

  function headingButton(target: EventTarget | null): HTMLButtonElement | undefined {
    const button = target as HTMLButtonElement | null
    if (button?.dataset?.headingId && list.contains(button)) return button
  }

  function render(): void {
    if (el.hidden || composing || signal.aborted) return
    index ??= indexHeadings(engine.getTree(), opts.richText)
    const terms = fold(input.value).split(/\s+/).filter(Boolean)
    const matches = terms.length
      ? index.headings.filter((heading) => {
          const label = fold(`H${heading.level} ${heading.title || untitled}`)
          return terms.every((term) => label.includes(term))
        })
      : index.headings
    const message = countText(matches.length, terms.length > 0)
    if (status.textContent !== message) status.textContent = message

    const active = doc.activeElement
    const focused = headingButton(active)
    const previousIndex = focused ? Array.from(list.children).indexOf(focused.parentElement!) : -1
    const page = matches.slice(0, limit)
    const ids = new Set(page.map((heading) => heading.id))
    for (const [id, row] of items) {
      if (ids.has(id)) continue
      row.item.remove()
      items.delete(id)
    }
    page.forEach((heading, position) => {
      const row = items.get(heading.id) ?? makeItem(heading.id)
      items.set(heading.id, row)
      if (row.button.dataset.level !== heading.level) {
        row.button.dataset.level = heading.level
        row.badge.textContent = 'H' + heading.level
      }
      const title = heading.title || untitled
      if (row.title.textContent !== title) row.title.textContent = title
      const label = 'H' + heading.level + ' ' + title
      if (row.button.getAttribute('aria-label') !== label)
        row.button.setAttribute('aria-label', label)
      if (row.item !== list.children[position])
        list.insertBefore(row.item, list.children[position] ?? null)
    })
    more.hidden = matches.length <= limit
    syncSelection()
    const first = list.firstElementChild?.querySelector('button')
    setTabStop(tabStop && list.contains(tabStop) ? tabStop : (currentButton ?? first ?? undefined))
    if (focused && doc.activeElement !== focused) {
      const row = list.children[Math.min(previousIndex, page.length - 1)]
      const next = list.contains(focused) ? focused : (row?.querySelector('button') ?? input)
      next.focus({ preventScroll: true })
    } else if (active === more && more.hidden) (tabStop ?? input).focus({ preventScroll: true })
  }

  function refresh(patch?: Patch): void {
    // Editing unrelated body text does not change the document outline.
    if (
      patch?.type === 'update' &&
      index &&
      !index.titleSources.has(patch.id) &&
      Object.keys(patch).every((key) =>
        ['type', 'id', 'content', 'name', 'locked'].includes(key),
      ) &&
      (patch.content !== undefined || patch.name !== undefined || patch.locked !== undefined)
    )
      return
    index = undefined
    render()
  }

  function refreshLocale(): void {
    const label = uiText(opts.i18n, 'layers.outline_search', '搜尋標題')
    input.placeholder = label
    input.setAttribute('aria-label', label)
    more.textContent = uiText(opts.i18n, 'layers.outline_more', '顯示更多標題')
    untitled = uiText(opts.i18n, 'layers.outline_untitled', '未命名標題')
    render()
  }

  function activate(button: HTMLButtonElement): void {
    const id = button.dataset.headingId
    if (!id || !items.has(id)) return
    button.focus({ preventScroll: true })
    opts.onActivate(id)
  }

  function focus(): void {
    if (el.hidden) return
    const target =
      el.contains(lastControl) && !lastControl.hidden ? lastControl : (tabStop ?? input)
    target.focus({ preventScroll: true })
  }

  input.addEventListener(
    'compositionstart',
    () => {
      composing = true
    },
    { signal },
  )
  function query(): void {
    limit = PAGE_SIZE
    render()
  }
  input.addEventListener(
    'compositionend',
    () => {
      composing = false
      query()
    },
    { signal },
  )
  input.addEventListener('input', query, { signal })
  more.addEventListener(
    'click',
    () => {
      const next = list.children.length
      limit += PAGE_SIZE
      render()
      list.children[next]?.querySelector('button')?.focus()
    },
    { signal },
  )
  el.addEventListener(
    'focusin',
    (event) => {
      const control = event.target as HTMLInputElement | HTMLButtonElement
      lastControl = control
      const button = headingButton(control)
      if (button) setTabStop(button)
    },
    { signal },
  )
  list.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-heading-id]')
      if (button) activate(button)
    },
    { signal },
  )
  el.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isComposing ||
        composing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      )
        return
      const target = event.target as HTMLButtonElement | HTMLInputElement
      const first = list.firstElementChild?.querySelector('button')
      const last = list.lastElementChild?.querySelector('button')
      const button = headingButton(target)
      if (event.key === 'Escape' && input.value) {
        input.value = ''
        query()
        input.focus()
      } else if (target === input && event.key === 'Enter') {
        if (first) activate(first)
      } else if (target === input && event.key === 'ArrowDown') first?.focus()
      else if (target === more && event.key === 'ArrowUp') last?.focus()
      else if (button) {
        const item = button.parentElement!
        switch (event.key) {
          case 'ArrowDown': {
            const next =
              item.nextElementSibling?.querySelector('button') ?? (more.hidden ? last : more)
            next?.focus()
            break
          }
          case 'ArrowUp': {
            const previous = item.previousElementSibling?.querySelector('button') ?? input
            previous.focus()
            break
          }
          case 'Home':
            first?.focus()
            break
          case 'End':
            last?.focus()
            break
          case 'Enter':
          case ' ':
            activate(button)
            break
          default:
            return
        }
      } else return
      event.preventDefault()
      event.stopPropagation()
    },
    { signal },
  )

  refreshLocale()
  return {
    el,
    refresh,
    refreshLocale,
    syncSelection,
    focus,
    setVisible(visible: boolean) {
      if (el.hidden === !visible) return
      el.hidden = !visible
      if (visible) render()
    },
    destroy() {
      events.abort()
      items.clear()
      index = undefined
      el.remove()
    },
  }
}
