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
import { uiText } from './i18n.js'
import { isImageLinkLayout, readImageLink } from './image-link.js'
import { getDeviceStyleValue } from './style-device.js'

const ratios = ['1 / 1', '4 / 3', '16 / 9', '3 / 4'] as const
const fitChoices = { cover: '填滿裁切', contain: '完整顯示', fill: '伸展填滿' } as const
const heightProperties = ['height', 'min-height', 'max-height'] as const
const frameProperties = ['aspect-ratio', ...heightProperties, 'object-fit'] as const
type FocusPoint = { x: number; y: number }

export function supportsImageFraming(node: ComponentNode): boolean {
  return node.type === 'image' && !node.shortcode && (node.tagName ?? 'img').toLowerCase() === 'img'
}

function percent(value: string, axis: 'x' | 'y'): number | undefined {
  const keywords = axis === 'x' ? ['left', 'center', 'right'] : ['top', 'center', 'bottom']
  const keyword = keywords.indexOf(value)
  if (keyword >= 0) return keyword * 50
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value)) return
  const number = Number.parseFloat(value)
  return number <= 100 ? number : undefined
}

function position(value = 'center'): FocusPoint | undefined {
  const words = value.trim().toLowerCase().split(/\s+/)
  if (words.length > 2) return
  let [horizontal = 'center', vertical = 'center'] = words
  if (
    horizontal === 'top' ||
    horizontal === 'bottom' ||
    vertical === 'left' ||
    vertical === 'right'
  )
    [horizontal, vertical] = [vertical, horizontal]
  const x = percent(horizontal, 'x')
  const y = percent(vertical, 'y')
  if (x !== undefined && y !== undefined) return { x, y }
}

