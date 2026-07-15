import {
  createClearStylePatch,
  createStylePatch,
  findNode,
  getEffectiveStyle,
  getStyleSource,
  type ComponentNode,
  type Engine,
  type ResponsiveDevice,
} from '@cluion/sigil-core'

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

export function inheritanceLabel(device: ResponsiveDevice): string {
  if (device === 'desktop') return '基礎樣式'
  if (device === 'tablet') return '未覆寫時繼承 Desktop'
  return '未覆寫時繼承 Tablet，再繼承 Desktop'
}

type StyleControl = HTMLInputElement | HTMLSelectElement

function sourceText(value: DeviceStyleValue): string {
  if (value.override !== undefined) return '覆寫'
  if (value.source) return `繼承 ${deviceLabel(value.source)}`
  return '未設定'
}

function applyControlMetadata(control: StyleControl, value: DeviceStyleValue): void {
  control.dataset.styleSource = value.source ?? ''
  control.dataset.styleInherited = String(value.inherited)
  control.title = sourceText(value)
  if (control instanceof HTMLInputElement && control.type !== 'color') {
    const defaultPlaceholder = control.dataset.styleDefaultPlaceholder ?? control.placeholder
    control.dataset.styleDefaultPlaceholder = defaultPlaceholder
    control.placeholder =
      value.inherited && value.effective ? `繼承：${value.effective}` : defaultPlaceholder
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
): HTMLElement {
  applyControlMetadata(control, initial)
  if (device === 'desktop') return control

  const row = document.createElement('div')
  row.className = 'sigil-style-control-row'
  const source = document.createElement('span')
  source.className = 'sigil-style-source'
  source.dataset.styleSourceLabel = property
  source.textContent = sourceText(initial)

  const inherit = document.createElement('button')
  inherit.type = 'button'
  inherit.className = 'sigil-btn sigil-btn--ghost sigil-style-inherit'
  inherit.dataset.styleReset = property
  inherit.textContent = '使用繼承'
  inherit.disabled = initial.override === undefined

  const syncMetadata = (): void => {
    const latest = findNode(engine.getTree(), node.id)
    if (!latest) return
    const value = getDeviceStyleValue(latest, device, property)
    applyControlMetadata(control, value)
    source.textContent = sourceText(value)
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
    applyControlMetadata(control, value)
    source.textContent = sourceText(value)
    inherit.disabled = true
  })

  row.append(control, source, inherit)
  return row
}
