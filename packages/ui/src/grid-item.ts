import {
  createId,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
  type RichTextResolver,
  type Style,
} from '@cluion/sigil-core'
import { findComponentPath } from './component-path.js'
import { isGrid } from './grid-columns.js'
import { isImageLinkLayout } from './image-link.js'
import { subscribeLocale, uiText } from './i18n.js'
import { deviceLabel } from './style-device.js'

const column = 'grid-column'
const start = 'grid-column-start'
const end = 'grid-column-end'
const area = 'grid-area'
const columnProperties = [column, start, end]
const devices = ['desktop', 'tablet', 'mobile'] as const
type Mode = 'auto' | 'full' | 'custom'

function layer(node: ComponentNode, device: ResponsiveDevice) {
  return device === 'desktop' ? node.style : node.responsiveStyles?.[device]
}

// 省略的格線邊界會沿用單一線名，其餘值以 auto 補上。
function omitted(line: string) {
  const name = /^(?:[\w-]|\P{ASCII}|\\.)+$/u.test(line) && !/^(?:-?\d+|auto|span)$/i.test(line)
  return name ? line : 'auto'
}

function placement(node: ComponentNode, device: ResponsiveDevice, skipLocalColumns = false) {
  let from = 'auto'
  let to = 'auto'
  let description = ''
  let source: ResponsiveDevice | undefined
  for (const at of devices) {
    for (const [property, raw] of Object.entries(layer(node, at) ?? {})) {
      if (!raw || (property !== area && !columnProperties.includes(property))) continue
      if (skipLocalColumns && at === device && property !== area) continue
      source = at
      const value = raw.trim()
      if (property === start || property === end) {
        if (property === start) from = value
        else to = value
        description = from + ' / ' + to
      } else {
        description = value
        if (/\b(?:var|env)\(/i.test(value)) {
          from = to = value
        } else {
          const parts = value.split('/').map((part) => part.trim())
          from = property === area ? (parts[1] ?? omitted(parts[0]!)) : parts[0]!
          to = parts[property === area ? 3 : 1] ?? omitted(from)
        }
      }
    }
    if (at === device) break
  }
  const mode: Mode =
    from.toLowerCase() === 'auto' && to.toLowerCase() === 'auto'
      ? 'auto'
      : from === '1' && to === '-1'
        ? 'full'
        : 'custom'
  return { mode, description, source }
}

export function createGridItem(
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  i18n?: I18n,
  richText?: Pick<RichTextResolver, 'supports'>,
) {
  const controller = new AbortController()
  const { signal } = controller
  const el = document.createElement('div')
  el.className = 'sigil-grid-item'
  el.setAttribute('role', 'group')
  const title = document.createElement('h4')
  title.className = 'sigil-grid-title'
  title.id = 'sigil-grid-item-' + createId()
  el.setAttribute('aria-labelledby', title.id)
  const actions = document.createElement('div')
  actions.className = 'sigil-grid-item-actions'
  function button(action: 'auto' | 'full' | 'inherit') {
    const control = document.createElement('button')
    control.type = 'button'
    control.className = 'sigil-btn sigil-btn--ghost'
    control.dataset.gridItem = action
    control.addEventListener('click', () => apply(action), { signal })
    return control
  }
  const auto = button('auto')
  const full = button('full')
  const inherit = button('inherit')
  actions.append(auto, full)
  const custom = document.createElement('small')
  custom.className = 'sigil-grid-item-custom'
  custom.tabIndex = -1
  const source = document.createElement('small')
  source.className = 'sigil-style-source'
  const footer = document.createElement('div')
  footer.className = 'sigil-grid-inheritance'
  footer.append(source, inherit)
  el.append(title, actions, custom)
  if (device !== 'desktop') el.append(footer)

  let path: ComponentNode[] = []
  let gridParentId: string | undefined
  function locate() {
    path = engine.getSelection() === node.id ? findComponentPath(engine.getTree(), node.id) : []
    const selected = path.at(-1)
    const directParent = path.at(-2)
    const wrapped = !!selected && !!directParent && isImageLinkLayout(directParent, selected)
    const parent = wrapped ? path.at(-3) : directParent
    gridParentId = parent?.id
    const current = wrapped ? directParent : selected
    if (
      !current ||
      !parent ||
      parent.shortcode ||
      parent.type === 'shortcode' ||
      parent.type === 'rich-text' ||
      richText?.supports(parent) ||
      !isGrid(getEffectiveStyle(parent, device).display)
    )
      return
    const { display, position } = getEffectiveStyle(current, device)
    if (
      /^(?:none|contents)$/i.test(display?.trim() ?? '') ||
      /^(?:absolute|fixed)$/i.test(position?.trim() ?? '')
    )
      return
    return current
  }

  function refresh() {
    const current = locate()
    el.hidden = !current
    if (!current) return
    const own = layer(current, device)
    const state = placement(current, device)
    const locked = !!current.locked || !!path.at(-1)?.locked
    auto.disabled = full.disabled = locked
    auto.setAttribute('aria-pressed', String(state.mode === 'auto'))
    full.setAttribute('aria-pressed', String(state.mode === 'full'))
    custom.hidden = state.mode !== 'custom'
    custom.textContent = custom.hidden
      ? ''
      : uiText(i18n, 'grid.item_custom', '自訂配置（{value}）').replace(
          '{value}',
          () => state.description,
        )
    inherit.disabled = locked || !columnProperties.some((key) => own?.[key])
    inherit.textContent = own?.[area]
      ? uiText(i18n, 'grid.item_restore_area', '還原區域配置')
      : uiText(i18n, 'grid.item_inherit', '沿用上層配置')
    source.textContent =
      state.source === device
        ? uiText(i18n, 'style.override', '覆寫')
        : state.source
          ? uiText(i18n, 'style.inherit', '繼承') + ' ' + deviceLabel(state.source, i18n)
          : uiText(i18n, 'style.unset', '未設定')
  }

  function apply(action: 'auto' | 'full' | 'inherit') {
    const current = locate()
    if (signal.aborted || !current || current.locked || path.at(-1)?.locked) return
    const itemId = current.id
    if (action !== 'inherit' && placement(current, device).mode === action) return
    const own = layer(current, device) ?? {}
    const changes: Style = {}
    for (const property of columnProperties) {
      if (own[property]) changes[property] = ''
    }
    if (action !== 'inherit' && placement(current, device, true).mode !== action) {
      changes[column] = action === 'full' ? '1 / -1' : 'auto'
    }
    if (!Object.keys(changes).length) return
    const focusedReset = document.activeElement === inherit
    function update(patch: Style) {
      engine.update(
        itemId,
        device === 'desktop' ? { style: patch } : { responsiveStyles: { [device]: patch } },
      )
    }
    const keys = Object.keys(own)
    // 保留 grid-area 所定義的列，並將新的欄宣告放在它之後。
    if (changes[column] && own[column] && keys.indexOf(area) > keys.indexOf(column)) {
      engine.batch(() => {
        update({ [column]: '' })
        update(changes)
      })
    } else update(changes)
    if (focusedReset && inherit.disabled) {
      const selected = actions.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ;(selected ?? custom).focus({ preventScroll: true })
    }
  }

  function refreshLocale() {
    title.textContent = uiText(i18n, 'grid.item_title', '格線項目配置')
    auto.textContent = uiText(i18n, 'grid.item_auto', '自動排列')
    full.textContent = uiText(i18n, 'grid.item_full', '橫跨整列')
    refresh()
  }
  el.addEventListener(
    'keydown',
    (event) => {
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
  refreshLocale()
  const unsubLocale = subscribeLocale(i18n, refreshLocale)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'tree' || event.type === 'selection') return refresh()
    if (event.type !== 'patch') return
    const p = event.patch
    if (p.type === 'update') {
      if (p.id === node.id && (p.style || p.responsiveStyles || p.locked !== undefined)) refresh()
      else if (
        (p.id === path.at(-2)?.id || p.id === gridParentId) &&
        (p.style ||
          p.responsiveStyles ||
          p.shortcode ||
          richText ||
          (node.type === 'image' &&
            (p.locked !== undefined ||
              p.attrs ||
              p.removeAttributes ||
              p.content !== undefined ||
              p.tagName)))
      )
        refresh()
    } else if (node.type === 'image' && path.at(-2)?.tagName?.toLowerCase() === 'a') {
      refresh()
    } else if (p.type === 'insert') {
      if (!path.length && engine.getSelection() === node.id) refresh()
    } else if (path.some((entry) => entry.id === p.id)) refresh()
  })
  return {
    el,
    destroy() {
      controller.abort()
      unsubLocale()
      unsubscribe()
    },
  }
}
