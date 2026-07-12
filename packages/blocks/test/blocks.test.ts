import { describe, it, expect } from 'vitest'
import {
  blockShortcode,
  blockSection,
  defineBlock,
  normalizeBlocks,
  basicBlockDefs,
  basicBlocks,
} from '../src/index.js'

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

  it('defineBlock 保留欄位', () => {
    const def = defineBlock({
      id: 'x',
      label: 'X',
      category: '測試',
      icon: '★',
      keywords: ['x'],
      create: blockSection,
    })
    expect(def.category).toBe('測試')
    expect(def.create().type).toBe('section')
  })

  it('normalizeBlocks 接受 Record 與陣列', () => {
    const fromRecord = normalizeBlocks(basicBlocks)
    expect(fromRecord.length).toBe(5)
    expect(fromRecord[0]!.category).toBe('一般')

    const fromDefs = normalizeBlocks(basicBlockDefs)
    expect(fromDefs.some((d) => d.category === '版面')).toBe(true)
  })
})
