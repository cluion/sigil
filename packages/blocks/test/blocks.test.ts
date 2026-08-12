import { describe, it, expect } from 'vitest'
import {
  blockShortcode,
  blockSection,
  blockText,
  defineBlock,
  normalizeBlocks,
  basicBlockDefs,
  basicBlocks,
  templateToBlockDef,
  blockHero,
  heroBlockDef,
  marketingBlockDefs,
} from '../src/index.js'
import { toHTML, type ComponentNode, type TemplateDef } from '@cluion/sigil-core'

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

describe('templateToBlockDef', () => {
  it('產生帶範本 category 的 BlockDef', () => {
    const def = templateToBlockDef({
      id: 'hero',
      label: 'Hero',
      node: blockSection(),
    })
    expect(def.id).toBe('template:hero')
    expect(def.label).toBe('Hero')
    expect(def.category).toBe('範本')
  })

  it('create 每次 clone 帶新 id', () => {
    const tpl: TemplateDef = {
      id: 't1',
      label: 'T',
      node: {
        id: 'orig',
        type: 'section',
        children: [{ id: 'child', type: 'text', content: 'x' }],
      },
    }
    const def = templateToBlockDef(tpl)
    const a = def.create()
    const b = def.create()
    // 每次插入都是新 id，不與原始或其他插入衝突
    expect(a.id).not.toBe('orig')
    expect(b.id).not.toBe('orig')
    expect(a.id).not.toBe(b.id)
    expect(a.children![0]!.id).not.toBe('child')
  })

  it('create 重設 locked／hidden', () => {
    const tpl: TemplateDef = {
      id: 't1',
      label: 'T',
      node: { id: 'orig', type: 'section', locked: true, hidden: true, children: [] },
    }
    const node = templateToBlockDef(tpl).create()
    expect(node.locked).toBeUndefined()
    expect(node.hidden).toBeUndefined()
  })

  it('保留 shortcode props 與響應式樣式', () => {
    const tpl: TemplateDef = {
      id: 't1',
      label: 'T',
      node: {
        id: 'orig',
        type: 'shortcode',
        shortcode: { name: 'counter', props: { step: 2 } },
        responsiveStyles: { tablet: { 'font-size': '14px' } },
      },
    }
    const node = templateToBlockDef(tpl).create()
    expect(node.shortcode).toEqual({ name: 'counter', props: { step: 2 } })
    expect(node.responsiveStyles?.tablet?.['font-size']).toBe('14px')
  })

  it('自訂 category 覆寫預設', () => {
    const def = templateToBlockDef({
      id: 'x',
      label: 'X',
      category: '自訂',
      icon: '★',
      node: blockText(),
    })
    expect(def.category).toBe('自訂')
    expect(def.icon).toBe('★')
  })
})

describe('marketing Hero', () => {
  it('建立可拆解的語意節點樹與產品級預設', () => {
    const hero = blockHero()

    expect(hero.type).toBe('section')
    expect(hero.name).toBe('主視覺')
    expect(hero.attributes).toEqual({ 'aria-label': '主視覺' })
    expect(hero.style).toMatchObject({
      display: 'flex',
      width: '100%',
      'min-height': '34rem',
      background: expect.stringContaining('linear-gradient'),
    })
    expect(hero.responsiveStyles).toMatchObject({
      tablet: { padding: '4.5rem 2rem' },
      mobile: { padding: '3.5rem 1.25rem' },
    })

    expect(hero.children).toHaveLength(4)
    expect(hero.children?.map((node) => node.tagName ?? node.type)).toEqual([
      'span',
      'h1',
      'p',
      'button',
    ])
    expect(hero.children?.map((node) => node.name)).toEqual(['眉標', '主標題', '說明', '主要行動'])
    expect(hero.children?.[3]?.attributes).toEqual({ type: 'button' })
  })

  it('接受文案與 accessibility label 覆寫', () => {
    const hero = blockHero({
      eyebrow: '新功能',
      title: '產品標題',
      description: '產品說明',
      ctaLabel: '免費試用',
      ariaLabel: '產品介紹',
    })

    expect(hero.attributes?.['aria-label']).toBe('產品介紹')
    expect(hero.children?.map((node) => node.content)).toEqual([
      '新功能',
      '產品標題',
      '產品說明',
      '免費試用',
    ])
  })

  it('每次建立整棵 Hero 都使用唯一 id', () => {
    const first = collectIds(blockHero())
    const second = collectIds(blockHero())

    expect(new Set(first).size).toBe(first.length)
    expect(new Set(second).size).toBe(second.length)
    expect(first.some((id) => second.includes(id))).toBe(false)
  })

  it('輸出語意 HTML 與 responsive media rules', () => {
    const html = toHTML({ version: 1, root: blockHero({ title: '安全 Hero' }) })

    expect(html).toContain('<style data-sigil-responsive>')
    expect(html).toContain('@media (max-width:768px)')
    expect(html).toContain('@media (max-width:480px)')
    expect(html).toContain('<section aria-label="主視覺"')
    expect(html).toContain('<h1')
    expect(html).toContain('>安全 Hero</h1>')
    expect(html).toContain('<button type="button"')
  })

  it('公開 Hero definition 與 marketing definitions', () => {
    expect(heroBlockDef).toMatchObject({
      id: 'marketing-hero',
      label: 'Hero 主視覺',
      category: '行銷',
    })
    expect(heroBlockDef.create().type).toBe('section')
    expect(marketingBlockDefs).toEqual([heroBlockDef])
  })
})

function collectIds(node: ComponentNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)]
}
