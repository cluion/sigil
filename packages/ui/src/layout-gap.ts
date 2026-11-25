import {
  findNode,
  type ComponentNode,
  type Engine,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'
import { writeLayoutDeclaration } from './layout-declaration.js'

type Axis = 'row' | 'column'
const wideKeyword = /^(?:initial|inherit|unset|revert|revert-layer)$/i
const substitution = /^(?:var|env|attr)\(/i

function layer(node: ComponentNode, device: ResponsiveDevice): Style | undefined {
  return device === 'desktop' ? node.style : node.responsiveStyles?.[device]
}

function property(axis?: Axis): string {
  return axis ? axis + '-gap' : 'gap'
}

function canonical(key: string): string {
  return key.toLowerCase().replace(/^grid-(?=(?:row-|column-)?gap$)/, '')
}

// Only split on whitespace between values, so a calculation remains a single component.
function components(input: string): string[] | undefined {
  const value = input.replace(/\/\*[\s\S]*?\*\//g, ' ').trim()
  if (!value || /[;!{}<>]|\/\*/.test(value)) return
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) return
    else if (!depth && /\s/.test(ch)) {
      if (i > start) parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  if (depth !== 0) return
  parts.push(value.slice(start))
  return parts
}

function validComponent(part: string): boolean {
  if (/^normal$/i.test(part)) return true
  if (/^[a-z-]+\(.+\)$/is.test(part)) return true
  const length = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?$/i.exec(part)
  if (!length || Number(length[1]) < 0) return false
  return !!length[2] || Number(length[1]) === 0
}

function parsed(axis: Axis | undefined, value: string): string[] | undefined {
  const parts = components(value)
  if (!parts || parts.length > (axis ? 1 : 2)) return
  if (!(parts.length === 1 && wideKeyword.test(parts[0]!)) && !parts.every(validComponent)) return
  if (!CSS.supports(property(axis), value)) return
  return parts
}

export function isLayoutGapValue(axis: Axis | undefined, value: string): boolean {
  return !!parsed(axis, value)
}

export function ownLayoutGap(node: ComponentNode, device: ResponsiveDevice, axis?: Axis) {
  const style = layer(node, device)
  const key = Object.keys(style ?? {})
    .filter((name) => canonical(name) === property(axis))
    .at(-1)
  return key === undefined ? undefined : style?.[key]
}

export function readLayoutGap(node: ComponentNode, device: ResponsiveDevice, axis: Axis) {
  let value = ''
  let source: ResponsiveDevice | null = null
  for (const at of ['desktop', 'tablet', 'mobile'] as const) {
    for (const [name, raw] of Object.entries(layer(node, at) ?? {})) {
      const key = canonical(name)
      if (key === 'all') {
        const reset = raw.trim()
        if (wideKeyword.test(reset)) value = reset
        else if (substitution.test(reset) && parsed(undefined, reset)) value = ''
        else continue
      } else if (key === 'gap') {
        const parts = parsed(undefined, raw)
        if (!parts) continue
        // A substituted shorthand may expand to one or two values at computed-value time.
        value = parts.some((part) => substitution.test(part))
          ? ''
          : (parts[axis === 'column' ? 1 : 0] ?? parts[0]!)
      } else if (key === property(axis) && parsed(axis, raw)) value = raw.trim()
      else continue
      source = at
    }
    if (at === device) break
  }
  return { value, source }
}

function write(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  axis: Axis | undefined,
  input: string,
): void {
  const value = input.trim()
  if (value && !isLayoutGapValue(axis, value)) return
  const node = findNode(engine.getTree(), id)
  if (!node || node.locked) return
  writeLayoutDeclaration(
    engine,
    node,
    device,
    property(axis),
    value,
    (after) =>
      after === 'all' ||
      after === 'gap' ||
      (!axis && (after === 'row-gap' || after === 'column-gap')),
    canonical,
  )
}

export function setLayoutGap(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  axis: Axis,
  value: string,
): void {
  write(engine, id, device, axis, value)
}

export function setUniformGap(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  value: string,
): void {
  write(engine, id, device, undefined, value)
}
