import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type ComponentNode } from '@cluion/sigil-core'
import { createHeadingOutline } from '../src/heading-outline.js'
import { createLayersPanel } from '../src/layers.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function heading(id: string, level: number, content: string): ComponentNode {
  return { id, type: 'text', tagName: 'h' + level, content }
}

function mount(children: ComponentNode[]) {
  const engine = createEngine({
    doc: { version: 1, root: { type: 'section', id: 'root', children } },
  })
  const getTree = vi.spyOn(engine, 'getTree')
  const onActivate = vi.fn((id: string) => engine.select(id))
  const i18n = createI18n({
    zh: {},
    en: {
      'layers.outline_untitled': 'Untitled heading',
      'layers.outline_empty': 'No headings yet',
    },
  })
  const outline = createHeadingOutline(engine, {
    i18n,
    richText: { supports: (node) => node.attributes?.['data-markup'] === 'true' },
    onActivate,
  })
  const unsub = engine.subscribe((event) => {
    if (event.type === 'patch') outline.refresh(event.patch)
    if (event.type === 'tree') outline.refresh()
    if (event.type === 'selection') outline.syncSelection()
  })
  document.body.append(outline.el)
  cleanups.push(() => {
    unsub()
    outline.destroy()
    engine.destroy()
  })
  const input = outline.el.querySelector('input')!
  const results = () => [...outline.el.querySelectorAll<HTMLButtonElement>('[data-heading-id]')]
  const status = () => outline.el.querySelector('[role="status"]')!.textContent
  const more = outline.el.querySelector<HTMLButtonElement>('.sigil-heading-outline-more')!
  function query(value: string) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function key(element: HTMLElement, key: string, init: KeyboardEventInit = {}) {
    return element.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
  }
  return { engine, getTree, onActivate, i18n, outline, input, results, status, more, query, key }
}

