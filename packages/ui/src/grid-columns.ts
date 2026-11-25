import {
  createId,
  findNode,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'
import { deviceLabel, getDeviceStyleValue } from './style-device.js'

const property = 'grid-template-columns'
const track = 'minmax(0, 1fr)'
const containerTags = new Set([
  'div',
  'section',
  'article',
  'main',
  'aside',
  'header',
  'footer',
  'nav',
  'blockquote',
  'ul',
  'ol',
  'li',
  'figure',
  'form',
  'fieldset',
])
const leafTypes = new Set(['text', 'button', 'image', 'rich-text', 'shortcode'])

export function supportsGridColumns(node: ComponentNode): boolean {
  if (node.shortcode || leafTypes.has(node.type)) return false
  return node.tagName
    ? containerTags.has(node.tagName.toLowerCase())
    : node.type === 'section' || node.type === 'column' || node.type === 'root'
}

function equalColumns(value = ''): number | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
  const repeat = /^repeat\(([1-6]),minmax\(0,1fr\)\)$/.exec(normalized)
  if (repeat) return Number(repeat[1])
  const tracks = normalized.split(/\s+/)
  if (tracks.every((item) => item === 'minmax(0,1fr)')) return tracks.length
}

export function isGrid(display = ''): boolean {
  return /^(?:(?:inline|block)\s+grid|inline-grid|grid)$/i.test(display.trim())
}

function validTracks(value: string): boolean {
  if (/[;<>{}\\]/.test(value)) return false
  // CSS.supports 會自動補部分結尾括號；輸入框只接受已完成的欄軌定義。
  const expected: string[] = []
  for (const part of value.match(/[()[\]]/g) ?? []) {
    if (part === '(') expected.push(')')
    else if (part === '[') expected.push(']')
    else if (expected.pop() !== part) return false
  }
  return expected.length === 0 && CSS.supports(property, value)
}

