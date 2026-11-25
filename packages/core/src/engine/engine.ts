import type { ComponentNode } from '../model/types.js'
import { insertNode, removeNode, updateNode, moveNode, findNode, createId } from '../model/index.js'
import { updateAlongPath } from '../model/tree.js'
import type {
  EngineEvent,
  EngineOptions,
  HistoryEngine,
  HistoryEntry,
  HistoryKind,
  Patch,
} from './types.js'
import { describeChange, sameSnapshot, updateKind } from './history.js'

/**
 * 建立 Engine
 *
 * 管理不可變樹 歷史與選取
 */
export function createEngine(opts: EngineOptions = {}): HistoryEngine {
  const idFactory = opts.idFactory ?? createId
  const { root: initialRoot, ...documentFields } = opts.doc ?? {
    version: 1 as const,
    root: { id: idFactory(), type: 'section', children: [] },
  }
  let root: ComponentNode = initialRoot
  let selection: string | null = null
  let suspendedSelection: string | null = null
  const initial: HistoryEntry = Object.freeze({ id: 0, kind: 'initial', target: '' })
  const frames = [{ entry: initial, tree: root }]
  let cursor = 0
  let navigation = 0
  let nextId = 1
  let cachedEntries: readonly HistoryEntry[] | undefined
  const listeners = new Set<(e: EngineEvent) => void>()
  type Change = Omit<HistoryEntry, 'id'>
  type PendingBatch = { change?: Change; targetId?: string | null; multiple: boolean }
  let batch: PendingBatch | null = null
  let lastMerge: { key: string; time: number; before: ComponentNode } | undefined
  const MERGE_MS = 500

  function emit(e: EngineEvent): boolean {
    const startedAt = navigation
    for (const listener of listeners) {
      listener(e)
      // A subscriber can synchronously jump to another tree, superseding this event.
      if (navigation !== startedAt) return false
    }
    return true
  }

  function emitHistory(): boolean {
    return emit({ type: 'history', canUndo: cursor > 0, canRedo: cursor + 1 < frames.length })
  }

  function append(change: Change): void {
    frames.length = cursor + 1
    frames.push({ tree: root, entry: Object.freeze({ id: nextId++, ...change }) })
    cursor++
    cachedEntries = undefined
  }

  function record(
    kind: HistoryKind,
    node: ComponentNode,
    key?: string,
    before?: ComponentNode,
    removedSelection?: string | null,
  ): boolean {
    if (removedSelection != null || !batch?.change) suspendedSelection = removedSelection ?? null
    const change = describeChange(kind, node)
    if (batch) {
      if (!batch.change) {
        batch.change = change
        batch.targetId = node.id
      } else {
        batch.multiple = true
        if (batch.targetId !== node.id) batch.targetId = null
        batch.change =
          batch.targetId && batch.change.kind === kind
            ? change
            : { kind: 'group', target: batch.targetId ? change.target : '' }
      }
      return true
    }
    const now = Date.now()
    if (key && lastMerge?.key === key && now - lastMerge.time < MERGE_MS) {
      if (sameSnapshot(lastMerge.before, node)) {
        frames.pop()
        root = frames[--cursor]!.tree
        cachedEntries = undefined
        lastMerge = undefined
      } else {
        const frame = frames[cursor]!
        frame.tree = root
        if (frame.entry.target !== change.target || frame.entry.detail !== change.detail) {
          frame.entry = Object.freeze({ id: frame.entry.id, ...change })
          cachedEntries = undefined
        }
        lastMerge.time = now
      }
    } else {
      append(change)
      lastMerge = key && before ? { key, time: now, before } : undefined
    }
    return emitHistory()
  }

  function navigate(index: number): boolean {
    if (batch || index === cursor || index < 0 || index >= frames.length) return false
    lastMerge = undefined
    cursor = index
    navigation++
    root = frames[index]!.tree
    const previousSelection = selection
    const candidate = selection ?? suspendedSelection
    const nextSelection = candidate !== null && findNode(root, candidate) ? candidate : null
    // Keep a missing selection only while navigating the same history.
    suspendedSelection = nextSelection === null ? candidate : null
    selection = nextSelection
    if (!emit({ type: 'tree', tree: root })) return true
    if (
      previousSelection !== nextSelection &&
      selection === nextSelection &&
      (nextSelection !== null || suspendedSelection === candidate) &&
      !emit({ type: 'selection', id: nextSelection })
    )
      return true
    emitHistory()
    return true
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
      return { ...documentFields, root }
    },
    getSelection() {
      return selection
    },

    insert(parentId, node, index) {
      const beforeId = beforeIdOf(parentId, index)
      const prev = root
      root = insertNode(root, parentId, node, index)
      if (root === prev) return node.id
      if (!record('insert', node)) return node.id
      emit({ type: 'patch', patch: { type: 'insert', parentId, beforeId, node } })
      return node.id
    },

    remove(id) {
      const node = findNode(root, id)
      if (!node || node.locked || node === root) return
      root = removeNode(root, id)
      const lost = selection !== null && findNode(node, selection) ? selection : null
      if (lost !== null) selection = null
      if (!record('remove', node, undefined, undefined, lost)) return
      if (!emit({ type: 'patch', patch: { type: 'remove', id } })) return
      if (lost && selection === null) emit({ type: 'selection', id: null })
    },

    update(id, patch) {
      const node = findNode(root, id)
      if (!node) return
      if (node.locked) {
        // 鎖定時只允許圖層狀態
        const keys = Object.keys(patch)
        const ok = keys.every((k) => k === 'locked' || k === 'hidden' || k === 'name')
        if (!ok) return
      }
      const tagChanged = patch.tagName !== undefined && patch.tagName !== node.tagName
      if (patch.tagName !== undefined && !tagChanged && Object.keys(patch).length === 1) return
      const replaceChildren = patch.children !== undefined
      const updated = updateNode(node, id, patch)
      if (sameSnapshot(node, updated)) return
      root = updateAlongPath(root, id, (current) =>
        current === node ? updated : updateNode(current, id, patch),
      )
      const keys = Object.keys(patch)
      const field =
        keys.length === 1 && (keys[0] === 'content' || keys[0] === 'className') ? keys[0] : null
      const lostSelection =
        replaceChildren &&
        selection !== null &&
        selection !== id &&
        !!findNode(node, selection) &&
        !findNode(updated, selection)
          ? selection
          : null
      if (lostSelection !== null) selection = null
      if (
        !record(
          updateKind(patch),
          updated,
          field ? id + ':' + field : undefined,
          node,
          lostSelection,
        )
      )
        return
      if (
        replaceChildren ||
        (tagChanged && (node.shortcode || patch.shortcode || patch.type !== undefined))
      ) {
        if (!emit({ type: 'patch', patch: { type: 'replace', id, node: updated } })) return
        if (lostSelection && selection === null) emit({ type: 'selection', id: null })
        return
      }
      const p: Extract<Patch, { type: 'update' }> = { type: 'update', id }
      if (tagChanged) p.tagName = patch.tagName
      if (patch.attributes) p.attrs = patch.attributes
      if (patch.removeAttributes?.length) p.removeAttributes = patch.removeAttributes
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

    updateTextContents(updates) {
      if (!updates.size) return
      const patches: { type: 'update'; id: string; content: string }[] = []
      function visit(node: ComponentNode): ComponentNode {
        if (node.locked || node.shortcode || node.type === 'shortcode' || node.type === 'rich-text')
          return node
        let next = node
        const content = updates.get(node.id)
        if (typeof content === 'string' && content !== (node.content ?? '')) {
          next = { ...node, content }
          patches.push({ type: 'update', id: node.id, content })
        }
        let children: ComponentNode[] | undefined
        node.children?.forEach((child, index) => {
          const changed = visit(child)
          if (changed !== child) {
            children ??= node.children!.slice()
            children[index] = changed
          }
        })
        return children ? { ...next, children } : next
      }
      const previous = root
      const updated = visit(previous)
      if (updated === previous) return
      root = updated
      navigation++
      if (!record('replace-text', updated)) return
      emit(
        root === updated
          ? { type: 'tree', tree: updated, textChanges: { from: previous, patches } }
          : { type: 'tree', tree: root },
      )
    },

    move(id, newParentId, index) {
      const prev = root
      root = moveNode(root, id, newParentId, index)
      if (root === prev) return
      const siblings = findNode(root, newParentId)!.children!
      const position = siblings.findIndex((child) => child.id === id)
      const beforeId = siblings[position + 1]?.id ?? null
      if (!record('move', siblings[position]!)) return
      emit({ type: 'patch', patch: { type: 'move', id, newParentId, beforeId } })
    },

    batch(fn) {
      if (batch) return fn()
      const pending: PendingBatch = { multiple: false }
      lastMerge = undefined
      batch = pending
      try {
        fn()
      } finally {
        batch = null
        if (pending.change) {
          const previous = frames[cursor]!.tree
          if (pending.multiple && sameSnapshot(previous, root)) {
            root = previous
            const restored =
              selection === null &&
              suspendedSelection !== null &&
              findNode(root, suspendedSelection)
                ? suspendedSelection
                : null
            if (restored !== null) {
              selection = restored
              suspendedSelection = null
            }
            // The last patch was observed with a provisional root reference.
            if (emit({ type: 'tree', tree: root }) && restored !== null && selection === restored)
              emit({ type: 'selection', id: restored })
          } else {
            append(pending.change)
            emitHistory()
          }
        }
      }
    },

    select(id) {
      suspendedSelection = null
      selection = id
      emit({ type: 'selection', id })
    },

    undo() {
      navigate(cursor - 1)
    },
    redo() {
      navigate(cursor + 1)
    },
    canUndo() {
      return cursor > 0
    },
    canRedo() {
      return cursor + 1 < frames.length
    },

    getHistory() {
      cachedEntries ??= Object.freeze(frames.map((frame) => frame.entry))
      return { entries: cachedEntries, currentId: frames[cursor]!.entry.id }
    },

    checkpointHistory() {
      if (batch) return
      lastMerge = undefined
      return frames[cursor]!.entry.id
    },

    goToHistory(id) {
      if (!Number.isSafeInteger(id) || batch) return false
      let low = 0,
        high = frames.length - 1
      while (low <= high) {
        const mid = Math.floor((low + high) / 2),
          entryId = frames[mid]!.entry.id
        if (entryId === id) return navigate(mid)
        if (entryId < id) low = mid + 1
        else high = mid - 1
      }
      return false
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
