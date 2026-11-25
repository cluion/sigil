import {
  createStylePatch,
  findNode,
  type ComponentNode,
  type Engine,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'

export const boxSides = ['top', 'right', 'bottom', 'left'] as const
export type BoxSide = (typeof boxSides)[number]
export type BoxProperty = 'margin' | 'padding'

interface SideValue {
  value: string
  declaration: string | null
  source: ResponsiveDevice | null
  hasOverride: boolean
  unresolved: boolean
}

function layer(node: ComponentNode, device: ResponsiveDevice): Style | undefined {
  return device === 'desktop' ? node.style : node.responsiveStyles?.[device]
}

let probe: CSSStyleDeclaration | undefined

function parse(property: string, value: string): CSSStyleDeclaration | undefined {
  const style = (probe ??= document.createElement('span').style)
  style.cssText = ''
  style.setProperty(property, value)
  return style.getPropertyValue(property) ? style : undefined
}

function validInput(name: string, value: string): boolean {
  const clean = value.trim()
  if (!clean || /[;{}<>!]/.test(clean)) return false
  const tokens = clean.replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (tokens.includes('/*')) return false
  // 瀏覽器會補齊尚未輸入的右括號，編輯器等輸入完整再套用。
  let depth = 0
  for (const char of tokens) {
    if (char === '(') depth++
    if (char === ')' && --depth < 0) return false
  }
  if (depth !== 0) return false
  if (name.startsWith('padding') && !clean.includes('(')) {
    if (clean.split(/\s+/).some((token) => Number.parseFloat(token) < 0)) return false
  }
  if (parse(name, clean)) return true
  // 某些 CSS 函式可通過語法檢查，但無法由 CSSOM 拆成四邊。
  return clean.includes('(') && typeof CSS !== 'undefined' && CSS.supports(name, clean)
}

export function isBoxSideValue(property: BoxProperty, value: string): boolean {
  return validInput(property + '-top', value)
}

export function isBoxShorthandValue(property: BoxProperty, value: string): boolean {
  return validInput(property, value)
}

function isLogical(key: string, property: BoxProperty): boolean {
  return (
    key.startsWith(property + '-') &&
    /^(?:block|inline)(?:-start|-end)?$/.test(key.slice(property.length + 1))
  )
}

function emptySide(): SideValue {
  return { value: '', declaration: null, source: null, hasOverride: false, unresolved: false }
}

export function readBoxSpacing(
  node: ComponentNode,
  device: ResponsiveDevice,
  property: BoxProperty,
) {
  const sides = { top: emptySide(), right: emptySide(), bottom: emptySide(), left: emptySide() }
  for (const at of ['desktop', 'tablet', 'mobile'] as const) {
    for (const [name, raw] of Object.entries(layer(node, at) ?? {})) {
      const key = name.toLowerCase()
      const value = raw.trim()
      if (!value) continue
      const physical = boxSides.find((side) => key === property + '-' + side)
      if (physical && at === device) sides[physical].hasOverride = true
      if (!physical && key !== property && key !== 'all' && !isLogical(key, property)) continue
      const style = parse(key, value)
      if (!style && !((physical || key === property) && validInput(key, value))) continue
      for (const side of boxSides) {
        if (physical && physical !== side) continue
        // 邏輯邊取決於畫布書寫方向；含變數的簡寫可能展開成不同數量的值。
        let sideValue = ''
        if (physical || key === 'all') sideValue = value
        else if (key === property && !/\b(?:var|env|attr)\(/i.test(value)) {
          sideValue = style?.getPropertyValue(property + '-' + side) ?? ''
        }
        Object.assign(sides[side], {
          value: sideValue,
          declaration: key,
          source: at,
          unresolved: !sideValue,
        })
      }
    }
    if (at === device) break
  }
  return sides
}

function setDeclaration(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  property: BoxProperty,
  side: BoxSide | undefined,
  input: string,
): void {
  const key = side ? property + '-' + side : property
  const value = input.trim()
  if (value && !validInput(key, value)) return
  const node = findNode(engine.getTree(), id)
  if (!node || node.locked) return
  const own = layer(node, device) ?? {}
  const keys = Object.keys(own)
  const same = keys.filter((name) => name.toLowerCase() === key)
  if (!value) {
    if (same.length) {
      const removals = Object.fromEntries(same.map((name) => [name, '']))
      engine.update(
        id,
        device === 'desktop' ? { style: removals } : { responsiveStyles: { [device]: removals } },
      )
    }
    return
  }
  const last = same.at(-1)
  const target = last ?? key
  // 同層既有 key 的位置不會因覆寫而變動；必要時將正在編輯的宣告移到最後。
  const shadowed =
    last !== undefined &&
    keys.slice(keys.indexOf(last) + 1).some((name) => {
      const other = name.toLowerCase()
      return (
        other === 'all' ||
        other === property ||
        isLogical(other, property) ||
        (!side && boxSides.some((direction) => other === property + '-' + direction))
      )
    })
  if (shadowed) {
    engine.batch(() => {
      engine.update(id, createStylePatch(device, target, ''))
      engine.update(id, createStylePatch(device, target, value))
    })
  } else if (own[target] !== value) engine.update(id, createStylePatch(device, target, value))
}

export function setBoxSide(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  property: BoxProperty,
  side: BoxSide,
  value: string,
): void {
  setDeclaration(engine, id, device, property, side, value)
}

export function setBoxShorthand(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  property: BoxProperty,
  value: string,
): void {
  setDeclaration(engine, id, device, property, undefined, value)
}
