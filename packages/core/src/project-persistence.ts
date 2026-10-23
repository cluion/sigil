import type { ProjectStore } from './adapters.js'
import type { Engine } from './engine/types.js'
import type { EditorHooks } from './hooks.js'
import { runBeforeSave, runAfterSave, runOnSaveError } from './hooks.js'
import type { SigilDoc } from './model/types.js'

export interface ProjectPersistence {
  /** Capture this revision now and wait for its serialized write; rejects on failure. */
  save(): Promise<SigilDoc>
  isDirty(): boolean
  isSaving(): boolean
  /** Prevent queued/new writes; an adapter request already sent cannot be cancelled. */
  destroy(): void
}

/** Shared persistence lifecycle for the product shell and SDK. */
export function createProjectPersistence(options: {
  engine: Engine
  store: ProjectStore
  hooks?: EditorHooks
  /** Observer only; exceptions must not change write outcomes or queue accounting. */
  onStateChange?: () => void
}): ProjectPersistence {
  const { engine, store, hooks } = options
  let savedTree = engine.getTree()
  let pending = 0
  let destroyed = false
  let tail: Promise<void> = Promise.resolve()

  function notify(): void {
    if (destroyed) return
    try {
      options.onStateChange?.()
    } catch {
      // State observers cannot turn an acknowledged write into a rejected save.
    }
  }

  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'patch' || event.type === 'tree') notify()
  })

  return {
    async save() {
      if (destroyed) throw new Error('Cannot save a destroyed editor')
      const submittedTree = engine.getTree()
      // Hooks and adapters receive detached data, never mutable engine/history references.
      const snapshot = structuredClone(engine.toJSON())
      pending += 1
      notify()
      const result = tail.then(async () => {
        try {
          if (destroyed) throw new Error('Cannot save a destroyed editor')
          const doc = structuredClone(await runBeforeSave(hooks, snapshot, engine))
          if (destroyed) throw new Error('Cannot save a destroyed editor')
          await store.save(structuredClone(doc))
          if (!destroyed) {
            // Checkpoint the submitted revision, not whatever is currently being edited.
            savedTree = submittedTree
            try {
              await runAfterSave(hooks, structuredClone(doc), engine)
            } catch {
              // A notification failure cannot undo an acknowledged adapter write.
            }
          }
          return doc
        } catch (error) {
          if (!destroyed) await runOnSaveError(hooks, error, snapshot, engine)
          throw error
        } finally {
          pending -= 1
          notify()
        }
      })
      // A failed write must not poison subsequent explicit retries.
      tail = result.then(
        () => {},
        () => {},
      )
      return result
    },
    isDirty: () => engine.getTree() !== savedTree,
    isSaving: () => pending > 0,
    destroy() {
      destroyed = true
      unsubscribe()
    },
  }
}