function normalizedRatio(value: string | undefined) {
  const match = /^(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?$/.exec(value?.trim() ?? '')
  if (!match) return
  const ratio = Number(match[1]) / Number(match[2] ?? 1)
  return ratios.find((choice) => {
    const [w, h] = choice.split(' / ').map(Number)
    return Math.abs(w! / h! - ratio) < 0.000001
  })
}

function heightLimitOverrides(style: Style): Style {
  const overrides: Style = {}
  const min = style['min-height']?.trim().toLowerCase()
  const max = style['max-height']?.trim().toLowerCase()
  if (min && !['auto', 'initial', 'unset'].includes(min) && !/^0+(?:\.0+)?(?:[a-z]+|%)?$/.test(min))
    overrides['min-height'] = '0'
  if (max && !['none', 'initial', 'unset'].includes(max)) overrides['max-height'] = 'none'
  return overrides
}

function allowsAspectRatio(style: Style = {}, limits = heightLimitOverrides(style)): boolean {
  return (!style.height || style.height === 'auto') && !Object.keys(limits).length
}

export function createImageFraming(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  i18n?: I18n,
) {
  const t = (key: string, fallback: string) => uiText(i18n, 'framing.' + key, fallback)
  const events = new AbortController()
  const { signal } = events
  const el = document.createElement('div')
  el.className = 'sigil-image-framing'
  el.tabIndex = -1
  el.setAttribute('role', 'group')
  const title = document.createElement('h4')
  title.id = 'sigil-framing-' + createId()
  title.className = 'sigil-framing-title'
  el.setAttribute('aria-labelledby', title.id)
  const modes = document.createElement('div')
  modes.className = 'sigil-framing-modes'
  const axes = document.createElement('div')
  axes.className = 'sigil-framing-coordinates'
  const actions = document.createElement('div')
  actions.className = 'sigil-framing-actions'

  function field(parent: HTMLElement, input: HTMLSelectElement | HTMLInputElement) {
    const label = document.createElement('label')
    label.className = 'sigil-field'
    const caption = document.createElement('span')
    caption.className = 'sigil-field-label'
    input.className = 'sigil-input'
    label.append(caption, input)
    parent.append(label)
    return caption
  }

  function select(key: string) {
    const input = document.createElement('select')
    input.dataset.framing = key
    return { input, caption: field(modes, input) }
  }
  const ratio = select('ratio')
  const fit = select('fit')
  function option(select: HTMLSelectElement, value: string, text: string, disabled = false) {
    const entry = document.createElement('option')
    entry.value = value
    entry.textContent = text
    entry.disabled = disabled
    select.append(entry)
    return entry
  }
  const ratioOther = option(ratio.input, '', '', true)
  for (const value of ratios) option(ratio.input, value, value.replace(' / ', ':'))
  const fitOther = option(fit.input, '', '', true)
  for (const [key, label] of Object.entries(fitChoices)) option(fit.input, key, label)

  const photo = document.createElement('div')
  photo.className = 'sigil-framing-photo'
  photo.style.textAlign = 'center'
  const surface = document.createElement('button')
  surface.type = 'button'
  surface.className = 'sigil-framing-surface'
  surface.style.cssText =
    'position:relative;display:inline-block;vertical-align:middle;max-width:100%;padding:0;border:0;line-height:0;touch-action:none'
  const image = document.createElement('img')
  image.alt = ''
  image.draggable = false
  image.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none'
  const marker = document.createElement('span')
  marker.className = 'sigil-framing-marker'
  marker.setAttribute('aria-hidden', 'true')
  marker.style.cssText =
    'position:absolute;pointer-events:none;transform:translate(-50%,-50%);width:14px;height:14px;border:2px solid white;box-shadow:0 0 0 1px #27344a;border-radius:50%'
  surface.append(image, marker)
  photo.append(surface)
  const hint = document.createElement('p')
  hint.className = 'sigil-framing-hint sigil-muted'
  hint.id = title.id + '-hint'
  surface.setAttribute('aria-describedby', hint.id)
  const custom = document.createElement('p')
  custom.className = 'sigil-framing-custom sigil-muted'
  const missing = document.createElement('p')
  missing.className = 'sigil-framing-missing sigil-muted'

  let editing: HTMLInputElement | undefined
  let lastPosition: string | undefined

  function axis(key: 'x' | 'y') {
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.max = '100'
    input.step = '1'
    input.dataset.framing = key
    const finish = () => {
      editing = undefined
      const current = selected()
      const value = input.valueAsNumber
      if (current && Number.isFinite(value) && value >= 0 && value <= 100) {
        const point = position(getEffectiveStyle(current, device)['object-position']) ?? {
          x: 50,
          y: 50,
        }
        commitFocus({ ...point, [key]: value })
      }
      sync()
    }
    input.addEventListener('input', () => (editing = input), { signal })
    input.addEventListener('change', finish, { signal })
    input.addEventListener(
      'blur',
      () => {
        if (editing === input) finish()
      },
      { signal },
    )
    return { input, caption: field(axes, input) }
  }
  const x = axis('x')
  const y = axis('y')
  function resetButton(keys: readonly string[], resetLayout = false) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sigil-btn sigil-btn--ghost'
    button.addEventListener(
      'click',
      () => {
        const current = selected()
        if (!current || current.locked) return
        const layout = resetLayout ? imageLayout(current) : undefined
        if (layout && !layout.canEdit) return
        engine.batch(() => {
          if (layout) clearStyle(layout.link, heightProperties)
          clearStyle(current, keys)
        })
      },
      { signal },
    )
    actions.append(button)
    return button
  }
  const resetFocus = resetButton(['object-position'])
  const resetFrame = resetButton(frameProperties, true)
  el.append(title, modes, photo, missing, hint, custom, axes, actions)

  let src: string | undefined
  let loaded = false
  let failed = false
  let layoutId: string | undefined
  let pointer: number | undefined
  let draft: FocusPoint | undefined

  function selected(): ComponentNode | undefined {
    if (signal.aborted || engine.getSelection() !== node.id) return
    const current = findNode(engine.getTree(), node.id)
    if (current && supportsImageFraming(current)) return current
  }
  function imageLayout(current: ComponentNode) {
    const state = readImageLink(engine.getTree(), current.id)
    if (state?.link && isImageLinkLayout(state.link, current))
      return { link: state.link, canEdit: state.canEdit }
  }
  function clearStyle(current: ComponentNode, keys: readonly string[]): void {
    const changes: Style = {}
    for (const key of keys) {
      if (getDeviceStyleValue(current, device, key).override !== undefined) changes[key] = ''
    }
    update(current, changes)
  }
  function update(current: ComponentNode, changes: Style): void {
    if (Object.keys(changes).length)
      engine.update(
        current.id,
        device === 'desktop' ? { style: changes } : { responsiveStyles: { [device]: changes } },
      )
  }
  function commitFocus(point: FocusPoint): void {
    const current = selected()
    if (!current || current.locked) return
    const old = position(getEffectiveStyle(current, device)['object-position'])
    if (point.x === old?.x && point.y === old.y) return
    update(current, { 'object-position': point.x + '% ' + point.y + '%' })
  }
  ratio.input.addEventListener(
    'change',
    () => {
      const current = selected()
      const value = ratios.find((value) => ratio.input.value === value)
      if (!current || current.locked || !value) return
      const layout = imageLayout(current)
      if (layout && !layout.canEdit) return
      const effective = getEffectiveStyle(current, device)
      const limits = heightLimitOverrides(effective)
      const box = layout && getEffectiveStyle(layout.link, device)
      const boxLimits = heightLimitOverrides(box ?? {})
      if (
        normalizedRatio(effective['aspect-ratio']) === value &&
        effective.height === 'auto' &&
        effective['object-fit'] &&
        !Object.keys(limits).length &&
        allowsAspectRatio(box, boxLimits)
      )
        return
      const changes: Style = { 'aspect-ratio': value, height: 'auto', ...limits }
      if (!effective['object-fit']) changes['object-fit'] = 'cover'
      engine.batch(() => {
        // 裁切時同步調整連結承接的高度，讓點擊範圍貼齊圖片。
        if (layout) update(layout.link, { height: 'auto', ...boxLimits })
        update(current, changes)
      })
    },
    { signal },
  )
  fit.input.addEventListener(
    'change',
    () => {
      const current = selected()
      const value = fit.input.value
      if (!current || current.locked || !Object.hasOwn(fitChoices, value)) return
      if ((getEffectiveStyle(current, device)['object-fit'] ?? 'fill') !== value)
        update(current, { 'object-fit': value })
    },
    { signal },
  )

  function displayPoint(point: FocusPoint | undefined): void {
    marker.hidden = !point
    if (point) {
      marker.style.left = point.x + '%'
      marker.style.top = point.y + '%'
    }
    for (const [field, value] of [
      [x, point?.x],
      [y, point?.y],
    ] as const) {
      const next = value === undefined ? '' : String(value)
      if (field.input !== editing && field.input.value !== next) field.input.value = next
    }
  }
  function sync(): void {
    if (signal.aborted) return
    const current = selected()
    const locked = !current || !!current.locked
    const nextSrc = current?.attributes?.src?.trim() ?? ''
    if (src !== nextSrc) {
      editing = undefined
      cancelGesture()
      src = nextSrc
      failed = false
      loaded = false
      if (src) image.src = src
      else image.removeAttribute('src')
    }
    if (locked) cancelGesture()
    const style = current ? getEffectiveStyle(current, device) : {}
    const layout = current && imageLayout(current)
    layoutId = layout?.link.id
    const box = layout && getEffectiveStyle(layout.link, device)
    const frame = style['aspect-ratio']
    const preset = allowsAspectRatio(style) && allowsAspectRatio(box) && normalizedRatio(frame)
    ratioOther.textContent = frame ? t('custom', '自訂') + ' · ' + frame : t('original', '原有尺寸')
    ratio.input.value = preset || ''
    const mode = style['object-fit'] || 'fill'
    fitOther.textContent = t('custom', '自訂') + ' · ' + mode
    fitOther.hidden = Object.hasOwn(fitChoices, mode)
    fit.input.value = fitOther.hidden ? mode : ''
    const value = style['object-position']
    if (locked || value !== lastPosition) editing = undefined
    lastPosition = value
    const point = draft ?? position(value)
    custom.hidden = !!point
    if (!point) custom.textContent = t('custom_position', '自訂焦點') + ' · ' + value
    displayPoint(point)
    for (const control of [fit.input, x.input, y.input]) control.disabled = locked
    ratio.input.disabled = locked || !!(layout && !layout.canEdit)
    surface.disabled = locked || !loaded
    photo.hidden = !loaded
    missing.hidden = !!src && !failed
    const own = device === 'desktop' ? current?.style : current?.responsiveStyles?.[device]
    resetFocus.disabled = locked || !own?.['object-position']
    const outer =
      device === 'desktop' ? layout?.link.style : layout?.link.responsiveStyles?.[device]
    resetFrame.disabled =
      ratio.input.disabled ||
      (!frameProperties.some((key) => own?.[key]) && !heightProperties.some((key) => outer?.[key]))
  }

  image.addEventListener(
    'load',
    () => {
      if (!src || !image.naturalWidth || !image.naturalHeight) return
      loaded = true
      failed = false
      surface.style.width = (176 * image.naturalWidth) / image.naturalHeight + 'px'
      sync()
    },
    { signal },
  )
  image.addEventListener(
    'error',
    () => {
      cancelGesture()
      loaded = false
      failed = true
      sync()
    },
    { signal },
  )

  function pointAt(event: PointerEvent): FocusPoint | undefined {
    const box = image.getBoundingClientRect()
    if (!box.width || !box.height) return
    const coordinate = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100)))
    return {
      x: coordinate((event.clientX - box.left) / box.width),
      y: coordinate((event.clientY - box.top) / box.height),
    }
  }
  function cancelGesture(): void {
    const previous = pointer
    pointer = undefined
    draft = undefined
    if (previous !== undefined && surface.hasPointerCapture?.(previous))
      surface.releasePointerCapture(previous)
  }
  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (pointer !== undefined || event.button !== 0 || surface.disabled || !selected()) return
      const point = pointAt(event)
      if (!point) return
      editing?.blur()
      pointer = event.pointerId
      draft = point
      surface.setPointerCapture?.(pointer)
      displayPoint(point)
    },
    { signal },
  )
  surface.addEventListener(
    'pointermove',
    (event) => {
      if (pointer !== event.pointerId) return
      const point = pointAt(event)
      if (point) {
        draft = point
        displayPoint(point)
      }
    },
    { signal },
  )
  surface.addEventListener(
    'pointerup',
    (event) => {
      if (pointer !== event.pointerId) return
      const point = pointAt(event)
      cancelGesture()
      if (point) commitFocus(point)
      sync()
    },
    { signal },
  )
  function abortPointer(event: PointerEvent): void {
    if (event.pointerId !== pointer) return
    cancelGesture()
    sync()
  }
  surface.addEventListener('pointercancel', abortPointer, { signal })
  surface.addEventListener('lostpointercapture', abortPointer, { signal })
  function abortOnBlur(): void {
    if (pointer === undefined) return
    cancelGesture()
    sync()
  }
  surface.addEventListener('blur', abortOnBlur, { signal })
  window.addEventListener('blur', abortOnBlur, { signal })
  surface.addEventListener(
    'click',
    (event) => {
      if (event.detail === 0 && !surface.disabled) x.input.focus()
    },
    { signal },
  )
  surface.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && pointer !== undefined) {
        cancelGesture()
        sync()
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      const delta = arrows[event.key]
      const current = selected()
      if (
        !delta ||
        !current ||
        surface.disabled ||
        pointer !== undefined ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return
      event.preventDefault()
      event.stopPropagation()
      const point = position(getEffectiveStyle(current, device)['object-position']) ?? {
        x: 50,
        y: 50,
      }
      const step = event.shiftKey ? 10 : 1
      commitFocus({
        x: Math.min(100, Math.max(0, point.x + delta[0] * step)),
        y: Math.min(100, Math.max(0, point.y + delta[1] * step)),
      })
    },
    { signal },
  )

  function refreshLocale(): void {
    title.textContent = t('title', '圖片構圖')
    ratio.caption.textContent = t('ratio', '裁切比例')
    fit.caption.textContent = t('fit', '圖片適應方式')
    for (const entry of Array.from(fit.input.options).slice(1)) {
      const key = entry.value as keyof typeof fitChoices
      entry.textContent = t(key, fitChoices[key])
    }
    x.caption.textContent = t('x', '水平焦點 (%)')
    y.caption.textContent = t('y', '垂直焦點 (%)')
    surface.setAttribute('aria-label', t('point', '在原圖設定焦點'))
    hint.textContent = t('focus_hint', '點選原圖或輸入百分比調整焦點。')
    missing.textContent = t('unavailable', '無法預覽原圖')
    resetFocus.textContent =
      device === 'desktop' ? t('reset_focus', '清除焦點設定') : t('inherit_focus', '沿用上層焦點')
    resetFrame.textContent =
      device === 'desktop'
        ? t('reset_frame', '清除比例、高度、上下限與適應方式')
        : t('inherit_frame', '沿用上層比例、高度、上下限與適應方式')
    sync()
  }
  refreshLocale()
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'tree' || event.type === 'selection') {
      editing = undefined
      cancelGesture()
      sync()
      return
    }
    if (event.type !== 'patch') return
    if (event.patch.type === 'update') {
      if (
        event.patch.id !== node.id &&
        event.patch.id !== layoutId &&
        event.patch.locked === undefined
      )
        return
      if (
        event.patch.style ||
        event.patch.responsiveStyles ||
        event.patch.locked !== undefined ||
        event.patch.attrs?.src !== undefined ||
        event.patch.removeAttributes?.some((key) => key.toLowerCase() === 'src')
      ) {
        cancelGesture()
        sync()
      }
    } else sync()
  })
  return {
    el,
    refreshLocale,
    destroy() {
      cancelGesture()
      events.abort()
      unsubscribe()
    },
  }
}
