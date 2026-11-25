import {
  createTypeRegistry,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type ResponsiveDevice,
  type RichTextResolver,
  type TypeRegistry,
} from '@cluion/sigil-core'
import { hasDocumentChildren } from './component-path.js'
import { attribute } from './link-destination.js'

export interface PageTextSearchOptions {
  matchCase?: boolean
  richText?: Pick<RichTextResolver, 'supports'>
  registry?: TypeRegistry
  device?: ResponsiveDevice
}

export interface PageTextMatch {
  nodeId: string
  name: string
  content: string
  /** UTF-16 offsets into the original authored content, suitable for String.slice. */
  start: number
  end: number
  locked: boolean
}

const defaultRegistry = createTypeRegistry()
const nonPageText = new Set(['head', 'datalist', 'canvas', 'audio', 'video', 'object'])

function visitPageText(
  root: ComponentNode,
  options: PageTextSearchOptions,
  visitor: (node: ComponentNode, content: string, locked: boolean) => boolean | void,
): void {
  const registry = options.registry ?? defaultRegistry
  const device = options.device ?? 'desktop'
  function visit(node: ComponentNode, ancestorLocked: boolean, ancestorVisible: boolean): boolean {
    if (
      node.hidden ||
      attribute(node, 'hidden') !== undefined ||
      attribute(node, 'aria-hidden')?.trim().toLowerCase() === 'true' ||
      node.shortcode ||
      node.type === 'shortcode' ||
      node.type === 'rich-text' ||
      options.richText?.supports(node)
    )
      return false
    const tag = (node.tagName ?? registry.get(node.type)?.tagName ?? 'div').toLowerCase()
    if (
      !hasDocumentChildren(tag) ||
      nonPageText.has(tag) ||
      (tag === 'dialog' && attribute(node, 'open') === undefined)
    )
      return false
    let visible = ancestorVisible
    if (node.style || node.responsiveStyles) {
      const style = getEffectiveStyle(node, device)
      let display: string | undefined
      let visibility: string | undefined
      let contentVisibility: string | undefined
      for (const [key, value] of Object.entries(style)) {
        switch (key.toLowerCase()) {
          case 'display':
            display = value.trim().toLowerCase()
            break
          case 'visibility':
            visibility = value.trim().toLowerCase()
            break
          case 'content-visibility':
            contentVisibility = value.trim().toLowerCase()
            break
        }
      }
      if (display === 'none' || contentVisibility === 'hidden') return false
      if (visibility === 'hidden' || visibility === 'collapse') visible = false
      else if (visibility === 'visible' || visibility === 'initial') visible = true
    }
    const locked = ancestorLocked || !!node.locked
    if (visible && node.content && visitor(node, node.content, locked)) return true
    for (const child of node.children ?? []) {
      if (visit(child, locked, visible)) return true
    }
    return false
  }
  visit(root, false, true)
}

function literalPattern(query: string, matchCase: boolean | undefined): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped, matchCase ? 'gu' : 'giu')
}

function textName(node: ComponentNode, content: string): string {
  const label = node.name?.trim() || attribute(node, 'aria-label')?.trim()
  if (label) return label
  const words = content.replace(/\s+/g, ' ').trim()
  return words.replace(/^(.{52}).+$/u, '$1…') || node.tagName || node.type
}

export function searchPageText(
  root: ComponentNode,
  query: string,
  options: PageTextSearchOptions = {},
): PageTextMatch[] {
  const matches: PageTextMatch[] = []
  if (!query) return matches
  const pattern = literalPattern(query, options.matchCase)
  visitPageText(root, options, (node, content, locked) => {
    let name: string | undefined
    for (const found of content.matchAll(pattern)) {
      name ??= textName(node, content)
      matches.push({
        nodeId: node.id,
        name,
        content,
        start: found.index,
        end: found.index + found[0].length,
        locked,
      })
    }
  })
  return matches
}

export function replaceOne(
  engine: Engine,
  query: string,
  replacement: string,
  match: PageTextMatch,
  options: PageTextSearchOptions = {},
): number {
  if (!query) return 0
  const pattern = literalPattern(query, options.matchCase)
  let updated: string | undefined
  visitPageText(engine.getTree(), options, (node, content, locked) => {
    if (node.id !== match.nodeId) return
    if (!locked && content === match.content) {
      for (const found of content.matchAll(pattern)) {
        if (found.index > match.start) break
        if (
          found.index === match.start &&
          found.index + found[0].length === match.end &&
          found[0] !== replacement
        ) {
          updated = content.slice(0, match.start) + replacement + content.slice(match.end)
          break
        }
      }
    }
    return true
  })
  if (updated === undefined) return 0
  const content = updated
  engine.batch(() => engine.update(match.nodeId, { content }))
  return 1
}

export function replaceAll(
  engine: Engine,
  query: string,
  replacement: string,
  options: PageTextSearchOptions = {},
): number {
  if (!query) return 0
  const pattern = literalPattern(query, options.matchCase)
  const updates = new Map<string, string>()
  let count = 0
  visitPageText(engine.getTree(), options, (node, content, locked) => {
    if (locked) return
    const next = content.replace(pattern, (found) => {
      if (found !== replacement) count++
      return replacement
    })
    if (next !== content) updates.set(node.id, next)
  })
  if (updates.size > 1 && engine.updateTextContents) engine.updateTextContents(updates)
  else if (updates.size) {
    engine.batch(() => {
      for (const [id, content] of updates) engine.update(id, { content })
    })
  }
  return count
}
