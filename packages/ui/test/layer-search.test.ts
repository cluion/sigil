import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type ComponentNode } from '@cluion/sigil-core'
import { createLayersPanel } from '../src/layers.js'
import { createLayerSearch } from '../src/layer-search.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function mount(children: ComponentNode[]) {
  const engine = createEngine({
    doc: { version: 1, root: { id: 'root', name: '活動頁', type: 'section', children } },
  })
  const getTree = vi.spyOn(engine, 'getTree')
  const i18n = createI18n({
    zh: {},
    en: {
      'layers.search': 'Search layers',
      'layers.search_count': 'Matches: {count}',
      'layers.search_none': 'No layers',
    },
  })
  const tree = document.createElement('div')
  const row = document.createElement('button')
  tree.append(row)
  const onActivate = vi.fn((id: string) => {
    expect(tree.hidden).toBe(false)
    engine.select(id)
    row.focus()
  })
  const handle = createLayerSearch(engine, {
    tree,
    i18n,
    labelForNode: (node) => node.name ?? node.type,
    onActivate,
  })
  document.body.append(handle.el, tree)
  cleanups.push(() => {
    handle.destroy()
    tree.remove()
    engine.destroy()
  })
  const input = handle.el.querySelector('input')!
  const status = handle.el.querySelector('[role="status"]')!
  const clear = handle.el.querySelector<HTMLButtonElement>('.sigil-layer-search-clear')!
  const more = handle.el.querySelector<HTMLButtonElement>('.sigil-layer-search-more')!
  const results = () => [...handle.el.querySelectorAll<HTMLButtonElement>('[data-layer-result]')]
  function query(value: string) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function key(target: HTMLElement, value: string, init: KeyboardEventInit = {}) {
    return target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...init }),
    )
  }
  return {
    engine,
    getTree,
    i18n,
    tree,
    row,
    handle,
    onActivate,
    input,
    results,
    query,
    key,
    status,
    clear,
    more,
  }
}

