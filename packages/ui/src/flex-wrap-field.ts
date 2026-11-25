import {
  createId,
  findNode,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { supportsGridColumns } from './grid-columns.js'
import { uiText } from './i18n.js'
import { writeLayoutDeclaration } from './layout-declaration.js'
import { deviceLabel, type DeviceStyleValue } from './style-device.js'

const modes = { nowrap: '不換行', wrap: '自動換行', 'wrap-reverse': '反向換行' } as const

export function isFlex(display = ''): boolean {
  return /^(?:flex|inline-flex|(?:inline|block)\s+flex|flex\s+(?:inline|block))$/i.test(
    display.trim(),
  )
}

type FlowProperty = 'flex-wrap' | 'flex-direction'
const isDirection = (token: string) => /^(?:row|column)(?:-reverse)?$/.test(token)
function flowValue(property: FlowProperty, declaration: string, raw: string): string | undefined {
  const initial = property === 'flex-wrap' ? 'nowrap' : 'row'
  const value = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .toLowerCase()
  if (!value) return
  if (value === 'initial' || value === 'unset') return initial
  if (/^(?:inherit|revert|revert-layer)$/.test(value) || /\b(?:var|env|attr)\(/.test(value))
    return raw
  if (declaration === property) {
    const valid = property === 'flex-wrap' ? Object.hasOwn(modes, value) : isDirection(value)
    return valid ? value : undefined
  }
  if (declaration !== 'flex-flow') return
  const tokens = value.split(/\s+/)
  const wrap = tokens.filter((token) => Object.hasOwn(modes, token))
  const direction = tokens.filter(isDirection)
  if (wrap.length <= 1 && direction.length <= 1 && wrap.length + direction.length === tokens.length)
    return (property === 'flex-wrap' ? wrap[0] : direction[0]) ?? initial
}

function flowSetting(node: ComponentNode, device: ResponsiveDevice, property: FlowProperty) {
  let effective: string | undefined
  let source: ResponsiveDevice | null = null
  let fromFlow = false
  let override: string | undefined
  for (const at of ['desktop', 'tablet', 'mobile'] as const) {
    const layer = at === 'desktop' ? node.style : node.responsiveStyles?.[at]
    for (const [declaration, raw] of Object.entries(layer ?? {})) {
      const key = declaration.toLowerCase()
      if (key !== property && key !== 'flex-flow' && key !== 'all') continue
      if (key === property && at === device) override = raw
      const next = flowValue(property, key, raw)
      if (next === undefined) continue
      effective = next
      source = at
      fromFlow = key === 'flex-flow'
    }
    if (at === device) break
  }
  return { effective, source, fromFlow, override, inherited: source !== null && source !== device }
}

export function readFlexDirection(
  node: ComponentNode,
  device: ResponsiveDevice,
): DeviceStyleValue & { fromFlow: boolean } {
  return flowSetting(node, device, 'flex-direction')
}

function shadowsFlow(name: string): boolean {
  return name === 'all' || name === 'flex-flow'
}

export function setFlexDirection(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  value: string,
): void {
  const current = findNode(engine.getTree(), id)
  if (current && !current.locked && engine.getSelection() === id)
    writeLayoutDeclaration(engine, current, device, 'flex-direction', value, shadowsFlow)
}

export function createFlexWrapField(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  i18n?: I18n,
) {
  const controller = new AbortController()
  const { signal } = controller
  const el = document.createElement('div')
  el.className = 'sigil-field sigil-flex-wrap'
  const label = document.createElement('label')
  label.className = 'sigil-field-label'
  label.textContent = uiText(i18n, 'layout.wrap_title', '項目換行')
  const select = document.createElement('select')
  select.className = 'sigil-input'
  select.id = 'sigil-flex-wrap-' + createId()
  select.dataset.styleProperty = 'flex-wrap'
  label.htmlFor = select.id
  for (const [value, caption] of Object.entries(modes)) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = uiText(i18n, 'layout.' + value, caption)
    select.append(option)
  }
  const custom = document.createElement('option')
  custom.value = 'custom'
  custom.disabled = true
  select.append(custom)
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'sigil-btn sigil-btn--ghost sigil-box-spacing-reset'
  reset.textContent = '↺'
  reset.dataset.styleReset = 'flex-wrap'
  reset.title = uiText(i18n, 'layout.reset_wrap', '還原換行設定')
  reset.setAttribute('aria-label', reset.title)
  const row = document.createElement('div')
  row.className = 'sigil-box-spacing-controls'
  row.append(select, reset)
  const source = document.createElement('span')
  source.className = 'sigil-box-spacing-source'
  source.id = select.id + '-source'
  select.setAttribute('aria-describedby', source.id)
  el.append(label, row, source)

  function visible(current: ComponentNode): boolean {
    return supportsGridColumns(current) && isFlex(getEffectiveStyle(current, device).display)
  }
  function refresh(current: ComponentNode): void {
    el.hidden = !visible(current)
    if (el.hidden) return
    const state = flowSetting(current, device, 'flex-wrap')
    const value = state.effective ?? 'nowrap'
    custom.hidden = Object.hasOwn(modes, value)
    if (!custom.hidden)
      custom.textContent = uiText(i18n, 'layout.wrap_css', '依 CSS 決定') + ' (' + value + ')'
    select.value = custom.hidden ? value : custom.value
    select.disabled = !!current.locked
    reset.disabled = !!current.locked || state.override === undefined
    select.dataset.styleSource = state.source ?? ''
    select.dataset.styleInherited = String(!!state.source && state.source !== device)
    let caption = ''
    if (state.source && state.source !== device)
      caption = uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(state.source, i18n)
    else if (state.fromFlow) caption = uiText(i18n, 'layout.from_flow', '來自 flex-flow')
    source.textContent = caption
    source.hidden = !caption
  }
  function apply(value: string): void {
    if (
      signal.aborted ||
      engine.getSelection() !== node.id ||
      (value && !Object.hasOwn(modes, value))
    )
      return
    const current = findNode(engine.getTree(), node.id)
    if (!current || current.locked || !visible(current)) return
    writeLayoutDeclaration(engine, current, device, 'flex-wrap', value, shadowsFlow)
  }
  select.addEventListener('change', () => apply(select.value), { signal })
  reset.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { signal },
  )
  reset.addEventListener(
    'click',
    () => {
      const focused = document.activeElement === reset
      apply('')
      if (focused && reset.disabled) select.focus({ preventScroll: true })
    },
    { signal },
  )
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch' || event.patch.type !== 'update' || event.patch.id !== node.id)
      return
    const current = findNode(engine.getTree(), node.id)
    if (current) refresh(current)
  })
  refresh(node)
  return {
    el,
    destroy() {
      controller.abort()
      unsubscribe()
    },
  }
}
