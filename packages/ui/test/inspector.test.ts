import { describe, expect, it } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createEnglishUiI18n } from './i18n.js'

describe('createInspector — responsive style', () => {
  it('runtime locale 切換更新分頁與內容並保留 tab／device', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'Hello', style: { margin: '16px' } }],
        },
      },
    })
    const box = document.createElement('div')
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const inspector = createInspector(engine, box, { i18n })

    expect([...box.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      '內容',
      '樣式',
      '進階',
    ])
    expect(box.textContent).toContain('尚未選取元件')
    engine.select('t')
    expect(box.querySelector('.sigil-field-label')?.textContent).toBe('內容')

    ;(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
        (tab) => tab.textContent === '樣式',
      ) as HTMLButtonElement
    ).click()
    inspector.setDevice('tablet')
    const tree = engine.getTree()

    i18n.setLocale('en')

    expect(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')]
        .find((tab) => tab.textContent === 'Style')
        ?.getAttribute('aria-selected'),
    ).toBe('true')
    expect(engine.getTree()).toBe(tree)
    expect(
      [...box.querySelectorAll('.sigil-section-title')].map((title) => title.textContent),
    ).toEqual(['Layout', 'Typography', 'Appearance'])
    expect(box.querySelector('.sigil-responsive-style-context')?.textContent).toContain(
      'Inherits Desktop when not overridden',
    )
    expect(box.textContent).toContain('Use inherited')
    expect(box.textContent).toContain('Clear Tablet Override')

    ;(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
        (tab) => tab.textContent === 'Advanced',
      ) as HTMLButtonElement
    ).click()
    expect(box.textContent).toContain('Delete component')
    inspector.destroy()
    i18n.setLocale('zh')
    expect([...box.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      'Content',
      'Style',
      'Advanced',
    ])
  })

  it('裝置切換後顯示繼承來源，清除只影響目前 breakpoint', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'n',
          type: 'section',
          style: { margin: '16px' },
          responsiveStyles: { tablet: { margin: '8px', color: '#ff0000' } },
        },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box)
    const styleTab = [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
      (button) => button.textContent === '樣式',
    )!
    styleTab.click()
    inspector.setDevice('tablet')

    const context = box.querySelector('.sigil-responsive-style-context') as HTMLElement
    expect(context.dataset.styleDevice).toBe('tablet')
    expect(context.textContent).toContain('繼承 Desktop')

    const clear = [...box.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('清除 Tablet 覆寫'),
    )!
    clear.click()
    expect(engine.getTree().style?.margin).toBe('16px')
    expect(engine.getTree().responsiveStyles?.tablet).toBeUndefined()

    const marginReset = box.querySelector('button[data-style-reset="margin"]') as HTMLButtonElement
    const margin = marginReset.parentElement?.querySelector('input') as HTMLInputElement
    expect(margin.value).toBe('')
    expect(margin.placeholder).toBe('繼承：16px')
    inspector.destroy()
  })

  it('resolver 支援既有文字型別時改為富文字唯讀摘要', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'n', type: 'text', content: '<p><em>Hello</em> inspector</p>' },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, {
      richText: {
        supports: (node) => node.id === 'n',
        read: (node) => node.content ?? '',
      },
    })

    expect(box.querySelector('.sigil-rich-text-summary')?.textContent).toBe('Hello inspector')
    expect(box.querySelector('.sigil-rich-text-hint')?.textContent).toBe('請在畫布編輯富文字')
    expect(box.querySelector('.sigil-field input')).toBeNull()
    expect(box.textContent).not.toContain('此節點無可編輯內容欄位')
    inspector.destroy()
  })
})
