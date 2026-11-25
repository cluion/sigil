import { describe, it, expect } from 'vitest'
import {
  blockShortcode,
  blockSection,
  blockText,
  blockHeading,
  defineBlock,
  normalizeBlocks,
  basicBlockDefs,
  basicBlocks,
  templateToBlockDef,
  blockHero,
  blockPricing,
  blockFAQ,
  blockAccordionFAQ,
  blockFAQItem,
  heroBlockDef,
  pricingBlockDef,
  faqBlockDef,
  accordionFAQBlockDef,
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

  it('標題預設為第二級，每次從區塊庫插入有獨立 ID', () => {
    const standalone = blockHeading('交通資訊', 3)
    const fromRecord = basicBlocks.heading!()
    const fromLibrary = basicBlockDefs.find((block) => block.id === 'heading')!.create()
    expect(standalone).toMatchObject({ type: 'text', tagName: 'h3', content: '交通資訊' })
    for (const heading of [fromRecord, fromLibrary]) {
      expect(heading).toMatchObject({ type: 'text', tagName: 'h2', content: '標題' })
    }
    expect(fromRecord.id).not.toBe(fromLibrary.id)
    expect(() => blockHeading('Title', 7 as 6)).toThrow(RangeError)
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
    expect(fromRecord.find((block) => block.id === 'link')?.create()).toMatchObject({
      type: 'text',
      tagName: 'a',
      attributes: { href: '#' },
    })
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
    expect(marketingBlockDefs).toContain(heroBlockDef)
  })
})

