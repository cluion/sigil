import { describe, it, expect } from 'vitest'
import { createEngine, updateNode, toHTML } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

describe('layer flags — name / locked / hidden', () => {
  it('updateNode 設定與清除 name／locked／hidden', () => {
    const tree: ComponentNode = { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'x' }] }
    let next = updateNode(tree, 't', { name: '標題', locked: true, hidden: true })
    expect(next.children?.[0]).toMatchObject({ name: '標題', locked: true, hidden: true })
    next = updateNode(next, 't', { name: '', locked: false, hidden: false })
    expect(next.children?.[0]?.name).toBeUndefined()
    expect(next.children?.[0]?.locked).toBeUndefined()
    expect(next.children?.[0]?.hidden).toBeUndefined()
  })

  it('engine 鎖定時拒絕 remove／move／改 content', () => {
    const e = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', content: 'A', locked: true },
            { id: 'b', type: 'text', content: 'B' },
          ],
        },
      },
    })
    e.remove('a')
    expect(e.getTree().children).toHaveLength(2)
    e.move('a', 'r', 1)
    expect(e.getTree().children?.[0]?.id).toBe('a')
    e.update('a', { content: 'Z' })
    expect(e.getTree().children?.[0]?.content).toBe('A')
    // 可解鎖
    e.update('a', { locked: false })
    e.update('a', { content: 'Z' })
    expect(e.getTree().children?.[0]?.content).toBe('Z')
    e.remove('a')
    expect(e.getTree().children).toHaveLength(1)
  })

  it('hidden 匯出 HTML 帶 display:none', () => {
    const html = toHTML({
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        children: [{ id: 't', type: 'text', content: 'hi', hidden: true }],
      },
    })
    expect(html).toContain('display:none')
    expect(html).toContain('hi')
  })

  it('鎖定節點仍可改 name／hidden', () => {
    const e = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'x', locked: true }],
        },
      },
    })
    e.update('t', { name: '別名', hidden: true })
    const n = e.getTree().children?.[0]
    expect(n?.name).toBe('別名')
    expect(n?.hidden).toBe(true)
    expect(n?.locked).toBe(true)
  })
})
