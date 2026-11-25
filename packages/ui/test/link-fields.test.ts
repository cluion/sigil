import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, findNode, renameHtmlAnchor, type ComponentNode } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createLinkFields, isNativeLink } from '../src/link-fields.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function setup(
  extra: ComponentNode[] = [],
  attributes: Record<string, string> = { href: '/tickets', title: '連結' },
) {
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
            attributes,
          },
          { id: 'faq', type: 'section', name: '常見問題' },
          ...extra,
        ],
      },
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  const inspector = createInspector(engine, box)
  engine.select('cta')
  cleanups.push(() => {
    inspector.destroy()
    engine.destroy()
    box.remove()
  })
  return {
    engine,
    box,
    node: (id: string) => findNode(engine.getTree(), id)!,
    select: () => box.querySelector<HTMLSelectElement>('.sigil-link-section select')!,
    address: () => box.querySelector<HTMLInputElement>('.sigil-link-address input')!,
    kind: () => box.querySelector<HTMLSelectElement>('[data-link-kind]')!,
    newTab: () => box.querySelector<HTMLInputElement>('.sigil-link-new-tab input')!,
    message: () => box.querySelector<HTMLElement>('.sigil-link-status')!,
    reveal: () => box.querySelector<HTMLButtonElement>('.sigil-link-reveal')!,
  }
}

