import { afterEach, describe, expect, it } from 'vitest'
import { createEngine, createI18n } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})

function mount(kind: 'inspector' | 'props') {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'page',
        type: 'section',
        style: { display: 'inline-flex', gap: '1rem' },
        responsiveStyles: { tablet: { gap: '8px 12px' } },
        children: [
          { id: 'text', type: 'text', style: { display: 'flex' } },
          { id: 'managed', type: 'section', style: { display: 'grid' } },
        ],
      },
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  engine.select('page')
  const i18n = createI18n({
    zh: {},
    en: { 'layout.separate_gaps': 'Adjust gaps separately', 'style.property.row-gap': 'Row gap' },
  })
  const options = {
    device: 'mobile' as const,
    i18n,
    richText: { supports: (node: { id: string }) => node.id === 'managed', read: () => '' },
    acceptsSpacingValue: (value: string) => !value.includes('vw') && value !== '2rem',
  }
  const panel =
    kind === 'inspector'
      ? createInspector(engine, box, options)
      : createPropsPanel(engine, box, options)
  box.querySelector<HTMLButtonElement>('[role=tab][id$="-style"]')?.click()
  cleanup.push(() => {
    panel.destroy()
    engine.destroy()
    box.remove()
  })
  const toggle = () => box.querySelector<HTMLButtonElement>('[data-gap-toggle]')!
  const axis = (dir: string) =>
    box.querySelector<HTMLInputElement>(`[data-style-property="${dir}-gap"]`)!
  const reset = (dir: string) => box.querySelector<HTMLButtonElement>(`[data-gap-reset="${dir}"]`)!
  const wrap = () => box.querySelector<HTMLSelectElement>('[data-style-property="flex-wrap"]')!
  function type(input: HTMLInputElement, value: string) {
    input.focus()
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { engine, box, panel, i18n, toggle, axis, reset, wrap, type }
}

function press(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe.each(['inspector', 'props'] as const)('%s 容器間距', (kind) => {
  it('以單軸草稿調整本裝置的值，清除、切裝置與復原保留實際樣式及焦點', () => {
    const { engine, panel, i18n, toggle, axis, reset, type } = mount(kind)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    toggle().click()
    expect(axis('row').value).toBe('8px')
    expect(axis('column').value).toBe('12px')
    expect(axis('row').dataset.styleSource).toBe('tablet')
    expect(reset('row').disabled).toBe(true)
    type(axis('row'), '6vw')
    press(axis('row'), 'Enter')
    expect(axis('row').getAttribute('aria-invalid')).toBe('true')
    expect(engine.canUndo()).toBe(false)
    press(axis('row'), 'Escape')
    expect(axis('row').value).toBe('8px')
    type(axis('row'), '-1px')
    axis('row').dispatchEvent(new FocusEvent('blur'))
    expect(axis('row').getAttribute('aria-invalid')).toBe('true')
    type(axis('row'), '18px')
    expect(engine.canUndo()).toBe(false)
    press(axis('row'), 'Enter')
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'row-gap': '18px' })
    expect(axis('column').value).toBe('12px')
    expect(document.activeElement).toBe(axis('row'))
    engine.undo()
    expect(engine.canUndo()).toBe(false)
    expect(document.activeElement).toBe(axis('row'))
    expect(axis('row').value).toBe('8px')
    engine.redo()
    reset('row').focus()
    reset('row').click()
    expect(reset('row').disabled).toBe(true)
    expect(document.activeElement).toBe(axis('row'))
    expect(axis('row').value).toBe('8px')
    type(axis('column'), '3.5%')
    axis('column').dispatchEvent(new FocusEvent('blur'))
    expect(engine.getTree().responsiveStyles?.mobile?.['column-gap']).toBe('3.5%')
    panel.setDevice('desktop')
    expect(axis('column').value).toBe('1rem')
    expect(document.activeElement).toBe(axis('column'))
    i18n.setLocale('en')
    expect(toggle().textContent).toBe('Adjust gaps separately')
    expect(document.activeElement).toBe(axis('column'))
    type(axis('column'), '9px')
    engine.update('page', { locked: true })
    expect(axis('column').disabled).toBe(true)
    expect(axis('column').value).toBe('1rem')
  })

  it('依目前裝置顯示 Flex 換行與 Grid 或 Flex 間距，不向文字或託管內容顯示', () => {
    const { engine, panel, i18n, toggle, wrap } = mount(kind)
    expect(wrap().closest('[hidden]')).toBeNull()
    wrap().focus()
    i18n.setLocale('en')
    expect(document.activeElement).toBe(wrap())
    wrap().value = 'wrap'
    wrap().dispatchEvent(new Event('change'))
    expect(engine.getTree().responsiveStyles?.mobile?.['flex-wrap']).toBe('wrap')
    engine.undo()
    expect(wrap().value).toBe('nowrap')
    expect(document.activeElement).toBe(wrap())
    engine.update('page', { responsiveStyles: { mobile: { display: 'inline grid' } } })
    expect(wrap().closest('[hidden]')).toBeTruthy()
    expect(toggle().closest('[hidden]')).toBeNull()
    engine.update('page', { responsiveStyles: { mobile: { display: 'block' } } })
    expect(toggle().closest('[hidden]')).toBeTruthy()
    panel.setDevice('desktop')
    expect(toggle().closest('[hidden]')).toBeNull()
    for (const id of ['text', 'managed']) {
      engine.select(id)
      expect(toggle()).toBeNull()
      expect(wrap()).toBeNull()
    }
  })
})

