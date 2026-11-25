import { createI18n, type ComponentNode } from '@cluion/sigil-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPageLinksPanel } from '../src/page-links.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function link(id: string, href?: string): ComponentNode {
  return {
    id,
    type: 'text',
    tagName: 'a',
    content: id,
    attributes: href === undefined ? {} : { href },
  }
}

function root(children: ComponentNode[]): ComponentNode {
  return { id: 'root', type: 'section', children }
}

function target(id: string, name: string): ComponentNode {
  return { id, type: 'section', attributes: { ID: name } }
}

function mount(doc: ComponentNode, options?: Parameters<typeof createPageLinksPanel>[1]) {
  const panel = createPageLinksPanel(doc, options)
  document.body.append(panel.el)
  cleanups.push(panel.destroy)
  const rows = () => Array.from(panel.el.querySelectorAll<HTMLElement>('[data-page-link-id]'))
  const statuses = () =>
    Object.fromEntries(
      rows().map((row) => [
        row.dataset.pageLinkId,
        row.querySelector('.sigil-page-link-status')!.textContent,
      ]),
    )
  const filter = panel.el.querySelector<HTMLButtonElement>('.sigil-page-links-filter')!
  const more = panel.el.querySelector<HTMLButtonElement>('.sigil-page-links-more')!
  function open(value = true) {
    panel.el.open = value
    panel.el.dispatchEvent(new Event('toggle'))
  }
  return { panel, rows, statuses, filter, more, open }
}

