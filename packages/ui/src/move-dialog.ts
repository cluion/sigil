import {
  createId,
  type ComponentNode,
  type Engine,
  type I18n,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'

type RichText = Pick<RichTextResolver, 'supports'>

export interface MoveDialogOptions {
  engine: Engine
  id: string
  trigger?: HTMLElement | null
  i18n?: I18n
  richText?: RichText
  onClose?: (moved: boolean) => void
}

const flowContainers = new Set([
  'div',
  'section',
  'main',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
  'blockquote',
])
const pageSize = 40

function acceptsComponents(node: ComponentNode, richText?: RichText): boolean {
  if (
    node.locked ||
    node.shortcode ||
    node.type === 'shortcode' ||
    node.type === 'rich-text' ||
    node.type === 'text' ||
    node.type === 'button' ||
    node.type === 'image' ||
    richText?.supports(node)
  )
    return false
  return node.tagName
    ? flowContainers.has(node.tagName.toLowerCase())
    : node.type === 'section' || node.type === 'column' || node.type === 'root'
}

function sourceParent(
  root: ComponentNode,
  id: string,
  richText?: RichText,
): ComponentNode | undefined {
  if (!acceptsComponents(root, richText)) return
  for (const child of root.children ?? []) {
    if (child.id === id)
      return !child.locked && child.tagName?.toLowerCase() !== 'summary' ? root : undefined
    if (child.children?.length) {
      const parent = sourceParent(child, id, richText)
      if (parent) return parent
    }
  }
}

export function canMoveComponent(root: ComponentNode, id: string, richText?: RichText): boolean {
  return root.id !== id && !!sourceParent(root, id, richText)
}

function label(node: ComponentNode, i18n?: I18n): string {
  const name = node.name?.trim() || node.attributes?.['aria-label']?.trim() || node.attributes?.id
  if (name) return name
  if (node.shortcode) return node.shortcode.name
  if ((node.type === 'text' || node.type === 'button') && node.content?.trim())
    return node.content.trim().slice(0, 64)
  if (node.type === 'section') return uiText(i18n, 'move.section', '區段')
  if (node.type === 'column') return uiText(i18n, 'move.column', '欄')
  return node.attributes?.alt?.trim() || node.tagName || node.type
}

interface Destination {
  node: ComponentNode
  path: string
  search: string
}

function fold(value: string): string {
  return value.normalize('NFKC').toLowerCase()
}

function describeTree(root: ComponentNode, sourceId: string, richText?: RichText, i18n?: I18n) {
  const targets: Destination[] = []
  const labels = new Map<string, string>()
  function visit(node: ComponentNode, path: string): void {
    targets.push({
      node,
      path,
      search: fold([path, node.id, node.type, node.tagName, node.attributes?.id].join(' ')),
    })
    const occurrences = new Map<string, number>()
    for (const child of node.children ?? []) {
      const base = label(child, i18n)
      const count = (occurrences.get(base) ?? 0) + 1
      occurrences.set(base, count)
      const name = count === 1 ? base : base + ' · ' + count
      labels.set(child.id, name)
      if (child.id !== sourceId && acceptsComponents(child, richText))
        visit(child, path + ' › ' + name)
    }
  }
  visit(
    root,
    root.name?.trim() ||
      root.attributes?.['aria-label']?.trim() ||
      uiText(i18n, 'move.page', '頁面'),
  )
  return { targets, labels }
}

export function openMoveDialog(opts: MoveDialogOptions): () => void {
  const { engine, id, richText, i18n } = opts
  const doc = opts.trigger?.ownerDocument ?? document
  const trigger =
    opts.trigger ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null)
  const initialRoot = engine.getTree()
  let parent = sourceParent(initialRoot, id, richText)
  if (!parent || (engine.getSelection() !== null && engine.getSelection() !== id)) {
    opts.onClose?.(false)
    return () => {}
  }

  const text = (key: string, fallback: string) => uiText(i18n, 'move.' + key, fallback)
  const dialog = doc.createElement('dialog')
  dialog.className = 'sigil-move-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const dark = !!trigger?.closest('.sigil-theme-dark')
  dialog.classList.toggle('sigil-theme-dark', dark)
  dialog.style.colorScheme = dark ? 'dark' : 'light'
  dialog.style.maxInlineSize = 'min(32rem, calc(100% - 2rem))'
  const panel = doc.createElement('div')
  panel.className = 'sigil-dialog-panel sigil-move-panel'
  const title = doc.createElement('h2')
  title.id = 'sigil-move-' + createId()
  dialog.setAttribute('aria-labelledby', title.id)
  const source = doc.createElement('p')
  source.className = 'sigil-move-source'
  const search = doc.createElement('input')
  search.type = 'search'
  search.className = 'sigil-input sigil-move-search'
  const destination = doc.createElement('select')
  destination.className = 'sigil-input sigil-move-destination'
  const position = doc.createElement('select')
  position.className = 'sigil-input sigil-move-position'
  const before = doc.createElement('select')
  before.className = 'sigil-input sigil-move-before'
  function field(control: HTMLElement) {
    const el = doc.createElement('div')
    el.className = 'sigil-move-field'
    const caption = doc.createElement('label')
    control.id = title.id + '-' + createId()
    caption.htmlFor = control.id
    caption.style.display = 'block'
    control.style.maxInlineSize = '100%'
    el.append(caption, control)
    return { el, caption }
  }
  const searchField = field(search)
  const destinationField = field(destination)
  const positionField = field(position)
  const beforeField = field(before)
  function button(className: string, run: () => void) {
    const el = doc.createElement('button')
    el.type = 'button'
    el.className = 'sigil-btn ' + className
    el.addEventListener('click', run)
    return el
  }
  const more = button('sigil-btn--ghost sigil-move-more', () => {
    targetLimit += pageSize
    renderDestinations()
    destination.focus()
  })
  const moreBefore = button('sigil-btn--ghost sigil-move-more-before', () => {
    siblingLimit += pageSize
    renderPosition()
    before.focus()
  })
  const preview = doc.createElement('p')
  preview.className = 'sigil-move-preview'
  preview.setAttribute('role', 'status')
  preview.setAttribute('aria-atomic', 'true')
  const actions = doc.createElement('div')
  actions.className = 'sigil-dialog-actions sigil-move-actions'
  const cancel = button('sigil-btn--ghost', () => finish(false))
  const confirm = button('sigil-btn--primary sigil-move-confirm', submit)
  actions.append(cancel, confirm)
  panel.append(
    title,
    source,
    searchField.el,
    destinationField.el,
    more,
    positionField.el,
    beforeField.el,
    moreBefore,
    preview,
    actions,
  )
  dialog.append(panel)
  doc.body.append(dialog)

  let tree = initialRoot
  let targets: Destination[] = []
  let labels: Map<string, string>
  let targetId = parent.id
  let positionValue = 'last'
  let beforeId = ''
  let targetLimit = pageSize
  let siblingLimit = pageSize
  let closed = false
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'selection' && event.id !== id) finish(false)
    if (event.type === 'patch' || event.type === 'tree') refreshTree()
  })
  const stopLocale = subscribeLocale(i18n, render)
  function option(value: string, name: string) {
    const el = doc.createElement('option')
    el.value = value
    el.textContent = name
    return el
  }

  function refreshTree() {
    if (closed || engine.getTree() === tree) return
    tree = engine.getTree()
    parent = sourceParent(tree, id, richText)
    if (!parent) {
      finish(false)
      return
    }
    render()
  }

  function render() {
    const description = describeTree(tree, id, richText, i18n)
    targets = description.targets
    labels = description.labels
    title.textContent = text('title', '移動元件')
    const current = parent?.children?.find((child) => child.id === id)
    if (current) {
      const path = targets.find(({ node }) => node.id === parent?.id)?.path ?? ''
      source.textContent = text('source', '目前位置：{path}').replace(
        '{path}',
        () => path + ' › ' + labels.get(current.id),
      )
    }
    searchField.caption.textContent = text('search', '搜尋目的地')
    destinationField.caption.textContent = text('destination', '目的地')
    positionField.caption.textContent = text('position', '插入位置')
    beforeField.caption.textContent = text('before_label', '放在這個元件之前')
    more.textContent = text('more', '顯示更多目的地')
    moreBefore.textContent = text('more_before', '顯示更多元件')
    cancel.textContent = text('cancel', '取消')
    confirm.textContent = text('confirm', '移動')
    position.replaceChildren(
      option('first', text('first', '開頭')),
      option('last', text('last', '結尾')),
      option('before', text('before', '指定元件之前')),
    )
    position.value = positionValue
    renderDestinations()
  }

  function renderDestinations(searchChanged = false) {
    const terms = fold(search.value).trim().split(/\s+/)
    const matches = targets.filter((target) => terms.every((term) => target.search.includes(term)))
    if (!matches.some(({ node }) => node.id === targetId)) {
      targetId = searchChanged ? (matches[0]?.node.id ?? '') : ''
      beforeId = ''
    }
    const visible = matches.filter(({ node }, index) => index < targetLimit || node.id === targetId)
    const options = visible.map(({ node, path }) => option(node.id, path))
    if (!targetId)
      options.unshift(
        option(
          '',
          matches.length ? text('choose', '選擇目的地') : text('empty', '找不到符合的目的地'),
        ),
      )
    destination.replaceChildren(...options)
    destination.value = targetId
    destination.disabled = !matches.length
    more.hidden = visible.length >= matches.length
    renderPosition(searchChanged)
  }

  function renderPosition(destinationChanged = false) {
    const target = targets.find(({ node }) => node.id === targetId)
    const siblings = (target?.node.children ?? []).filter((child) => child.id !== id)
    if (destinationChanged && target && positionValue === 'before' && !siblings.length) {
      position.value = positionValue = 'last'
    }
    const wantsBefore = positionValue === 'before'
    beforeField.el.hidden = !wantsBefore || !target
    moreBefore.hidden = true
    position.disabled = !target
    const beforeOption = position.querySelector<HTMLOptionElement>('option[value=before]')!
    beforeOption.disabled = !siblings.length
    if (wantsBefore && target) {
      const visible = siblings.filter(
        (child, index) => index < siblingLimit || child.id === beforeId,
      )
      const options = visible.map((child) => option(child.id, labels.get(child.id)!))
      if (!siblings.some((child) => child.id === beforeId)) {
        beforeId = ''
        options.unshift(option('', text('choose_before', '選擇同層元件')))
      }
      before.replaceChildren(...options)
      before.value = beforeId
      before.disabled = !siblings.length
      moreBefore.hidden = visible.length >= siblings.length
    }
    const index =
      positionValue === 'last'
        ? siblings.length
        : wantsBefore
          ? siblings.findIndex((child) => child.id === beforeId)
          : 0
    const unchanged =
      targetId === parent?.id && parent?.children?.findIndex((child) => child.id === id) === index
    confirm.disabled = !target || index < 0 || unchanged
    if (!target || index < 0) {
      preview.textContent = !target
        ? (destination.selectedOptions[0]?.textContent ?? '')
        : siblings.length
          ? text('choose_before', '選擇同層元件')
          : text('empty_before', '目的地沒有其他元件，請改選開頭或結尾。')
    } else {
      const placement = wantsBefore
        ? text('preview_before', '在「{name}」之前').replace('{name}', () =>
            labels.get(siblings[index]!.id)!,
          )
        : position.selectedOptions[0]!.textContent
      preview.textContent = [
        target.path,
        placement,
        unchanged ? text('unchanged', '已在這個位置') : '',
      ]
        .filter(Boolean)
        .join(' · ')
    }
    return { target, index }
  }

  function submit() {
    if (closed) return
    refreshTree()
    if (closed) return
    const { target, index } = renderPosition()
    if (!target || confirm.disabled) return
    const previous = tree
    engine.move(id, target.node.id, index)
    if (engine.getTree() !== previous) finish(true)
  }

  function finish(moved: boolean) {
    if (closed) return
    closed = true
    unsubscribe()
    stopLocale()
    dialog.close()
    dialog.remove()
    if (trigger?.isConnected && !trigger.closest('[hidden], [inert]'))
      trigger.focus({ preventScroll: true })
    opts.onClose?.(moved)
  }
  search.addEventListener('input', () => {
    targetLimit = pageSize
    renderDestinations(true)
  })
  destination.addEventListener('change', () => {
    targetId = destination.value
    beforeId = ''
    siblingLimit = pageSize
    renderPosition(true)
  })
  position.addEventListener('change', () => {
    positionValue = position.value
    renderPosition()
  })
  before.addEventListener('change', () => {
    beforeId = before.value
    renderPosition()
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    finish(false)
  })
  dialog.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    } else if (event.key === 'Tab') {
      const last = confirm.disabled ? cancel : confirm
      if (event.shiftKey && doc.activeElement === search) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault()
        search.focus()
      }
    }
  })
  render()
  dialog.showModal()
  search.focus()
  return () => finish(false)
}
