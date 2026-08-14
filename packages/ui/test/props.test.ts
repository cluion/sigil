import { describe, it, expect } from 'vitest'
import { createEngine, type Engine, type PropSchema } from '@cluion/sigil-core'
import { createPropsPanel } from '../src/props.js'
import { createEnglishUiI18n } from './i18n.js'

function panel(schema: PropSchema[] | undefined, props: Record<string, unknown> = {}) {
  const engine = createEngine({
    doc: {
      version: 1 as const,
      root: { id: 'n', type: 'shortcode', shortcode: { name: 'sc', props } },
    },
  }) as Engine
  engine.select('n')
  const box = document.createElement('div')
  createPropsPanel(engine, box, {
    getShortcodeSchema: schema ? () => schema : undefined,
  })
  return { engine, box }
}

describe('createPropsPanel — shortcode props', () => {
  it('runtime locale 切換更新欄位與樣式並保留裝置狀態', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'n', type: 'text', content: 'Hello', style: { margin: '16px' } },
      },
    })
    const box = document.createElement('div')
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const handle = createPropsPanel(engine, box, { i18n })

    expect(box.textContent).toBe('未選取節點')
    engine.select('n')
    handle.setDevice('tablet')
    const tree = engine.getTree()

    i18n.setLocale('en')

    expect(box.querySelector('h3')?.textContent).toBe('text (n)')
    expect(box.textContent).toContain('Content:')
    expect(box.textContent).toContain('Styles · Tablet')
    expect(engine.getTree()).toBe(tree)
    expect(box.querySelector('.sigil-responsive-style-context')?.textContent).toBe(
      'Inherits Desktop when not overridden',
    )
    expect(box.textContent).toContain('Use inherited')
    expect(box.textContent).toContain('Clear Tablet Override')
    const margin = box
      .querySelector('button[data-style-reset="margin"]')
      ?.parentElement?.querySelector('input') as HTMLInputElement
    expect(margin.placeholder).toBe('Inherited: 16px')
    handle.destroy()
    i18n.setLocale('zh')
    expect(box.textContent).toContain('Styles · Tablet')
  })

  it('有 schema → 生成型別控制項(number)', () => {
    const { box } = panel([{ name: 'step', type: 'number', label: '步進' }], { step: 2 })
    const input = box.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('2')
  })

  it('無 schema → fallback 通用 key/value', () => {
    const { box } = panel(undefined, { foo: 'bar' })
    const input = [...box.querySelectorAll('input')].find((i) => i.value === 'bar')
    expect(input).toBeTruthy()
  })

  it('非 shortcode 節點 → 無 shortcode props 區', () => {
    const engine = createEngine({
      doc: { version: 1 as const, root: { id: 'n', type: 'section', children: [] } },
    }) as Engine
    engine.select('n')
    const box = document.createElement('div')
    createPropsPanel(engine, box)
    expect(box.textContent).not.toContain('shortcode props')
  })

  it('富文字節點只顯示安全摘要與畫布編輯提示', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'n',
          type: 'rich-text',
          content: '<p><strong>Hello</strong> world</p><script>alert(1)</script>',
        },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    createPropsPanel(engine, box, {
      richText: {
        supports: (node) => node.type === 'rich-text',
        read: (node) => node.content ?? '',
      },
    })

    expect(box.querySelector('.sigil-rich-text-summary')?.textContent).toBe('Hello world alert(1)')
    expect(box.querySelector('.sigil-rich-text-hint')?.textContent).toBe('請在畫布編輯富文字')
    expect(box.textContent).not.toContain('<strong>')
    expect([...box.querySelectorAll('input')].some((input) => input.value.includes('<p>'))).toBe(
      false,
    )
  })

  it('樣式:color 改值 → engine.update style', () => {
    const engine = createEngine({
      doc: { version: 1 as const, root: { id: 'n', type: 'section' } },
    }) as Engine
    engine.select('n')
    const box = document.createElement('div')
    createPropsPanel(engine, box)
    const colorInput = box.querySelector('input[type=color]') as HTMLInputElement
    colorInput.value = '#ff0000'
    colorInput.dispatchEvent(new Event('input'))
    expect(engine.getTree().style?.color).toBe('#ff0000')
  })

  it('樣式:text-align select 改值', () => {
    const engine = createEngine({
      doc: { version: 1 as const, root: { id: 'n', type: 'section' } },
    }) as Engine
    engine.select('n')
    const box = document.createElement('div')
    createPropsPanel(engine, box)
    const sels = box.querySelectorAll('select')
    const align = sels[sels.length - 1] as HTMLSelectElement // 最後 select = text-align
    align.value = 'center'
    align.dispatchEvent(new Event('change'))
    expect(engine.getTree().style?.['text-align']).toBe('center')
  })

  it('tablet 編輯只寫 responsiveStyles，並可回到 Desktop 繼承', () => {
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'n', type: 'section', style: { margin: '16px' } },
      },
    }) as Engine
    engine.select('n')
    const box = document.createElement('div')
    const panel = createPropsPanel(engine, box)
    panel.setDevice('tablet')

    const reset = box.querySelector('button[data-style-reset="margin"]') as HTMLButtonElement
    const input = reset.parentElement?.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('繼承：16px')
    expect(input.dataset.styleInherited).toBe('true')

    input.value = '8px'
    input.dispatchEvent(new Event('input'))
    expect(engine.getTree().style?.margin).toBe('16px')
    expect(engine.getTree().responsiveStyles?.tablet?.margin).toBe('8px')

    input.value = ''
    input.dispatchEvent(new Event('input'))
    expect(engine.getTree().responsiveStyles?.tablet).toBeUndefined()
    expect(input.dataset.styleInherited).toBe('true')
    expect(reset.disabled).toBe(true)

    input.value = '8px'
    input.dispatchEvent(new Event('input'))
    reset.click()
    expect(engine.getTree().responsiveStyles?.tablet).toBeUndefined()
    expect(input.placeholder).toBe('繼承：16px')
    expect(input.dataset.styleInherited).toBe('true')
    panel.destroy()
  })
})
