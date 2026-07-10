import type { ComponentNode } from './types.js'
import { createId } from './id.js'

/**
 * 深找節點 by id
 */
export function findNode(root: ComponentNode, id: string): ComponentNode | null {
  if (root.id === id) return root
  for (const child of root.children ?? []) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

/**
 * 找父節點 by 子 id
 */
export function findParent(root: ComponentNode, id: string): ComponentNode | null {
  for (const child of root.children ?? []) {
    if (child.id === id) return root
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

/**
 * 沿路徑更新目標 id 節點，未變子樹共享
 */
function updateAlongPath(
  root: ComponentNode,
  id: string,
  fn: (n: ComponentNode) => ComponentNode,
): ComponentNode {
  if (root.id === id) return fn(root)
  if (!root.children) return root
  let changed = false
  const next = root.children.map((c) => {
    const updated = updateAlongPath(c, id, fn)
    if (updated !== c) changed = true
    return updated
  })
  return changed ? { ...root, children: next } : root
}

/**
 * 過濾掉指定 id 的節點，未變子樹共享
 */
function filterNode(node: ComponentNode, id: string): ComponentNode {
  if (!node.children) return node
  let changed = false
  const next: ComponentNode[] = []
  for (const c of node.children) {
    if (c.id === id) {
      changed = true
      continue
    }
    const filtered = filterNode(c, id)
    if (filtered !== c) changed = true
    next.push(filtered)
  }
  return changed ? { ...node, children: next } : node
}

/**
 * 不可變插入，回傳新 root
 */
export function insertNode(
  root: ComponentNode,
  parentId: string,
  node: ComponentNode,
  index?: number,
): ComponentNode {
  return updateAlongPath(root, parentId, (n) => {
    const children = n.children ? [...n.children] : []
    children.splice(index ?? children.length, 0, node)
    return { ...n, children }
  })
}

/**
 * 不可變移除，回傳新 root（root 本身不移除）
 */
export function removeNode(root: ComponentNode, id: string): ComponentNode {
  if (root.id === id) return root
  return filterNode(root, id)
}

/**
 * 不可變更新，attributes／style 合併，其餘欄位取代
 */
export function updateNode(
  root: ComponentNode,
  id: string,
  patch: Partial<ComponentNode>,
): ComponentNode {
  return updateAlongPath(root, id, (n) => {
    const next: ComponentNode = { ...n }
    if (patch.type !== undefined) next.type = patch.type
    if (patch.tagName !== undefined) next.tagName = patch.tagName
    if (patch.className !== undefined) next.className = patch.className
    if (patch.content !== undefined) next.content = patch.content
    if (patch.children !== undefined) next.children = patch.children
    if (patch.shortcode !== undefined) next.shortcode = patch.shortcode
    if (patch.attributes) next.attributes = { ...n.attributes, ...patch.attributes }
    if (patch.style) next.style = { ...n.style, ...patch.style }
    return next
  })
}

/**
 * 不可變移動，先移除再插入
 */
export function moveNode(
  root: ComponentNode,
  id: string,
  newParentId: string,
  index?: number,
): ComponentNode {
  const node = findNode(root, id)
  if (!node || node.id === root.id) return root
  const removed = removeNode(root, id)
  return insertNode(removed, newParentId, node, index)
}

/**
 * 深拷貝節點並遞迴產生新 id(copy/paste 用)
 */
export function cloneWithNewIds(
  node: ComponentNode,
  idFactory: () => string = createId,
): ComponentNode {
  const cloned: ComponentNode = { ...node, id: idFactory() }
  if (node.children) {
    cloned.children = node.children.map((c) => cloneWithNewIds(c, idFactory))
  }
  return cloned
}
