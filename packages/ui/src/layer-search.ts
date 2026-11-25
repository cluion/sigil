import { createId, findNode, type ComponentNode, type Engine, type I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'

const PAGE_SIZE = 30

interface LayerSearchOptions {
  tree: HTMLElement
  i18n?: I18n
  labelForNode: (node: ComponentNode) => string
  onActivate: (id: string) => void
  onShowTree?: () => void
  preserveSearchOnActivate?: () => boolean
}

interface LayerMatch {
  id: string
  name: string
  path: string
  excerpt: string
}

function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

function normalize(text: string): string {
  return fold(text).replace(/\s+/g, ' ').trim()
}

let graphemes: Intl.Segmenter | undefined

function matchRanges(text: string, terms: string[], firstOnly = false) {
  const folded = fold(text)
  const ranges: Array<{ start: number; end: number }> = []
  for (const term of terms) {
    let start = folded.indexOf(term)
    while (start >= 0) {
      ranges.push({ start, end: start + term.length })
      if (firstOnly) break
      start = folded.indexOf(term, start + term.length)
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  if (firstOnly && ranges.length) ranges.length = 1
  if (!ranges.length || (folded === text.toLowerCase() && folded.length === text.length))
    return ranges

  // Map normalized matches back to authored graphemes, including ligatures and accents.
  if (typeof Intl.Segmenter !== 'function') return []
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const starts: number[] = []
  const ends: number[] = []
  const last = ranges.reduce((max, range) => Math.max(max, range.end), 0)
  for (const { index, segment } of graphemes.segment(text)) {
    const length = fold(segment).length
    for (let i = 0; i < length; i++) {
      starts.push(index)
      ends.push(index + segment.length)
    }
    if (starts.length >= last) break
  }
  return ranges.flatMap(({ start, end }) => {
    const from = starts[start]
    const to = ends[end - 1]
    return from !== undefined && to !== undefined ? [{ start: from, end: to }] : []
  })
}

function highlight(line: HTMLElement, text: string, terms: string[]): void {
  const doc = line.ownerDocument
  let cursor = 0
  const ranges = matchRanges(text, terms)
  for (let index = 0; index < ranges.length; index++) {
    const { start } = ranges[index]!
    let end = ranges[index]!.end
    while (ranges[index + 1] && ranges[index + 1]!.start < end) {
      index += 1
      end = Math.max(end, ranges[index]!.end)
    }
    if (start > cursor) line.append(text.slice(cursor, start))
    const mark = doc.createElement('mark')
    mark.textContent = text.slice(start, end)
    line.append(mark)
    cursor = end
  }
  if (cursor < text.length) line.append(text.slice(cursor))
}

function excerpt(text: string, terms: string[]): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const limit = 84
  const firstMatch = matchRanges(clean, terms, true)[0]?.start ?? 0
  // Keep the matched words on the first lines of a narrow results panel.
  const start = firstMatch > 12 ? firstMatch - 6 : 0
  return (
    (start ? '…' : '') +
    clean.slice(start, start + limit) +
    (start + limit < clean.length ? '…' : '')
  )
}

function findLayers(
  root: ComponentNode,
  terms: string[],
  limit: number,
  labelForNode: LayerSearchOptions['labelForNode'],
) {
  const matches: LayerMatch[] = []
  let count = 0
  function visit(node: ComponentNode, path: string, foldedPath: string): void {
    const name = labelForNode(node)
    const text = node.content ?? ''
    const alt = node.attributes?.alt ?? ''
    const htmlId = node.attributes?.id ? '#' + node.attributes.id : ''
    const searchable = normalize(
      [name, node.type, node.tagName, node.shortcode?.name, text, alt, htmlId, node.id].join(' '),
    )
    // A path can narrow a match; querying a section alone should not return its whole subtree.
    const matchesNode = terms.some((term) => searchable.includes(term))
    if (
      matchesNode &&
      terms.every((term) => searchable.includes(term) || foldedPath.includes(term))
    ) {
      count++
      if (matches.length < limit) {
        const details = [text, alt, htmlId, node.id]
        const best = details.find((value) => terms.some((term) => normalize(value).includes(term)))
        const snippet =
          best ||
          text ||
          alt ||
          htmlId ||
          node.children?.find((child) => child.content?.trim())?.content ||
          node.id
        matches.push({
          id: node.id,
          name,
          path,
          excerpt: snippet === name ? '' : excerpt(snippet, terms),
        })
      }
    }
    if (node.children?.length) {
      const nextPath = path ? path + ' › ' + name : name
      const nextFoldedPath = foldedPath + ' ' + normalize(name)
      for (const child of node.children) visit(child, nextPath, nextFoldedPath)
    }
  }
  visit(root, '', '')
  return { matches, count }
}

export function createLayerSearch(engine: Engine, opts: LayerSearchOptions) {
  const doc = opts.tree.ownerDocument
  const el = doc.createElement('div')
  el.className = 'sigil-layer-search'
  el.style.overflowWrap = 'anywhere'
  const controls = doc.createElement('div')
  controls.className = 'sigil-layer-search-controls'
  controls.style.display = 'flex'
  const input = doc.createElement('input')
  input.type = 'search'
  input.className = 'sigil-input sigil-layer-search-input'
  input.style.cssText = 'min-width:0;flex:1'
  const clear = doc.createElement('button')
  clear.type = 'button'
  clear.className = 'sigil-layer-search-clear'
  clear.textContent = '×'
  clear.hidden = true
  controls.append(input, clear)

  const results = doc.createElement('div')
  results.className = 'sigil-layer-search-results'
  results.id = 'sigil-layer-results-' + createId()
  input.setAttribute('aria-controls', results.id)
  results.hidden = true
  const status = doc.createElement('div')
  status.className = 'sigil-layer-search-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-atomic', 'true')
  const list = doc.createElement('div')
  list.className = 'sigil-layer-search-list'
  const more = doc.createElement('button')
  more.type = 'button'
  more.className = 'sigil-btn sigil-layer-search-more'
  results.append(status, list, more)
  el.append(controls, results)

  let composing = false
  let destroyed = false
  let visible = true
  let pendingRefresh = false
  let limit = PAGE_SIZE
  let buttons: HTMLButtonElement[] = []
  const events = new AbortController()
  const { signal } = events

  function resultButton(match: LayerMatch, terms: string[]): HTMLButtonElement {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'sigil-layer-search-result'
    button.style.cssText =
      'display:grid;width:100%;min-width:0;text-align:start;overflow-wrap:anywhere'
    button.dataset.layerResult = match.id
    for (const key of ['name', 'path', 'excerpt'] as const) {
      if (!match[key]) continue
      const line = doc.createElement('span')
      line.className = 'sigil-layer-search-' + key
      highlight(line, match[key], terms)
      line.title = match[key]
      button.append(line)
    }
    button.setAttribute(
      'aria-label',
      [match.name, match.path, match.excerpt].filter(Boolean).join(' · '),
    )
    return button
  }

  function refresh(): void {
    if (destroyed || composing) return
    if (!visible) {
      pendingRefresh = true
      return
    }
    pendingRefresh = false
    if (!input.value && results.hidden && clear.hidden) return
    clear.hidden = !input.value
    const query = normalize(input.value)
    if (!query) {
      if (!results.hidden) {
        opts.tree.hidden = false
        results.hidden = true
        list.replaceChildren()
        status.textContent = ''
        buttons = []
        opts.onShowTree?.()
      }
      return
    }
    const focused = buttons.indexOf(doc.activeElement as HTMLButtonElement)
    const focusedId = buttons[focused]?.dataset.layerResult
    const moreFocused = doc.activeElement === more
    const terms = [...new Set(query.split(' '))]
    const { matches, count } = findLayers(engine.getTree(), terms, limit, opts.labelForNode)
    buttons = matches.map((match) => resultButton(match, terms))
    list.replaceChildren(...buttons)
    opts.tree.hidden = true
    results.hidden = false
    const message = count
      ? uiText(opts.i18n, 'layers.search_count', '找到 {count} 個圖層').replace(
          '{count}',
          String(count),
        )
      : uiText(opts.i18n, 'layers.search_none', '找不到符合的圖層')
    if (status.textContent !== message) status.textContent = message
    more.hidden = count <= matches.length
    if (focused >= 0) {
      const next =
        buttons.find((b) => b.dataset.layerResult === focusedId) ??
        buttons[Math.min(focused, buttons.length - 1)] ??
        input
      next.focus({ preventScroll: true })
    } else if (moreFocused && more.hidden) (buttons.at(-1) ?? input).focus({ preventScroll: true })
  }

  function reset(): void {
    input.value = ''
    limit = PAGE_SIZE
    refresh()
  }

  function activate(button: HTMLButtonElement): void {
    const id = button.dataset.layerResult
    if (!id || !findNode(engine.getTree(), id)) {
      refresh()
      return
    }
    if (opts.preserveSearchOnActivate?.()) button.focus({ preventScroll: true })
    else reset()
    opts.onActivate(id)
  }

  function showMore(): void {
    const next = buttons.length
    limit += PAGE_SIZE
    refresh()
    buttons[next]?.focus()
  }

  function refreshLocale(): void {
    if (destroyed) return
    const label = uiText(opts.i18n, 'layers.search', '搜尋圖層')
    input.placeholder = label
    input.setAttribute('aria-label', label)
    const clearLabel = uiText(opts.i18n, 'layers.search_clear', '清除搜尋')
    clear.title = clearLabel
    clear.setAttribute('aria-label', clearLabel)
    more.textContent = uiText(opts.i18n, 'layers.search_more', '顯示更多結果')
    refresh()
  }

  input.addEventListener(
    'compositionstart',
    () => {
      composing = true
    },
    { signal },
  )
  input.addEventListener(
    'compositionend',
    () => {
      composing = false
      limit = PAGE_SIZE
      refresh()
    },
    { signal },
  )
  input.addEventListener(
    'input',
    () => {
      limit = PAGE_SIZE
      refresh()
    },
    { signal },
  )
  clear.addEventListener(
    'click',
    () => {
      reset()
      input.focus()
    },
    { signal },
  )
  more.addEventListener('click', showMore, { signal })
  list.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>(
        '[data-layer-result]',
      )
      if (button && list.contains(button)) activate(button)
    },
    { signal },
  )
  el.addEventListener(
    'keydown',
    (event) => {
      if (
        composing ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return
      if (event.key === 'Escape' && input.value) {
        event.preventDefault()
        event.stopPropagation()
        reset()
        input.focus()
        return
      }
      if (event.target === input && event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        if (buttons[0]) activate(buttons[0])
        return
      }
      if (results.hidden || !buttons.length) return
      if (event.target === more && event.key === 'ArrowUp') {
        event.preventDefault()
        buttons.at(-1)?.focus()
        return
      }
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (event.target !== input && index < 0) return
      switch (event.key) {
        case 'ArrowDown':
          if (index === buttons.length - 1 && !more.hidden) more.focus()
          else buttons[Math.min(index + 1, buttons.length - 1)]?.focus()
          break
        case 'ArrowUp': {
          if (event.target === input) return
          const previous = buttons[index - 1] ?? input
          previous.focus()
          break
        }
        case 'Enter':
          activate(buttons[index]!)
          break
        default:
          return
      }
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
    setVisible(next: boolean) {
      if (visible === next) return
      visible = next
      if (visible && pendingRefresh) refresh()
    },
    destroy() {
      destroyed = true
      events.abort()
      opts.tree.hidden = false
      el.remove()
    },
  }
}
