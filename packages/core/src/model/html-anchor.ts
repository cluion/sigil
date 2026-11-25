import type { Engine } from '../engine/types.js'
import { decodeFragment, IDREF_ATTRIBUTES, parseLocalFragment } from './html-ids.js'
import { findNode } from './tree.js'
import type { Attrs, ComponentNode, ComponentUpdate } from './types.js'

export interface HtmlAnchorInfo {
  name: string
  fragment: string | null
  /** Number of structured reference attributes, including those shared by duplicate IDs. */
  referenceCount: number
  duplicate: boolean
  locked: boolean
}

export type HtmlAnchorResult =
  | { ok: true }
  | {
      ok: false
      reason: 'missing' | 'locked' | 'invalid' | 'conflict' | 'referenced' | 'locked-reference'
    }

type Reference = {
  node: ComponentNode
  key: string
  value: string
  fragment?: NonNullable<ReturnType<typeof parseLocalFragment>>
}

function attributeKey(attrs: Attrs, name: string): string {
  return Object.hasOwn(attrs, name)
    ? name
    : (Object.keys(attrs).find((key) => key.toLowerCase() === name) ?? name)
}

function indexDocument(root: ComponentNode) {
  const counts = new Map<string, number>()
  const namedAnchors = new Set<string>()
  const references: Reference[] = []
  function visit(node: ComponentNode): void {
    const attrs = node.attributes
    if (attrs) {
      const id = attrs[attributeKey(attrs, 'id')]
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const [key, value] of Object.entries(attrs)) {
        const name = key.toLowerCase()
        if (name === 'href' || name === 'xlink:href') {
          const fragment = parseLocalFragment(value)
          if (fragment?.literal) references.push({ node, key, value, fragment })
        } else if (IDREF_ATTRIBUTES.has(name)) references.push({ node, key, value })
        else if (name === 'name' && node.tagName?.toLowerCase() === 'a') namedAnchors.add(value)
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(root)
  const hasTarget = (id: string) => counts.has(id) || namedAnchors.has(id)
  return { counts, namedAnchors, references, hasTarget }
}

function resolvedId(literal: string, hasTarget: (id: string) => boolean): string {
  return hasTarget(literal) ? literal : decodeFragment(literal)
}

function fragmentFor(name: string, hasTarget: (id: string) => boolean): string | null {
  if (!name || /\p{Surrogate}/u.test(name)) return null
  const encoded = encodeURIComponent(name).replaceAll("'", '%27')
  if (resolvedId(encoded, hasTarget) === name) return '#' + encoded
  if (!/[\s\\<>"']/u.test(name)) {
    const parts = parseLocalFragment('#' + name)
    if (parts && !parts.suffix && resolvedId(parts.literal, hasTarget) === name) return '#' + name
  }
  return null
}

function pointsTo(ref: Reference, name: string, hasTarget: (id: string) => boolean): boolean {
  if (ref.fragment) return resolvedId(ref.fragment.literal, hasTarget) === name
  return ref.value.split(/[\t\n\f\r ]+/).includes(name)
}

/** Inspect the node's authored HTML ID and its structural fragment and HTML ID references. */
export function getHtmlAnchorInfo(root: ComponentNode, nodeId: string): HtmlAnchorInfo | undefined {
  const node = findNode(root, nodeId)
  if (!node || node.shortcode) return
  const attrs = node.attributes ?? {}
  const name = attrs[attributeKey(attrs, 'id')] ?? ''
  const info: HtmlAnchorInfo = {
    name,
    fragment: null,
    referenceCount: 0,
    duplicate: false,
    locked: !!node.locked,
  }
  if (!name) return info
  const { counts, references, hasTarget } = indexDocument(root)
  info.duplicate = (counts.get(name) ?? 0) > 1
  if (!info.duplicate) info.fragment = fragmentFor(name, hasTarget)
  for (const reference of references)
    if (pointsTo(reference, name, hasTarget)) info.referenceCount++
  return info
}

/** Set or clear a native node's HTML ID and update its unambiguous references in one undo step. */
export function renameHtmlAnchor(engine: Engine, nodeId: string, name: string): HtmlAnchorResult {
  const root = engine.getTree()
  const target = findNode(root, nodeId)
  if (!target || target.shortcode) return { ok: false, reason: 'missing' }
  if (target.locked) return { ok: false, reason: 'locked' }
  const attrs = target.attributes ?? {}
  const key = attributeKey(attrs, 'id')
  const previous = attrs[key] ?? ''
  if (previous === name) return { ok: true }
  if (typeof name !== 'string' || /[\s\p{Cc}\p{Surrogate}\\]/u.test(name))
    return { ok: false, reason: 'invalid' }
  const { counts, namedAnchors, references, hasTarget } = indexDocument(root)
  if (name && hasTarget(name)) return { ok: false, reason: 'conflict' }
  const unique = !!previous && counts.get(previous) === 1
  const hasAfter = (id: string) =>
    id === name || (id === previous && unique ? namedAnchors.has(id) : hasTarget(id))
  const fragment = fragmentFor(name, hasAfter)
  if (name && !fragment) return { ok: false, reason: 'conflict' }
  const changes = new Map<string, ComponentUpdate>()
  changes.set(nodeId, name ? { attributes: { [key]: name } } : { removeAttributes: [key] })
  for (const ref of references) {
    const matches = !!previous && pointsTo(ref, previous, hasTarget)
    if (matches && !name) return { ok: false, reason: 'referenced' }
    if (!matches || !unique) {
      if (ref.fragment) {
        const literal = ref.fragment.literal
        const before = resolvedId(literal, hasTarget)
        const after = resolvedId(literal, hasAfter)
        if (
          after === name &&
          ((hasTarget(before) && before !== after) ||
            (!hasTarget(before) && before.toLowerCase() === 'top'))
        )
          return { ok: false, reason: 'conflict' }
      }
      continue
    }
    const value = ref.fragment
      ? ref.fragment.prefix + fragment!.slice(1) + ref.fragment.suffix
      : ref.value.replace(/[^\t\n\f\r ]+/g, (id) => (id === previous ? name : id))
    if (value === ref.value) continue
    if (ref.node.locked) return { ok: false, reason: 'locked-reference' }
    const change = changes.get(ref.node.id) ?? {}
    ;(change.attributes ??= {})[ref.key] = value
    changes.set(ref.node.id, change)
  }
  engine.batch(() => {
    for (const [id, patch] of changes) engine.update(id, patch)
  })
  return { ok: true }
}
