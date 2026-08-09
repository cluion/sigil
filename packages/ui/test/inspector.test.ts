import { describe, expect, it } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createEnglishUiI18n } from './i18n.js'

describe('createInspector — responsive style', () => {
  it('英文 i18n 翻譯分頁、空狀態、樣式與進階操作', () => {
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
    const inspector = createInspector(engine, box, { i18n: createEnglishUiI18n() })

    expect([...box.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      'Content',
      'Style',
      'Advanced',
    ])
    expect(box.textContent).toContain('No component selected')
    engine.select('t')
    expect(box.querySelector('.sigil-field-label')?.textContent).toBe('Content')

    ;(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
        (tab) => tab.textContent === 'Style',
      ) as HTMLButtonElement
    ).click()
    inspector.setDevice('tablet')
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
})
