import { describe, expect, it, vi } from 'vitest'
import { createEngine, createRenderer, findNode, type ComponentNode } from '../src/index.js'

function setup() {
  const root: ComponentNode = {
    id: 'root',
    type: 'section',
    children: [
      {
        id: 'group',
        type: 'section',
        children: [
          { id: 'a', type: 'section', children: [{ id: 'leaf', type: 'text', content: 'A' }] },
          { id: 'b', type: 'text' },
          { id: 'c', type: 'text' },
          { id: 'd', type: 'text' },
        ],
      },
      { id: 'custom', type: 'host-panel' },
      { id: 'locked', type: 'section', locked: true, children: [{ id: 'held', type: 'text' }] },
    ],
  }
  const engine = createEngine({ doc: { version: 1, root } })
  const container = document.createElement('div')
  const renderer = createRenderer()
  renderer.mount(root, container)
  engine.subscribe((event) => {
    if (event.type === 'patch') renderer.applyPatch(event.patch)
    if (event.type === 'tree') renderer.reconcile(event.tree)
  })
  const element = (id: string) => container.querySelector<HTMLElement>(`[data-sigil-id="${id}"]`)!
  function expectOrder(parent: string, ids: string[]) {
    expect(findNode(engine.getTree(), parent)?.children?.map((child) => child.id)).toEqual(ids)
    expect(
      Array.from(element(parent).children, (child) => child.getAttribute('data-sigil-id')),
    ).toEqual(ids)
  }
  return { engine, root, element, expectOrder }
}

describe('engine.move 與 renderer', () => {
  it.each([
    ['a', 2, ['b', 'c', 'a', 'd']],
    ['d', 0, ['d', 'a', 'b', 'c']],
    ['a', undefined, ['b', 'c', 'd', 'a']],
    ['a', 99, ['b', 'c', 'd', 'a']],
    ['a', -1, ['b', 'c', 'a', 'd']],
    ['a', 1.8, ['b', 'a', 'c', 'd']],
    ['c', NaN, ['c', 'a', 'b', 'd']],
  ] as const)('%s 移到索引 %s 後，資料與 DOM 順序一致', (id, index, order) => {
    const { engine, root, element, expectOrder } = setup()
    const original = element(id)
    engine.move(id, 'group', index)
    expectOrder('group', [...order])
    expect(element(id)).toBe(original)
    engine.undo()
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
    expectOrder('group', ['a', 'b', 'c', 'd'])
    engine.redo()
    expectOrder('group', [...order])
  })

  it('整棵子樹可移入自訂類型的空容器，保留身分、選取與單步復原', () => {
    const { engine, root, element, expectOrder } = setup()
    const source = element('a')
    const leaf = element('leaf')
    engine.select('leaf')
    engine.move('a', 'custom')
    expectOrder('group', ['b', 'c', 'd'])
    expectOrder('custom', ['a'])
    expect(element('a')).toBe(source)
    expect(element('leaf')).toBe(leaf)
    expect(findNode(engine.getTree(), 'a')).toBe(findNode(root, 'a'))
    expect(engine.getSelection()).toBe('leaf')
    engine.undo()
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expectOrder('custom', ['a'])
    expect(engine.getSelection()).toBe('leaf')
  })

  it('無效與同位置操作保留來源、redo 與選取，也不發出事件', () => {
    const { engine, root } = setup()
    engine.update('b', { name: 'new name' })
    engine.undo()
    engine.select('a')
    const events = vi.fn()
    engine.subscribe(events)
    for (const [source, destination, index] of [
      ['group', 'missing'],
      ['missing', 'group'],
      ['root', 'group'],
      ['a', 'a'],
      ['a', 'leaf'],
      ['locked', 'group'],
      ['a', 'locked'],
      ['held', 'group'],
      ['a', 'group', 0],
      ['d', 'group'],
      ['d', 'group', 90],
      ['d', 'group', 3],
    ] as const) {
      engine.move(source, destination, index)
      expect(engine.getTree()).toBe(root)
    }
    expect(events).not.toHaveBeenCalled()
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(true)
    expect(engine.getSelection()).toBe('a')
  })
})
