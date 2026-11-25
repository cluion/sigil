import {
  createId,
  findNode,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { isFlex } from './flex-wrap-field.js'
import { isGrid } from './grid-columns.js'
import { uiText } from './i18n.js'
import { isLayoutGapValue, ownLayoutGap, readLayoutGap, setLayoutGap } from './layout-gap.js'
import { deviceLabel } from './style-device.js'
import { bindStyleDraft } from './style-draft.js'

const axes = ['row', 'column'] as const
type Axis = (typeof axes)[number]

export function readUniformGap(node: ComponentNode, device: ResponsiveDevice) {
  const row = readLayoutGap(node, device, 'row')
  const column = readLayoutGap(node, device, 'column')
  const sources = (['mobile', 'tablet', 'desktop'] as const).filter(
    (at) => row.source === at || column.source === at,
  )
  const source = sources[0] ?? null
  const shorthand = source && ownLayoutGap(node, source)
  return {
    override: ownLayoutGap(node, device),
    effective: row.value || shorthand || undefined,
    source,
    inherited: !!source && source !== device,
    gap: {
      mixed: row.value !== column.value,
      sources,
      hasOwnAxis: axes.some((axis) => ownLayoutGap(node, device, axis) !== undefined),
    },
  }
}
const focusTargets = [
  '[data-gap-toggle]',
  '[data-style-property="row-gap"]',
  '[data-style-property="column-gap"]',
  '[data-gap-reset="row"]',
  '[data-gap-reset="column"]',
  '[data-style-property="flex-wrap"]',
  '[data-style-reset="flex-wrap"]',
  '[data-style-property="flex-direction"]',
  '[data-style-reset="flex-direction"]',
]

export function preserveLayoutFocus(container: HTMLElement, id: string | null) {
  const active = container.ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return
  if (active.closest<HTMLElement>('[data-layout-node]')?.dataset.layoutNode !== id) return
  const selector = focusTargets.find((target) => active.matches(target))
  if (!selector) return
  return () => {
    let control = container.querySelector<HTMLElement>(selector)
    if (control?.matches(':disabled')) {
      const prop = active.dataset.gapReset
        ? active.dataset.gapReset + '-gap'
        : (active.dataset.styleProperty ?? active.dataset.styleReset)
      control =
        container.querySelector<HTMLElement>(`[data-style-property="${prop}"]:not(:disabled)`) ??
        container.querySelector<HTMLElement>('[data-gap-toggle]')
    }
    if (control && !control.closest('[hidden]')) control.focus({ preventScroll: true })
  }
}

export function gapValidationMessage(
  axis: Axis | undefined,
  value: string,
  i18n?: I18n,
  accepts?: (value: string) => boolean,
): string {
  if (!isLayoutGapValue(axis, value))
    return uiText(i18n, 'layout.invalid_gap', '請輸入有效的非負間距')
  return accepts?.(value) === false
    ? uiText(i18n, 'spacing.unsupported', '此編輯器無法儲存這個間距')
    : ''
}

export function createLayoutGapField(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  expanded: Set<string>,
  i18n?: I18n,
  accepts?: (value: string) => boolean,
) {
  const events = new AbortController()
  const { signal } = events
  const el = document.createElement('div')
  el.className = 'sigil-box-spacing sigil-layout-gap'
  el.dataset.layoutNode = node.id
  el.dataset.layoutGap = ''
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'sigil-btn sigil-btn--ghost sigil-box-spacing-toggle'
  toggle.dataset.gapToggle = ''
  toggle.textContent = uiText(i18n, 'layout.separate_gaps', '分別調整間距')
  const fields = document.createElement('div')
  fields.id = 'sigil-layout-gap-' + createId()
  fields.className = 'sigil-box-spacing-sides sigil-layout-gap-axes'
  toggle.setAttribute('aria-controls', fields.id)
  el.append(toggle, fields)
  let current = node
  const refreshers: ((current: ComponentNode) => void)[] = []

  function createAxis(axis: Axis) {
    const prop = axis + '-gap'
    const field = document.createElement('div')
    field.className = 'sigil-box-spacing-side'
    const label = document.createElement('label')
    label.className = 'sigil-box-spacing-label'
    const name = uiText(i18n, 'style.property.' + prop, axis === 'row' ? '列間距' : '欄間距')
    label.textContent = name
    const controls = document.createElement('div')
    controls.className = 'sigil-box-spacing-controls'
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.dataset.styleProperty = prop
    input.id = label.htmlFor = fields.id + '-' + axis
    input.autocapitalize = 'none'
    input.spellcheck = false
    input.autocomplete = 'off'
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'sigil-btn sigil-btn--ghost sigil-box-spacing-reset'
    reset.dataset.gapReset = axis
    reset.textContent = '↶'
    reset.title = uiText(i18n, 'spacing.reset', '清除{side}覆寫').replace('{side}', name)
    reset.setAttribute('aria-label', reset.title)
    controls.append(input, reset)
    const source = document.createElement('small')
    source.id = input.id + '-source'
    source.className = 'sigil-style-source sigil-box-spacing-source'
    input.setAttribute('aria-describedby', source.id)
    field.append(label, controls, source)
    fields.append(field)

    const draft = bindStyleDraft(input, signal, {
      live: false,
      editable: () => !el.hidden && !fields.hidden && engine.getSelection() === node.id,
      errorClass: 'sigil-box-spacing-error sigil-layout-gap-error',
      validate: (value) => gapValidationMessage(axis, value, i18n, accepts),
      write: (value) => setLayoutGap(engine, node.id, device, axis, value),
    })
    draft.appendError(field)
    reset.addEventListener('mousedown', (event) => event.preventDefault(), { signal })
    reset.addEventListener(
      'click',
      () => {
        if (reset.disabled || el.hidden || fields.hidden || engine.getSelection() !== node.id)
          return
        input.focus({ preventScroll: true })
        draft.restore()
        setLayoutGap(engine, node.id, device, axis, '')
      },
      { signal },
    )
    return (latest: ComponentNode) => {
      const value = readLayoutGap(latest, device, axis)
      const inherited = !!value.source && value.source !== device
      input.disabled = !!latest.locked
      input.dataset.styleSource = value.source ?? ''
      input.dataset.styleInherited = String(inherited)
      input.placeholder =
        value.source && !value.value
          ? uiText(i18n, 'spacing.dynamic', '依 CSS 宣告決定')
          : uiText(i18n, 'style.unset', '未設定')
      draft.sync(value.value, input.disabled || el.hidden)
      reset.disabled = input.disabled || ownLayoutGap(latest, device, axis) === undefined
      source.hidden = device === 'desktop'
      source.textContent = inherited
        ? uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(value.source!, i18n)
        : value.source
          ? uiText(i18n, 'style.override', '覆寫')
          : uiText(i18n, 'style.unset', '未設定')
    }
  }

  function refresh(latest: ComponentNode) {
    current = latest
    const display = getEffectiveStyle(latest, device).display
    el.hidden = !isFlex(display) && !isGrid(display)
    for (const sync of refreshers) sync(latest)
  }
  function show(open: boolean) {
    toggle.setAttribute('aria-expanded', String(open))
    fields.hidden = !open
    if (open) {
      expanded.add('layout-gap')
      if (!refreshers.length) refreshers.push(...axes.map(createAxis))
      refresh(current)
    } else {
      expanded.delete('layout-gap')
    }
  }
  refresh(node)
  show(expanded.has('layout-gap'))
  toggle.addEventListener('click', () => show(fields.hidden), { signal })
  el.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape' && !fields.hidden && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        show(false)
        toggle.focus({ preventScroll: true })
      } else if (
        event.target instanceof HTMLButtonElement &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { signal },
  )
  const unsubscribe = engine.subscribe((event) => {
    if (
      event.type === 'patch' &&
      event.patch.type === 'update' &&
      event.patch.id === node.id &&
      (event.patch.style || event.patch.responsiveStyles || event.patch.locked !== undefined)
    ) {
      const latest = findNode(engine.getTree(), node.id)
      if (latest) refresh(latest)
    }
  })
  return {
    el,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
