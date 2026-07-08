import { describe, it, expect } from 'vitest'
import { createRenderer } from '../src/index.js'

describe('renderer — mount', () => {
  it('渲染樹', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      { id: 'root', type: 'section', children: [{ id: 'a', type: 'text', content: 'Hi' }] },
      container,
    )
    expect(container.querySelector('span')?.textContent).toBe('Hi')
  })

  it('type 推導 tagName（image→img）', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        children: [{ id: 'img', type: 'image', attributes: { src: 'x' } }],
      },
      container,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('x')
  })

  it('style 走 setProperty', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      { id: 'root', type: 'section', style: { 'padding-top': '10px' } },
      container,
    )
    expect((container.firstElementChild as HTMLElement).style.paddingTop).toBe('10px')
  })
})

describe('renderer — applyPatch', () => {
  it('insert / update / remove', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'section', children: [] }, container)
    r.applyPatch({
      type: 'insert',
      parentId: 'root',
      beforeId: null,
      node: { id: 'a', type: 'text', content: 'A' },
    })
    expect(container.textContent).toBe('A')
    r.applyPatch({ type: 'update', id: 'a', content: 'B' })
    expect(container.textContent).toBe('B')
    r.applyPatch({ type: 'remove', id: 'a' })
    expect(container.textContent).toBe('')
  })

  it('move 保留元素（跨 parent）', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        children: [
          { id: 'p1', type: 'section', children: [{ id: 'a', type: 'text', content: 'A' }] },
          { id: 'p2', type: 'section', children: [] },
        ],
      },
      container,
    )
    const root = container.firstElementChild as HTMLElement
    const p1 = root.children[0] as HTMLElement
    const p2 = root.children[1] as HTMLElement
    r.applyPatch({ type: 'move', id: 'a', newParentId: 'p2', beforeId: null })
    expect(p1.children.length).toBe(0)
    expect(p2.children.length).toBe(1)
  })
})

describe('renderer — reconcile', () => {
  it('全量重建', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'section', children: [] }, container)
    r.reconcile({
      id: 'root',
      type: 'section',
      children: [{ id: 'a', type: 'text', content: 'X' }],
    })
    expect(container.textContent).toBe('X')
  })
})
