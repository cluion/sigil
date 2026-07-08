import { describe, it, expect } from 'vitest'
import { insertNode, removeNode, updateNode, moveNode, findNode, findParent } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

const makeTree = (): ComponentNode => ({
  id: 'root',
  type: 'section',
  children: [
    { id: 'a', type: 'text', content: 'A' },
    { id: 'b', type: 'section', children: [{ id: 'b1', type: 'text', content: 'B1' }] },
  ],
})

describe('tree ops — 不可變 + 結構共享', () => {
  it('insert 不改原樹，回傳新樹', () => {
    const tree = makeTree()
    const next = insertNode(tree, 'root', { id: 'c', type: 'text', content: 'C' }, 1)
    expect(tree.children).toHaveLength(2)
    expect(next.children).toHaveLength(3)
    expect(next.children?.[1]?.id).toBe('c')
  })

  it('未變子樹共享', () => {
    const tree = makeTree()
    const next = updateNode(tree, 'a', { content: 'A2' })
    expect(next).not.toBe(tree)
    expect(next.children?.[0]).not.toBe(tree.children?.[0])
    expect(next.children?.[1]).toBe(tree.children?.[1])
  })

  it('remove', () => {
    const next = removeNode(makeTree(), 'a')
    expect(next.children).toHaveLength(1)
    expect(findNode(next, 'a')).toBeNull()
  })

  it('update attributes 合併', () => {
    const tree: ComponentNode = { id: 'x', type: 'image', attributes: { src: 'a', alt: 'old' } }
    const next = updateNode(tree, 'x', { attributes: { alt: 'new' } })
    expect(next.attributes).toEqual({ src: 'a', alt: 'new' })
  })

  it('move 跨 parent', () => {
    const next = moveNode(makeTree(), 'b1', 'root', 0)
    expect(next.children?.[0]?.id).toBe('b1')
    expect(findNode(next, 'b')?.children).toHaveLength(0)
  })

  it('findNode / findParent', () => {
    expect(findNode(makeTree(), 'b1')?.content).toBe('B1')
    expect(findParent(makeTree(), 'b1')?.id).toBe('b')
  })

  it('root 不移除', () => {
    const tree = makeTree()
    expect(removeNode(tree, 'root')).toBe(tree)
  })
})