it('Studio 統一預設覆蓋兩軸，清除時保留原本的單軸設定', () => {
  const { engine, box, toggle, axis, type } = mount('inspector')
  toggle().click()
  type(axis('row'), '24px')
  press(axis('row'), 'Enter')
  const preset = () => box.querySelector<HTMLSelectElement>('[data-style-property=gap]')!
  const commonReset = () => box.querySelector<HTMLButtonElement>('[data-style-reset=gap]')!
  const commonSource = () => box.querySelector<HTMLElement>('[data-style-source-label=gap]')!
  expect(preset().selectedOptions[0]?.textContent).toBe('分別設定')
  expect(commonSource().hidden).toBe(true)
  expect(commonReset().hidden).toBe(true)
  expect(preset().hasAttribute('aria-describedby')).toBe(false)
  expect(preset().querySelector<HTMLOptionElement>('option[value="2rem"]')?.disabled).toBe(true)
  preset().value = '1rem'
  preset().dispatchEvent(new Event('change'))
  expect(axis('row').value).toBe('1rem')
  expect(axis('column').value).toBe('1rem')
  expect(preset().value).toBe('1rem')
  expect(commonSource().hidden).toBe(false)
  expect(commonSource().textContent).toBe('覆寫')
  expect(commonReset().hidden).toBe(false)
  expect(commonReset().textContent).toBe('清除共用間距')
  commonReset().focus()
  commonReset().click()
  expect(axis('row').value).toBe('24px')
  expect(axis('column').value).toBe('12px')
  expect(preset().selectedOptions[0]?.textContent).toBe('分別設定')
  expect(commonReset().hidden).toBe(true)
  expect(document.activeElement).toBe(preset())
  engine.update('page', { responsiveStyles: { mobile: { 'column-gap': '24px' } } })
  expect(preset().selectedOptions[0]?.textContent).toBe('24px')
  expect(commonSource().hidden).toBe(false)
  expect(commonSource().textContent).toBe('覆寫')
  expect(commonReset().hidden).toBe(true)
})

it('舊文件 flex-flow 決定方向時顯示實際值、局部覆寫與清除不改換行', () => {
  const { engine, box, panel, wrap } = mount('inspector')
  engine.update('page', {
    responsiveStyles: {
      mobile: {
        'flex-direction': 'row',
        'flex-flow': 'column-reverse wrap',
      },
    },
  })
  const direction = () =>
    box.querySelector<HTMLSelectElement>('[data-style-property="flex-direction"]')!
  const reset = () => box.querySelector<HTMLButtonElement>('[data-style-reset="flex-direction"]')!
  expect(direction().value).toBe('')
  expect(direction().selectedOptions[0]?.textContent).toBe('來自 flex-flow · 反向直排')
  expect(direction().title).toBe('來自 flex-flow')
  expect(reset().disabled).toBe(false)
  reset().click()
  expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'flex-flow': 'column-reverse wrap' })
  expect(reset().disabled).toBe(true)
  direction().focus()
  direction().value = 'row'
  direction().dispatchEvent(new Event('change'))
  expect(direction().value).toBe('row')
  expect(wrap().value).toBe('wrap')
  engine.undo()
  expect(document.activeElement).toBe(direction())
  expect(direction().selectedOptions[0]?.textContent).toContain('反向直排')
  engine.update('page', { responsiveStyles: { tablet: { 'flex-flow': 'column wrap' } } })
  panel.setDevice('tablet')
  expect(direction().selectedOptions[0]?.textContent).toBe('來自 flex-flow · 直向')
  panel.setDevice('desktop')
  expect(direction().selectedOptions[0]?.textContent).toBe('未設')
})
