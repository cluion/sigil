import { describe, it, expect } from 'vitest'
import { blockShortcode, blockSection } from '../src/index.js'

describe('blocks', () => {
  it('blockShortcode 產生 shortcode 節點', () => {
    const node = blockShortcode('counter', { count: 0 })
    expect(node.type).toBe('shortcode')
    expect(node.shortcode).toEqual({ name: 'counter', props: { count: 0 } })
    expect(typeof node.id).toBe('string')
  })

  it('blockShortcode 預設空 props', () => {
    const node = blockShortcode('hello')
    expect(node.shortcode?.props).toEqual({})
  })

  it('blockSection 仍正常', () => {
    const node = blockSection()
    expect(node.type).toBe('section')
    expect(node.children).toEqual([])
  })
})