describe('marketing Pricing', () => {
  it('建立三方案語意節點樹與 responsive grid', () => {
    const pricing = blockPricing()
    const list = findByName(pricing, '方案列表')
    const plans = list?.children ?? []

    expect(pricing.type).toBe('section')
    expect(pricing.name).toBe('方案價格')
    expect(pricing.attributes).toEqual({ 'aria-label': '方案價格' })
    expect(pricing.children?.map((node) => node.tagName ?? node.type)).toEqual([
      'span',
      'h2',
      'p',
      'div',
    ])
    expect(list?.style?.['grid-template-columns']).toBe('repeat(3, minmax(0, 1fr))')
    expect(list?.attributes).toEqual({ role: 'list', 'aria-label': '方案列表' })
    expect(list?.responsiveStyles).toMatchObject({
      tablet: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' },
      mobile: { 'grid-template-columns': 'minmax(0, 1fr)' },
    })
    expect(plans.map((node) => node.tagName)).toEqual(['article', 'article', 'article'])
    expect(plans.map((node) => node.name)).toEqual(['入門方案', '專業方案', '企業方案'])
    expect(plans.filter((node) => node.attributes?.['data-featured'] === 'true')).toHaveLength(1)
    expect(findByName(pricing, '專業功能')?.children?.map((node) => node.tagName)).toEqual([
      'li',
      'li',
      'li',
    ])
  })

  it('接受自訂方案且不修改輸入', () => {
    const plans = [
      {
        name: '開發者',
        price: 'NT$300',
        period: '／月',
        description: '開發者方案',
        features: ['兩個網站', 'Email 支援'],
        ctaLabel: '開始使用',
        featured: true,
        badgeLabel: '首選',
      },
    ] as const
    const before = structuredClone(plans)
    const pricing = blockPricing({
      eyebrow: '彈性方案',
      title: '自訂標題',
      description: '自訂說明',
      ariaLabel: '價格比較',
      plans,
    })

    expect(pricing.attributes?.['aria-label']).toBe('價格比較')
    expect(findByName(pricing, '價格眉標')?.content).toBe('彈性方案')
    expect(findByName(pricing, '價格標題')?.content).toBe('自訂標題')
    expect(findByName(pricing, '價格說明')?.content).toBe('自訂說明')
    expect(findByName(pricing, '開發者推薦標記')?.content).toBe('首選')
    expect(findByName(pricing, '開發者金額')?.content).toBe('NT$300')
    expect(findByName(pricing, '開發者週期')?.content).toBe('／月')
    expect(findByName(pricing, '開發者行動')?.content).toBe('開始使用')
    expect(plans).toEqual(before)
  })

  it('每次建立整棵 Pricing 都使用唯一 id', () => {
    const first = collectIds(blockPricing())
    const second = collectIds(blockPricing())

    expect(new Set(first).size).toBe(first.length)
    expect(new Set(second).size).toBe(second.length)
    expect(first.some((id) => second.includes(id))).toBe(false)
  })

  it('輸出安全的語意 HTML 與 responsive media rules', () => {
    const html = toHTML({
      version: 1,
      root: blockPricing({
        title: '<script>bad()</script>',
        plans: [
          {
            name: '<b>方案</b>',
            price: 'NT$1',
            features: ['<img src=x onerror=bad()>'],
            featured: true,
          },
        ],
      }),
    })

    expect(html).toContain('<section aria-label="方案價格"')
    expect(html).toContain(
      '<article role="listitem" aria-label="&lt;b&gt;方案&lt;/b&gt;方案" data-featured="true"',
    )
    expect(html).toContain('<h2')
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;</h2>')
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('✓ &lt;img src=x onerror=bad()&gt;</li>')
    expect(html).toContain('@media (max-width:480px)')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it('公開 Pricing definition 並加入 marketing definitions', () => {
    expect(pricingBlockDef).toMatchObject({
      id: 'marketing-pricing',
      label: 'Pricing 方案價格',
      category: '行銷',
    })
    expect(pricingBlockDef.create().name).toBe('方案價格')
    expect(marketingBlockDefs).toContain(pricingBlockDef)
  })
})

describe('marketing FAQ', () => {
  it('建立六組語意問答與 responsive grid', () => {
    const faq = blockFAQ()
    const list = findByName(faq, '常見問題列表')
    const items = list?.children ?? []

    expect(faq.type).toBe('section')
    expect(faq.name).toBe('常見問題')
    expect(faq.attributes).toEqual({ 'aria-label': '常見問題' })
    expect(faq.children?.map((node) => node.tagName ?? node.type)).toEqual([
      'span',
      'h2',
      'p',
      'dl',
    ])
    expect(list?.attributes).toEqual({ 'aria-label': '常見問題列表' })
    expect(list?.style?.['grid-template-columns']).toBe('repeat(2, minmax(0, 1fr))')
    expect(list?.responsiveStyles).toMatchObject({
      tablet: { 'grid-template-columns': 'minmax(0, 1fr)' },
      mobile: { gap: '1rem' },
    })
    expect(items).toHaveLength(6)
    expect(items.every((node) => node.tagName === 'div')).toBe(true)
    expect(items.every((node) => node.children?.[0]?.tagName === 'dt')).toBe(true)
    expect(items.every((node) => node.children?.[1]?.tagName === 'dd')).toBe(true)
  })

  it('接受自訂問答且不修改輸入', () => {
    const items = [{ question: '如何開始？', answer: '安裝套件後加入區塊定義。' }] as const
    const before = structuredClone(items)
    const faq = blockFAQ({
      eyebrow: '支援中心',
      title: '自訂標題',
      description: '自訂說明',
      ariaLabel: '導入問答',
      items,
    })

    expect(faq.attributes?.['aria-label']).toBe('導入問答')
    expect(findByName(faq, 'FAQ 眉標')?.content).toBe('支援中心')
    expect(findByName(faq, 'FAQ 標題')?.content).toBe('自訂標題')
    expect(findByName(faq, 'FAQ 說明')?.content).toBe('自訂說明')
    expect(findByName(faq, '如何開始？問題')?.content).toBe('如何開始？')
    expect(findByName(faq, '如何開始？答案')?.content).toBe('安裝套件後加入區塊定義。')
    expect(items).toEqual(before)
  })

  it('每次建立整棵 FAQ 都使用唯一 id', () => {
    const first = collectIds(blockFAQ())
    const second = collectIds(blockFAQ())

    expect(new Set(first).size).toBe(first.length)
    expect(new Set(second).size).toBe(second.length)
    expect(first.some((id) => second.includes(id))).toBe(false)
  })

  it('輸出安全的 dl／dt／dd 與 responsive media rules', () => {
    const html = toHTML({
      version: 1,
      root: blockFAQ({
        title: '<script>bad()</script>',
        items: [
          {
            question: '<b>安全嗎？</b>',
            answer: '<img src=x onerror=bad()>',
          },
        ],
      }),
    })

    expect(html).toContain('<section aria-label="常見問題"')
    expect(html).toContain('<dl aria-label="常見問題列表"')
    expect(html).toContain('<dt')
    expect(html).toContain('&lt;b&gt;安全嗎？&lt;/b&gt;</dt>')
    expect(html).toContain('<dd')
    expect(html).toContain('&lt;img src=x onerror=bad()&gt;</dd>')
    expect(html).toContain('@media (max-width:768px)')
    expect(html).toContain('@media (max-width:480px)')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it('公開 FAQ definition 並加入 marketing definitions', () => {
    expect(faqBlockDef).toMatchObject({
      id: 'marketing-faq',
      label: 'FAQ 常見問題',
      category: '行銷',
    })
    expect(faqBlockDef.create().name).toBe('常見問題')
    expect(marketingBlockDefs).toEqual([
      heroBlockDef,
      pricingBlockDef,
      faqBlockDef,
      accordionFAQBlockDef,
    ])
  })
})

describe('折疊式 FAQ', () => {
  it('可從目錄找到，預設三個問答都能直接編輯', () => {
    expect(accordionFAQBlockDef).toMatchObject({
      id: 'marketing-accordion-faq',
      label: '折疊式 FAQ',
      category: '行銷',
      keywords: expect.arrayContaining(['accordion', 'FAQ', '問答']),
    })
    const faq = accordionFAQBlockDef.create()
    expect(faq.attributes).toMatchObject({ 'data-faq-accordion': 'true', 'aria-label': '常見問題' })
    expect(faq.children?.map((node) => node.tagName)).toEqual([
      'h2',
      'details',
      'details',
      'details',
    ])
    const first = faq.children?.[1]
    expect(first?.name).toBe('問答項目')
    expect(first?.children).toMatchObject([
      {
        type: 'text',
        tagName: 'summary',
        name: '問題',
        content: '需要自備工具嗎？',
        style: { 'min-height': '44px' },
      },
      { type: 'text', tagName: 'p', name: '答案', content: '活動現場會提供所需工具與材料。' },
    ])
  })

  it('單題與整組可重複建立，且明確指定空清單可建立空 FAQ', () => {
    const item = { question: '何時開始？', answer: '早上十點。' }
    const first = blockFAQItem(item)
    const second = blockFAQItem(item)
    expect(first.tagName).toBe('details')
    const faq = blockAccordionFAQ({ items: [item, item] })
    const ids = [...collectIds(first), ...collectIds(second), ...collectIds(faq)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(blockAccordionFAQ({ items: [] }).children?.map((node) => node.tagName)).toEqual(['h2'])
  })

  it('輸出可攜的原生展開控制項，保留文案並預設收合', () => {
    const item = { question: '可以帶 <工具> 嗎？', answer: '<b>可以</b>。\n請先登記。' }
    const root = blockAccordionFAQ({
      eyebrow: '工作坊',
      title: '行前準備',
      description: '報到前請確認以下事項。',
      ariaLabel: '工作坊問答',
      items: [item, item],
    })
    const dom = new DOMParser().parseFromString(toHTML({ version: 1, root }), 'text/html')
    const section = dom.querySelector('section[data-faq-accordion="true"]')!
    expect(section.getAttribute('aria-label')).toBe('工作坊問答')
    expect(section.querySelector('span')?.textContent).toBe('工作坊')
    expect(section.querySelector('h2')?.textContent).toBe('行前準備')
    expect(section.querySelector('p')?.textContent).toBe('報到前請確認以下事項。')
    const details = [...section.children].filter((el) => el.localName === 'details')
    expect(details).toHaveLength(2)
    for (const entry of details) {
      expect(entry.hasAttribute('open')).toBe(false)
      expect([...entry.children].map((el) => el.localName)).toEqual(['summary', 'p'])
      expect(entry.firstElementChild?.textContent).toBe(item.question)
      expect(entry.lastElementChild?.textContent).toBe(item.answer)
      expect(entry.querySelector('p')?.style.whiteSpace).toBe('pre-line')
      expect(entry.lastElementChild?.childElementCount).toBe(0)
    }
    expect(dom.querySelector('script, [onclick], [aria-expanded]')).toBeNull()
  })
})

function collectIds(node: ComponentNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)]
}

function findByName(node: ComponentNode, name: string): ComponentNode | null {
  if (node.name === name) return node
  for (const child of node.children ?? []) {
    const found = findByName(child, name)
    if (found) return found
  }
  return null
}
