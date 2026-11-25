import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type I18n } from '@cluion/sigil-core'
import { createSelectionPath } from '../src/selection-path.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const destroy of cleanup.splice(0)) destroy()
})

function setup(compact = false, i18n?: I18n) {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        children: [
          {
            id: 'hero',
            type: 'section',
            name: '主視覺',
            children: [
              {
                id: 'intro',
                type: 'column',
                name: '活動簡介',
                children: [{ id: 'cta', type: 'button', name: '主要行動' }],
              },
            ],
          },
          { id: 'info', type: 'section', name: '活動資訊' },
        ],
      },
    },
  })
  const mount = document.createElement('div')
  document.body.append(mount)
  const onActivate = vi.fn()
  const handle = createSelectionPath(engine, mount, { i18n, compact, onActivate })
  const nav = mount.querySelector('nav')!
  const trail = nav.querySelector('ol')!
  const labels = () => Array.from(trail.querySelectorAll('[data-path-id]'), (el) => el.textContent)
  const trigger = nav.querySelector<HTMLButtonElement>('[aria-haspopup]')!
  const dialog = nav.querySelector('dialog')!
  cleanup.push(() => {
    handle.destroy()
    engine.destroy()
    mount.remove()
  })
  return { engine, handle, onActivate, nav, trail, labels, trigger, dialog }
}

