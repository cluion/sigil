import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEngine,
  createI18n,
  findNode,
  type ComponentNode,
  type ResponsiveDevice,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { createGridItem } from '../src/grid-item.js'
import { readImageLink, removeImageLink, setImageLink } from '../src/image-link.js'

const clear: (() => void)[] = []
afterEach(() => {
  for (const fn of clear.splice(0)) fn()
  vi.restoreAllMocks()
})

function setup(
  fields: Partial<ComponentNode> = {},
  device: ResponsiveDevice = 'desktop',
  parentFields: Partial<ComponentNode> = {},
  richText?: Pick<RichTextResolver, 'supports'>,
) {
  const item: ComponentNode = { id: 'heading', type: 'text', content: '活動資訊', ...fields }
  const parent: ComponentNode = {
    id: 'cards',
    type: 'section',
    style: { display: 'grid' },
    children: [item],
    ...parentFields,
  }
  const other: ComponentNode = {
    id: 'other',
    type: 'section',
    children: [{ id: 'unrelated', type: 'text' }],
  }
  const engine = createEngine({
    doc: { version: 1, root: { id: 'root', type: 'section', children: [parent, other] } },
  })
  const i18n = createI18n({
    zh: {},
    en: {
      'grid.item_title': 'Grid item placement',
      'grid.item_auto': 'Auto placement',
      'grid.item_full': 'Full row',
      'grid.item_custom': 'Custom placement ({value})',
      'grid.item_inherit': 'Inherit placement',
    },
  })
  engine.select(item.id)
  const panel = createGridItem(engine, item, device, i18n, richText)
  document.body.append(panel.el)
  const button = (key: string) =>
    panel.el.querySelector<HTMLButtonElement>('[data-grid-item="' + key + '"]')!
  clear.push(() => {
    panel.destroy()
    panel.el.remove()
    engine.destroy()
  })
  return {
    engine,
    i18n,
    panel,
    full: button('full'),
    auto: button('auto'),
    inherit: button('inherit'),
    custom: panel.el.querySelector<HTMLElement>('.sigil-grid-item-custom')!,
    read: () => findNode(engine.getTree(), item.id)!,
  }
}

