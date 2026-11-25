import { createId, type ComponentNode, type I18n, type RichTextResolver } from '@cluion/sigil-core'
import { documentTag, findComponentPath, hasDocumentChildren } from './component-path.js'
import { uiText } from './i18n.js'
import { attribute, isHiddenTarget } from './link-destination.js'
import { resolveLinkFragment } from './link-fragment.js'

/** 設定匯出前連結檢查的翻譯、富文字判斷及返回編輯的動作。 */
export interface PageLinksPanelOptions {
  i18n?: I18n
  richText?: Pick<RichTextResolver, 'supports'>
  onEdit?: (id: string) => void
}

const PAGE_SIZE = 40
const STATUS = {
  unset: '未設定目的地',
  missing: '找不到頁內目標',
  duplicate: '頁內目標重複',
  hidden: '頁內目標已隱藏',
  unconfirmed: '需在預覽確認目標',
  page: '頁內連結',
  text: '文字片段',
  email: '電子郵件',
  phone: '電話',
  url: '網址',
}
type Status = keyof typeof STATUS

function isHidden(node: ComponentNode): boolean {
  return (
    !!node.hidden ||
    attribute(node, 'hidden') !== undefined ||
    attribute(node, 'aria-hidden')?.trim().toLowerCase() === 'true'
  )
}

function isShortcode(node: ComponentNode): boolean {
  return !!node.shortcode || node.type === 'shortcode'
}

function isRich(node: ComponentNode, richText: PageLinksPanelOptions['richText']): boolean {
  return node.type === 'rich-text' || !!richText?.supports(node)
}

function isSource(node: ComponentNode): boolean {
  return (
    documentTag(node) === 'a' &&
    (attribute(node, 'href') !== undefined || (!attribute(node, 'id') && !attribute(node, 'name')))
  )
}

interface Target {
  count: number
  hidden: boolean
}

