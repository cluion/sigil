import { describe, it, expect } from 'vitest'
import { MemoryTemplateStore, JsonTemplateStore } from '../src/index.js'
import type { TemplateDef, TemplateStore } from '@cluion/sigil-core'

function tpl(id: string, label: string): TemplateDef {
  return { id, label, node: { id: `n-${id}`, type: 'section', children: [] } }
}

describe('MemoryTemplateStore', () => {
  it('list 回傳初始項目', () => {
    const s = new MemoryTemplateStore([tpl('1', 'A')])
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0]!.label).toBe('A')
  })

  it('save 新增項目', () => {
    const s = new MemoryTemplateStore()
    s.save(tpl('1', 'A'))
    expect(s.list()).toHaveLength(1)
    s.save(tpl('2', 'B'))
    expect(s.list()).toHaveLength(2)
  })

  it('save 覆蓋同 id', () => {
    const s = new MemoryTemplateStore([tpl('1', '舊')])
    s.save(tpl('1', '新'))
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0]!.label).toBe('新')
  })

  it('list 回傳副本，外部 mutate 不影響內部', () => {
    const s = new MemoryTemplateStore([tpl('1', 'A')])
    const items = s.list()
    items[0]!.label = '改掉'
    expect(s.list()[0]!.label).toBe('A')
  })

  it('remove 已存在 id 能刪除範本', () => {
    const s = new MemoryTemplateStore([tpl('1', 'A'), tpl('2', 'B')])
    s.remove('1')
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0]!.id).toBe('2')
  })

  it('remove 不存在的 id 不影響現有範本', () => {
    const s = new MemoryTemplateStore([tpl('1', 'A')])
    s.remove('2')
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0]!.label).toBe('A')
  })

  it('TemplateStore remove 支援非同步 adapter', async () => {
    const removed: string[] = []
    const s: TemplateStore = {
      list: async () => [],
      save: async () => undefined,
      remove: async (id) => {
        removed.push(id)
      },
    }

    await s.remove?.('1')
    expect(removed).toEqual(['1'])
  })
})

describe('JsonTemplateStore', () => {
  it('export/import round-trip', () => {
    const s = new JsonTemplateStore([tpl('1', 'A'), tpl('2', 'B')])
    const json = s.exportJSON(s.list())
    const restored = s.importJSON(json)
    expect(restored).toHaveLength(2)
    expect(restored[0]!.label).toBe('A')
  })

  it('繼承 MemoryTemplateStore 的 remove', () => {
    const s = new JsonTemplateStore([tpl('1', 'A'), tpl('2', 'B')])
    s.remove('2')
    expect(s.list().map(({ id }) => id)).toEqual(['1'])
  })
})
