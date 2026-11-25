import type { ComponentNode } from '@cluion/sigil-core'
import { resolveLinkFragment } from './link-fragment.js'

export type LinkKind = 'url' | 'email' | 'tel'

export function attributeKey(node: ComponentNode, name: string): string {
  const attrs = node.attributes
  if (!attrs || Object.hasOwn(attrs, name)) return name
  return Object.keys(attrs).find((key) => key.toLowerCase() === name) ?? name
}

export function attribute(node: ComponentNode | undefined, name: string): string | undefined {
  return node?.attributes?.[attributeKey(node, name)]
}

export function isHiddenTarget(node: ComponentNode): boolean {
  const hidden = attribute(node, 'hidden')
  return !!node.hidden || (hidden !== undefined && hidden.toLowerCase() !== 'until-found')
}

export function linkKind(href: string): LinkKind {
  if (/^mailto:/i.test(href) && validDestination(href)) return 'email'
  if (/^tel:/i.test(href) && validDestination(href)) return 'tel'
  return 'url'
}

export function addressFor(kind: LinkKind, href: string): string {
  if (kind === 'url') return href
  return kind === linkKind(href) ? href.slice(href.indexOf(':') + 1) : ''
}

export function destination(kind: LinkKind, input: string): string | undefined {
  let value = input.trim()
  if (kind === 'tel') {
    const number = value.replace(/^tel:/i, '')
    if (!/^[+\d(). -]+$/.test(number)) return
    value = 'tel:' + number.replace(/[(). -]/g, '')
  } else if (kind === 'email') {
    value = 'mailto:' + value.replace(/^mailto:/i, '')
  } else {
    value = value.replace(/^(mailto|tel):/i, (scheme) => scheme.toLowerCase())
  }
  return validDestination(value) ? value : undefined
}

function validDestination(value: string): boolean {
  if (!value || /[\s\p{Cc}\\<>"']/u.test(value) || /%(?:0[\da-f]|1[\da-f]|7f|5c)/i.test(value))
    return false
  if (value.startsWith('#') || (value.startsWith('/') && !value.startsWith('//'))) return true
  if (/^mailto:/i.test(value)) {
    const [local, domain, ...extra] = value.slice(7).split('@')
    if (
      value.length - 7 > 254 ||
      !local ||
      local.length > 64 ||
      !domain?.includes('.') ||
      extra.length
    )
      return false
    return (
      local.split('.').every((part) => /^[a-z0-9!$%&*+\-=/^_`{|}~]+$/i.test(part)) &&
      domain.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))
    )
  }
  if (/^tel:\+?\d[\d().-]{0,31}$/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export function sectionHref(
  anchor: string,
  hasTarget: (id: string) => boolean,
): string | undefined {
  try {
    const encoded = '#' + encodeURIComponent(anchor).replaceAll("'", '%27')
    if (validDestination(encoded) && resolveLinkFragment(encoded, hasTarget) === anchor)
      return encoded
    const literal = '#' + anchor
    if (validDestination(literal) && resolveLinkFragment(literal, hasTarget) === anchor)
      return literal
  } catch {
    // Unpaired UTF-16 surrogates have no exact URL representation.
  }
}

export function pageTargets(root: ComponentNode, linkId: string) {
  const counts = new Map<string, number>()
  const namedAnchors = new Set<string>()
  const targets: ComponentNode[] = []
  function visit(node: ComponentNode, visible: boolean): void {
    const anchor = attribute(node, 'id')
    if (anchor) counts.set(anchor, (counts.get(anchor) ?? 0) + 1)
    if (node.tagName?.toLowerCase() === 'a') {
      const name = attribute(node, 'name')
      if (name) namedAnchors.add(name)
    }
    const shown = visible && !isHiddenTarget(node)
    if (
      shown &&
      node.id !== linkId &&
      !node.shortcode &&
      (anchor || (node.type === 'section' && node.name?.trim() && !node.locked))
    ) {
      targets.push(node)
    }
    for (const child of node.children ?? []) visit(child, shown)
  }
  visit(root, true)
  return {
    counts,
    hasTarget: (id: string) => counts.has(id) || namedAnchors.has(id),
    targets: targets.filter((node) => {
      const anchor = attribute(node, 'id')
      return !anchor || counts.get(anchor) === 1
    }),
  }
}
