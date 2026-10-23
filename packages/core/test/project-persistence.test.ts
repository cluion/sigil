import { describe, expect, it, vi } from 'vitest'
import { createEngine, createProjectPersistence, type SigilDoc } from '../src/index.js'

describe('project persistence data boundaries', () => {
  it('isolates state observers from both acknowledged writes and adapter failures', async () => {
    const engine = createEngine()
    const failure = new Error('adapter failure')
    const save = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure)
    const persistence = createProjectPersistence({
      engine,
      store: { load: () => null, save },
      onStateChange: () => {
        throw new Error('observer failure')
      },
    })
    expect(() => engine.update(engine.getTree().id, { name: 'changed' })).not.toThrow()
    await expect(persistence.save()).resolves.toMatchObject({ root: { name: 'changed' } })
    expect(persistence.isSaving()).toBe(false)
    expect(persistence.isDirty()).toBe(false)
    await expect(persistence.save()).rejects.toBe(failure)
    expect(persistence.isSaving()).toBe(false)
    persistence.destroy()
  })

  it('preserves document metadata and stylesheets through editing and persistence', async () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'before' }] },
      meta: { title: 'Campaign', device: 'mobile' },
      stylesheets: [{ id: 'brand', rules: '.brand { color: red; }' }],
    }
    const engine = createEngine({ doc })
    const save = vi.fn()
    const persistence = createProjectPersistence({ engine, store: { load: () => null, save } })
    engine.update('t', { content: 'after' })
    const saved = await persistence.save()
    expect(saved.meta).toEqual(doc.meta)
    expect(saved.stylesheets).toEqual(doc.stylesheets)
    expect(saved.root.children?.[0]?.content).toBe('after')
    engine.undo()
    expect(engine.toJSON()).toEqual(doc)
    persistence.destroy()
  })

  it('isolates mutations by beforeSave, adapter, afterSave and caller from the live tree', async () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'text', content: 'live' } },
    })
    const persistence = createProjectPersistence({
      engine,
      store: {
        load: () => null,
        save: (doc) => {
          doc.root.content = 'adapter mutation'
        },
      },
      hooks: {
        beforeSave: (doc) => {
          doc.root.content = 'transformed'
        },
        afterSave: (doc) => {
          doc.root.content = 'notification mutation'
        },
      },
    })
    const saved = await persistence.save()
    expect(saved.root.content).toBe('transformed')
    saved.root.content = 'caller mutation'
    expect(engine.getTree().content).toBe('live')
    persistence.destroy()
  })
})