describe('格線項目配置', () => {
  it('從原圖設定連結在頁面格線的欄位，解除連結後帶回圖片', () => {
    const h = setup({ id: 'poster', type: 'image', content: undefined }, 'mobile')
    setImageLink(h.engine, 'poster', '/tickets')
    const link = readImageLink(h.engine.getTree(), 'poster')!.link!
    h.full.click()
    expect(findNode(h.engine.getTree(), link.id)?.responsiveStyles?.mobile).toEqual({
      'grid-column': '1 / -1',
    })
    expect(h.read().responsiveStyles?.mobile?.['grid-column']).toBeUndefined()
    h.engine.update('poster', { locked: true })
    expect(h.auto.disabled).toBe(true)
    h.engine.update('poster', { locked: false })
    h.engine.update('cards', { style: { display: 'flex' } })
    expect(h.panel.el.hidden).toBe(true)
    h.engine.update('cards', { style: { display: 'grid' } })
    expect(h.full.getAttribute('aria-pressed')).toBe('true')
    expect(removeImageLink(h.engine, 'poster')).toBe(true)
    expect(h.read().responsiveStyles?.mobile?.['grid-column']).toBe('1 / -1')
    expect(h.full.getAttribute('aria-pressed')).toBe('true')
  })
  it('在目前斷點橫跨整列；不改資料順序或父層，回到自動排列與復原各需一步', () => {
    const h = setup({ style: { color: 'red' } })
    const before = h.engine.getTree()
    expect(h.auto.getAttribute('aria-pressed')).toBe('true')
    h.auto.click()
    expect(h.engine.canUndo()).toBe(false)
    h.full.click()
    h.full.click()
    expect(h.read().style).toEqual({ color: 'red', 'grid-column': '1 / -1' })
    expect(h.full.getAttribute('aria-pressed')).toBe('true')
    expect(findNode(h.engine.getTree(), 'cards')!.style).toBe(before.children![0]!.style)
    expect(h.engine.getTree().children![1]).toBe(before.children![1])
    h.engine.undo()
    expect(h.engine.getTree()).toBe(before)
    h.engine.redo()
    h.auto.click()
    expect(h.read().style).toEqual({ color: 'red' })
    h.engine.undo()
    expect(h.read().style?.['grid-column']).toBe('1 / -1')
  })

  it('手機可覆寫較寬斷點的整列，並刪除該單一覆寫重新繼承', () => {
    const h = setup(
      { responsiveStyles: { tablet: { 'grid-column': '1/-1' }, mobile: { width: '80%' } } },
      'mobile',
    )
    const before = h.engine.getTree()
    h.full.click()
    expect(h.engine.getTree()).toBe(before)
    h.auto.click()
    expect(h.read().responsiveStyles?.mobile).toEqual({ width: '80%', 'grid-column': 'auto' })
    expect(h.auto.getAttribute('aria-pressed')).toBe('true')
    h.inherit.focus()
    h.inherit.click()
    expect(h.read().responsiveStyles?.mobile).toEqual({ width: '80%' })
    expect(document.activeElement).toBe(h.full)
    expect(h.panel.el.querySelector('.sigil-style-source')?.textContent).toBe('繼承 平板')
    h.engine.undo()
    h.full.click()
    expect(h.read().responsiveStyles?.mobile).toEqual({ width: '80%' })
  })

  it('依較寬層的個別起訖線及目前層的簡寫辨識配置，還原後呈現自訂 CSS', () => {
    const h = setup(
      {
        style: {
          'grid-column': '1/-1',
          'grid-column-start': 'sidebar',
          'grid-column-end': 'span 2',
        },
      },
      'mobile',
    )
    expect(h.custom.textContent).toContain('sidebar / span 2')
    expect(h.auto.getAttribute('aria-pressed')).toBe('false')
    h.full.click()
    expect(h.read().responsiveStyles?.mobile).toEqual({ 'grid-column': '1 / -1' })
    expect(h.full.getAttribute('aria-pressed')).toBe('true')
    h.inherit.click()
    expect(h.custom.textContent).toContain('sidebar / span 2')
    h.engine.update('heading', { style: { 'grid-column-start': '1', 'grid-column-end': '-1' } })
    h.full.click()
    expect(h.read().responsiveStyles?.mobile).toBeUndefined()
  })

  it('保留具名區域與列配置，即使簡寫原本早於 area 也可覆寫且精確復原', () => {
    const h = setup(
      {
        responsiveStyles: {
          mobile: {
            'grid-column': '3 / 4',
            'grid-area': '2 / sidebar / span 3 / sidebar-end',
            'grid-column-end': 'span 2',
            color: 'blue',
          },
        },
      },
      'mobile',
    )
    const before = h.engine.getTree()
    expect(h.custom.textContent).toContain('sidebar / span 2')
    h.full.click()
    const own = h.read().responsiveStyles!.mobile!
    expect(own['grid-area']).toBe('2 / sidebar / span 3 / sidebar-end')
    expect(own['grid-column-end']).toBeUndefined()
    expect(Object.keys(own).at(-1)).toBe('grid-column')
    expect(h.full.getAttribute('aria-pressed')).toBe('true')
    h.engine.undo()
    expect(h.engine.getTree()).toBe(before)
    expect(h.engine.canUndo()).toBe(false)
    h.engine.redo()
    expect(h.inherit.textContent).toBe('還原區域配置')
    h.inherit.click()
    expect(h.read().responsiveStyles?.mobile).toEqual({
      'grid-area': '2 / sidebar / span 3 / sidebar-end',
      color: 'blue',
    })
    expect(h.custom.hidden).toBe(false)
    expect(h.custom.textContent).toContain('sidebar')
  })

  it('中文命名區域可設定整列，還原後焦點回到原本的配置', () => {
    const h = setup({ responsiveStyles: { mobile: { 'grid-area': '主標題' } } }, 'mobile')
    expect(h.auto.getAttribute('aria-pressed')).toBe('false')
    expect(h.custom.textContent).toContain('主標題')
    h.full.click()
    h.inherit.focus()
    h.inherit.click()
    expect(document.activeElement).toBe(h.custom)
    expect(h.read().responsiveStyles?.mobile).toEqual({ 'grid-area': '主標題' })
  })

  it('只提供目前裝置有格線項目盒的直接子元件', () => {
    const h = setup({ responsiveStyles: { mobile: { display: 'contents' } } }, 'mobile')
    expect(h.panel.el.hidden).toBe(true)
    h.full.click()
    expect(h.engine.canUndo()).toBe(false)
    for (const position of ['absolute', 'fixed']) {
      h.engine.update('heading', { responsiveStyles: { mobile: { display: 'block', position } } })
      expect(h.panel.el.hidden).toBe(true)
    }
    h.engine.update('heading', { responsiveStyles: { mobile: { position: 'static' } } })
    expect(h.panel.el.hidden).toBe(false)
  })

  it('移動後依直接父層與裝置顯示；不為無關的文字或兄弟變更重新掃樹', () => {
    const h = setup({}, 'tablet', {
      style: { display: 'flex' },
      responsiveStyles: { tablet: { display: 'inline-grid' } },
    })
    expect(h.panel.el.hidden).toBe(false)
    const read = vi.spyOn(h.engine, 'getTree')
    h.engine.update('unrelated', { content: '場地' })
    h.engine.update('heading', { content: '卡片' })
    h.engine.update('cards', { name: '新名稱' })
    h.engine.remove('unrelated')
    expect(read).not.toHaveBeenCalled()
    h.engine.move('heading', 'other')
    expect(h.panel.el.hidden).toBe(true)
    h.full.click()
    expect(h.read().style).toBeUndefined()
    h.engine.update('other', { style: { display: 'block grid' } })
    expect(h.panel.el.hidden).toBe(false)
    h.engine.remove('other')
    expect(h.panel.el.hidden).toBe(true)
    h.engine.undo()
    expect(h.panel.el.hidden).toBe(false)
    h.engine.update('other', { style: { display: 'block' } })
    expect(h.panel.el.hidden).toBe(true)
  })

  it('排除 shortcode 和由 richText 接管的父層，沒有父層的根節點不顯示操作', () => {
    const h = setup({}, 'desktop', {}, { supports: (n) => n.className === 'article' })
    h.engine.update('cards', { className: 'article' })
    expect(h.panel.el.hidden).toBe(true)
    h.engine.update('cards', { className: 'layout' })
    expect(h.panel.el.hidden).toBe(false)
    h.engine.update('cards', { shortcode: { name: 'promotion', props: {} } })
    expect(h.panel.el.hidden).toBe(true)
    const root = h.engine.getTree()
    h.engine.select(root.id)
    const rootItem = createGridItem(h.engine, root, 'desktop')
    expect(rootItem.el.hidden).toBe(true)
    rootItem.destroy()
  })

  it('鎖定和舊面板不會誤改元件；可切換語系並使用工作區的存檔或復原捷徑', () => {
    const h = setup({ style: { 'grid-column': '2 / 4' } }, 'mobile')
    h.engine.update('heading', { locked: true })
    expect(h.full.disabled).toBe(true)
    h.engine.update('heading', { locked: false })
    h.i18n.setLocale('en')
    expect(h.auto.textContent).toBe('Auto placement')
    expect(h.custom.textContent).toBe('Custom placement (2 / 4)')
    for (const [key, modifier, expected] of [
      ['Delete', false, false],
      ['v', true, false],
      ['s', true, true],
      ['z', true, true],
    ] as const) {
      expect(
        h.full.dispatchEvent(
          new KeyboardEvent('keydown', { key, ctrlKey: modifier, bubbles: true, cancelable: true }),
        ),
      ).toBe(expected)
    }
    h.engine.select('cards')
    h.full.click()
    expect(h.read().responsiveStyles).toBeUndefined()
    h.engine.select('heading')
    h.panel.destroy()
    h.full.click()
    expect(h.read().responsiveStyles).toBeUndefined()
  })
})
