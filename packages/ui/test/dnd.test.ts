import { describe, it, expect, vi } from 'vitest'
import {
  affectsShortcodeSlot,
  contains,
  isMoveIntoSelf,
  autoScrollNearEdge,
  computeDrop,
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

/**
 * 建 mock iframe：命中指定 id 元素，該元素 rect 可控
 *
 * 座標原點在 iframe 左上角（rect.left=rect.top=0）
 */
function mockIframe(opts: {
  width: number
  height: number
  hitId: string | null
  hitRect: { left: number; top: number; width: number; height: number }
}): HTMLIFrameElement {
  const { width, height, hitId, hitRect } = opts
  const fakeEl = hitId
    ? ({
        getAttribute: (k: string) => (k === 'data-sigil-id' ? hitId : null),
        getBoundingClientRect: () => hitRect,
        closest: () => fakeEl,
      } as unknown as Element)
    : null
  const doc = {
    elementFromPoint: () => fakeEl,
  }
  return {
    contentDocument: doc as unknown as Document,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height, width, height }),
  } as unknown as HTMLIFrameElement
}

describe('computeDrop', () => {
  const dropTree: ComponentNode = {
    id: 'root',
    type: 'section',
    children: [
      { id: 'a', type: 'text', content: 'A' },
      { id: 'box', type: 'section', children: [{ id: 'c', type: 'text', content: 'C' }] },
    ],
  }

  it('命中容器中間 → mode child', () => {
    const iframe = mockIframe({
      width: 400,
      height: 400,
      hitId: 'box',
      hitRect: { left: 0, top: 0, width: 200, height: 200 },
    })
    // 命中 (100,100) = box 中央
    const t = computeDrop(iframe, dropTree, 100, 100)
    expect(t).not.toBeNull()
    expect(t!.mode).toBe('child')
    expect(t!.parentId).toBe('box')
    expect(t!.hitId).toBe('box')
  })

  it('命中容器邊緣 → sibling', () => {
    const iframe = mockIframe({
      width: 400,
      height: 400,
      hitId: 'a',
      hitRect: { left: 0, top: 0, width: 200, height: 100 },
    })
    // relY 接近 0.5（中線），relX 接近 0.02（左邊緣 <0.05）→ onEdge → sibling
    const t = computeDrop(iframe, dropTree, 3, 50)
    expect(t).not.toBeNull()
    expect(t!.mode).toBe('sibling')
  })

  it('超出 iframe rect → null', () => {
    const iframe = mockIframe({
      width: 400,
      height: 400,
      hitId: 'a',
      hitRect: { left: 0, top: 0, width: 100, height: 100 },
    })
    expect(computeDrop(iframe, dropTree, -5, 50)).toBeNull()
    expect(computeDrop(iframe, dropTree, 500, 50)).toBeNull()
  })

  it('命中 root 邊緣 → append 成 root child', () => {
    const iframe = mockIframe({
      width: 400,
      height: 400,
      hitId: 'root',
      hitRect: { left: 0, top: 0, width: 400, height: 400 },
    })
    // relX = 2/400 ≈ 0.005 < 0.05 → onEdge，命中 root 邊緣
    const t = computeDrop(iframe, dropTree, 2, 200)
    expect(t).not.toBeNull()
    expect(t!.parentId).toBe('root')
    // root 邊緣邏輯：一律 append
    expect(t!.index).toBe(dropTree.children!.length)
  })

  it('無命中元素 → null', () => {
    const iframe = mockIframe({
      width: 400,
      height: 400,
      hitId: null,
      hitRect: { left: 0, top: 0, width: 0, height: 0 },
    })
    expect(computeDrop(iframe, dropTree, 100, 100)).toBeNull()
  })
})
