import {
  createId,
  findNode,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import {
  collectPageColors,
  getPageBackgroundInfo,
  isAuthoredColor,
  nativeColorHex,
  reusableColorKey,
} from './page-colors.js'
import { deviceLabel, getDeviceStyleValue, updateDeviceStyle } from './style-device.js'

type ColorProperty = 'color' | 'background-color'

export function createColorField(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  property: ColorProperty,
  label: string,
  i18n?: I18n,
  acceptsColorValue?: (value: string) => boolean,
) {
  const events = new AbortController()
  const { signal } = events
  const id = 'sigil-color-' + createId()
  const el = document.createElement('div')
  el.className = 'sigil-field sigil-color-field'
  el.dataset.colorProperty = property
  const title = document.createElement('label')
  title.className = 'sigil-field-label'
  title.textContent = label

  const controls = document.createElement('div')
  controls.className = 'sigil-color-controls'
  const picker = document.createElement('span')
  picker.className = 'sigil-color-picker'
  const preview = document.createElement('span')
  preview.className = 'sigil-color-chip'
  preview.setAttribute('aria-hidden', 'true')
  const native = document.createElement('input')
  native.type = 'color'
  native.setAttribute('aria-label', uiText(i18n, 'color.pick', '選擇顏色') + ' · ' + label)
  native.dataset.styleProperty = property
  picker.append(preview, native)
  const text = document.createElement('input')
  text.type = 'text'
  text.id = title.htmlFor = id + '-value'
  text.className = 'sigil-input sigil-color-value'
  text.spellcheck = false
  text.autocomplete = 'off'
  text.autocapitalize = 'none'
  text.placeholder = '#RRGGBB'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'sigil-btn sigil-btn--ghost sigil-color-palette-toggle'
  toggle.textContent = uiText(i18n, 'color.palette', '頁面色票')
  toggle.setAttribute('aria-expanded', 'false')
  const palette = document.createElement('div')
  palette.className = 'sigil-color-palette'
  palette.id = id + '-palette'
  palette.hidden = true
  toggle.setAttribute('aria-controls', palette.id)
  const options = document.createElement('div')
  options.className = 'sigil-color-options'
  options.setAttribute('role', 'group')
  options.setAttribute('aria-label', toggle.textContent)
  const empty = document.createElement('p')
  empty.className = 'sigil-muted'
  empty.textContent = uiText(i18n, 'color.empty', '此頁尚無可重用的顏色')
  palette.append(options, empty)
  controls.append(picker, text, toggle)
  const error = document.createElement('p')
  error.className = 'sigil-color-error'
  error.id = id + '-error'
  error.hidden = true
  error.setAttribute('role', 'status')

  const footer = document.createElement('div')
  footer.className = 'sigil-style-control-row sigil-color-source-row'
  const source = document.createElement('span')
  source.id = id + '-source'
  source.dataset.styleSourceLabel = property
  source.className = 'sigil-style-source'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'sigil-btn sigil-btn--ghost sigil-style-inherit'
  reset.dataset.styleReset = property
  reset.textContent = uiText(i18n, 'style.use_inheritance', '使用繼承')
  footer.append(source, reset)
  text.setAttribute(
    'aria-describedby',
    device === 'desktop' ? error.id : source.id + ' ' + error.id,
  )
  el.append(title, controls, error, palette)
  if (device !== 'desktop') el.append(footer)

  let currentValue = ''
  let draft = false
  let composing = false

  function feedback(message = ''): void {
    error.textContent = message
    error.hidden = !message
    if (message) text.setAttribute('aria-invalid', 'true')
    else text.removeAttribute('aria-invalid')
  }

  function closePalette(): void {
    toggle.setAttribute('aria-expanded', 'false')
    palette.hidden = true
  }

  function refresh(current: ComponentNode | null): void {
    const style = current && getDeviceStyleValue(current, device, property)
    const background =
      current && property === 'background-color' ? getPageBackgroundInfo(current, device) : null
    const value = (background ? background.value : style?.effective) ?? ''
    const from = background ? background.source : style?.source
    const disabled = !current || !!current.locked || engine.getSelection() !== node.id
    if (!draft || value !== currentValue || disabled) {
      text.value = value
      draft = false
      feedback()
    }
    if (currentValue !== value) {
      currentValue = value
      preview.style.backgroundColor = ''
      preview.style.backgroundColor = value
      native.value = nativeColorHex(value) ?? '#000000'
    }
    native.disabled = text.disabled = toggle.disabled = disabled
    if (disabled) closePalette()
    reset.disabled = disabled || style?.override === undefined
    source.textContent =
      from === device
        ? uiText(i18n, 'style.override', '覆寫')
        : from
          ? uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(from, i18n)
          : uiText(i18n, 'style.unset', '未設定')
    for (const control of [text, native]) {
      control.dataset.styleSource = from ?? ''
      control.dataset.styleInherited = String(!!from && from !== device)
    }
  }

  function sync(): void {
    refresh(findNode(engine.getTree(), node.id))
  }

  function apply(value: string): boolean {
    if (signal.aborted || engine.getSelection() !== node.id) return false
    const current = findNode(engine.getTree(), node.id)
    if (!current || current.locked) return false
    if (value && !isAuthoredColor(value)) {
      feedback(uiText(i18n, 'color.invalid', '請輸入有效的 CSS 色值'))
      return false
    }
    if (value && acceptsColorValue && !acceptsColorValue(value)) {
      feedback(uiText(i18n, 'color.unsupported', '此編輯器無法儲存這個色值'))
      return false
    }
    draft = false
    if (!value || value !== currentValue) {
      const own = device === 'desktop' ? current.style : current.responsiveStyles?.[device]
      const keys = Object.keys(own ?? {})
      // 同層後寫的背景簡寫會覆蓋色值，將新長屬性放在簡寫後。
      if (
        value &&
        property === 'background-color' &&
        own?.[property] &&
        keys.indexOf('background') > keys.indexOf(property)
      ) {
        engine.batch(() => {
          updateDeviceStyle(engine, node.id, device, property, '')
          updateDeviceStyle(engine, node.id, device, property, value)
        })
      } else updateDeviceStyle(engine, node.id, device, property, value)
    }
    sync()
    return true
  }

  function renderPalette(): void {
    const values = collectPageColors(engine.getTree(), device, acceptsColorValue)
    const previous = [...options.querySelectorAll('button')]
    if (!values.every((v, i) => previous[i]?.value === v) || values.length !== previous.length) {
      const focused = previous.find((button) => button === document.activeElement)?.value
      options.replaceChildren()
      for (const value of values) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sigil-btn sigil-color-option'
        button.value = value
        button.dataset.colorKey = reusableColorKey(value) ?? value
        const chip = document.createElement('span')
        chip.className = 'sigil-color-chip'
        chip.setAttribute('aria-hidden', 'true')
        chip.style.backgroundColor = value
        button.append(chip, value)
        options.appendChild(button)
      }
      if (focused)
        (
          [...options.querySelectorAll('button')].find((button) => button.value === focused) ??
          toggle
        ).focus({ preventScroll: true })
    }
    const currentKey = reusableColorKey(currentValue)
    for (const button of options.querySelectorAll('button'))
      button.setAttribute(
        'aria-pressed',
        String(!!currentKey && button.dataset.colorKey === currentKey),
      )
    empty.hidden = values.length > 0
  }

  function commit(): boolean {
    return !composing && (!draft || apply(text.value.trim()))
  }
  text.addEventListener(
    'compositionstart',
    () => {
      composing = true
    },
    { signal },
  )
  text.addEventListener(
    'compositionend',
    () => {
      composing = false
    },
    { signal },
  )
  text.addEventListener(
    'input',
    () => {
      draft = true
      feedback()
    },
    { signal },
  )
  text.addEventListener(
    'blur',
    (event) => {
      if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return
      commit()
    },
    { signal },
  )
  text.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229 || composing) return
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        commit()
      } else if (event.key === 'Tab') {
        commit()
      } else if (event.key === 'Escape' && draft) {
        event.preventDefault()
        event.stopPropagation()
        draft = false
        sync()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !commit()) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { signal },
  )
  el.addEventListener(
    'focusout',
    (event) => {
      if (
        event.target !== text &&
        !(event.relatedTarget instanceof Node && el.contains(event.relatedTarget))
      )
        commit()
    },
    { signal },
  )
  function pickNative(): void {
    if (!apply(native.value)) native.value = nativeColorHex(currentValue) ?? '#000000'
  }
  native.addEventListener('input', pickNative, { signal })
  native.addEventListener('change', pickNative, { signal })
  toggle.addEventListener(
    'click',
    () => {
      if (palette.hidden) {
        renderPalette()
        palette.hidden = false
        toggle.setAttribute('aria-expanded', 'true')
      } else closePalette()
    },
    { signal },
  )
  options.addEventListener(
    'click',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      if (!button || !options.contains(button)) return
      if (button.getAttribute('aria-pressed') === 'true') {
        draft = false
        sync()
      } else if (!apply(button.value)) return
      closePalette()
      toggle.focus({ preventScroll: true })
    },
    { signal },
  )
  el.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229 || composing) return
      if (event.key === 'Escape' && !palette.hidden) {
        event.preventDefault()
        event.stopPropagation()
        closePalette()
        toggle.focus({ preventScroll: true })
      } else if (
        event.target instanceof HTMLButtonElement &&
        (event.key === 'Delete' ||
          event.key === 'Backspace' ||
          ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v'].includes(event.key.toLowerCase())))
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
      const hadFocus = reset === document.activeElement
      apply('')
      if (hadFocus && reset.disabled) text.focus({ preventScroll: true })
    },
    { signal },
  )

  refresh(node)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'history') return
    if (event.type === 'patch' && event.patch.type === 'update') {
      const patch = event.patch
      if (!patch.style && !patch.responsiveStyles && patch.locked === undefined) return
      if (patch.id === node.id) sync()
    } else sync()
    if (!palette.hidden) renderPalette()
  })
  return {
    el,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