export function createGridColumns(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  i18n?: I18n,
  acceptsCustomGridTracks?: (value: string) => boolean,
) {
  const events = new AbortController()
  const { signal } = events
  const el = document.createElement('div')
  el.className = 'sigil-grid-columns'
  el.setAttribute('role', 'group')
  const heading = document.createElement('h4')
  heading.id = 'sigil-grid-' + createId()
  heading.className = 'sigil-grid-title'
  el.setAttribute('aria-labelledby', heading.id)
  const presets = document.createElement('div')
  presets.className = 'sigil-grid-presets'
  const buttons = Array.from({ length: 6 }, (_, index) => {
    const count = index + 1
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sigil-btn sigil-btn--ghost'
    button.dataset.gridColumns = String(count)
    const swatch = document.createElement('span')
    swatch.className = 'sigil-grid-swatch'
    swatch.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < count; i++) swatch.append(document.createElement('span'))
    const number = document.createElement('span')
    number.textContent = String(count)
    button.append(swatch, number)
    presets.append(button)
    button.addEventListener(
      'click',
      () => {
        draft = false
        apply('repeat(' + count + ', ' + track + ')', count)
      },
      { signal },
    )
    return button
  })
  const label = document.createElement('label')
  label.className = 'sigil-field'
  const caption = document.createElement('span')
  caption.className = 'sigil-field-label'
  const custom = document.createElement('input')
  custom.type = 'text'
  custom.className = 'sigil-input'
  custom.dataset.gridCustom = ''
  custom.placeholder = '1fr 2fr'
  custom.spellcheck = false
  const error = document.createElement('small')
  error.id = heading.id + '-error'
  error.className = 'sigil-grid-error'
  error.setAttribute('role', 'alert')
  error.hidden = true
  const inheritance = document.createElement('div')
  inheritance.className = 'sigil-grid-inheritance'
  const source = document.createElement('small')
  source.className = 'sigil-style-source'
  source.id = heading.id + '-source'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'sigil-btn sigil-btn--ghost'
  reset.dataset.gridInherit = ''
  custom.setAttribute(
    'aria-describedby',
    [device !== 'desktop' && source.id, error.id].filter(Boolean).join(' '),
  )
  label.append(caption, custom)
  el.append(heading, presets, label, error)
  if (device !== 'desktop') {
    inheritance.append(source, reset)
    el.append(inheritance)
  }
  let draft = false
  let composing = false
  let lastValue: string | undefined
  let errorKind: 'invalid' | 'unsupported' | undefined

  function selected(): ComponentNode | undefined {
    if (signal.aborted || engine.getSelection() !== node.id) return
    const current = findNode(engine.getTree(), node.id)
    return current && supportsGridColumns(current) ? current : undefined
  }

  function showError(kind?: 'invalid' | 'unsupported'): void {
    errorKind = kind
    error.hidden = !kind
    const message =
      kind === 'unsupported'
        ? uiText(i18n, 'grid.unsupported', '此網站不支援這種欄寬設定。')
        : kind === 'invalid'
          ? uiText(i18n, 'grid.invalid', '請輸入有效的 CSS 欄寬。')
          : ''
    if (error.textContent !== message) error.textContent = message
    if (kind) custom.setAttribute('aria-invalid', 'true')
    else custom.removeAttribute('aria-invalid')
  }

  function sync(): void {
    const current = selected()
    const value = current && getDeviceStyleValue(current, device, property)
    const disabled = !current || !!current.locked
    const count =
      current && isGrid(getEffectiveStyle(current, device).display)
        ? equalColumns(value?.effective)
        : undefined
    buttons.forEach((button, i) => {
      button.disabled = disabled
      button.setAttribute('aria-pressed', String(count === i + 1))
    })
    custom.disabled = disabled
    reset.disabled = disabled || value?.override === undefined
    if (disabled || value?.effective !== lastValue) draft = false
    lastValue = value?.effective
    if (!draft) {
      if (custom.value !== (lastValue ?? '')) custom.value = lastValue ?? ''
      showError()
    }
    if (value?.override !== undefined) source.textContent = uiText(i18n, 'style.override', '覆寫')
    else if (value?.source) {
      source.textContent =
        uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(value.source, i18n)
    } else source.textContent = uiText(i18n, 'style.unset', '未設定')
  }

  function apply(next: string, count?: number): void {
    const current = selected()
    if (!current || current.locked) return
    const style = getEffectiveStyle(current, device)
    const changes: Style = {}
    if (next) {
      if (!isGrid(style.display)) changes.display = 'grid'
      if (
        count === undefined ? style[property] !== next : equalColumns(style[property]) !== count
      ) {
        changes[property] = next
      }
    } else if (getDeviceStyleValue(current, device, property).override !== undefined) {
      changes[property] = ''
    }
    if (Object.keys(changes).length) {
      engine.update(
        node.id,
        device === 'desktop' ? { style: changes } : { responsiveStyles: { [device]: changes } },
      )
    }
    sync()
  }

  function commit(): boolean {
    if (custom.disabled || composing || signal.aborted) return false
    const value = custom.value.trim()
    if (value === (lastValue ?? '')) {
      draft = false
      sync()
      return true
    }
    if (value) {
      if (!validTracks(value)) {
        draft = true
        showError('invalid')
        return false
      }
      if (acceptsCustomGridTracks && !acceptsCustomGridTracks(value)) {
        draft = true
        showError('unsupported')
        return false
      }
    }
    draft = false
    apply(value)
    return true
  }
  custom.addEventListener(
    'compositionstart',
    () => {
      composing = true
    },
    { signal },
  )
  custom.addEventListener(
    'compositionend',
    () => {
      composing = false
    },
    { signal },
  )
  custom.addEventListener(
    'input',
    () => {
      draft = true
      showError()
    },
    { signal },
  )
  custom.addEventListener('change', commit, { signal })
  custom.addEventListener('blur', commit, { signal })
  custom.addEventListener(
    'keydown',
    (event) => {
      const save =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'
      if (save) {
        if (event.isComposing || event.keyCode === 229 || !commit()) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      if (event.isComposing || event.keyCode === 229 || composing) return
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Enter') commit()
      else {
        draft = false
        sync()
      }
    },
    { signal },
  )
  el.addEventListener(
    'keydown',
    (event) => {
      if (!(event.target instanceof HTMLButtonElement)) return
      if (
        event.key === 'Delete' ||
        event.key === 'Backspace' ||
        ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v'].includes(event.key.toLowerCase()))
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { signal },
  )
  reset.addEventListener(
    'click',
    () => {
      const hadFocus = document.activeElement === reset
      draft = false
      apply('')
      if (hadFocus && reset.disabled) {
        const activePreset = buttons.find(
          (button) => button.getAttribute('aria-pressed') === 'true',
        )
        ;(activePreset ?? custom).focus({ preventScroll: true })
      }
    },
    { signal },
  )

  function refreshLocale(): void {
    heading.textContent = uiText(i18n, 'grid.title', '格線欄數')
    caption.textContent = uiText(i18n, 'grid.custom', '自訂欄寬')
    reset.textContent = uiText(i18n, 'grid.inherit', '沿用上層欄寬')
    for (const button of buttons) {
      const count = button.dataset.gridColumns!
      const caption =
        count === '1'
          ? uiText(i18n, 'grid.one', '1 欄')
          : uiText(i18n, 'grid.count', '{count} 欄').replace('{count}', count)
      button.setAttribute('aria-label', caption)
      button.title = caption
    }
    if (errorKind) showError(errorKind)
    sync()
  }
  refreshLocale()
  const unsubscribeLocale = subscribeLocale(i18n, refreshLocale)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'tree' || event.type === 'selection') {
      draft = false
      sync()
    } else if (
      event.type === 'patch' &&
      event.patch.type === 'update' &&
      event.patch.id === node.id
    ) {
      if (event.patch.style || event.patch.responsiveStyles || event.patch.locked !== undefined)
        sync()
    } else if (
      event.type === 'patch' &&
      (event.patch.type === 'remove' || event.patch.type === 'replace')
    )
      sync()
  })
  return {
    el,
    destroy() {
      events.abort()
      unsubscribeLocale()
      unsubscribe()
    },
  }
}
