import type { ComponentNode } from '../model/types.js'
import { insertNode, removeNode, updateNode, moveNode, findNode, createId } from '../model/index.js'
import type { Engine, EngineEvent, EngineOptions, Patch } from './types.js'

/**
 * 建立 Engine
 *
 * 管理不可變樹 歷史與選取
 */
export function createEngine(opts: EngineOptions = {}): Engine {
  const idFactory = opts.idFactory ?? createId
  let root: ComponentNode = opts.doc?.root ?? { id: idFactory(), type: 'section', children: [] }
  let selection: string | null = null
  const undoStack: ComponentNode[] = []
  const redoStack: ComponentNode[] = []
  const listeners = new Set<(e: EngineEvent) => void>()
  let batching = false
  let batchSnapshot: ComponentNode | null = null
  let lastMergeKey: string | null = null
  let lastMergeTime = 0
  const MERGE_MS = 500

  function emit(e: EngineEvent): void {
    for (const l of listeners) l(e)
  }

  function emitHistory(): void {
    emit({ type: 'history', canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })
  }

  // batch 只記第一個 snapshot
  function pushHistory(prev: ComponentNode): void {
    if (batching) {
      if (batchSnapshot === null) batchSnapshot = prev
      return
    }
    undoStack.push(prev)
    redoStack.length = 0
    lastMergeKey = null
    emitHistory()
  }

  function beforeIdOf(parentId: string, index?: number): string | null {
    if (index === undefined) return null
    const parent = findNode(root, parentId)
    const children = parent?.children ?? []
    return index < children.length ? (children[index]?.id ?? null) : null
  }

  return {
    getTree() {
      return root
    },
    toJSON() {
      return { version: 1 as const, root }
    },
    getSelection() {
      return selection
    },

    insert(parentId, node, index) {
      const beforeId = beforeIdOf(parentId, index)
      const prev = root
      root = insertNode(root, parentId, node, index)
      pushHistory(prev)
      emit({ type: 'patch', patch: { type: 'insert', parentId, beforeId, node } })
      return node.id
    },

    remove(id) {
      const node = findNode(root, id)
      if (node?.locked) return
      const prev = root
      root = removeNode(root, id)
      if (selection === id) selection = null
      pushHistory(prev)
      emit({ type: 'patch', patch: { type: 'remove', id } })
    },

    update(id, patch) {
      const node = findNode(root, id)
      if (node?.locked) {
        // 鎖定時只允許圖層狀態
        const keys = Object.keys(patch) as (keyof ComponentNode)[]
        const ok = keys.every((k) => k === 'locked' || k === 'hidden' || k === 'name')
        if (!ok) return
      }
      const prev = root
      root = updateNode(root, id, patch)
      // 合併同欄位的連續輸入
      const key =
        patch.content !== undefined
          ? `${id}:content`
          : patch.className !== undefined
            ? `${id}:className`
            : null
      const now = Date.now()
      if (key !== null && key === lastMergeKey && now - lastMergeTime < MERGE_MS) {
        // 沿用上一個 undo step
      } else {
        pushHistory(prev)
      }
      lastMergeKey = key
      lastMergeTime = now
      const p: Extract<Patch, { type: 'update' }> = { type: 'update', id }
      if (patch.attributes) p.attrs = patch.attributes
      if (patch.style) p.style = patch.style
      if (patch.responsiveStyles !== undefined) p.responsiveStyles = patch.responsiveStyles
      if (patch.content !== undefined) p.content = patch.content
      if (patch.className !== undefined) p.className = patch.className
      if (patch.shortcode !== undefined) p.shortcode = patch.shortcode
      if (patch.name !== undefined) p.name = patch.name
      if (patch.locked !== undefined) p.locked = patch.locked
      if (patch.hidden !== undefined) p.hidden = patch.hidden
      emit({ type: 'patch', patch: p })
    },

    move(id, newParentId, index) {
      if (findNode(root, id)?.locked) return
      const beforeId = beforeIdOf(newParentId, index)
      const prev = root
      root = moveNode(root, id, newParentId, index)
      pushHistory(prev)
      emit({ type: 'patch', patch: { type: 'move', id, newParentId, beforeId } })
    },

    batch(fn) {
      batching = true
      batchSnapshot = null
      try {
        fn()
      } finally {
        batching = false
        if (batchSnapshot !== null) {
          undoStack.push(batchSnapshot)
          redoStack.length = 0
          emitHistory()
        }
        batchSnapshot = null
      }
    },

    select(id) {
      selection = id
      emit({ type: 'selection', id })
    },

    undo() {
      const prev = undoStack.pop()
      if (prev === undefined) return
      redoStack.push(root)
      root = prev
      emit({ type: 'tree', tree: root })
      emitHistory()
    },

    redo() {
      const next = redoStack.pop()
      if (next === undefined) return
      undoStack.push(root)
      root = next
      emit({ type: 'tree', tree: root })
      emitHistory()
    },

    canUndo() {
      return undoStack.length > 0
    },
    canRedo() {
      return redoStack.length > 0
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    destroy() {
      listeners.clear()
    },
  }
}
