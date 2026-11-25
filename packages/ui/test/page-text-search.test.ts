import {
  createEngine,
  createTypeRegistry,
  findNode,
  type ComponentNode,
  type EngineEvent,
} from '@cluion/sigil-core'
import { describe, expect, it, vi } from 'vitest'
import { replaceAll, replaceOne, searchPageText } from '../src/page-text-search.js'

function text(id: string, content = '文字', extra: Partial<ComponentNode> = {}): ComponentNode {
  return { id, type: 'text', content, ...extra }
}

function page(...children: ComponentNode[]): ComponentNode {
  return { id: 'root', type: 'section', children }
}

function mount(root: ComponentNode) {
  return createEngine({ doc: { version: 1, root } })
}

describe('頁面文字尋找與取代', () => {
  it('依頁面順序列出每一處原生文字與混合段落開頭，標籤和屬性不參與比對', () => {
    const root = page(
      text('heading', '在台北・台北', { tagName: 'H1', name: '  主標  ' }),
      text('paragraph', '台北', {
        type: 'section',
        tagName: 'P',
        children: [text('bold', '到台北', { tagName: 'strong' })],
      }),
      text('link', '台北票', {
        tagName: 'A',
        attributes: { href: '#台北', 'ARIA-LABEL': '  車票 ' },
      }),
      text('button', '台北站', { type: 'button' }),
      text('column', '台北組', { type: 'column' }),
      text('img', '台北', { type: 'image', attributes: { alt: '台北' } }),
      text('other', '高雄', { name: '台北', attributes: { id: '台北' } }),
    )
    const found = searchPageText(root, '台北')
    expect(found.map(({ nodeId, start, end }) => [nodeId, start, end])).toEqual([
      ['heading', 1, 3],
      ['heading', 4, 6],
      ['paragraph', 0, 2],
      ['bold', 1, 3],
      ['link', 0, 2],
      ['button', 0, 2],
      ['column', 0, 2],
    ])
    expect(found.map((hit) => hit.name)).toEqual([
      '主標',
      '主標',
      '台北',
      '到台北',
      '車票',
      '台北站',
      '台北組',
    ])
    expect(found.every((hit) => hit.content.slice(hit.start, hit.end) === '台北')).toBe(true)
  })

  it('按 literal 搜尋並保留 Unicode 原始位移、空白、不重疊與大小寫選項', () => {
    const root = page(text('one', 'İ 😀KK 𐐨 𐐀 [a.*] [A.*] aaa'))
    const ranges = (query: string, matchCase = false) =>
      searchPageText(root, query, { matchCase }).map((hit) => [hit.start, hit.end])
    expect(ranges('k')).toEqual([
      [4, 5],
      [5, 6],
    ])
    expect(ranges('K', true)).toEqual([[5, 6]])
    expect(ranges('𐐀')).toEqual([
      [7, 9],
      [10, 12],
    ])
    expect(ranges('[a.*]')).toEqual([
      [13, 18],
      [19, 24],
    ])
    expect(ranges('aa')).toEqual([[25, 27]])
    expect(ranges(' ')).toHaveLength(6)
    expect(ranges('')).toEqual([])
  })

  it('排除 hidden、非畫布標籤與 adapter 分支，鎖定由祖先繼承', () => {
    const group = (id: string, overrides: Partial<ComponentNode> = {}) =>
      text(id, '文字', { children: [text(id + '-child')], ...overrides })
    const root = page(
      group('hidden', { hidden: true }),
      group('html', { attributes: { HIDDEN: 'until-found' } }),
      group('aria', { attributes: { 'ARIA-hidden': ' TRUE ' } }),
      group('void', { type: 'custom' }),
      group('template', { tagName: 'Template' }),
      group('code', { tagName: 'script' }),
      group('dialog', { tagName: 'dialog' }),
      group('shortcode', { type: 'shortcode' }),
      group('managed', { shortcode: { name: 'list', props: {} } }),
      group('rich', { type: 'rich-text' }),
      group('resolver'),
      group('locked', { locked: true }),
      group('faq', { tagName: 'details' }),
      group('open', { tagName: 'dialog', attributes: { OPEN: '' } }),
    )
    const supports = vi.fn((node: ComponentNode) => node.id === 'resolver')
    const options = {
      registry: createTypeRegistry({ custom: { tagName: 'input' } }),
      richText: { supports },
    }
    expect(
      searchPageText(root, '文字', options).map(({ nodeId, locked }) => [nodeId, locked]),
    ).toEqual([
      ['locked', true],
      ['locked-child', true],
      ['faq', false],
      ['faq-child', false],
      ['open', false],
      ['open-child', false],
    ])
    expect(supports.mock.calls.flat().map((node) => node.id)).not.toContain('resolver-child')
    const engine = mount(root)
    expect(replaceAll(engine, '文字', '新', options)).toBe(4)
    expect(findNode(engine.getTree(), 'resolver')).toBe(findNode(root, 'resolver'))
    expect(findNode(engine.getTree(), 'locked')).toBe(findNode(root, 'locked'))
  })

  it('依裝置樣式排除不可見內容，同時容許子元件明確恢復 visibility', () => {
    const root = page(
      text('responsive', '文字', {
        responsiveStyles: { tablet: { display: 'none' }, mobile: { DISPLAY: 'block' } },
        children: [text('child', '文字', { style: { visibility: 'visible' } })],
      }),
      text('invisible', '文字', {
        style: { visibility: 'hidden' },
        children: [text('inherited'), text('shown', '文字', { style: { visibility: 'visible' } })],
      }),
      text('skipped', '文字', {
        style: { 'content-visibility': 'hidden' },
        children: [text('skipped-child')],
      }),
    )
    const ids = (device: 'desktop' | 'tablet' | 'mobile') =>
      searchPageText(root, '文字', { device }).map((hit) => hit.nodeId)
    expect(ids('desktop')).toEqual(['responsive', 'child', 'shown'])
    expect(ids('tablet')).toEqual(['shown'])
    expect(ids('mobile')).toEqual(['responsive', 'child', 'shown'])
  })

  it('可選第二處、清空或填入含 $ 的文字，更新父段落保留內嵌連結身分', () => {
    const child = text('link', '字', { tagName: 'a', attributes: { href: '/字' } })
    const root = page(text('p', '字字字', { tagName: 'p', children: [child] }))
    const engine = mount(root)
    engine.select('p')
    const second = searchPageText(root, '字')[1]!
    expect(replaceOne(engine, '字', '$&', second)).toBe(1)
    expect(findNode(engine.getTree(), 'p')?.content).toBe('字$&字')
    expect(findNode(engine.getTree(), 'link')).toBe(child)
    expect(replaceOne(engine, '字', '', second)).toBe(0)
    engine.undo()
    expect(engine.getTree()).toBe(root)
    expect(replaceOne(engine, '字', '', second)).toBe(1)
    expect(findNode(engine.getTree(), 'p')?.content).toBe('字字')
    expect(engine.getSelection()).toBe('p')
  })

  it('只套用仍然符合的原始範圍，執行當下重查祖先鎖定、可見性和 resolver', () => {
    const engine = mount(page(text('target', 'aaa')))
    const hit = searchPageText(engine.getTree(), 'aa')[0]!
    expect(replaceOne(engine, 'aa', 'x', { ...hit, start: 1, end: 3 })).toBe(0)
    expect(replaceOne(engine, 'AA', 'x', hit, { matchCase: true })).toBe(0)
    engine.update('target', { content: 'aaaa' })
    expect(replaceOne(engine, 'aa', 'x', hit)).toBe(0)
    engine.undo()
    engine.update('root', { locked: true })
    expect(replaceOne(engine, 'aa', 'x', hit)).toBe(0)
    engine.undo()
    engine.update('root', { hidden: true })
    expect(replaceOne(engine, 'aa', 'x', hit)).toBe(0)
    engine.undo()
    expect(
      replaceOne(engine, 'aa', 'x', hit, { richText: { supports: (n) => n.id === 'root' } }),
    ).toBe(0)
    expect(engine.canUndo()).toBe(false)
  })

  it.each(['bulk', '舊版 Engine'])(
    '%s 大小寫取代與刪除按實際改變計數，一步復原並保留未變分支',
    (mode) => {
      const protectedNode = text('protected', 'GO', { locked: true })
      const link = text('link', 'gO go', { tagName: 'a', attributes: { href: '/go' } })
      const root = page(text('first', 'go GOgo'), link, protectedNode)
      const engine = mount(root)
      const api = mode === 'bulk' ? engine : { ...engine, updateTextContents: undefined }
      const events: EngineEvent[] = []
      engine.subscribe((event) => events.push(event))
      engine.select('link')
      expect(replaceAll(api, 'go', 'go')).toBe(2)
      expect(engine.getHistory().entries).toHaveLength(2)
      expect(findNode(engine.getTree(), 'link')?.attributes).toBe(link.attributes)
      expect(findNode(engine.getTree(), 'protected')).toBe(protectedNode)
      expect(replaceAll(api, 'go', 'go')).toBe(0)
      expect(replaceAll(api, '', 'new')).toBe(0)
      expect(engine.getHistory().entries).toHaveLength(2)
      expect(replaceAll(api, 'go', '$&gO')).toBe(5)
      expect(findNode(engine.getTree(), 'first')?.content).toBe('$&gO $&gO$&gO')
      expect(replaceAll(api, '$&go', '')).toBe(5)
      expect(findNode(engine.getTree(), 'link')?.content).toBe(' ')
      engine.undo()
      expect(findNode(engine.getTree(), 'link')?.content).toBe('$&gO $&gO')
      engine.undo()
      engine.undo()
      expect(engine.getTree()).toBe(root)
      expect(engine.getSelection()).toBe('link')
      engine.redo()
      expect(findNode(engine.getTree(), 'first')?.content).toBe('go gogo')
      expect(events.filter((event) => event.type === 'history')).toHaveLength(7)
    },
  )

  it('5,000 個節點的 1,398 處只更新一次畫布與一次歷程；同一節點多處使用單筆 patch', () => {
    const root = page(
      ...Array.from({ length: 100 }, (_, group) => ({
        id: 's' + group,
        type: 'section',
        children: Array.from({ length: group === 99 ? 48 : 49 }, (_, col) =>
          text(group + '-' + col, col % 8 === 0 ? 'spring spring' : 'summer'),
        ),
      })),
    )
    const engine = mount(root)
    const events: EngineEvent[] = []
    engine.subscribe((event) => events.push(event))
    expect(searchPageText(root, 'spring')).toHaveLength(1398)
    expect(replaceAll(engine, 'spring', 'autumn')).toBe(1398)
    expect(events.map((event) => event.type).sort()).toEqual(['history', 'tree'])
    expect(findNode(engine.getTree(), '50-1')).toBe(findNode(root, '50-1'))
    expect(findNode(engine.getTree(), '99-40')?.content).toBe('autumn autumn')
    engine.undo()
    expect(engine.getTree()).toBe(root)
    const single = mount(page(text('only', 'aa')))
    single.subscribe((event) => events.push(event))
    events.length = 0
    expect(replaceAll(single, 'a', 'b')).toBe(2)
    expect(events.map((event) => event.type).sort()).toEqual(['history', 'patch'])
  })
})
