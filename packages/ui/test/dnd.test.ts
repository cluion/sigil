import { describe, it, expect } from 'vitest'
import { affectsShortcodeSlot } from '../src/dnd.js'
import type { ComponentNode, Patch } from '@cluion/sigil-core'

const tree: ComponentNode = {
  id: 'root', type: 'section',
  children: [
    {
      id: 's', type: 'shortcode', shortcode: { name: 'card', props: {} },
      children: [{ id: 'c', type: 'text', content: 'x' }],
    },
  ],
}

describe('affectsShortcodeSlot', () => {
  it('insert 進 shortcode → true', () => {
    const patch = {
      type: 'insert', parentId: 's', beforeId: null,
      node: { id: 'n', type: 'text', content: 'y' },
    } as Patch
    expect(affectsShortcodeSlot(patch, tree)).toBe(true)
  })

  it('insert 進 section → false', () => {
    const patch = {
      type: 'insert', parentId: 'root', beforeId: null,
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
