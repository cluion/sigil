import type { ComponentNode } from './types.js'

const IDREF_ATTRIBUTES = new Set([
  'for',
  'form',
  'list',
  'headers',
  'itemref',
  'popovertarget',
  'commandfor',
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
])

function visitIds(node: ComponentNode, visit: (node: ComponentNode, id: string) => void): void {
  const attributes = node.attributes
  if (attributes) {
    const id =
      attributes.id ?? Object.entries(attributes).find(([key]) => key.toLowerCase() === 'id')?.[1]
    if (id) visit(node, id)
  }
  for (const child of node.children ?? []) visitIds(child, visit)
}

function decodeFragment(value: string): string {
  if (!value.includes('%')) return value
  // Preserve fragment punctuation while using the URL parser's forgiving UTF-8 percent decoder.
  const escaped = value.replaceAll('+', '%2B').replaceAll('&', '%26')
  return new URLSearchParams('id=' + escaped).get('id')!
}

function rewriteFragment(
  value: string,
  targets: Map<string, string>,
  documentIds: Set<string>,
): string {
  const match = /^([\t\n\f\r ]*#)(.*?)(:~:.*|[\t\n\f\r ]*)$/s.exec(value)
  if (!match) return value
  const fragment = match[2]!
  // HTML first tries the serialized fragment, then its UTF-8 percent-decoded form.
  const serialized = new URL('about:blank#' + fragment).hash.slice(1)
  const literal = targets.has(serialized) || documentIds.has(serialized)
  const id = literal ? serialized : decodeFragment(serialized)
  const target = targets.get(id)
  if (!target || target === id) return value
  const renamed = target.startsWith(id)
    ? fragment + target.slice(id.length)
    : literal
      ? target
      : encodeURIComponent(target)
  return match[1] + renamed + match[3]
}

/**
 * Prepare a subtree for insertion without changing its component IDs or the destination.
 * Conflicting HTML IDs receive a copy suffix. References within the subtree follow their target.
 */
export function resolveHtmlIdConflicts(
  node: ComponentNode,
  documentRoot: ComponentNode,
): ComponentNode {
  const incoming = new Map<ComponentNode, string>()
  visitIds(node, (element, id) => incoming.set(element, id))
  if (!incoming.size) return node

  const documentIds = new Set<string>()
  visitIds(documentRoot, (_, id) => documentIds.add(id))
  const used = new Set(documentIds)
  // A literal a%2Fb-copy would steal an encoded link to a/b-copy in the exported HTML.
  const reservedFragments = new Set<string>()
  function reserve(id: string): void {
    reservedFragments.add(id)
    reservedFragments.add(decodeFragment(id))
  }
  for (const id of documentIds) reserve(id)
  for (const id of incoming.values()) reserve(id)
  const nextSuffix = new Map<string, number>()
  const assigned = new Map<ComponentNode, string>()
  const targets = new Map<string, string>()
  for (const [element, id] of incoming) {
    let name = id
    if (used.has(name)) {
      const base = id.replace(/-copy(?:-[1-9]\d*)?$/, '') || id
      let suffix = nextSuffix.get(base) ?? 1
      do {
        name = suffix === 1 ? base + '-copy' : base + '-copy-' + suffix
        suffix++
      } while (reservedFragments.has(name) || reservedFragments.has(decodeFragment(name)))
      nextSuffix.set(base, suffix)
      reserve(name)
      assigned.set(element, name)
    }
    used.add(name)
    // A reference to an already-duplicated source ID follows the first element in tree order.
    if (!targets.has(id)) targets.set(id, name)
  }
  if (!assigned.size) return node

  function rewrite(element: ComponentNode): ComponentNode {
    const copy = { ...element }
    if (element.attributes) {
      const attributes = { ...element.attributes }
      for (const [key, value] of Object.entries(attributes)) {
        const name = key.toLowerCase()
        if (name === 'id') attributes[key] = assigned.get(element) ?? value
        else if (name === 'href' || name === 'xlink:href')
          attributes[key] = rewriteFragment(value, targets, documentIds)
        else if (IDREF_ATTRIBUTES.has(name)) {
          attributes[key] = value.replace(/[^\t\n\f\r ]+/g, (id) => targets.get(id) ?? id)
        }
      }
      copy.attributes = attributes
    }
    if (element.children) copy.children = element.children.map(rewrite)
    return copy
  }
  return rewrite(node)
}
