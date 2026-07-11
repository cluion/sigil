import { describe, it, expect } from 'vitest'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { JsonProjectStore } from '../src/index.js'

const sample: SigilDoc = {
  version: 1,
  root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'hi' }] },
}

describe('JsonProjectStore', () => {
  it('implements ProjectStore load/save', () => {
    const store: ProjectStore = new JsonProjectStore()
    expect(store.load()).toBeNull()
    store.save(sample)
    expect(store.load()).toEqual(sample)
  })

  it('exportJSON / importJSON 往返', () => {
    const store = new JsonProjectStore()
    const json = store.exportJSON(sample)
    const doc = store.importJSON(json)
    expect(doc.version).toBe(1)
    expect(doc.root.children?.[0]?.content).toBe('hi')
  })

  it('importJSON 壞資料拋錯', () => {
    const store = new JsonProjectStore()
    expect(() => store.importJSON('{}')).toThrow()
  })
})
