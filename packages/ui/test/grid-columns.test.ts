import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEngine,
  createI18n,
  findNode,
  type ComponentNode,
  type I18n,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { createGridColumns, supportsGridColumns } from '../src/grid-columns.js'

const property = 'grid-template-columns'
const columns = (n: number) => 'repeat(' + n + ', minmax(0, 1fr))'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function setup(
  fields: Partial<ComponentNode> = {},
  device: ResponsiveDevice = 'desktop',
  i18n?: I18n,
  acceptsCustomGridTracks?: (value: string) => boolean,
) {
  const node: ComponentNode = {
    id: 'cards',
    type: 'section',
    children: [{ id: 'card', type: 'column' }],
    ...fields,
  }
  const engine = createEngine({
    doc: { version: 1, root: { id: 'page', type: 'section', children: [node] } },
  })
  engine.select(node.id)
  const panel = createGridColumns(engine, node, device, i18n, acceptsCustomGridTracks)
  document.body.append(panel.el)
  cleanups.push(() => {
    panel.destroy()
    panel.el.remove()
    engine.destroy()
  })
  const input = panel.el.querySelector<HTMLInputElement>('[data-grid-custom]')!
  const preset = (n: number) =>
    panel.el.querySelector<HTMLButtonElement>('[data-grid-columns="' + n + '"]')!
  const reset = panel.el.querySelector<HTMLButtonElement>('[data-grid-inherit]')
  const source = panel.el.querySelector('.sigil-style-source')
  const read = () => findNode(engine.getTree(), node.id)!
  const type = (value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const key = (key: string, init: KeyboardEventInit = {}) =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
  return { engine, panel, preset, read, input, reset, source, type, key }
}

describe('格線欄數', () => {
  it('只提供可自行排列的版面容器，支援已匯入的原生標籤與空區段', () => {
    const base = { id: 'list', type: 'section' }
    expect(supportsGridColumns(base)).toBe(true)
    expect(supportsGridColumns({ ...base, type: 'column', locked: true })).toBe(true)
    expect(supportsGridColumns({ ...base, type: 'html', tagName: 'OL' })).toBe(true)
    for (const type of ['button', 'text', 'rich-text', 'shortcode', 'image']) {
      expect(supportsGridColumns({ ...base, type, tagName: 'div' })).toBe(false)
    }
    expect(supportsGridColumns({ ...base, tagName: 'img', children: [] })).toBe(false)
    expect(supportsGridColumns({ ...base, shortcode: { name: 'cards', props: {} } })).toBe(false)
  })

  it('一次將桌面調為三欄，其他裝置與子元件保留，復原重做同步反映在面板', () => {
    const h = setup({
      style: { display: 'flex', gap: '12px' },
      responsiveStyles: { mobile: { display: 'block' } },
    })
    const original = h.engine.getTree()
    const children = h.read().children
    const update = vi.spyOn(h.engine, 'update')
    h.preset(3).click()
    expect(update).toHaveBeenCalledExactlyOnceWith('cards', {
      style: { display: 'grid', [property]: columns(3) },
    })
    expect(h.read().style?.gap).toBe('12px')
    expect(h.read().responsiveStyles).toEqual({ mobile: { display: 'block' } })
    expect(h.read().children).toBe(children)
    expect(h.preset(3).getAttribute('aria-pressed')).toBe('true')
    h.preset(3).click()
    expect(update).toHaveBeenCalledTimes(1)
    h.engine.undo()
    expect(h.engine.getTree()).toBe(original)
    expect(h.engine.canUndo()).toBe(false)
    expect(h.preset(3).getAttribute('aria-pressed')).toBe('false')
    h.engine.redo()
    expect(h.input.value).toBe(columns(3))
  })

  it('辨識既有等寬欄及行內格線，精確還原目前裝置的欄寬繼承', () => {
    const inherited = 'MINMAX(0,1fr)  minmax( 0 , 1fr )'
    const h = setup(
      {
        style: { display: 'inline-grid', [property]: 'minmax(0, 1fr)' },
        responsiveStyles: { tablet: { [property]: inherited }, mobile: { gap: '1em' } },
      },
      'mobile',
    )
    expect(h.source?.textContent).toBe('繼承 平板')
    expect(h.preset(2).getAttribute('aria-pressed')).toBe('true')
    h.preset(2).click()
    expect(h.engine.canUndo()).toBe(false)
    expect(h.reset?.disabled).toBe(true)
    h.preset(1).click()
    expect(h.read().responsiveStyles?.mobile).toEqual({ gap: '1em', [property]: columns(1) })
    expect(h.source?.textContent).toBe('覆寫')
    h.reset?.focus()
    h.reset?.click()
    expect(document.activeElement).toBe(h.preset(2))
    expect(h.read().responsiveStyles?.mobile).toEqual({ gap: '1em' })
    expect(h.input.value).toBe(inherited)
    h.engine.update('cards', { responsiveStyles: { tablet: { [property]: '' } } })
    expect(h.preset(1).getAttribute('aria-pressed')).toBe('true')
    expect(h.source?.textContent).toBe('繼承 桌面')
    const update = vi.spyOn(h.engine, 'update')
    h.preset(1).click()
    expect(update).not.toHaveBeenCalled()
  })

  it('啟用已配置好欄寬的區段時只覆寫 display，已有格線時僅改欄寬', () => {
    const h = setup(
      { style: { display: 'flex', [property]: 'repeat( 3, minmax(0, 1fr) )' } },
      'tablet',
    )
    h.key('s', { ctrlKey: true })
    expect(h.engine.canUndo()).toBe(false)
    expect(h.preset(3).getAttribute('aria-pressed')).toBe('false')
    h.preset(3).click()
    expect(h.read().responsiveStyles).toEqual({ tablet: { display: 'grid' } })
    expect(h.preset(3).getAttribute('aria-pressed')).toBe('true')
    h.preset(6).click()
    h.reset?.click()
    expect(h.read().responsiveStyles).toEqual({ tablet: { display: 'grid' } })
    expect(h.preset(3).getAttribute('aria-pressed')).toBe('true')
  })

  it('只在送出時套用有效自訂欄軌；錯誤可見且保留輸入，Escape 可捨棄', () => {
    const initial = 'repeat(auto-fit, minmax(12rem, 1fr))'
    const h = setup({ style: { display: 'grid', [property]: initial } })
    const update = vi.spyOn(h.engine, 'update')
    expect(h.input.value).toBe(initial)
    h.type('minmax(0,')
    h.engine.update('cards', { style: { gap: '2rem' } })
    expect(h.input.value).toBe('minmax(0,')
    h.key('Enter')
    expect(h.input.getAttribute('aria-invalid')).toBe('true')
    expect(h.panel.el.querySelector('[role=alert]')?.textContent).toContain('CSS 欄寬')
    expect(h.read().style?.[property]).toBe(initial)
    h.type('invalid-value')
    vi.spyOn(Object.getPrototypeOf(CSS) as typeof CSS, 'supports').mockReturnValueOnce(false)
    expect(h.key('s', { metaKey: true })).toBe(false)
    expect(h.input.getAttribute('aria-invalid')).toBe('true')
    h.key('Escape')
    expect(h.input.hasAttribute('aria-invalid')).toBe(false)
    expect(h.input.value).toBe(initial)
    h.type('minmax(10rem, 1fr) 2fr')
    expect(h.key('s', { ctrlKey: true })).toBe(true)
    expect(h.read().style?.[property]).toBe('minmax(10rem, 1fr) 2fr')
    expect(update).toHaveBeenCalledTimes(2)
    h.input.dispatchEvent(new Event('blur'))
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('切換輸入法、鎖定及選取期間不會誤寫，解除掛載後舊控制失效', () => {
    const h = setup({ style: { display: 'grid', [property]: '1fr 2fr' } })
    const original = h.engine.getTree()
    h.input.dispatchEvent(new Event('compositionstart'))
    h.type('1fr 3fr')
    h.key('Enter')
    expect(h.key('s', { metaKey: true })).toBe(false)
    expect(h.engine.getTree()).toBe(original)
    h.input.dispatchEvent(new Event('compositionend'))
    h.input.dispatchEvent(new Event('change'))
    expect(h.read().style?.[property]).toBe('1fr 3fr')
    h.type('1fr 4fr')
    h.engine.update('cards', { locked: true })
    expect(h.input.disabled).toBe(true)
    expect(h.preset(3).disabled).toBe(true)
    expect(h.input.value).toBe('1fr 3fr')
    h.engine.update('cards', { locked: false })
    h.engine.select('card')
    h.preset(3).click()
    expect(h.read().style?.[property]).toBe('1fr 3fr')
    h.engine.select('cards')
    const globalKey = vi.fn()
    document.addEventListener('keydown', globalKey)
    try {
      h.preset(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      h.preset(3).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
      )
      expect(globalKey).not.toHaveBeenCalled()
      h.preset(3).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
      )
      expect(globalKey).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', globalKey)
    }
    h.panel.destroy()
    h.preset(2).click()
    expect(h.read().style?.[property]).toBe('1fr 3fr')
  })

  it('宿主可拒絕有效的 CSS 欄軌，保留可修正草稿並同步轉換錯誤語系', () => {
    const accept = vi.fn((value: string) => !value.includes('var('))
    const i18n = createI18n({
      zh: {},
      en: { 'grid.unsupported': 'This site does not support these column tracks.' },
    })
    const h = setup({ style: { display: 'grid', [property]: columns(2) } }, 'mobile', i18n, accept)
    h.type('minmax(0,')
    h.key('Enter')
    expect(accept).not.toHaveBeenCalled()
    h.type('var(--layout)')
    expect(h.key('s', { ctrlKey: true })).toBe(false)
    expect(accept).toHaveBeenCalledExactlyOnceWith('var(--layout)')
    expect(h.read().responsiveStyles).toBeUndefined()
    expect(h.engine.canUndo()).toBe(false)
    expect(h.input.value).toBe('var(--layout)')
    const alert = h.panel.el.querySelector<HTMLElement>('[role=alert]')!
    expect(alert.textContent).toBe('此網站不支援這種欄寬設定。')
    i18n.setLocale('en')
    expect(alert.textContent).toBe('This site does not support these column tracks.')
    h.key('Escape')
    expect(alert.hidden).toBe(true)
    expect(h.input.value).toBe(columns(2))
    h.type('2fr 1fr')
    h.key('Enter')
    expect(h.read().responsiveStyles?.mobile?.[property]).toBe('2fr 1fr')
    h.type('')
    h.key('Enter')
    h.preset(3).click()
    expect(accept.mock.calls).toEqual([['var(--layout)'], ['2fr 1fr']])
  })

  it('切換介面語系更新名稱、欄寬來源與按鈕狀態', () => {
    const i18n = createI18n({
      zh: {},
      en: {
        'grid.title': 'Grid columns',
        'grid.one': '1 column',
        'grid.count': '{count} columns',
        'grid.custom': 'Custom column tracks',
        'grid.inherit': 'Inherit column tracks',
        'style.inherit': 'Inherited from',
        'device.desktop': 'Desktop',
      },
    })
    const h = setup({ style: { display: 'grid', [property]: columns(4) } }, 'mobile', i18n)
    i18n.setLocale('en')
    expect(h.panel.el.querySelector('h4')?.textContent).toBe('Grid columns')
    expect(h.preset(1).getAttribute('aria-label')).toBe('1 column')
    expect(h.preset(4).getAttribute('aria-label')).toBe('4 columns')
    expect(h.preset(4).getAttribute('aria-pressed')).toBe('true')
    expect(h.source?.textContent).toBe('Inherited from Desktop')
  })
})
