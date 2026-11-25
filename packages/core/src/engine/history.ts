import type { ComponentNode, ComponentUpdate } from '../model/types.js'
import type { HistoryEntry, HistoryKind } from './types.js'

function sameValue(a: unknown, b: unknown, ordered = false): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (
    Array.isArray(a) !== Array.isArray(b) ||
    Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)
  )
    return false
  const prototype = Object.getPrototypeOf(a)
  if (!Array.isArray(a) && prototype !== null && prototype !== Object.prototype) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  const other = Object.keys(right)
  return (
    keys.length === other.length &&
    keys.every(
      (key, index) =>
        (ordered ? other[index] === key : Object.hasOwn(right, key)) &&
        sameValue(left[key], right[key]),
    )
  )
}

const empty = {}

/** Compare only changed branches; declaration order can affect CSS shorthand precedence. */
export function sameSnapshot(a: ComponentNode, b: ComponentNode): boolean {
  if (a === b) return true
  for (const key of ['id', 'type', 'tagName', 'className', 'content', 'name'] as const) {
    if (a[key] !== b[key]) return false
  }
  if (
    !!a.hidden !== !!b.hidden ||
    !!a.locked !== !!b.locked ||
    !sameValue(a.attributes ?? empty, b.attributes ?? empty, true) ||
    !sameValue(a.style ?? empty, b.style ?? empty, true) ||
    !sameValue(a.responsiveStyles?.tablet ?? empty, b.responsiveStyles?.tablet ?? empty, true) ||
    !sameValue(a.responsiveStyles?.mobile ?? empty, b.responsiveStyles?.mobile ?? empty, true) ||
    !sameValue(a.shortcode, b.shortcode)
  )
    return false
  if (a.children === b.children) return true
  const length = a.children?.length ?? 0
  if (length !== (b.children?.length ?? 0)) return false
  for (let i = 0; i < length; i++) {
    if (!sameSnapshot(a.children![i]!, b.children![i]!)) return false
  }
  return true
}

export function updateKind(patch: ComponentUpdate): HistoryKind {
  const keys = Object.keys(patch)
  if (keys.every((key) => ['style', 'responsiveStyles', 'className'].includes(key))) return 'style'
  if (keys.length !== 1) return 'update'
  if (patch.content !== undefined) return 'text'
  if (patch.name !== undefined) return 'rename'
  if (patch.hidden !== undefined) return patch.hidden ? 'hide' : 'show'
  if (patch.locked !== undefined) return patch.locked ? 'lock' : 'unlock'
  return 'update'
}

function excerpt(text: string): string {
  const chars: string[] = []
  let space = false
  for (const char of text) {
    if (/\s/u.test(char)) {
      space = chars.length > 0
      continue
    }
    if (space) chars.push(' ')
    space = false
    chars.push(char)
    if (chars.length > 48) return chars.slice(0, 47).join('').trimEnd() + '…'
  }
  return chars.join('')
}

export function describeChange(kind: HistoryKind, node: ComponentNode): Omit<HistoryEntry, 'id'> {
  const entries = node.attributes ? Object.entries(node.attributes) : []
  const label = (name: string) => entries.find(([key]) => key.toLowerCase() === name)?.[1]?.trim()
  const name = node.name?.trim() || label('aria-label') || label('alt')
  const content =
    (!name || kind === 'text') && node.content && !/<\/?[a-z!][^<>]*>/i.test(node.content)
      ? excerpt(node.content)
      : ''
  const target = name ? excerpt(name) : content
  return kind === 'text' && content && content !== target
    ? { kind, target, detail: content }
    : { kind, target }
}
