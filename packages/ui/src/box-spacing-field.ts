import {
  createId,
  findNode,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import {
  boxSides,
  isBoxShorthandValue,
  isBoxSideValue,
  readBoxSpacing,
  setBoxSide,
  setBoxShorthand,
  type BoxProperty,
  type BoxSide,
} from './box-spacing.js'
import { uiText } from './i18n.js'
import { deviceLabel } from './style-device.js'
import { bindStyleDraft } from './style-draft.js'

export function bindBoxShorthand(
  input: HTMLInputElement,
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  property: BoxProperty,
  signal: AbortSignal,
  i18n?: I18n,
  acceptsValue?: (value: string) => boolean,
) {
  return bindStyleDraft(input, signal, {
    live: true,
    errorClass: 'sigil-box-spacing-error',
    editable: () => engine.getSelection() === node.id,
    validate(value) {
      if (!isBoxShorthandValue(property, value))
        return uiText(i18n, 'spacing.invalid_shorthand', '請輸入有效的 CSS 間距')
      return acceptsValue?.(value) === false
        ? uiText(i18n, 'spacing.unsupported', '此編輯器無法儲存這個間距')
        : ''
    },
    write: (value) => setBoxShorthand(engine, node.id, device, property, value),
  })
}

export function preserveBoxSpacingFocus(container: HTMLElement, id: string | null) {
  const active = container.ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return
  const group = active.closest<HTMLElement>('[data-box-spacing]')
  if (!group || group.dataset.spacingNode !== id) return
  const side = active.dataset.boxSide ?? active.dataset.boxReset
  return () => {
    const restored = container.querySelector<HTMLElement>(
      `[data-box-spacing="${group.dataset.boxSpacing}"]`,
    )
    const reset =
      active.dataset.boxReset &&
      restored?.querySelector<HTMLButtonElement>(`[data-box-reset="${side}"]`)
    const input = side && restored?.querySelector<HTMLInputElement>(`[data-box-side="${side}"]`)
    const control =
      reset && !reset.disabled
        ? reset
        : input && !input.disabled
          ? input
          : restored?.querySelector('button')
    control?.focus({ preventScroll: true })
  }
}

export function createBoxSpacingField(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  property: BoxProperty,
  expanded: Set<string>,
  i18n?: I18n,
  acceptsValue?: (value: string) => boolean,
) {
  const events = new AbortController()
  const { signal } = events
  const el = document.createElement('div')
  el.className = 'sigil-box-spacing'
  el.dataset.boxSpacing = property
  el.dataset.spacingNode = node.id
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'sigil-btn sigil-btn--ghost sigil-box-spacing-toggle'
  const name = uiText(i18n, 'style.property.' + property, property === 'padding' ? '內距' : '外距')
  toggle.textContent = uiText(i18n, 'spacing.expand.' + property, '分別調整' + name)
  const sides = document.createElement('div')
  sides.id = 'sigil-spacing-' + createId()
  sides.className = 'sigil-box-spacing-sides'
  toggle.setAttribute('aria-controls', sides.id)
  el.append(toggle, sides)

  const groupKey = 'spacing.' + property
  let current = node
  const fields: ReturnType<typeof sideField>[] = []
  function refresh(next: ComponentNode) {
    current = next
    if (sides.hidden) return
    const values = readBoxSpacing(next, device, property)
    for (const field of fields) field.sync(values[field.side], !!next.locked)
  }
  function sideField(side: BoxSide) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-box-spacing-side'
    const caption = document.createElement('label')
    caption.className = 'sigil-box-spacing-label'
    const sideNames = { top: '上方', right: '右方', bottom: '下方', left: '左方' }
    const title = uiText(i18n, 'spacing.' + side, sideNames[side] + '{property}').replace(
      '{property}',
      name,
    )
    caption.textContent = title
    const controls = document.createElement('div')
    controls.className = 'sigil-box-spacing-controls'
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'sigil-input'
    input.dataset.boxSide = property + '-' + side
    input.id = caption.htmlFor = sides.id + '-' + side
    input.spellcheck = false
    input.autocapitalize = 'none'
    input.autocomplete = 'off'
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'sigil-btn sigil-btn--ghost sigil-box-spacing-reset'
    reset.dataset.boxReset = input.dataset.boxSide
    reset.textContent = '↶'
    reset.title = uiText(i18n, 'spacing.reset', '清除{side}覆寫').replace('{side}', title)
    reset.setAttribute('aria-label', reset.title)
    controls.append(input, reset)
    const source = document.createElement('small')
    source.className = 'sigil-style-source sigil-box-spacing-source'
    source.id = input.id + '-source'
    const error = document.createElement('small')
    error.className = 'sigil-box-spacing-error'
    error.id = input.id + '-error'
    error.setAttribute('role', 'status')
    error.hidden = true
    input.setAttribute('aria-describedby', source.id + ' ' + error.id)
    wrap.append(caption, controls, source, error)
    sides.append(wrap)

    let draft = false
    let composing = false
    let lastValue: string | undefined
    function feedback(message = '') {
      if (error.textContent !== message) error.textContent = message
      error.hidden = !message
      if (message) input.setAttribute('aria-invalid', 'true')
      else input.removeAttribute('aria-invalid')
    }
    function sync(state: ReturnType<typeof readBoxSpacing>[BoxSide], locked: boolean) {
      if (!draft || locked || state.value !== lastValue) {
        draft = false
        if (input.value !== state.value) input.value = state.value
        feedback()
      }
      lastValue = state.value
      input.disabled = locked
      input.dataset.styleSource = state.source ?? ''
      input.dataset.styleInherited = String(!!state.source && state.source !== device)
      input.placeholder = state.unresolved
        ? uiText(i18n, 'spacing.dynamic', '依 CSS 宣告決定')
        : uiText(i18n, 'style.unset', '未設定')
      reset.disabled = locked || !state.hasOverride
      let description = uiText(i18n, 'style.unset', '未設定')
      if (state.source === device) {
        description =
          state.declaration === property
            ? uiText(i18n, 'spacing.from_group', '來自四邊設定')
            : uiText(i18n, 'style.override', '覆寫')
      } else if (state.source) {
        description = uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(state.source, i18n)
      }
      source.textContent = description
      source.hidden = device === 'desktop'
    }
    function apply(value: string): boolean {
      if (signal.aborted || current.locked || engine.getSelection() !== node.id) return false
      if (value && !isBoxSideValue(property, value)) {
        feedback(uiText(i18n, 'spacing.invalid', '請輸入有效的單邊間距'))
        return false
      }
      if (value && acceptsValue && !acceptsValue(value)) {
        feedback(uiText(i18n, 'spacing.unsupported', '此編輯器無法儲存這個間距'))
        return false
      }
      draft = false
      setBoxSide(engine, node.id, device, property, side, value)
      const latest = findNode(engine.getTree(), node.id)
      if (latest) refresh(latest)
      return true
    }
    function commit(): boolean {
      return !composing && (!draft || apply(input.value.trim()))
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
      },
      { signal },
    )
    input.addEventListener(
      'input',
      () => {
        draft = true
        feedback()
      },
      { signal },
    )
    input.addEventListener(
      'blur',
      (event) => {
        if (event.relatedTarget !== reset) commit()
      },
      { signal },
    )
    input.addEventListener(
      'keydown',
      (event) => {
        if (composing || event.isComposing || event.keyCode === 229) return
        if (event.key === 'Escape' && draft) {
          event.preventDefault()
          event.stopPropagation()
          draft = false
          refresh(current)
        } else if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          commit()
        } else if (event.key === 'Tab') commit()
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !commit()) {
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
        if (focused && reset.disabled) input.focus({ preventScroll: true })
      },
      { signal },
    )
    return { side, sync }
  }
  function show(open: boolean) {
    sides.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    if (open) {
      expanded.add(groupKey)
      if (!fields.length) fields.push(...boxSides.map(sideField))
      refresh(current)
    } else expanded.delete(groupKey)
  }
  toggle.addEventListener('click', () => show(sides.hidden), { signal })
  el.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape' && !sides.hidden && !event.defaultPrevented) {
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
  show(expanded.has(groupKey))
  return { el, refresh, destroy: () => events.abort() }
}
