import {
  createId,
  createTypeRegistry,
  type ComponentNode,
  type Engine,
  type I18n,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { findComponentPath } from './component-path.js'
import { uiText } from './i18n.js'

const formats = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
const flowParents = new Set(
  'article aside blockquote body caption dd details dialog div fieldset figcaption figure footer form header li main nav search section td'.split(
    ' ',
  ),
)
const structuralAncestors = new Set('html table tbody tfoot thead tr dl ol ul menu'.split(' '))
const leafTypes = new Set(['text', 'image', 'button', 'rich-text', 'shortcode'])
const nativeTypes = createTypeRegistry()

function textFormat(path: ComponentNode[], richText?: RichTextResolver): string | undefined {
  const node = path.at(-1)
  if (
    !node ||
    node.type !== 'text' ||
    node.shortcode ||
    node.children?.length ||
    richText?.supports(node)
  )
    return
  const tag = (node.tagName ?? 'span').toLowerCase()
  if (
    !formats.includes(tag) ||
    Object.keys(node.attributes ?? {}).some((key) =>
      ['role', 'aria-level', 'href'].includes(key.toLowerCase()),
    )
  )
    return
  for (const [index, ancestor] of path.slice(0, -1).entries()) {
    if (ancestor.shortcode || leafTypes.has(ancestor.type) || richText?.supports(ancestor)) return
    if (
      Object.entries(ancestor.attributes ?? {}).some(
        ([name, role]) => name.toLowerCase() === 'role' && /\b(button|link|heading)\b/i.test(role),
      )
    )
      return
    const parentTag = (
      ancestor.tagName ??
      nativeTypes.get(ancestor.type)?.tagName ??
      'div'
    ).toLowerCase()
    if (
      !flowParents.has(parentTag) &&
      (index === path.length - 2 || !structuralAncestors.has(parentTag))
    )
      return
  }
  return tag
}

export function mountTextFormat(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  richText?: RichTextResolver,
  i18n?: I18n,
) {
  if (node.type !== 'text' || node.shortcode || richText?.supports(node)) return
  const position = document.createComment('')
  container.append(position)
  const field = document.createElement('div')
  field.className = 'sigil-field sigil-text-format'
  const caption = document.createElement('label')
  caption.className = 'sigil-field-label'
  const control = document.createElement('select')
  control.className = 'sigil-input'
  control.id = caption.htmlFor = 'sigil-text-format-' + createId()
  control.dataset.textFormat = node.id
  for (const tag of formats) {
    const option = document.createElement('option')
    option.value = tag
    control.append(option)
  }
  field.append(caption, control)

  function refreshLocale(): void {
    caption.textContent = uiText(i18n, 'text_format.label', '文字格式')
    for (const option of control.options) {
      if (option.value === 'span')
        option.textContent = uiText(i18n, 'text_format.inline', '行內文字')
      else if (option.value === 'p')
        option.textContent = uiText(i18n, 'text_format.paragraph', '段落')
      else
        option.textContent = uiText(
          i18n,
          'text_format.heading',
          '標題 {level}（H{level}）',
        ).replaceAll('{level}', option.value.slice(1))
    }
  }

  let pathIds = new Set<string>()
  function refresh(): void {
    const path = findComponentPath(engine.getTree(), node.id)
    pathIds = new Set(path.map((ancestor) => ancestor.id))
    const tag = textFormat(path, richText)
    if (!tag || engine.getSelection() !== node.id) {
      field.remove()
      return
    }
    if (!field.parentElement) position.before(field)
    control.value = tag
    const current = path.at(-1)!
    control.disabled = !!current.locked
    if (richText)
      for (const option of control.options) {
        option.disabled =
          option.value !== tag && richText.supports({ ...current, tagName: option.value })
      }
  }
  function change(): void {
    const next = control.value
    refresh()
    if (
      !field.parentElement ||
      control.disabled ||
      next === control.value ||
      !formats.includes(next)
    )
      return
    if (control.querySelector<HTMLOptionElement>(`option[value="${next}"]`)?.disabled) return
    engine.update(node.id, { tagName: next })
  }
  refreshLocale()
  refresh()
  control.addEventListener('change', change)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch') return
    const patch = event.patch
    if (patch.type === 'update') {
      if (
        patch.tagName === undefined &&
        patch.locked === undefined &&
        !patch.attrs &&
        !patch.removeAttributes &&
        !patch.shortcode
      )
        return
      if (!pathIds.has(patch.id)) return
    }
    refresh()
  })
  return {
    refreshLocale,
    destroy() {
      unsubscribe()
      control.removeEventListener('change', change)
      field.remove()
      position.remove()
    },
  }
}