describe('匯出快照的頁面連結', () => {
  it('依照 HTML fragment 的 literal/decoded 及 ID/name 順序處理隱藏目標、重複、頁首和文字片段', () => {
    const { open, statuses, filter } = mount(
      root([
        link('literal', '  #a%2Fb  '),
        link('decoded', '#part%2Fone'),
        link('named', '#legacy'),
        link('duplicates', '#copies'),
        link('duplicate-names', '#old'),
        link('id-first', '#shadow'),
        link('missing', '#absent'),
        link('top', '#ToP'),
        link('empty', '#'),
        link('until', '#findable'),
        link('aria', '#scrollable'),
        link('hidden-html', '#collapsed'),
        link('text', '#:~:text=words'),
        link('fallback', '#absent:~:text=words'),
        link('with-text', '#legacy:~:text=words'),
        link('unset', ' \t'),
        link('new'),
        link('relative', 'sibling.html#other'),
        link('mail', 'MAILTO:person@example.com'),
        link('tel', 'tel:+88612345678'),
        target('literal-target', 'a%2Fb'),
        target('decoded-1', 'a/b'),
        target('decoded-2', 'a/b'),
        {
          id: 'hidden',
          type: 'section',
          hidden: true,
          children: [
            target('part-target', 'part/one'),
            target('copy-one', 'copies'),
            link('hidden-link', '#gone'),
          ],
        },
        target('copy-two', 'copies'),
        target('real', 'shadow'),
        { id: 'find', type: 'section', attributes: { id: 'findable', hidden: 'UNTIL-FOUND' } },
        {
          id: 'aria-target',
          type: 'section',
          attributes: { id: 'scrollable', 'aria-hidden': 'true' },
        },
        { id: 'collapsed', type: 'section', attributes: { id: 'collapsed', hidden: '' } },
        ...['legacy', 'old', 'old', 'shadow', 'shadow'].map((name, index) => ({
          id: 'bookmark-' + index,
          type: 'text',
          tagName: 'A',
          attributes: { NAME: name },
        })),
        { ...link('id-only'), attributes: { id: 'bookmark' } },
      ]),
    )
    open()
    expect(statuses()).toEqual({
      literal: '頁內連結',
      decoded: '頁內目標已隱藏',
      named: '頁內連結',
      duplicates: '頁內目標重複',
      'duplicate-names': '頁內目標重複',
      'id-first': '頁內連結',
      missing: '找不到頁內目標',
      top: '頁內連結',
      empty: '頁內連結',
      text: '文字片段',
      fallback: '需在預覽確認目標',
      until: '頁內連結',
      aria: '頁內連結',
      'hidden-html': '頁內目標已隱藏',
      'with-text': '頁內連結',
      unset: '未設定目的地',
      new: '未設定目的地',
      relative: '網址',
      mail: '電子郵件',
      tel: '電話',
    })
    filter.click()
    expect(filter.getAttribute('aria-pressed')).toBe('true')
    expect(Object.keys(statuses())).toEqual([
      'decoded',
      'duplicates',
      'duplicate-names',
      'missing',
      'hidden-html',
      'fallback',
      'unset',
      'new',
    ])
  })

  it('保留鎖定、圖片與行內文字，在不載入 HTML 的情況下區分結構化和動態目標', () => {
    const locked: ComponentNode = {
      ...link('locked', '#widget'),
      content: '檢視',
      locked: true,
      children: [
        { id: 'inline', type: 'text', tagName: 'b', content: '活動' },
        { id: 'line', type: 'text', tagName: 'br' },
        { id: 'img', type: 'image', attributes: { ALT: '地圖' } },
        { ...link('excluded', 'x'), attributes: { 'aria-hidden': 'true' } },
      ],
    }
    const doc = root([
      locked,
      link('rich-host', '#rich'),
      link('unknown', '#from-slot'),
      link('void-target', '#discarded'),
      {
        ...link('case'),
        tagName: 'A',
        attributes: { HREF: 'https://example.com/<b>test</b>', 'ARIA-LABEL': '$&' },
      },
      {
        id: 'code',
        type: 'shortcode',
        shortcode: { name: 'widget', props: {} },
        attributes: { id: 'widget' },
        children: [link('slot', '#broken'), target('slot-id', 'from-slot')],
      },
      {
        ...link('managed', 'x'),
        attributes: { id: 'rich' },
        content: '<a href="#">rich</a>',
        children: [link('child', 'x')],
      },
      {
        id: 'hidden',
        type: 'section',
        attributes: { HIDDEN: 'false' },
        children: [link('internal', '/')],
      },
      {
        id: 'img-void',
        type: 'image',
        children: [link('void', 'x'), target('void-id', 'discarded')],
      },
    ])
    const onEdit = vi.fn()
    const { panel, open, rows, statuses } = mount(doc, {
      onEdit,
      richText: { supports: (node) => node.id === 'managed' },
    })
    open()
    expect(statuses()).toEqual({
      locked: '頁內連結',
      'rich-host': '頁內連結',
      unknown: '需在預覽確認目標',
      'void-target': '需在預覽確認目標',
      case: '網址',
    })
    expect(rows()[0]!.getAttribute('aria-label')).toBe('查看連結 檢視活動 地圖')
    expect(rows().at(-1)!.getAttribute('aria-label')).toBe('查看連結 $&')
    expect(rows().at(-1)!.querySelector('.sigil-page-link-href')?.textContent).toBe(
      'https://example.com/<b>test</b>',
    )
    expect(panel.el.querySelector('a, img, b')).toBeNull()
    rows()[0]!.querySelector('span')!.click()
    expect(onEdit).toHaveBeenCalledWith('locked')
    expect(panel.hasSource(doc, 'locked')).toBe(true)
    for (const id of ['slot', 'managed', 'internal', 'void', 'child', 'gone'])
      expect(panel.hasSource(doc, id)).toBe(false)
    expect(panel.hasSource(root([{ ...locked, hidden: true }]), 'locked')).toBe(false)
  })

  it('只在首次展開時走訪，每批 40 列，切換語系保留篩選及鍵盤焦點', () => {
    const children = Array.from({ length: 82 }, (_, i) =>
      link('item-' + i, i === 81 ? undefined : '#'),
    )
    const read = vi.fn(() => children)
    const doc: ComponentNode = {
      id: 'root',
      type: 'section',
      get children() {
        return read()
      },
    }
    const i18n = createI18n({
      zh: {},
      en: { 'page_links.inspect': 'Inspect {name}', 'page_links.unset': 'Unset' },
    })
    const { panel, open, filter, more, rows } = mount(doc, { onEdit: vi.fn(), i18n })
    panel.refreshLocale()
    expect(read).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(0)
    open()
    expect(read).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(40)
    const first = rows()[0]
    more.click()
    expect(rows()).toHaveLength(80)
    expect(rows()[0]).toBe(first)
    expect(document.activeElement).toBe(rows()[40])
    more.click()
    expect(rows()).toHaveLength(82)
    expect(more.hidden).toBe(true)
    expect(document.activeElement).toBe(rows()[80])
    filter.click()
    expect(rows().map((row) => row.dataset.pageLinkId)).toEqual(['item-81'])
    rows()[0]!.focus()
    i18n.setLocale('en')
    panel.refreshLocale()
    expect(document.activeElement).toBe(rows()[0])
    expect(rows()[0]!.getAttribute('aria-label')).toBe('Inspect item-81')
    expect(rows()[0]!.textContent).toContain('Unset')
    open(false)
    open()
    expect(read).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(1)
  })

  it('唯讀清單沒有列按鈕，篩選後提供空狀態', () => {
    const { panel, open, filter, rows } = mount(root([link('home', '#')]))
    open()
    expect(rows()[0]!.tagName).toBe('DIV')
    filter.click()
    expect(rows()).toHaveLength(0)
    expect(panel.el.querySelector('.sigil-page-links-empty')?.textContent).toBe('沒有待處理的連結')
  })
})