describe('連結內容設定', () => {
  it('大小寫不同的既有 HTML 屬性可編輯，外部刪除後顯示真實值', () => {
    const { engine, node, select, address, newTab } = setup(
      [{ id: 'stage', type: 'section', attributes: { ID: "作者's展區" } }],
      { HREF: '/before', TARGET: '_self', REL: 'author opener' },
    )
    expect(address().value).toBe('/before')
    newTab().click()
    expect(node('cta').attributes).toEqual({
      HREF: '/before',
      TARGET: '_blank',
      REL: 'author noopener',
    })
    select().value = 'stage'
    select().dispatchEvent(new Event('change'))
    const fragment = '#' + encodeURIComponent("作者's展區").replaceAll("'", '%27')
    expect(node('cta').attributes?.HREF).toBe(fragment)
    expect(address().value).toBe(fragment)
    expect(select().value).toBe('stage')
    expect(node('stage').attributes).toEqual({ ID: "作者's展區" })
    engine.update('cta', { removeAttributes: ['TarGet', 'rel'] })
    expect(newTab().checked).toBe(false)
    newTab().click()
    expect(node('cta').attributes).toEqual({ HREF: fragment, target: '_blank', rel: 'noopener' })
    engine.update('cta', { removeAttributes: ['href'] })
    expect(address().value).toBe('')
    expect(select().value).toBe('')
  })

  it('宿主改名時顯示同步更新的網址，失去 ID 時保留草稿與正確的定位狀態', () => {
    const { engine, address, select, message, reveal } = setup(
      [{ id: 'stage', type: 'text', attributes: { Id: 'original' } }],
      { Href: '#original' },
    )
    expect(select().value).toBe('stage')
    expect(renameHtmlAnchor(engine, 'stage', 'tickets')).toEqual({ ok: true })
    expect(address().value).toBe('#tickets')
    expect(select().value).toBe('stage')
    expect(reveal().hidden).toBe(false)
    address().value = '/draft'
    address().dispatchEvent(new Event('input'))
    engine.update('stage', { removeAttributes: ['ID'] })
    expect(address().value).toBe('/draft')
    expect(select().value).toBe('')
    expect(message().textContent).toContain('找不到')
    expect(reveal().hidden).toBe(true)
    engine.update('stage', { attributes: { iD: 'tickets' } })
    expect(select().value).toBe('stage')
    expect(message().hidden).toBe(true)
  })

  it('舊的 A NAME 參照優先於解碼後的 ID，不會定位到錯誤區段', () => {
    const { engine, node, select, reveal, message } = setup(
      [
        { id: 'slash', type: 'section', attributes: { id: 'a/b' } },
        { id: 'literal', type: 'text', tagName: 'a', attributes: { NAME: 'a%2Fb' } },
      ],
      { href: '#a%2Fb' },
    )
    expect(select().value).toBe('')
    expect(reveal().hidden).toBe(true)
    expect(message().textContent).toContain('無法在畫布定位')
    select().value = 'slash'
    select().dispatchEvent(new Event('change'))
    expect(node('cta').attributes?.href).toBe('#a/b')
    engine.update('literal', { removeAttributes: ['name'] })
    engine.update('cta', { attributes: { href: '#a%2Fb' } })
    expect(select().value).toBe('slash')
  })

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

  it('HTML hidden 變動同步更新後代的定位選項，保留錨點及 until-found 的可尋性', () => {
    const { engine, select, reveal, message, node } = setup(
      [
        {
          id: 'parent',
          type: 'section',
          children: [{ id: 'child', type: 'text', attributes: { id: 'schedule' } }],
        },
      ],
      { href: '#schedule' },
    )
    const checkTarget = (shown: boolean) => {
      expect(Array.from(select().options, (option) => option.value).includes('child')).toBe(shown)
      expect(select().value).toBe(shown ? 'child' : '')
      expect(reveal().hidden).toBe(!shown)
      if (!shown) expect(message().textContent).toContain('無法在畫布定位')
      expect(node('cta').attributes?.href).toBe('#schedule')
    }
    checkTarget(true)
    engine.update('parent', { attributes: { HiDdEn: 'false' } })
    checkTarget(false)
    reveal().click()
    expect(engine.getSelection()).toBe('cta')
    engine.update('parent', { removeAttributes: ['HIDDEN'] })
    checkTarget(true)
    engine.update('child', { attributes: { hidden: '' } })
    checkTarget(false)
    engine.update('child', { attributes: { hidden: 'UNTIL-FOUND' } })
    checkTarget(true)
    engine.update('parent', { hidden: true })
    checkTarget(false)
    engine.update('parent', { hidden: false, attributes: { 'aria-hidden': 'true' } })
    checkTarget(true)
    engine.insert('root', { id: 'copy', type: 'text', attributes: { id: 'schedule', HIDDEN: '' } })
    expect(message().textContent).toContain('多個')
    expect(reveal().hidden).toBe(true)
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
      box.querySelector<HTMLButtonElement>('.sigil-link-apply')!.click()
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

  it('輸入電子郵件與常見電話格式，切換草稿維持原狀，套用才寫入文件', () => {
    const { kind, address, engine, box, node } = setup()
    const apply = box.querySelector<HTMLButtonElement>('.sigil-link-apply')!
    const choose = (value: string) => {
      kind().value = value
      kind().dispatchEvent(new Event('change'))
    }
    const enter = (value: string) => {
      address().value = value
      address().dispatchEvent(new Event('input'))
    }
    const initial = engine.toJSON()
    choose('email')
    expect(address().inputMode).toBe('email')
    expect(address().value).toBe('')
    enter('hello+event@example.test')
    choose('tel')
    enter('+886 (2) 2345-6789')
    choose('email')
    expect(address().value).toBe('hello+event@example.test')
    expect(engine.toJSON()).toEqual(initial)
    expect(engine.canUndo()).toBe(false)
    choose('tel')
    expect(address().value).toBe('+886 (2) 2345-6789')
    apply.click()
    expect(node('cta').attributes).toEqual({ href: 'tel:+886223456789', title: '連結' })
    expect(address().value).toBe('+886223456789')
    choose('email')
    enter('hello+event@example.test')
    address().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(node('cta').attributes?.href).toBe('mailto:hello+event@example.test')
    engine.undo()
    expect(kind().value).toBe('tel')
    expect(address().value).toBe('+886223456789')
    engine.redo()
    expect(kind().value).toBe('email')
    expect(address().value).toBe('hello+event@example.test')
  })

  it('驗證各模式的地址與空值，鎖定及舊控制項無法改寫文件', () => {
    const { engine, box, address, kind, node, newTab } = setup()
    const apply = box.querySelector<HTMLButtonElement>('.sigil-link-apply')!
    for (const [mode, invalid] of [
      ['email', 'bad..email@example.test'],
      ['tel', '+ (02) extension'],
    ]) {
      kind().value = mode!
      kind().dispatchEvent(new Event('change'))
      address().value = invalid!
      address().dispatchEvent(new Event('input'))
      apply.click()
      expect(address().getAttribute('aria-invalid')).toBe('true')
      expect(node('cta').attributes?.href).toBe('/tickets')
    }
    kind().value = 'url'
    kind().dispatchEvent(new Event('change'))
    address().value = ''
    address().dispatchEvent(new Event('input'))
    apply.click()
    expect(address().getAttribute('aria-invalid')).toBe('true')
    expect(node('cta').attributes?.href).toBe('/tickets')
    engine.update('cta', { locked: true })
    expect(kind().disabled && address().disabled && newTab().disabled).toBe(true)
    engine.update('cta', { locked: false })
    const staleAddress = address()
    const staleTab = newTab()
    engine.select('faq')
    staleAddress.value = '/stale'
    staleAddress.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    staleTab.checked = true
    staleTab.dispatchEvent(new Event('change'))
    expect(node('cta').attributes).toEqual({ href: '/tickets', title: '連結' })
  })

  it('另開分頁保留既有 rel 用途，目標與 rel 可一起復原，編輯中的網址也會保留', () => {
    const { engine, address, newTab, node } = setup()
    engine.update('cta', { attributes: { rel: 'ugc OpEnEr author NOOPENER' } })
    address().value = '/draft'
    address().dispatchEvent(new Event('input'))
    newTab().click()
    expect(node('cta').attributes).toEqual({
      href: '/tickets',
      title: '連結',
      rel: 'ugc author NOOPENER',
      target: '_blank',
    })
    expect(address().value).toBe('/draft')
    engine.undo()
    expect(node('cta').attributes?.rel).toBe('ugc OpEnEr author NOOPENER')
    expect(newTab().checked).toBe(false)
    engine.redo()
    expect(newTab().checked).toBe(true)
    newTab().click()
    expect(node('cta').attributes?.target).toBe('_self')
    expect(node('cta').attributes?.rel).toBe('ugc author NOOPENER')
    engine.update('cta', { attributes: { rel: 'sponsored' } })
    newTab().click()
    expect(node('cta').attributes?.rel).toBe('sponsored noopener')
  })

  it.each([
    ['tel', '02 2345 6789', 'tel:0223456789'],
    ['email', 'hi@example.test', 'mailto:hi@example.test'],
    ['url', 'mailto:staff@example.test', 'mailto:staff@example.test'],
  ])('套用 %s 聯絡地址會同時恢復原分頁，單步復原可還原網址與分頁', (mode, input, href) => {
    const { engine, kind, address, newTab, node } = setup()
    engine.update('cta', { attributes: { target: '_blank', rel: 'sponsored noopener' } })
    const original = node('cta').attributes
    kind().value = mode
    kind().dispatchEvent(new Event('change'))
    expect(newTab().closest('label')!.hidden).toBe(mode !== 'url')
    address().value = input
    address().dispatchEvent(new Event('input'))
    expect(node('cta').attributes).toEqual(original)
    address().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(newTab().closest('label')!.hidden).toBe(true)
    expect(node('cta').attributes).toEqual({ ...original, href, target: '_self' })
    engine.undo()
    expect(node('cta').attributes).toEqual(original)
    expect(newTab().checked).toBe(true)
    expect(newTab().closest('label')!.hidden).toBe(false)
    engine.redo()
    expect(node('cta').attributes?.target).toBe('_self')
    expect(newTab().closest('label')!.hidden).toBe(true)
  })

  it('錨點狀態隨目的地異動更新，定位選取有效區段且不新增復原步驟', () => {
    const { node, engine, message, reveal, box } = setup()
    for (const href of ['#', '#ToP', '#:~:text=Workshop']) {
      engine.update('cta', { attributes: { href } })
      expect(message().hidden).toBe(true)
    }
    engine.update('cta', { attributes: { href: '#schedule' } })
    expect(message().textContent).toContain('找不到')
    expect(reveal().hidden).toBe(true)
    engine.update('faq', { attributes: { id: 'schedule' } })
    expect(message().hidden).toBe(true)
    expect(reveal().hidden).toBe(false)
    engine.insert('root', { id: 'duplicate', type: 'section', attributes: { id: 'schedule' } })
    expect(message().textContent).toContain('多個')
    expect(reveal().hidden).toBe(true)
    engine.remove('duplicate')
    engine.update('faq', { hidden: true })
    expect(message().textContent).toContain('無法在畫布定位')
    engine.update('faq', { hidden: false })
    const before = engine.toJSON()
    const go = vi.fn(() => expect(engine.getSelection()).toBe('faq'))
    const direct = createLinkFields(engine, node('cta'), undefined, go)
    direct.el.querySelector<HTMLButtonElement>('.sigil-link-reveal')!.click()
    expect(go).toHaveBeenCalledOnce()
    expect(engine.toJSON()).toEqual(before)
    expect(box.querySelector('.sigil-link-fields')).toBeNull()
    direct.destroy()
    engine.undo()
    expect(node('faq').hidden).toBe(true)
  })

  it('只為原生錨點啟用，包括自訂類型使用的 A 標籤', () => {
    expect(isNativeLink({ id: 'link', type: 'button', tagName: 'A' })).toBe(true)
    expect(
      isNativeLink({
        id: 'spec',
        type: 'text',
        tagName: 'a',
        shortcode: { name: 'host', props: {} },
      }),
    ).toBe(false)
  })

  it('載入既有聯絡方式、空網址與自訂 mailto 時不改寫原資料', () => {
    const { engine, kind, address, message } = setup()
    for (const [href, mode, display] of [
      ['mailto:staff+event@example.test', 'email', 'staff+event@example.test'],
      ['tel:02-2345-6789', 'tel', '02-2345-6789'],
      [
        'mailto:hello@example.test?subject=Workshop',
        'url',
        'mailto:hello@example.test?subject=Workshop',
      ],
      ['', 'url', ''],
    ] as const) {
      engine.update('cta', { attributes: { href, target: '_blank' } })
      const saved = engine.toJSON()
      engine.select('faq')
      engine.select('cta')
      expect(kind().value).toBe(mode)
      expect(address().value).toBe(display)
      expect(message().hidden).toBe(true)
      expect(engine.toJSON()).toEqual(saved)
    }
  })
})
