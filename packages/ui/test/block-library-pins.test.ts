import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n } from '@cluion/sigil-core'
import { createBlocksPanel, type BlockDef, type BlocksPanelOptions } from '../src/blocks-panel.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function definition(id: string, label: string, category = '內容'): BlockDef {
  return {
    id,
    label,
    category,
    create: vi.fn(() => ({ id: 'new-' + id, type: 'text', content: label })),
  }
}

function setup(defs: BlockDef[], options: BlocksPanelOptions = {}) {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'page',
        type: 'section',
        children: [
          { id: 'heading', type: 'text', name: '活動標題' },
          { id: 'image', type: 'image' },
        ],
      },
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  const panel = createBlocksPanel(engine, box, document.createElement('iframe'), defs, {
    blockPinStorageKey: false,
    ...options,
  })
  cleanups.push(() => {
    panel.destroy()
    engine.destroy()
    box.remove()
  })
  const rows = () => Array.from(box.querySelectorAll<HTMLElement>('.sigil-block-row'))
  const pin = (id: string) =>
    rows()
      .find((row) => row.dataset.blockId === id)!
      .querySelector<HTMLButtonElement>('.sigil-block-pin')!
  const item = (id: string) =>
    rows()
      .find((row) => row.dataset.blockId === id)!
      .querySelector<HTMLButtonElement>('.sigil-block-item')!
  const filter = box.querySelector<HTMLButtonElement>('.sigil-blocks-pin-filter')!
  const search = box.querySelector<HTMLInputElement>('[type=search]')!
  function query(value: string) {
    search.value = value
    search.dispatchEvent(new Event('input'))
  }
  return {
    engine,
    panel,
    box,
    pin,
    item,
    filter,
    search,
    query,
    ids: () => rows().map((row) => row.dataset.blockId),
  }
}

function press(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  return target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  )
}

