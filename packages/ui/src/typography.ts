import {
  findNode,
  type ComponentNode,
  type Engine,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'
import type { DeviceStyleValue } from './style-device.js'

export type TypographyProperty = 'font-size' | 'line-height' | 'font-weight' | 'letter-spacing'
export type AcceptsTypographyValue = (property: TypographyProperty, value: string) => boolean

export const presets = {
  display: {
    'font-size': 'clamp(2rem, 5vw, 4rem)',
    'line-height': '1.1',
    'font-weight': '700',
    'letter-spacing': '-0.035em',
  },
  heading: {
    'font-size': '2rem',
    'line-height': '1.25',
    'font-weight': '600',
    'letter-spacing': '-0.015em',
  },
  body: {
    'font-size': '1rem',
    'line-height': '1.6',
    'font-weight': '400',
    'letter-spacing': 'normal',
  },
  caption: {
    'font-size': '0.875rem',
    'line-height': '1.4',
    'font-weight': '400',
    'letter-spacing': '0.02em',
  },
} satisfies Record<string, Record<TypographyProperty, string>>

const properties = Object.keys(presets.body) as TypographyProperty[]
let probe: CSSStyleDeclaration | undefined

export function validTypography(property: TypographyProperty, value: string): boolean {
  if (/[;<>{}!]/.test(value)) return false
  const tokens = value.replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (tokens.includes('/*')) return false
  let depth = 0
  for (const ch of tokens) {
    if (ch === '(') depth++
    if (ch === ')' && --depth < 0) return false
  }
  if (depth || (property !== 'letter-spacing' && /^-/.test(tokens) && parseFloat(tokens) < 0))
    return false
  if (property === 'font-weight' && Number.isFinite(Number(tokens))) {
    const weight = Number(tokens)
    if (weight < 1 || weight > 1000) return false
  }
  if (tokens.includes('(') && typeof CSS !== 'undefined' && typeof CSS.supports === 'function')
    return CSS.supports(property, value)
  const style = (probe ??= document.createElement('span').style)
  style.cssText = ''
  style.setProperty(property, value)
  return !!style.getPropertyValue(property)
}

export function typographyValues(node: ComponentNode, device: ResponsiveDevice) {
  const result = {} as Record<TypographyProperty, DeviceStyleValue>
  for (const prop of properties)
    result[prop] = { source: null, inherited: false, effective: undefined, override: undefined }
  for (const at of ['desktop', 'tablet', 'mobile'] as const) {
    const layer = at === 'desktop' ? node.style : node.responsiveStyles?.[at]
    for (const [name, value] of Object.entries(layer ?? {})) {
      const key = name.toLowerCase()
      if (key === 'all' || key === 'font') {
        const style = (probe ??= document.createElement('span').style)
        style.cssText = ''
        style.setProperty(key, value)
        if (!style.getPropertyValue(key)) continue
        for (const prop of properties) {
          if (key === 'font' && prop === 'letter-spacing') continue
          const effective = key === 'all' ? value : style.getPropertyValue(prop) || undefined
          result[prop] = { source: at, inherited: at !== device, effective, override: undefined }
        }
      } else if (Object.hasOwn(result, key)) {
        result[key as TypographyProperty] = {
          source: at,
          inherited: at !== device,
          effective: value,
          override: at === device ? value : undefined,
        }
      }
    }
    if (at === device) break
  }
  return result
}

export function sameTypography(
  prop: TypographyProperty,
  current: string | undefined,
  requested: string,
): boolean {
  if (prop === 'font-weight') {
    const weight = (value?: string) =>
      value === 'normal' ? '400' : value === 'bold' ? '700' : value
    return weight(current) === weight(requested)
  }
  return current?.trim().replace(/\s*,\s*/g, ',') === requested.trim().replace(/\s*,\s*/g, ',')
}

export function writeTypography(
  engine: Engine,
  id: string,
  device: ResponsiveDevice,
  values: Partial<Record<TypographyProperty, string>>,
  skipMatching: boolean,
): void {
  if (engine.getSelection() !== id) return
  const node = findNode(engine.getTree(), id)
  if (!node || node.locked) return
  const current = typographyValues(node, device)
  const layer = device === 'desktop' ? node.style : node.responsiveStyles?.[device]
  const keys = Object.keys(layer ?? {})
  const removeFirst: Style = {}
  const patch: Style = {}
  for (const prop of properties) {
    const value = values[prop]
    if (
      value === undefined ||
      (value && skipMatching && sameTypography(prop, current[prop].effective, value))
    )
      continue
    const existing = keys.filter((key) => key.toLowerCase() === prop)
    if (!value) {
      for (const key of existing) patch[key] = ''
      continue
    }
    const key = existing.at(-1) ?? prop
    if (current[prop].override === value) continue
    // Move a declaration past a later font or all shorthand so its new value wins.
    if (
      existing.length &&
      keys
        .slice(keys.indexOf(key) + 1)
        .some(
          (after) =>
            after.toLowerCase() === 'all' ||
            (after.toLowerCase() === 'font' && prop !== 'letter-spacing'),
        )
    )
      removeFirst[key] = ''
    patch[key] = value
  }
  function update(style: Style): void {
    engine.update(id, device === 'desktop' ? { style } : { responsiveStyles: { [device]: style } })
  }
  if (!Object.keys(patch).length) return
  if (!Object.keys(removeFirst).length) return update(patch)
  engine.batch(() => {
    update(removeFirst)
    update(patch)
  })
}
