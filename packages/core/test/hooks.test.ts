import { describe, it, expect, vi } from 'vitest'
import {
  createEngine,
  runBeforeSave,
  runAfterSave,
  runOnSelect,
  runAfterLoad,
  runBeforeDestroy,
} from '../src/index.js'
import type { EditorHooks, SigilDoc } from '../src/index.js'

const baseDoc: SigilDoc = {
  version: 1,
  root: { id: 'r', type: 'section', children: [] },
}

describe('EditorHooks runners', () => {
  it('beforeSave 可改寫 doc', async () => {
    const engine = createEngine({ doc: baseDoc })
    const hooks: EditorHooks = {
      beforeSave: (doc) => ({
        ...doc,
        meta: { title: 't' },
      }),
    }
    const next = await runBeforeSave(hooks, baseDoc, engine)
    expect(next.meta?.title).toBe('t')
  })

  it('beforeSave void 保留原 doc', async () => {
    const engine = createEngine({ doc: baseDoc })
    const hooks: EditorHooks = { beforeSave: () => {} }
    const next = await runBeforeSave(hooks, baseDoc, engine)
    expect(next).toBe(baseDoc)
  })

  it('afterSave／onSelect／afterLoad／beforeDestroy 會呼叫', async () => {
    const engine = createEngine({ doc: baseDoc })
    const afterSave = vi.fn()
    const onSelect = vi.fn()
    const afterLoad = vi.fn()
    const beforeDestroy = vi.fn()
    const hooks: EditorHooks = { afterSave, onSelect, afterLoad, beforeDestroy }
    await runAfterSave(hooks, baseDoc, engine)
    runOnSelect(hooks, 'r', engine)
    runAfterLoad(hooks, baseDoc, engine)
    runBeforeDestroy(hooks, engine)
    expect(afterSave).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('r', { engine })
    expect(afterLoad).toHaveBeenCalled()
    expect(beforeDestroy).toHaveBeenCalled()
  })

  it('onSelect 拋錯不外洩', () => {
    const engine = createEngine({ doc: baseDoc })
    expect(() =>
      runOnSelect(
        {
          onSelect: () => {
            throw new Error('host boom')
          },
        },
        null,
        engine,
      ),
    ).not.toThrow()
  })
})
