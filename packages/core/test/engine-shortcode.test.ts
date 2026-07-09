import { describe, it, expect } from 'vitest'
import { createEngine } from '../src/index.js'
import type { EngineEvent } from '../src/index.js'

describe('engine — shortcode patch', () => {
  it('update shortcode 發 patch 帶 shortcode、樹也更新', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [
            { id: 's1', type: 'shortcode', shortcode: { name: 'counter', props: { count: 0 } } },
          ],
        },
      },
    })
    const seen: EngineEvent[] = []
    engine.subscribe((e) => seen.push(e))
    engine.update('s1', {
      shortcode: { name: 'counter', props: { count: 5 } },
    })
    const ev = seen.find((e) => e.type === 'patch')
    expect(ev?.type).toBe('patch')
    if (ev?.type === 'patch' && ev.patch.type === 'update') {
      expect(ev.patch.shortcode).toEqual({ name: 'counter', props: { count: 5 } })
    }
    const node = engine.getTree().children?.[0]
    expect(node?.shortcode?.props).toEqual({ count: 5 })
  })

  it('update 非 shortcode 欄位時 patch 不帶 shortcode', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [{ id: 't1', type: 'text', content: 'A' }],
        },
      },
    })
    const seen: EngineEvent[] = []
    engine.subscribe((e) => seen.push(e))
    engine.update('t1', { content: 'B' })
    const ev = seen.find((e) => e.type === 'patch')
    if (ev?.type === 'patch' && ev.patch.type === 'update') {
      expect(ev.patch.shortcode).toBeUndefined()
    }
  })
})
