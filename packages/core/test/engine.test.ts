import { describe, it, expect } from 'vitest'
import { createEngine } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

function findContent(node: ComponentNode, id: string): string | undefined {
  if (node.id === id) return node.content
  for (const c of node.children ?? []) {
    const found = findContent(c, id)
    if (found !== undefined) return found
  }
  return undefined
}

describe('engine commands', () => {
  it('insert 回傳 id 並更新樹', () => {
    const e = createEngine()
    const root = e.getTree()
    const id = e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    expect(id).toBe('a')
    expect(e.getTree().children?.[0]?.id).toBe('a')
  })

  it('update 改 content', () => {
    const e = createEngine()
    const root = e.getTree()
    e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    e.update('a', { content: 'B' })
    expect(findContent(e.getTree(), 'a')).toBe('B')
  })

  it('remove', () => {
    const e = createEngine()
    const root = e.getTree()
    e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    e.remove('a')
    expect(e.getTree().children).toHaveLength(0)
  })
})

describe('undo / redo', () => {
  it('undo 還原，redo 重做', () => {
    const e = createEngine()
    const root = e.getTree()
    e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    expect(e.canUndo()).toBe(true)
    e.undo()
    expect(e.getTree().children).toHaveLength(0)
    expect(e.canRedo()).toBe(true)
    e.redo()
    expect(e.getTree().children?.[0]?.id).toBe('a')
  })

  it('新 command 清空 redo stack', () => {
    const e = createEngine()
    const root = e.getTree()
    e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    e.undo()
    e.insert(root.id, { id: 'b', type: 'text', content: 'B' })
    expect(e.canRedo()).toBe(false)
  })

  it('responsive style update 可 undo／redo 並保留 JSON', () => {
    const e = createEngine({
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', style: { padding: '16px' } },
      },
    })
    e.update('r', { responsiveStyles: { tablet: { padding: '8px' } } })
    expect(e.toJSON().root.responsiveStyles?.tablet?.padding).toBe('8px')
    e.undo()
    expect(e.toJSON().root.responsiveStyles).toBeUndefined()
    e.redo()
    expect(e.toJSON().root.responsiveStyles?.tablet?.padding).toBe('8px')
  })
})

describe('batch — 多 command 一個 undo', () => {
  it('batch 內多 insert，undo 一次退完', () => {
    const e = createEngine()
    const root = e.getTree()
    e.batch(() => {
      e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
      e.insert(root.id, { id: 'b', type: 'text', content: 'B' })
    })
    expect(e.getTree().children).toHaveLength(2)
    e.undo()
    expect(e.getTree().children).toHaveLength(0)
  })
})

describe('subscribe / select', () => {
  it('收 patch 與 selection 事件', () => {
    const e = createEngine()
    const events: string[] = []
    e.subscribe((ev) => events.push(ev.type))
    const root = e.getTree()
    e.insert(root.id, { id: 'a', type: 'text', content: 'A' })
    e.select('a')
    expect(events).toContain('patch')
    expect(events).toContain('selection')
  })

  it('select 不進 undo', () => {
    const e = createEngine()
    e.select('x')
    expect(e.canUndo()).toBe(false)
  })

  it('toJSON 回傳 SigilDoc', () => {
    const e = createEngine()
    const doc = e.toJSON()
    expect(doc.version).toBe(1)
    expect(doc.root).toBe(e.getTree())
  })
})

describe('engine — undo 合併', () => {
  it('連續 content update 合併一 undo step', () => {
    const e = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: '' }] },
      },
    })
    e.update('c', { content: 'a' })
    e.update('c', { content: 'ab' })
    e.update('c', { content: 'abc' })
    e.undo()
    expect(e.getTree().children![0]!.content).toBe('')
  })

  it('不同節點不合併', () => {
    const e = createEngine({
      doc: {
        version: 1 as const,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', content: '' },
            { id: 'b', type: 'text', content: '' },
          ],
        },
      },
    })
    e.update('a', { content: 'x' })
    e.update('b', { content: 'y' })
    e.undo()
    expect(e.getTree().children![1]!.content).toBe('')
    expect(e.getTree().children![0]!.content).toBe('x')
  })

  it('insert 中斷合併', () => {
    const e = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: '' }] },
      },
    })
    e.update('c', { content: 'a' })
    e.insert('r', { id: 'n', type: 'text', content: 'N' })
    e.update('c', { content: 'ab' })
    e.undo()
    expect(e.getTree().children![0]!.content).toBe('a')
  })
})
