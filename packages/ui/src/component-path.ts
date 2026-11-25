import type { ComponentNode } from '@cluion/sigil-core'

const nonDocumentBranches = new Set(
  'area base br col embed hr img input link meta param source track wbr template script style textarea title iframe noscript'.split(
    ' ',
  ),
)

export function documentTag(node: ComponentNode): string {
  return node.tagName?.toLowerCase() ?? (node.type === 'image' ? 'img' : '')
}

/** Children of void elements, template contents and raw text are outside the authored page tree. */
export function hasDocumentChildren(tag: string): boolean {
  return !nonDocumentBranches.has(tag)
}

export function findComponentPath(root: ComponentNode, id: string): ComponentNode[] {
  const path: ComponentNode[] = []
  function visit(node: ComponentNode): boolean {
    path.push(node)
    if (node.id === id) return true
    for (const child of node.children ?? []) {
      if (visit(child)) return true
    }
    path.pop()
    return false
  }
  visit(root)
  return path
}
