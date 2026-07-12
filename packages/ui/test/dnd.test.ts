import { describe, it, expect, vi } from 'vitest'
import {
  affectsShortcodeSlot,
  contains,
  isMoveIntoSelf,
  autoScrollNearEdge,
} from '../src/dnd.js'
import type { ComponentNode, Patch } from '@cluion/sigil-core'

const tree: ComponentNode = {
  id: 'root',
  type: 'section',
  children: [
    {
      id: 's',
      type: 'shortcode',
      shortcode: { name: 'card', props: {} },
      children: [{ id: 'c', type: 'text', content: 'x' }],
    },
    { id: 't', type: 'text', content: 'y' },
  ],
}

describe('affectsShortcodeSlot', () => {
  it('insert 進 shortcode → true', () => {
    const patch = {
      type: 'insert',
      parentId: 's',
      beforeId: null,
      node: { id: 'n', type: 'text', content: 'y' },
    } as Patch
    expect(affectsShortcodeSlot(patch, tree)).toBe(true)
  })

  it('insert 進 section → false', () => {
    const patch = {
      type: 'insert',
      parentId: 'root',
      beforeId: null,
      node: { id: 'n', type: 'text', content: 'y' },
    } as Patch
    expect(affectsShortcodeSlot(patch, tree)).toBe(false)
  })

  it('remove shortcode 的 child → true', () => {
    expect(affectsShortcodeSlot({ type: 'remove', id: 'c' } as Patch, tree)).toBe(true)
  })

  it('update → false', () => {
    expect(affectsShortcodeSlot({ type: 'update', id: 's' } as Patch, tree)).toBe(false)
  })
})

describe('contains / isMoveIntoSelf', () => {
  it('contains 自身與後代', () => {
    const s = tree.children![0]!
    expect(contains(s, 's')).toBe(true)
    expect(contains(s, 'c')).toBe(true)
    expect(contains(s, 't')).toBe(false)
  })

  it('不可把節點移入自己的子樹', () => {
    expect(isMoveIntoSelf(tree, 's', 's')).toBe(true)
    expect(isMoveIntoSelf(tree, 's', 'c')).toBe(true)
    expect(isMoveIntoSelf(tree, 's', 'root')).toBe(false)
    expect(isMoveIntoSelf(tree, 's', 't')).toBe(false)
    expect(isMoveIntoSelf(tree, 't', 'root')).toBe(false)
  })
})

describe('autoScrollNearEdge', () => {
  it('靠近底邊時 scrollBy 向下', () => {
    const scrollBy = vi.fn()
    const iframe = {
      contentWindow: { scrollBy },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
      }),
    } as unknown as HTMLIFrameElement

    autoScrollNearEdge(iframe, 200, 290)
    expect(scrollBy).toHaveBeenCalled()
    const [dx, dy] = scrollBy.mock.calls[0]!
    expect(dx).toBe(0)
    expect(dy).toBeGreaterThan(0)
  })

  it('在中間不捲動', () => {
    const scrollBy = vi.fn()
    const iframe = {
      contentWindow: { scrollBy },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
      }),
    } as unknown as HTMLIFrameElement

    autoScrollNearEdge(iframe, 200, 150)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('離開 iframe 不捲動', () => {
    const scrollBy = vi.fn()
    const iframe = {
      contentWindow: { scrollBy },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
      }),
    } as unknown as HTMLIFrameElement

    autoScrollNearEdge(iframe, -10, 150)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