describe('圖層搜尋', () => {
  it('搜尋暫時隱藏時延後重算，重新顯示才更新目前頁數內的結果', () => {
    const { engine, getTree, handle, query, more, results, input, status } = mount(
      Array.from({ length: 35 }, (_, index) => ({
        id: 'item-' + index,
        type: 'text',
        content: '入場',
      })),
    )
    query('入場')
    more.click()
    expect(results()).toHaveLength(35)
    handle.setVisible(false)
    getTree.mockClear()
    engine.update('item-34', { content: '散場' })
    handle.refresh()
    handle.refreshLocale()
    expect(getTree).not.toHaveBeenCalled()
    expect(results()).toHaveLength(35)
    handle.setVisible(true)
    expect(getTree).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('入場')
    expect(results()).toHaveLength(34)
    expect(status.textContent).toContain('34')
    handle.setVisible(true)
    expect(getTree).toHaveBeenCalledTimes(1)
  })

  it('不輸入關鍵字時不走訪文件，瀏覽匹配與清除不會變更選取及歷史', () => {
    const { engine, getTree, handle, input, results, query, clear, tree, onActivate } = mount([
      { id: 'label', type: 'text', content: '未公開的場次', hidden: true, locked: true },
    ])
    handle.refresh()
    handle.refreshLocale()
    query('   ')
    expect(getTree).not.toHaveBeenCalled()
    engine.select('root')
    query('未公開')
    expect(tree.hidden).toBe(true)
    expect(results().map((el) => el.dataset.layerResult)).toEqual(['label'])
    expect(engine.getSelection()).toBe('root')
    clear.click()
    expect(onActivate).not.toHaveBeenCalled()
    expect(engine.canUndo()).toBe(false)
    expect(tree.hidden).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(results()).toHaveLength(0)
    getTree.mockClear()
    handle.refresh()
    expect(getTree).not.toHaveBeenCalled()
  })

  it('以多個詞查找巢狀同名元件、標籤、短碼、內部 id、HTML id 與圖片替代文字', () => {
    const suffix = '購票後會收到 <em>VIP</em> 通知'
    const chapters: ComponentNode[] = ['入場', '散場'].map((name, index) => ({
      id: 's-' + index,
      type: 'section',
      name,
      children: [
        {
          id: 'label-' + index,
          name: '時間',
          type: 'text',
          tagName: 'h3',
          content: '開放說明。'.repeat(28) + suffix,
        },
      ],
    }))
    const { query, results, tree } = mount([
      ...chapters,
      {
        id: 'photo-5',
        name: '場地',
        type: 'image',
        attributes: { alt: 'Sunset 照片', id: 'Studio-Entry' },
      },
      {
        id: 'ticket',
        name: '購票表單',
        type: 'shortcode',
        shortcode: { name: 'EventTickets', props: {} },
      },
    ])
    query('vIp   H３')
    expect(results()).toHaveLength(2)
    expect(results()[0]?.textContent).toContain('活動頁 › 入場')
    expect(results()[1]?.textContent).toContain('活動頁 › 散場')
    expect(results()[1]?.querySelector('em')).toBeNull()
    expect(results()[1]?.querySelector('.sigil-layer-search-excerpt')?.textContent).toContain(
      '<em>VIP</em> 通知',
    )
    for (const phrase of ['#studio-entry', 'Ｓｕｎｓｅｔ image', 'PHOTO-5', '場地']) {
      query(phrase)
      expect(results().map((item) => item.dataset.layerResult)).toEqual(['photo-5'])
    }
    query('eventtickets')
    expect(results().map((item) => item.dataset.layerResult)).toEqual(['ticket'])
    expect(tree.hidden).toBe(true)
  })

  it('使用父層名稱縮小收合分支內的同名結果，單查分支仍只列出分支本身', () => {
    const children = ['頁首', '頁尾'].map((name, index) => ({
      id: 'section-' + index,
      type: 'section',
      name,
      children: [{ id: 'title-' + index, type: 'text', name: '標題' }],
    }))
    const engine = createEngine({
      doc: { version: 1, root: { id: 'page', name: '活動頁', type: 'section', children } },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const layers = createLayersPanel(engine, box, { searchable: true })
    cleanups.push(() => {
      layers.destroy()
      engine.destroy()
      box.remove()
    })
    const row = (id: string) =>
      box.querySelector<HTMLElement>('[role="treeitem"][data-layer-id="' + id + '"]')
    row('section-1')!.querySelector<HTMLButtonElement>('[data-layer-action="toggle"]')!.click()
    expect(row('title-1')).toBeNull()
    const input = box.querySelector('input')!
    const search = (value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return [...box.querySelectorAll<HTMLButtonElement>('[data-layer-result]')].map(
        (el) => el.dataset.layerResult,
      )
    }
    expect(search('標題')).toEqual(['title-0', 'title-1'])
    expect(search('頁尾')).toEqual(['section-1'])
    expect(search('頁尾 標題')).toEqual(['title-1'])
    const button = box.querySelector<HTMLButtonElement>('[data-layer-result]')!
    expect(button.querySelector('.sigil-layer-search-path mark')?.textContent).toBe('頁尾')
    expect(row('title-1')).toBeNull()
    button.click()
    expect(row('title-1')?.getAttribute('aria-selected')).toBe('true')
  })

  it('在名稱、祖先路徑和摘要標出原始字元，多組或重疊詞不會改寫可讀文字', () => {
    const content = 'VIP 與 ｖｉｐ，請到 Cafe\u0301 以 ﬃ 取票。'
    const { query, results } = mount([
      {
        id: 'box',
        name: 'Studio 場地',
        type: 'section',
        children: [{ id: 'ticket', type: 'text', name: 'ＶＩＰ Studio', content }],
      },
    ])
    query('vip studio café ffi 取票')
    expect(results()).toHaveLength(1)
    const button = results()[0]!
    const marks = (section: string) =>
      [...button.querySelectorAll('.sigil-layer-search-' + section + ' mark')].map(
        (mark) => mark.textContent,
      )
    expect(marks('name')).toEqual(['ＶＩＰ', 'Studio'])
    expect(marks('path')).toEqual(['Studio'])
    expect(marks('excerpt')).toEqual(['VIP', 'ｖｉｐ', 'Cafe\u0301', 'ﬃ', '取票'])
    expect(button.querySelector('.sigil-layer-search-excerpt')!.textContent).toBe(content)
    expect(button.getAttribute('aria-label')).toBe(
      'ＶＩＰ Studio · 活動頁 › Studio 場地 · ' + content,
    )
    query('stu tud')
    const overlapping = results().find((result) => result.dataset.layerResult === 'ticket')!
    expect(overlapping.querySelector('.sigil-layer-search-name mark')!.textContent).toBe('Stud')
    expect(overlapping.querySelector('.sigil-layer-search-name')!.textContent).toBe('ＶＩＰ Studio')
  })

  it('窄欄摘要在首行附近顯示尾端命中字，也涵蓋未達摘要截斷長度的文字', () => {
    const { query, results } = mount(
      ['WorkshopPrintmaking'.repeat(3), 'WorkshopPrintmaking'.repeat(10), 'ﬃ'.repeat(40)].map(
        (prefix, index) => ({
          id: 'equipment-' + index,
          type: 'text',
          name: '工具說明',
          content: prefix + '，現場提供油墨滾筒。',
        }),
      ),
    )
    query('油墨滾筒')
    expect(results()).toHaveLength(3)
    for (const result of results()) {
      const preview = result.querySelector('.sigil-layer-search-excerpt')!.textContent!
      expect(preview.split('油墨滾筒')[0]!.length).toBeLessThanOrEqual(7)
      expect(preview).toContain('油墨滾筒。')
    }
  })

  it('一次顯示三十項，載入更多後可用鍵盤選取；組字和 Escape 不觸發選取', () => {
    const { input, results, query, status, more, key, row, tree, onActivate } = mount(
      Array.from({ length: 68 }, (_, i) => ({
        id: 'id-' + i,
        type: 'text',
        name: '場次',
        content: '第' + i + '場',
      })),
    )
    input.focus()
    input.dispatchEvent(new Event('compositionstart'))
    query('場')
    expect(key(input, 'Enter')).toBe(true)
    expect(results()).toHaveLength(0)
    input.dispatchEvent(new Event('compositionend'))
    expect(results()).toHaveLength(30)
    expect(status.textContent).toBe('找到 68 個圖層')
    expect(key(input, 'Escape', { isComposing: true })).toBe(true)
    expect(input.value).toBe('場')
    key(input, 'ArrowDown')
    expect(document.activeElement).toBe(results()[0])
    key(results()[0]!, 'ArrowDown')
    expect(document.activeElement).toBe(results()[1])
    key(results()[1]!, 'Escape')
    expect(onActivate).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('')
    query('場')
    key(results()[29]!, 'ArrowDown')
    expect(document.activeElement).toBe(more)
    key(more, 'ArrowUp')
    expect(document.activeElement).toBe(results()[29])
    more.click()
    expect(results()).toHaveLength(60)
    expect(document.activeElement).toBe(results()[30])
    more.click()
    expect(results()).toHaveLength(68)
    expect(more.hidden).toBe(true)
    expect(document.activeElement).toBe(results()[60])
    key(results()[60]!, 'Enter')
    expect(onActivate).toHaveBeenCalledExactlyOnceWith('id-60')
    expect(document.activeElement).toBe(row)
    expect(tree.hidden).toBe(false)
    expect(input.value).toBe('')
  })

  it('文件及語系變更後焦點保留於相同結果，當結果被移除時可繼續搜尋', () => {
    const { engine, handle, i18n, input, results, query, key, status, onActivate } = mount([
      { id: 'one', type: 'text', content: '公告日程' },
      { id: 'two', type: 'text', content: '活動日程' },
    ])
    query('日程')
    results()[1]!.focus()
    engine.remove('one')
    handle.refresh()
    expect(document.activeElement?.getAttribute('data-layer-result')).toBe('two')
    i18n.setLocale('en')
    handle.refreshLocale()
    expect(status.textContent).toBe('Matches: 1')
    const old = results()[0]!
    engine.remove('two')
    old.click()
    expect(onActivate).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-label')).toBe('Search layers')
    expect(document.activeElement).toBe(input)
    expect(status.textContent).toBe('No layers')
    expect(key(input, 'Enter')).toBe(false)
    expect(onActivate).not.toHaveBeenCalled()
    handle.destroy()
    query('日程')
    key(input, 'Enter')
    old.click()
    expect(onActivate).not.toHaveBeenCalled()
  })
})
