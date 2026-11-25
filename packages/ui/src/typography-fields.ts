import {
  createId,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { bindStyleDraft } from './style-draft.js'
import { decorateStyleControl, type DeviceStyleValue } from './style-device.js'
import {
  presets,
  sameTypography,
  typographyValues,
  validTypography,
  writeTypography,
  type AcceptsTypographyValue,
  type TypographyProperty,
} from './typography.js'

type Preset = keyof typeof presets
const labels = {
  'font-size': '字級',
  'font-weight': '字重',
  'line-height': '行高',
  'letter-spacing': '字距',
}
const presetLabels = { display: '展示標題', heading: '章節標題', body: '內文', caption: '註解' }
const customWeight = '__sigil_custom__'

function option(value: string, label: string) {
  const element = document.createElement('option')
  element.value = value
  element.textContent = label
  return element
}

export function preserveTypographyFocus(container: HTMLElement, id: string | null) {
  const active = container.ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return
  const group = active.closest<HTMLElement>('.sigil-typography-fields')
  if (!group || group.dataset.typographyNode !== id) return
  const property = active.dataset.styleProperty ?? active.dataset.styleReset
  const selector = property
    ? `[data-style-property="${property}"]`
    : active.matches('.sigil-style-custom')
      ? '.sigil-style-custom'
      : '[data-typography-preset]'
  return () => {
    const next = container.querySelector<HTMLElement>('.sigil-typography-fields ' + selector)
    if (next && !next.hidden && !next.matches(':disabled')) next.focus({ preventScroll: true })
    else
      container
        .querySelector<HTMLElement>('[data-style-property="font-weight"]:enabled')
        ?.focus({ preventScroll: true })
  }
}

export function createTypographyFields(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  signal: AbortSignal,
  i18n?: I18n,
  accepts?: AcceptsTypographyValue,
) {
  const el = document.createElement('div')
  el.className = 'sigil-typography-fields'
  el.dataset.typographyNode = node.id
  const t = (key: string, fallback: string) => uiText(i18n, key, fallback)

  function field(
    label: string,
    control: HTMLInputElement | HTMLSelectElement,
    contents: HTMLElement,
  ) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field'
    const caption = document.createElement('label')
    caption.className = 'sigil-field-label'
    caption.htmlFor = control.id = 'sigil-typography-' + createId()
    caption.textContent = label
    control.classList.add('sigil-input')
    wrap.append(caption, contents)
    el.append(wrap)
    return wrap
  }

  const preset = document.createElement('select')
  preset.dataset.typographyPreset = ''
  const custom = option('', t('typography.custom', '自訂'))
  custom.disabled = true
  preset.append(custom)
  const names = Object.keys(presets) as Preset[]
  for (const name of names) {
    const item = option(name, t('typography.' + name, presetLabels[name]))
    item.disabled = !Object.entries(presets[name]).every(
      ([prop, value]) => accepts?.(prop as TypographyProperty, value) !== false,
    )
    preset.append(item)
  }
  field(t('typography.preset', '文字排版預設'), preset, preset)
  const syncFields: ((values: ReturnType<typeof typographyValues>, locked: boolean) => void)[] = []
  const drafts: ReturnType<typeof bindStyleDraft>[] = []
  const initial = typographyValues(node, device)

  function addField(prop: TypographyProperty) {
    const isWeight = prop === 'font-weight'
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'sigil-input'
    input.spellcheck = false
    const select = isWeight ? document.createElement('select') : undefined
    const control = select ?? input
    control.dataset.styleProperty = prop
    const label = t('style.property.' + prop, labels[prop])
    const unset = option('', '')
    if (select) {
      select.append(unset)
      for (const [value, fallback] of [
        ['normal', '一般'],
        ['600', '半粗體'],
        ['bold', '粗體'],
      ] as const) {
        const item = option(value, t('style.option.font-weight.' + value, fallback))
        item.disabled = accepts?.(prop, value) === false
        select.append(item)
      }
      select.append(option(customWeight, t('style.custom_value', '自訂 CSS 值')))
      input.classList.add('sigil-style-custom')
      input.setAttribute('aria-label', t('style.custom_value', '自訂 CSS 值') + ' · ' + label)
    }
    let editing = false
    let previous: string | undefined
    const draft = bindStyleDraft(input, signal, {
      live: prop === 'font-size' || isWeight,
      errorClass: 'sigil-typography-error',
      editable: () => engine.getSelection() === node.id,
      validate(value) {
        if (!validTypography(prop, value)) return t('typography.invalid', '請輸入有效的 CSS 值')
        return accepts?.(prop, value) === false
          ? t('typography.unsupported', '此編輯器無法儲存這個值')
          : ''
      },
      write(value) {
        if (isWeight) previous = value || undefined
        writeTypography(engine, node.id, device, { [prop]: value }, false)
      },
    })
    drafts.push(draft)
    let describe!: (value: DeviceStyleValue) => void
    const row = decorateStyleControl(
      control,
      engine,
      node,
      device,
      prop,
      initial[prop],
      i18n,
      (refresh) => {
        describe = refresh
      },
      signal,
      () => {
        writeTypography(engine, node.id, device, { [prop]: '' }, false)
        control.focus({ preventScroll: true })
      },
    )
    const wrap = field(label, control, row)
    if (select) wrap.append(input)
    draft.appendError(wrap)
    function sync(value: DeviceStyleValue, locked: boolean) {
      control.disabled = input.disabled = locked
      describe(value)
      if (!value.override && !value.inherited && value.effective)
        input.placeholder = value.effective
      if (select) {
        if (value.override !== previous) editing = false
        previous = value.override
        unset.textContent =
          value.effective && value.override === undefined
            ? value.effective
            : t('style.unset_short', '未設')
        const raw = value.override ?? ''
        const match = Array.from(select.options).find((opt) => sameTypography(prop, raw, opt.value))
        const showCustom = editing || (!!raw && !match)
        select.value = showCustom ? customWeight : (match?.value ?? '')
        input.hidden = !showCustom
      }
      draft.sync(value.override ?? '', locked)
    }
    syncFields.push((values, locked) => sync(values[prop], locked))
    select?.addEventListener(
      'change',
      () => {
        if (select.disabled || select.selectedOptions[0]?.disabled) return
        editing = select.value === customWeight
        input.hidden = !editing
        if (editing) input.focus()
        else {
          draft.restore()
          writeTypography(engine, node.id, device, { [prop]: select.value }, false)
        }
      },
      { signal },
    )
  }
  addField('font-size')
  addField('font-weight')
  addField('line-height')
  addField('letter-spacing')
  preset.addEventListener(
    'change',
    () => {
      const name = preset.value as Preset
      if (preset.disabled || !Object.hasOwn(presets, name) || preset.selectedOptions[0]?.disabled)
        return
      for (const draft of drafts) draft.restore()
      writeTypography(engine, node.id, device, presets[name], true)
    },
    { signal },
  )
  function refresh(current: ComponentNode) {
    const values = typographyValues(current, device)
    preset.disabled = !!current.locked
    preset.value =
      names.find((name) =>
        Object.entries(presets[name]).every(([key, requested]) =>
          sameTypography(
            key as TypographyProperty,
            values[key as TypographyProperty].effective,
            requested,
          ),
        ),
      ) ?? ''
    for (const sync of syncFields) sync(values, preset.disabled)
  }
  refresh(node)
  return { el, refresh }
}