function statusFor(
  href: string,
  find: (target: string) => Target | undefined,
  opaque: boolean,
): Status {
  const value = href.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
  if (!value) return 'unset'
  if (/^mailto:/i.test(value)) return 'email'
  if (/^tel:/i.test(value)) return 'phone'
  if (!value.startsWith('#')) return 'url'
  const target = resolveLinkFragment(value, (id) => !!find(id))
  const textDirective = value.includes(':~:text=') || /:~:[^#]*&text=/.test(value)
  if (!target) return textDirective ? 'text' : 'page'
  const match = find(target)
  if (match && match.count > 1) return 'duplicate'
  if (match?.hidden) return 'hidden'
  if (match || target.toLowerCase() === 'top') return 'page'
  return opaque || textDirective ? 'unconfirmed' : 'missing'
}

function indexLinks(root: ComponentNode, richText: PageLinksPanelOptions['richText']) {
  const ids = new Map<string, Target>()
  const names = new Map<string, Target>()
  const sources: { id: string; href: string; name: string }[] = []
  let opaque = false

  function add(map: Map<string, Target>, value: string, hidden: boolean): void {
    const match = map.get(value)
    if (match) match.count++
    else map.set(value, { count: 1, hidden })
  }
  function visit(
    node: ComponentNode,
    visible: boolean,
    ancestorHidden: boolean,
    parentText?: string[],
  ): void {
    const hidden = ancestorHidden || isHiddenTarget(node)
    const id = attribute(node, 'id')
    if (id) add(ids, id, hidden)
    if (isShortcode(node)) {
      // The static shortcode host retains its authored ID; slot contents depend on the resolver.
      opaque = true
      return
    }
    const tag = documentTag(node)
    if (tag === 'a') {
      const name = attribute(node, 'name')
      if (name) add(names, name, hidden)
    }
    const rich = isRich(node, richText)
    opaque ||= rich
    const shown = visible && !rich && !isHidden(node)
    const source =
      shown && isSource(node)
        ? { id: node.id, href: attribute(node, 'href') ?? '', name: '' }
        : undefined
    if (source) sources.push(source)
    const text = shown ? (source ? [] : parentText) : undefined
    if (text) {
      if (tag === 'img') text.push(attribute(node, 'alt') ?? '')
      else if (tag === 'br') text.push(' ')
      else if (node.content) text.push(node.content)
    }
    if (hasDocumentChildren(tag)) {
      for (const child of node.children ?? []) visit(child, shown, hidden, text)
    }
    if (source && text) {
      const content = text.join('')
      parentText?.push(content)
      source.name =
        attribute(node, 'aria-label')?.trim() ||
        content.replace(/\s+/g, ' ').trim() ||
        node.name?.trim() ||
        attribute(node, 'title')?.trim() ||
        ''
    }
  }
  visit(root, true, false)
  // HTML gives matching IDs precedence over legacy anchor names.
  const find = (name: string) => ids.get(name) ?? names.get(name)
  const all = sources.map((source) => ({ ...source, status: statusFor(source.href, find, opaque) }))
  const issues = all.filter(({ status }) => needsAttention(status))
  return { all, issues }
}

function needsAttention(status: Status): boolean {
  return (
    status === 'unset' ||
    status === 'missing' ||
    status === 'duplicate' ||
    status === 'hidden' ||
    status === 'unconfirmed'
  )
}

/** Inspect authored links in an export snapshot when its disclosure is opened. */
export function createPageLinksPanel(root: ComponentNode, opts: PageLinksPanelOptions = {}) {
  const t = (key: string, fallback: string) => uiText(opts.i18n, 'page_links.' + key, fallback)
  const el = document.createElement('details')
  el.className = 'sigil-page-links'
  const summary = document.createElement('summary')
  const body = document.createElement('div')
  body.className = 'sigil-page-links-body'
  const scope = document.createElement('p')
  scope.className = 'sigil-page-links-scope'
  const controls = document.createElement('div')
  controls.className = 'sigil-page-links-controls'
  const count = document.createElement('span')
  count.className = 'sigil-page-links-count'
  count.setAttribute('role', 'status')
  const filter = document.createElement('button')
  filter.type = 'button'
  filter.className = 'sigil-btn sigil-page-links-filter'
  filter.setAttribute('aria-pressed', 'false')
  controls.append(count, filter)
  const list = document.createElement('ul')
  list.className = 'sigil-page-links-list'
  list.id = 'sigil-page-links-' + createId()
  list.setAttribute('role', 'list')
  filter.setAttribute('aria-controls', list.id)
  const empty = document.createElement('p')
  empty.className = 'sigil-page-links-empty'
  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'sigil-btn sigil-page-links-more'
  more.setAttribute('aria-controls', list.id)
  body.append(scope, controls, list, empty, more)
  el.append(summary, body)
  const events = new AbortController()
  const { signal } = events
  let index: ReturnType<typeof indexLinks> | undefined
  let limit = PAGE_SIZE
  let onlyIssues = false

  function row(link: ReturnType<typeof indexLinks>['all'][number], position: number) {
    const item = document.createElement('li')
    const entry = opts.onEdit ? document.createElement('button') : document.createElement('div')
    const name = link.name || t('untitled', '未命名連結')
    entry.className = 'sigil-page-link'
    entry.dataset.pageLinkId = link.id
    entry.dataset.attention = String(needsAttention(link.status))
    const title = document.createElement('span')
    title.className = 'sigil-page-link-name'
    title.textContent = name
    const href = document.createElement('span')
    href.className = 'sigil-page-link-href'
    href.id = list.id + '-href-' + position
    href.textContent = link.href || '—'
    const status = document.createElement('span')
    status.className = 'sigil-page-link-status'
    status.id = list.id + '-status-' + position
    status.textContent = t(link.status, STATUS[link.status])
    if (entry instanceof HTMLButtonElement) {
      entry.type = 'button'
      entry.setAttribute(
        'aria-label',
        t('inspect', '查看連結 {name}').replace('{name}', () => name),
      )
      entry.setAttribute('aria-describedby', href.id + ' ' + status.id)
    }
    entry.append(title, href, status)
    item.append(entry)
    return item
  }

  function render(append = false): void {
    if (!el.open || signal.aborted) return
    index ??= indexLinks(root, opts.richText)
    count.textContent = t('count', '共 {count} 個連結，{issues} 個待處理')
      .replace('{count}', String(index.all.length))
      .replace('{issues}', String(index.issues.length))
    const matches = onlyIssues ? index.issues : index.all
    const active = document.activeElement
    const focusedIndex =
      active && list.contains(active)
        ? Array.from(list.children).indexOf(active.parentElement!)
        : -1
    const start = append ? list.children.length : 0
    const rows = matches.slice(start, limit).map((link, i) => row(link, start + i))
    if (append) list.append(...rows)
    else {
      list.replaceChildren(...rows)
      if (focusedIndex >= 0)
        list.children[focusedIndex]?.querySelector('button')?.focus({ preventScroll: true })
    }
    empty.hidden = matches.length > 0
    empty.textContent = onlyIssues
      ? t('clear', '沒有待處理的連結')
      : t('empty', '這個頁面沒有元件連結')
    more.hidden = matches.length <= limit
  }

  function refreshLocale(): void {
    summary.textContent = t('title', '頁面連結')
    scope.textContent = t('scope', '檢查元件連結與頁內目標。外部連結僅列出網址。')
    filter.textContent = t('filter', '只看待處理')
    more.textContent = t('more', '顯示更多連結')
    render()
  }
  el.addEventListener('toggle', () => render(), { signal })
  filter.addEventListener(
    'click',
    () => {
      onlyIssues = !onlyIssues
      filter.setAttribute('aria-pressed', String(onlyIssues))
      limit = PAGE_SIZE
      render()
    },
    { signal },
  )
  more.addEventListener(
    'click',
    () => {
      const previous = limit
      limit += PAGE_SIZE
      render(true)
      const next = list.children[previous]?.firstElementChild as HTMLElement | undefined
      if (next) {
        if (!opts.onEdit) next.tabIndex = -1
        next.focus()
      }
    },
    { signal },
  )
  list.addEventListener(
    'click',
    (event) => {
      const id = (event.target as Element).closest<HTMLElement>('button[data-page-link-id]')
        ?.dataset.pageLinkId
      if (id !== undefined) opts.onEdit?.(id)
    },
    { signal },
  )
  refreshLocale()
  return {
    el,
    refreshLocale,
    hasSource(current: ComponentNode, id: string): boolean {
      const path = findComponentPath(current, id)
      const node = path.at(-1)
      return (
        !!node &&
        isSource(node) &&
        path.every(
          (part) =>
            !isHidden(part) &&
            !isShortcode(part) &&
            !isRich(part, opts.richText) &&
            (part === node || hasDocumentChildren(documentTag(part))),
        )
      )
    },
    destroy() {
      events.abort()
      index = undefined
      el.remove()
    },
  }
}
