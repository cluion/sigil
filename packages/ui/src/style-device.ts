import {
  createClearStylePatch,
  createStylePatch,
  findNode,
  getEffectiveStyle,
  getStyleSource,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'

export interface DeviceStyleValue {
  override: string | undefined
  effective: string | undefined
  source: ResponsiveDevice | null
  inherited: boolean
}

export function getDeviceStyleValue(
  node: ComponentNode,
  device: ResponsiveDevice,
  property: string,
): DeviceStyleValue {
  const override =
    device === 'desktop' ? node.style?.[property] : node.responsiveStyles?.[device]?.[property]
  const source = getStyleSource(node, device, property)
  return {
    override,
    effective: getEffectiveStyle(node, device)[property],
    source,
    inherited: device !== 'desktop' && override === undefined && source !== null,
  }
}

export function updateDeviceStyle(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  property: string,
  value: string,
): void {
  if (!findNode(engine.getTree(), id)) return
  engine.update(id, createStylePatch(device, property, value))
}

export function clearDeviceStyles(engine: Engine, id: string, device: ResponsiveDevice): void {
  if (!findNode(engine.getTree(), id)) return
  engine.update(id, createClearStylePatch(device))
}

export function deviceLabel(device: ResponsiveDevice): string {
  if (device === 'desktop') return 'Desktop'
  if (device === 'tablet') return 'Tablet'
  return 'Mobile'
}

export function inheritanceLabel(device: ResponsiveDevice, i18n?: I18n): string {
  if (device === 'desktop') return uiText(i18n, 'style.base', '基礎樣式')
  if (device === 'tablet') return uiText(i18n, 'style.inherit_desktop', '未覆寫時繼承 Desktop')
  return uiText(i18n, 'style.inherit_tablet_desktop', '未覆寫時繼承 Tablet，再繼承 Desktop')
}

type StyleControl = HTMLInputElement | HTMLSelectElement

function sourceText(value: DeviceStyleValue, i18n?: I18n): string {
  if (value.override !== undefined) return uiText(i18n, 'style.override', '覆寫')
  if (value.source) return `${uiText(i18n, 'style.inherit', '繼承')} ${deviceLabel(value.source)}`
  return uiText(i18n, 'style.unset', '未設定')
}

function applyControlMetadata(control: StyleControl, value: DeviceStyleValue, i18n?: I18n): void {
  control.dataset.styleSource = value.source ?? ''
  control.dataset.styleInherited = String(value.inherited)
  control.title = sourceText(value, i18n)
  if (control instanceof HTMLInputElement && control.type !== 'color') {
    const defaultPlaceholder = control.dataset.styleDefaultPlaceholder ?? control.placeholder
    control.dataset.styleDefaultPlaceholder = defaultPlaceholder
    control.placeholder =
      value.inherited && value.effective
        ? `${uiText(i18n, 'style.inherit', '繼承')}${uiText(i18n, 'form.label_separator', '：')}${value.effective}`
        : defaultPlaceholder
  }
}

/** 顯示樣式來源與繼承操作 */
export function decorateStyleControl(
  control: StyleControl,
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  property: string,
  initial: DeviceStyleValue,
  i18n?: I18n,
): HTMLElement {
  applyControlMetadata(control, initial, i18n)
  if (device === 'desktop') return control

  const row = document.createElement('div')
  row.className = 'sigil-style-control-row'
  const source = document.createElement('span')
  source.className = 'sigil-style-source'
  source.dataset.styleSourceLabel = property
  source.textContent = sourceText(initial, i18n)

  const inherit = document.createElement('button')
  inherit.type = 'button'
  inherit.className = 'sigil-btn sigil-btn--ghost sigil-style-inherit'
  inherit.dataset.styleReset = property
  inherit.textContent = uiText(i18n, 'style.use_inheritance', '使用繼承')
  inherit.disabled = initial.override === undefined

  const syncMetadata = (): void => {
    const latest = findNode(engine.getTree(), node.id)
    if (!latest) return
    const value = getDeviceStyleValue(latest, device, property)
    applyControlMetadata(control, value, i18n)
    source.textContent = sourceText(value, i18n)
    inherit.disabled = value.override === undefined
  }
  control.addEventListener('input', syncMetadata)
  control.addEventListener('change', syncMetadata)

  inherit.addEventListener('click', () => {
    updateDeviceStyle(engine, node.id, device, property, '')
    const latest = findNode(engine.getTree(), node.id)
    if (!latest) return
    const value = getDeviceStyleValue(latest, device, property)
    if (control instanceof HTMLInputElement && control.type === 'color') {
      const color = value.effective
      control.value = color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#000000'
    } else {
      control.value = ''
    }
    applyControlMetadata(control, value, i18n)
    source.textContent = sourceText(value, i18n)
    inherit.disabled = true
  })

  row.append(control, source, inherit)
  return row
}
