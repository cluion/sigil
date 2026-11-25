import { describe, expect, it, vi } from 'vitest'
import { searchBlocks } from '../src/block-search.js'
import type { BlockDef } from '../src/blocks-panel.js'

const create = vi.fn(() => {
  throw new Error('搜尋不應建立元件')
})

function block(id: string, label: string, category?: string, keywords?: string[]): BlockDef {
  return { id, label, category, keywords, create }
}

describe('區塊搜尋', () => {
  it('可依任意詞序合用名稱、分類、ID 與別名，正規化寬度、大小寫及空白', () => {
    const accordion = block('faq-2026', '折疊式問答', '行銷', ['Workshop'])
    const definitions = [
      block('faq-2025', '折疊式問答', '行銷', ['Workshop']),
      accordion,
      block('faq-2026-flat', '基本問答', '行銷', ['Workshop']),
    ]
    expect(
      searchBlocks(definitions, '  折疊　ｗＯＲＫｓｈｏｐ\t行銷 ＦＡＱ－２０２６ ', '一般'),
    ).toEqual([accordion])
    expect(searchBlocks(definitions, '2026 行銷 workshop 折疊', '一般')).toEqual([accordion])
    expect(searchBlocks(definitions, '2026 行銷 圖片', '一般')).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('優先完整名稱與識別字，接著是名稱前綴、片段與別名，同分使用原順序', () => {
    const alias = block('intro', '活動簡介', '行銷', ['FAQ'])
    const secondAlias = block('terms', '活動說明', '行銷', ['ＦＡＱ'])
    const contains = block('event-qa', '活動 FAQ', '行銷')
    const identifier = block('faq', '折疊問答', '行銷')
    const prefix = block('qa-v2', 'FAQ 第二版', '行銷')
    const exact = block('qa-v1', 'ＦＡＱ', '行銷')
    const definitions = [secondAlias, contains, prefix, alias, identifier, exact]
    expect(searchBlocks(definitions, 'faq', '一般')).toEqual([
      exact,
      identifier,
      prefix,
      contains,
      secondAlias,
      alias,
    ])
    expect(searchBlocks(definitions, '　\t ', '一般')).toEqual(definitions)
    expect(definitions[0]).toBe(secondAlias)
  })

  it('多詞比對時，命中較多名稱詞的區塊優先，未指定分類會使用目前語系的預設分類', () => {
    const byMetadata = block('template-1', '活動模板', undefined, ['FAQ', 'online'])
    const partlyNamed = block('template-2', 'FAQ 區段', undefined, ['online'])
    const named = block('template-3', 'Online 活動 FAQ')
    const definitions = [byMetadata, partlyNamed, named]
    expect(searchBlocks(definitions, 'FAQ general ONLINE', 'General')).toEqual([
      named,
      partlyNamed,
      byMetadata,
    ])
    expect(searchBlocks(definitions, 'FAQ general ONLINE', '一般')).toEqual([])
  })
})