describe('標題大綱', () => {
  it('按文件順序讀出原生層級、行內內容、替代文字與空標題，不顯示隱藏或由 adapter 管理的節點', () => {
    const { outline, results, i18n, query, status } = mount([
      {
        ...heading('hero', 1, 'Get'),
        tagName: 'H1',
        children: [
          { id: 'em', type: 'text', tagName: 'em', content: 'ting' },
          { id: 'break', type: 'text', tagName: 'br' },
          { id: 'img', type: 'image', attributes: { ALT: 'Started' } },
          { id: 'icon', type: 'image', attributes: { alt: 'decoration', 'ARIA-hidden': 'TRUE' } },
        ],
      },
      {
        id: 'section',
        type: 'section',
        children: [
          { ...heading('second', 2, ' <em>文字</em>  '), name: '圖層名稱', locked: true },
          { ...heading('named', 3, ' '), name: ' 說明 ' },
          { ...heading('label', 4, ''), attributes: { 'Aria-Label': '說明二' }, name: '圖層' },
        ],
      },
      { ...heading('empty', 6, '') },
      {
        ...heading('attribute', 1, ''),
        attributes: { Hidden: 'false' },
        children: [heading('hidden-in-attr', 2, 'hide')],
      },
      { id: 'invisible', type: 'section', hidden: true, children: [heading('hidden', 2, 'hide')] },
      {
        id: 'shortcode',
        type: 'shortcode',
        shortcode: { name: 'slug', props: {} },
        children: [heading('slot', 2, 'hide')],
      },
      { ...heading('adapter', 2, '<h2>private</h2>'), attributes: { 'data-markup': 'true' } },
      { id: 'rich', type: 'rich-text', tagName: 'h2', content: '<h2>hidden</h2>' },
    ])
    outline.setVisible(true)
    expect(results().map((row) => row.getAttribute('aria-label'))).toEqual([
      'H1 Getting Started',
      'H2 <em>文字</em>',
      'H3 說明',
      'H4 說明二',
      'H6 未命名標題',
    ])
    expect(outline.el.querySelector('em')).toBeNull()
    const empty = results().at(-1)
    i18n.setLocale('en')
    outline.refreshLocale()
    expect(empty?.getAttribute('aria-label')).toBe('H6 Untitled heading')
    query('ｈ６ TITLED')
    expect(results()).toEqual([empty])
    expect(status()).toContain('1')
    query('不存在')
    expect(status()).toBe('找不到符合的標題')
  })

  it('隱藏或編輯無關段落時不走訪模型；分頁、篩選、切換焦點均保留文件與歷史', () => {
    const { engine, getTree, outline, results, input, more, key, status, query } = mount([
      { id: 'body', type: 'text', tagName: 'p', content: '原文' },
      ...Array.from({ length: 5000 }, (_, i) => heading('h-' + i, 2, '章節 ' + i)),
    ])
    expect(getTree).not.toHaveBeenCalled()
    outline.setVisible(true)
    expect(getTree).toHaveBeenCalledTimes(1)
    expect(results()).toHaveLength(40)
    expect(status()).toContain('5000')
    const initial = results()[0]!
    key(input, 'ArrowDown')
    key(initial, 'End')
    key(results()[39]!, 'ArrowDown')
    expect(document.activeElement).toBe(more)
    more.click()
    expect(results()).toHaveLength(80)
    expect(document.activeElement).toBe(results()[40])
    query('4999')
    expect(results().map((row) => row.dataset.headingId)).toEqual(['h-4999'])
    expect(engine.canUndo()).toBe(false)
    expect(engine.getSelection()).toBeNull()
    engine.update('body', { content: '無關的新段落' })
    expect(getTree).toHaveBeenCalledTimes(1)
    outline.setVisible(false)
    engine.update('h-4999', { content: '尾聲' })
    outline.refreshLocale()
    expect(getTree).toHaveBeenCalledTimes(1)
    outline.setVisible(true)
    expect(getTree).toHaveBeenCalledTimes(2)
    expect(results()).toHaveLength(0)
    query('尾聲')
    expect(results()[0]?.dataset.headingId).toBe('h-4999')
  })

  it('重新命名內嵌文字、換層級、搬移、隱藏、刪除與復原時同步內容並保留可用焦點', () => {
    const { engine, outline, results, input, key, status, i18n } = mount([
      { ...heading('one', 1, ''), children: [{ id: 'inline', type: 'text', content: '開始' }] },
      heading('two', 2, '第二章'),
    ])
    outline.setVisible(true)
    const [first, second] = results()
    first!.focus()
    engine.update('inline', { content: '開場' })
    expect(results()[0]).toBe(first)
    expect(first!.getAttribute('aria-label')).toBe('H1 開場')
    engine.update('one', { tagName: 'h3' })
    expect(first!.getAttribute('aria-label')).toBe('H3 開場')
    engine.move('two', 'root', 0)
    expect(results()).toEqual([second, first])
    expect(document.activeElement).toBe(first)
    key(first!, 'Enter')
    expect(engine.getSelection()).toBe('one')
    expect(first?.getAttribute('aria-current')).toBe('true')
    engine.update('one', { hidden: true })
    expect(results()).toEqual([second])
    expect(document.activeElement).toBe(second)
    engine.undo()
    expect(results().at(-1)?.getAttribute('aria-current')).toBe('true')
    engine.update('one', { tagName: 'p' })
    engine.remove('two')
    expect(results()).toHaveLength(0)
    expect(document.activeElement).toBe(input)
    i18n.setLocale('en')
    outline.refreshLocale()
    expect(status()).toBe('No headings yet')
    engine.undo()
    expect(results()[0]?.dataset.headingId).toBe('two')
    engine.redo()
    expect(results()).toHaveLength(0)
  })

  it('低階圖層面板返回時保留空標題焦點，當 adapter 接管該標題時改焦點至仍可瀏覽的項目', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [heading('one', 1, '第一章'), heading('two', 2, '第二章')],
        },
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const panel = createLayersPanel(engine, container, {
      headingOutline: true,
      richText: { supports: (node) => node.attributes?.['data-format'] === 'external' },
    })
    cleanups.push(() => {
      panel.destroy()
      container.remove()
      engine.destroy()
    })
    container.querySelector<HTMLButtonElement>('[data-layer-view="outline"]')!.click()
    const first = container.querySelector<HTMLButtonElement>('[data-heading-id="one"]')!
    first.click()
    panel.setSearchVisible(false)
    engine.update('one', { content: '' })
    panel.setSearchVisible(true)
    panel.focus()
    expect(document.activeElement).toBe(first)
    expect(first.getAttribute('aria-label')).toBe('H1 未命名標題')
    panel.setSearchVisible(false)
    engine.update('one', { attributes: { 'data-format': 'external' } })
    panel.setSearchVisible(true)
    panel.focus()
    expect(first.isConnected).toBe(false)
    expect(document.activeElement).toBe(container.querySelector('[data-heading-id="two"]'))
    panel.setSearchVisible(false)
    engine.update('two', { attributes: { 'data-format': 'external' } })
    panel.setSearchVisible(true)
    panel.focus()
    expect(document.activeElement).toBe(container.querySelector('.sigil-heading-outline-search'))
  })

  it('點擊與搜尋 Enter 才會選取，返回時恢復焦點，輸入法確認不會提早啟用', () => {
    const { engine, outline, results, input, onActivate, query, key } = mount([
      heading('one', 1, '首頁'),
      heading('two', 2, '關於'),
    ])
    outline.setVisible(true)
    query('關')
    input.dispatchEvent(new Event('compositionstart'))
    query('首頁')
    key(input, 'Enter', { isComposing: true })
    expect(onActivate).not.toHaveBeenCalled()
    expect(results()[0]?.dataset.headingId).toBe('two')
    input.dispatchEvent(new Event('compositionend'))
    key(input, 'Enter')
    const first = results()[0]!
    expect(onActivate).toHaveBeenCalledWith('one')
    expect(document.activeElement).toBe(first)
    outline.setVisible(false)
    document.body.focus()
    outline.setVisible(true)
    outline.focus()
    expect(document.activeElement).toBe(first)
    expect(input.value).toBe('首頁')
    key(first, 'Escape')
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    key(input, 'ArrowDown')
    key(results()[0]!, 'ArrowDown')
    expect(engine.getSelection()).toBe('one')
    expect(document.activeElement).toBe(results()[1])
    results()[1]!.click()
    expect(engine.getSelection()).toBe('two')
    expect(results()[0]?.hasAttribute('aria-current')).toBe(false)
    expect(engine.canUndo()).toBe(false)
  })
})