describe('元件路徑', () => {
  it('從根到目前項顯示名稱與 ID，以鍵盤原生按鈕選取祖先並保留文件', () => {
    const { engine, onActivate, nav, trail, labels } = setup()
    expect(nav.hidden).toBe(true)
    const original = engine.getTree()
    engine.select('cta')
    expect(nav.hidden).toBe(false)
    expect(nav.getAttribute('aria-label')).toBe('元件路徑')
    expect(labels()).toEqual(['頁面', '主視覺', '活動簡介', '主要行動'])
    const current = trail.querySelector('[aria-current="location"]')!
    expect(current.tagName).toBe('SPAN')
    expect(current.getAttribute('title')).toContain('cta')
    const button = trail.querySelector<HTMLButtonElement>('button[data-path-id="hero"]')!
    button.click()
    expect(engine.getSelection()).toBe('hero')
    expect(labels()).toEqual(['頁面', '主視覺'])
    expect(document.activeElement).toBe(trail.querySelector('[aria-current]'))
    expect(onActivate).toHaveBeenCalledExactlyOnceWith('hero')
    expect(engine.getTree()).toBe(original)
    expect(engine.canUndo()).toBe(false)
    trail.querySelector('button')!.click()
    expect(labels()).toEqual(['頁面'])
    expect(trail.querySelector('button')).toBeNull()
    engine.select(null)
    expect(nav.hidden).toBe(true)
  })

  it('內容、樣式、無關分支或相同選取不重掃整棵樹，也不重建已聚焦的路徑', () => {
    const { engine, trail } = setup()
    engine.select('cta')
    const getTree = vi.spyOn(engine, 'getTree')
    const button = trail.querySelector('button')!
    button.focus()
    engine.update('cta', { content: '報名' })
    engine.update('hero', { style: { color: 'red' } })
    engine.update('intro', { attributes: { title: '摘要標題' } })
    engine.update('info', { name: '其他區段' })
    engine.insert('info', { id: 'other', type: 'text' })
    engine.move('other', 'r')
    engine.remove('other')
    engine.select('cta')
    expect(getTree).not.toHaveBeenCalled()
    expect(trail.querySelector('button')).toBe(button)
    expect(document.activeElement).toBe(button)
  })

  it('先用圖層名再用匯入的 ARIA 名稱、HTML ID，並同步名稱與屬性的移除', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          attributes: { ID: 'workshop' },
          children: [
            {
              id: 'intro',
              type: 'column',
              attributes: { 'ARIA-LABEL': '活動概要', id: 'intro-section' },
            },
          ],
        },
      },
    })
    engine.select('intro')
    const mount = document.createElement('div')
    const handle = createSelectionPath(engine, mount)
    const text = () =>
      Array.from(mount.querySelectorAll('[data-path-id]'), (item) => item.textContent)
    try {
      expect(text()).toEqual(['workshop', '活動概要'])
      engine.update('intro', { name: '活動說明' })
      expect(text()[1]).toBe('活動說明')
      engine.update('intro', { name: '', removeAttributes: ['aria-label'] })
      expect(text()[1]).toBe('intro-section')
      engine.update('intro', { attributes: { id: 'new-intro' } })
      expect(text()[1]).toBe('new-intro')
      engine.update('intro', { removeAttributes: ['ID'] })
      expect(text()[1]).toBe('欄')
      engine.update('root', { removeAttributes: ['id'] })
      expect(text()[0]).toBe('頁面')
    } finally {
      handle.destroy()
      engine.destroy()
    }
  })

  it('搬移祖先、復原重做、改名與刪除時維持完整路徑', () => {
    const { engine, nav, labels } = setup()
    engine.select('cta')
    engine.move('intro', 'info')
    expect(labels()).toEqual(['頁面', '活動資訊', '活動簡介', '主要行動'])
    engine.undo()
    expect(labels()[1]).toBe('主視覺')
    engine.redo()
    expect(labels()[1]).toBe('活動資訊')
    engine.update('info', { name: '立即報名' })
    expect(labels()[1]).toBe('立即報名')
    engine.remove('intro')
    expect(nav.hidden).toBe(true)
    expect(labels()).toEqual([])
    engine.undo()
    expect(labels()).toEqual(['頁面', '立即報名', '活動簡介', '主要行動'])
    engine.remove('cta')
    expect(nav.hidden).toBe(true)
    expect(engine.getSelection()).toBeNull()
  })

  it('尚未載入的選取在子樹插入後可顯示，鎖定圖層與 shortcode 可供定位', () => {
    const { engine, nav, labels, trail } = setup()
    engine.select('missing')
    expect(nav.hidden).toBe(true)
    engine.insert('info', {
      id: 'embed',
      type: 'shortcode',
      shortcode: { name: 'calendar', props: {} },
      locked: true,
      children: [{ id: 'missing', type: 'text', tagName: 'small' }],
    })
    expect(labels()).toEqual(['頁面', '活動資訊', 'calendar', 'small'])
    trail.querySelector<HTMLButtonElement>('[data-path-id="embed"]')!.click()
    expect(engine.getSelection()).toBe('embed')
  })

  it('手機顯示完整階層、焦點回到觸發器，取消保留原本選取', () => {
    const { engine, trigger, dialog, onActivate } = setup(true)
    engine.select('cta')
    trigger.focus()
    trigger.click()
    expect(dialog.open).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(dialog.querySelector('[data-path-id="intro"]'))
    expect(dialog.querySelector('[aria-current]')?.textContent).toBe('主要行動')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(engine.getSelection()).toBe('cta')
    expect(onActivate).not.toHaveBeenCalled()
    trigger.click()
    dialog.querySelector<HTMLButtonElement>('[data-path-id="intro"]')!.click()
    expect(engine.getSelection()).toBe('intro')
    expect(onActivate).toHaveBeenCalledExactlyOnceWith('intro')
    expect(document.activeElement).toBe(trigger)
    expect(dialog.open).toBe(false)
    expect(engine.canUndo()).toBe(false)
  })

  it('語系切換保留對話框與焦點，改為桌面時焦點跟著目前項', () => {
    const i18n = createI18n({
      zh: {},
      en: { 'path.title': 'Component path', 'path.page': 'Page', 'path.close': 'Close' },
    })
    const { engine, handle, dialog, nav, trail, trigger } = setup(true, i18n)
    engine.select('cta')
    trigger.click()
    i18n.setLocale('en')
    expect(dialog.open).toBe(true)
    expect(nav.getAttribute('aria-label')).toBe('Component path')
    expect(dialog.querySelector('h2')?.textContent).toBe('Component path')
    expect(dialog.querySelector('button')?.textContent).toBe('Close')
    expect(dialog.querySelector('[data-path-id="r"]')?.textContent).toBe('Page')
    expect(document.activeElement).toBe(dialog.querySelector('[data-path-id="intro"]'))
    handle.setCompact(false)
    expect(dialog.open).toBe(false)
    expect(trigger.hidden).toBe(true)
    expect(document.activeElement).toBe(trail.querySelector('[aria-current]'))
    handle.setCompact(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('外部選取、隱藏及銷毀均關閉對話框，清理後舊按鈕不會復活', () => {
    const { engine, handle, nav, trigger, dialog } = setup(true)
    engine.select('cta')
    trigger.click()
    engine.select('hero')
    expect(dialog.open).toBe(false)
    trigger.click()
    expect(dialog.querySelector('[aria-current]')?.textContent).toBe('主視覺')
    handle.setVisible(false)
    expect(nav.hidden).toBe(true)
    expect(dialog.open).toBe(false)
    handle.setVisible(true)
    trigger.click()
    handle.destroy()
    expect(dialog.open).toBe(false)
    expect(nav.isConnected).toBe(false)
    trigger.click()
    expect(dialog.open).toBe(false)
  })
})
