import { afterEach, describe, expect, it } from 'vitest'
import { createEngine, findNode, type ComponentNode } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function setup(extra: ComponentNode[] = []) {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        children: [
          {
            id: 'cta',
            type: 'text',
            tagName: 'a',
            content: '報名',
            attributes: { href: '/tickets', title: '連結' },
          },
          { id: 'faq', type: 'section', name: '常見問題' },
          ...extra,
        ],
      },
    },
  })
  const box = document.createElement('div')
  const inspector = createInspector(engine, box)
  engine.select('cta')
  cleanups.push(() => {
    inspector.destroy()
    engine.destroy()
  })
  return {
    engine,
    box,
    node: (id: string) => findNode(engine.getTree(), id)!,
    select: () => box.querySelector<HTMLSelectElement>('.sigil-link-fields select')!,
    address: () => box.querySelector<HTMLInputElement>('.sigil-link-fields input')!,
  }
}

describe('連結內容設定', () => {
  it('選取沒有錨點的區段後，新增的 id 與連結可以一起復原和重做', () => {
    const { engine, node, select, address } = setup()
    select().value = 'faq'
    select().dispatchEvent(new Event('change'))
    const anchor = node('faq').attributes?.id
    expect(anchor).toMatch(/^section-/)
    expect(node('cta').attributes).toEqual({ href: '#' + anchor, title: '連結' })
    expect(address().value).toBe('#' + anchor)
    engine.undo()
    expect(node('faq').attributes).toBeUndefined()
    expect(address().value).toBe('/tickets')
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expect(select().value).toBe('faq')
    expect(node('faq').attributes?.id).toBe(anchor)
  })

  it('排除重複與隱藏目標，沿用鎖定區段的既有錨點並編碼特殊字元', () => {
    const { select, node, engine } = setup([
      { id: 'a', type: 'section', attributes: { id: 'dup' } },
      { id: 'b', type: 'text', attributes: { id: 'dup' } },
      {
        id: 'hidden',
        type: 'section',
        hidden: true,
        children: [{ id: 'hidden-child', type: 'section', name: '隱藏' }],
      },
      { id: 'locked', type: 'section', name: '鎖定', locked: true },
      { id: 'spots', type: 'section', name: '地點', locked: true, attributes: { id: '場地%表' } },
    ])
    expect(Array.from(select().options, (option) => option.value)).toEqual(['', 'faq', 'spots'])
    select().value = 'spots'
    select().dispatchEvent(new Event('change'))
    expect(node('cta').attributes?.href).toBe('#' + encodeURIComponent('場地%表'))
    engine.update('spots', { hidden: true })
    expect(select().value).toBe('')
  })

  it('可區分名稱含斜線及名稱含百分比編碼的兩個目標', () => {
    const { select, address } = setup([
      { id: 'slash', type: 'section', attributes: { id: 'a/b' } },
      { id: 'percent', type: 'section', attributes: { id: 'a%2Fb' } },
    ])
    for (const [id, href] of [
      ['slash', '#a/b'],
      ['percent', '#a%252Fb'],
    ] as const) {
      select().value = id
      select().dispatchEvent(new Event('change'))
      expect(select().value).toBe(id)
      expect(address().value).toBe(href)
    }
  })

  it('無效網址保留原本目的地，套用有效網址後畫面與資料一致', () => {
    const { node, address, box, engine } = setup()
    function apply(value: string) {
      address().value = value
      address().dispatchEvent(new Event('input'))
      box.querySelector<HTMLButtonElement>('.sigil-link-fields button')!.click()
    }
    apply('這不是網址')
    expect(address().getAttribute('aria-invalid')).toBe('true')
    expect(node('cta').attributes?.href).toBe('/tickets')
    apply('https://example.test/signup')
    expect(address().getAttribute('aria-invalid')).toBe(null)
    expect(node('cta').attributes?.href).toBe(address().value)
    engine.update('cta', { locked: true })
    expect(address().disabled).toBe(true)
  })
})