describe('區塊釘選與結果導覽', () => {
  it('釘選不會建立區塊，篩選與搜尋保留分類、選取、文件與復原紀錄', () => {
    const faq = definition('accordion', '折疊式 FAQ', '行銷')
    const text = definition('text', '文字')
    const lib = setup([faq, text])
    lib.engine.select('heading')
    const original = lib.engine.getTree()
    const insert = lib.item('accordion')
    expect(lib.pin('accordion').parentElement).toBe(lib.item('accordion').parentElement)
    lib.pin('accordion').click()
    expect(lib.item('accordion')).toBe(insert)
    expect(lib.pin('accordion').getAttribute('aria-pressed')).toBe('true')
    expect(lib.pin('accordion').getAttribute('aria-label')).toBe('釘選 折疊式 FAQ')
    expect(lib.pin('accordion').title).toBe('取消釘選 折疊式 FAQ')
    expect(document.activeElement).toBe(lib.pin('accordion'))
    lib.filter.click()
    expect(lib.ids()).toEqual(['accordion'])
    lib.query('ＦＡＱ 行銷')
    expect(lib.ids()).toEqual(['accordion'])
    expect(lib.box.querySelector('.sigil-blocks-category')?.textContent).toBe('行銷')
    lib.query('文字')
    expect(lib.box.querySelector('.sigil-muted')?.textContent).toBe('無符合區塊')
    expect(lib.box.querySelector('.sigil-blocks-results')?.textContent).toBe('0 個結果')
    lib.filter.click()
    expect(lib.ids()).toEqual(['text'])
    expect(lib.engine.getSelection()).toBe('heading')
    expect(lib.engine.getTree()).toBe(original)
    expect(lib.engine.canUndo()).toBe(false)
    expect(faq.create).not.toHaveBeenCalled()
    expect(text.create).not.toHaveBeenCalled()
  })

  it('取消釘選、非同步清單換版與最後一個結果消失時焦點可繼續操作', () => {
    const defs = ['one', 'two', 'three'].map((id) => definition(id, id))
    const lib = setup(defs)
    for (const def of defs) lib.pin(def.id).click()
    lib.filter.click()
    lib.pin('two').click()
    expect(document.activeElement).toBe(lib.pin('three'))
    lib.panel.reload([defs[0]!])
    expect(document.activeElement).toBe(lib.pin('one'))
    expect(lib.box.querySelector('.sigil-blocks-pin-count')?.textContent).toBe('1')
    lib.pin('one').click()
    expect(lib.box.querySelector('.sigil-muted')?.textContent).toBe('尚無已釘選區塊')
    expect(document.activeElement).toBe(lib.filter)
    const renamed = definition('three', '已更名的範本')
    lib.panel.reload([renamed])
    expect(lib.pin('three').getAttribute('aria-label')).toBe('釘選 已更名的範本')
    expect(lib.pin('three').getAttribute('aria-pressed')).toBe('true')
    expect(lib.pin('three').nextElementSibling).toBeNull()
  })

  it('已釘選的結果可用方向鍵選取，在指定元件後插入並一次復原', () => {
    const lib = setup([definition('alpha', '第一個'), definition('beta', '第二個')])
    lib.pin('alpha').click()
    lib.pin('beta').click()
    lib.filter.click()
    const finish = vi.fn()
    lib.engine.select('heading')
    lib.panel.beginInsertAfter?.('heading', finish)
    expect(document.activeElement).toBe(lib.search)
    expect(press(lib.search, 'Escape', { keyCode: 229 })).toBe(true)
    expect(press(lib.search, 'ArrowDown', { isComposing: true })).toBe(true)
    expect(document.activeElement).toBe(lib.search)
    press(lib.search, 'ArrowUp')
    expect(document.activeElement).toBe(lib.item('beta'))
    press(lib.item('beta'), 'ArrowUp')
    expect(document.activeElement).toBe(lib.item('alpha'))
    press(lib.item('alpha'), 'ArrowUp')
    expect(document.activeElement).toBe(lib.search)
    press(lib.search, 'ArrowDown')
    press(lib.item('alpha'), 'ArrowDown')
    expect(document.activeElement).toBe(lib.item('beta'))
    press(lib.item('beta'), 'Enter', { isComposing: true })
    expect(lib.engine.canUndo()).toBe(false)
    press(lib.item('beta'), 'Enter')
    expect(finish).toHaveBeenCalledExactlyOnceWith(true)
    expect(lib.engine.getTree().children?.map((child) => child.id)).toEqual([
      'heading',
      'new-beta',
      'image',
    ])
    expect(lib.engine.getSelection()).toBe('new-beta')
    lib.engine.undo()
    expect(lib.engine.getTree().children?.map((child) => child.id)).toEqual(['heading', 'image'])
    expect(lib.engine.canUndo()).toBe(false)
  })

  it('語系切換與範本重新命名後，保留釘選、查詢與正確的鍵盤焦點', () => {
    const i18n = createI18n({
      zh: {},
      en: {
        'blocks.pin': 'Pin {name}',
        'blocks.unpin': 'Unpin {name}',
        'blocks.pinned_only': 'Pinned only',
        'blocks.results': '{count} results',
      },
    })
    const lib = setup([definition('p', '活動範本')], { i18n })
    lib.pin('p').click()
    lib.filter.click()
    lib.query('範本')
    lib.pin('p').focus()
    i18n.setLocale('en')
    expect(lib.pin('p').getAttribute('aria-label')).toBe('Pin 活動範本')
    expect(lib.pin('p').title).toBe('Unpin 活動範本')
    expect(lib.filter.getAttribute('aria-pressed')).toBe('true')
    expect(lib.search.value).toBe('範本')
    expect(lib.box.querySelector('.sigil-blocks-results')?.textContent).toBe('1 results')
    expect(document.activeElement).toBe(lib.pin('p'))
    lib.panel.reload([definition('p', '新的活動範本')])
    expect(lib.pin('p').getAttribute('aria-label')).toBe('Pin 新的活動範本')
    expect(document.activeElement).toBe(lib.pin('p'))
  })

  it('釘選篩選引起清單重繪時，執行中的範本管理不會重送', async () => {
    let finish!: () => void
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const lib = setup([definition('p', '活動範本')], { itemActions: () => ({ remove }) })
    const manage = () => lib.box.querySelector<HTMLButtonElement>('[data-block-actions]')!
    manage().click()
    document.querySelector<HTMLButtonElement>('[data-menu-item-id="remove"]')!.click()
    expect(remove).toHaveBeenCalledOnce()
    lib.pin('p').click()
    lib.filter.click()
    expect(manage().getAttribute('aria-busy')).toBe('true')
    manage().click()
    expect(document.querySelector('[role=menu]')).toBeNull()
    finish()
    await Promise.resolve()
    expect(manage().getAttribute('aria-busy')).toBe('false')
    expect(document.activeElement).toBe(lib.pin('p'))
  })

  it('瀏覽器拒絕寫入時可繼續使用釘選，並提示僅於工作階段保留', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    const lib = setup([definition('p', '活動範本')], { blockPinStorageKey: 'test-rejected' })
    lib.pin('p').click()
    expect(lib.pin('p').getAttribute('aria-pressed')).toBe('true')
    const notice = lib.box.querySelector<HTMLElement>('.sigil-blocks-pin-notice')!
    expect(notice.hidden).toBe(false)
    expect(notice.textContent).toBe('釘選變更僅保留於目前工作階段。')
    lib.filter.click()
    expect(lib.ids()).toEqual(['p'])
  })

  it('共用偏好的面板在另一筆釘選成功後仍顯示未儲存提示，回到原值才一起清除', () => {
    const defs = [definition('a', '活動簡介'), definition('b', '報名按鈕')]
    const settings = { blockPinStorageKey: 'test-library-shared-write-failure' }
    const storage = document.defaultView!.localStorage
    const write = vi.fn((key: string, value: string) => storage.setItem(key, value))
    const remove = vi.fn((key: string) => storage.removeItem(key))
    vi.spyOn(document.defaultView!, 'localStorage', 'get').mockReturnValue({
      getItem: (key) => storage.getItem(key),
      setItem: write,
      removeItem: remove,
      key: (index) => storage.key(index),
      clear: () => storage.clear(),
      get length() {
        return storage.length
      },
    })
    const i18n = createI18n({ zh: {}, en: { 'blocks.pins_session_only': 'Session only.' } })
    const first = setup(defs, settings)
    const second = setup(defs, { ...settings, i18n })
    const notice = (lib: ReturnType<typeof setup>) =>
      lib.box.querySelector<HTMLElement>('.sigil-blocks-pin-notice')!

    first.pin('b').click()
    expect(write).toHaveBeenCalledOnce()
    second.filter.click()
    expect(second.ids()).toEqual(['b'])
    write.mockImplementationOnce(() => {
      throw new Error('Quota exceeded')
    })
    first.pin('a').click()
    expect(write).toHaveBeenCalledTimes(2)
    expect(second.ids()).toEqual(['a', 'b'])
    expect(notice(first).hidden).toBe(false)
    expect(notice(second).hidden).toBe(false)
    i18n.setLocale('en')
    expect(notice(second).textContent).toBe('Session only.')

    second.pin('b').click()
    expect(remove).toHaveBeenCalledOnce()
    expect(notice(first).hidden).toBe(false)
    expect(notice(second).hidden).toBe(false)
    const later = setup(defs, settings)
    expect(later.pin('a').getAttribute('aria-pressed')).toBe('true')
    expect(notice(later).hidden).toBe(false)
    const temporary = setup(defs)
    temporary.pin('a').click()
    expect(notice(temporary).hidden).toBe(true)

    later.pin('a').click()
    for (const lib of [first, second, later]) {
      expect(notice(lib).hidden).toBe(true)
      expect(notice(lib).textContent).toBe('')
    }
    expect(first.pin('a').getAttribute('aria-pressed')).toBe('false')
    expect(second.ids()).toEqual([])
  })
})
