import { describe, it, expect } from 'vitest'
import { isPropVisible, type PropSchema } from '../src/index.js'

describe('isPropVisible / dependsOn', () => {
  const base: PropSchema = { name: 'size', type: 'select' }

  it('無 dependsOn → 可見', () => {
    expect(isPropVisible(base, {})).toBe(true)
  })

  it('eq 嚴格相等', () => {
    const s: PropSchema = {
      ...base,
      dependsOn: { prop: 'color', eq: 'red' },
    }
    expect(isPropVisible(s, { color: 'red' })).toBe(true)
    expect(isPropVisible(s, { color: 'blue' })).toBe(false)
  })

  it('in 落在陣列', () => {
    const s: PropSchema = {
      ...base,
      dependsOn: { prop: 'mode', in: ['a', 'b'] },
    }
    expect(isPropVisible(s, { mode: 'a' })).toBe(true)
    expect(isPropVisible(s, { mode: 'c' })).toBe(false)
  })

  it('僅 prop → truthy', () => {
    const s: PropSchema = {
      ...base,
      dependsOn: { prop: 'enabled' },
    }
    expect(isPropVisible(s, { enabled: true })).toBe(true)
    expect(isPropVisible(s, { enabled: false })).toBe(false)
    expect(isPropVisible(s, { enabled: '' })).toBe(false)
    expect(isPropVisible(s, {})).toBe(false)
  })

  it('PropType 含 date／repeater', () => {
    const date: PropSchema = { name: 'd', type: 'date' }
    const repeater: PropSchema = {
      name: 'items',
      type: 'repeater',
      schema: [{ name: 'label', type: 'text' }],
    }
    expect(isPropVisible(date, {})).toBe(true)
    expect(isPropVisible(repeater, {})).toBe(true)
    // repeater 子結構可描述多欄位
    expect(repeater.schema).toHaveLength(1)
  })

  it('repeater 整體可受 dependsOn 控制', () => {
    const repeater: PropSchema = {
      name: 'items',
      type: 'repeater',
      dependsOn: { prop: 'enabled', eq: true },
      schema: [{ name: 'label', type: 'text' }],
    }
    expect(isPropVisible(repeater, { enabled: true })).toBe(true)
    expect(isPropVisible(repeater, { enabled: false })).toBe(false)
  })
})
