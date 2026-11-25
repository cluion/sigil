import { afterEach, describe, expect, it } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function mount(kind: 'inspector' | 'props') {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'page',
        type: 'section',
        style: { padding: '1rem', margin: '0 auto' },
        responsiveStyles: { tablet: { padding: '8px 12px' } },
      },
    },
  })
  engine.select('page')
  const box = document.createElement('div')
  document.body.append(box)
  const opts = {
    device: 'mobile' as const,
    acceptsSpacingValue: (value: string) => !value.includes('vw') && value !== '2rem',
  }
  const panel =
    kind === 'inspector' ? createInspector(engine, box, opts) : createPropsPanel(engine, box, opts)
  box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')?.click()
  cleanups.push(() => {
    panel.destroy()
    engine.destroy()
    box.remove()
  })
  const input = (property: string) =>
    box.querySelector<HTMLInputElement>(`[data-box-side="${property}"]`)!
  const reset = (property: string) =>
    box.querySelector<HTMLButtonElement>(`[data-box-reset="${property}"]`)!
  const toggle = (property: string) =>
    box.querySelector<HTMLButtonElement>(`[data-box-spacing="${property}"] > button`)!
  function draft(property: string, value: string) {
    const field = input(property)
    field.focus()
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return field
  }
  return { engine, box, panel, input, reset, toggle, draft }
}

function press(field: HTMLElement, key: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  field.dispatchEvent(event)
  return event
}

describe.each(['inspector', 'props'] as const)('%s 單邊間距', (kind) => {
  it('保留裝置來歷、單步復原、鍵盤焦點與簡寫輸入', () => {
    const { engine, box, panel, input, reset, toggle, draft } = mount(kind)
    expect(toggle('padding').getAttribute('aria-expanded')).toBe('false')
    toggle('padding').click()
    expect(input('padding-bottom').value).toBe('8px')
    expect(input('padding-left').dataset.styleSource).toBe('tablet')
    expect(engine.canUndo()).toBe(false)
    press(draft('padding-bottom', '30px'), 'Enter')
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'padding-bottom': '30px' })
    engine.undo()
    expect(engine.canUndo()).toBe(false)
    expect(document.activeElement).toBe(input('padding-bottom'))
    expect(input('padding-bottom').value).toBe('8px')
    engine.redo()
    const shorthand = box.querySelector<HTMLInputElement>('[data-style-property="padding"]')!
    shorthand.value = '3rem'
    shorthand.dispatchEvent(new Event('input'))
    expect(input('padding-bottom').value).toBe('3rem')
    expect(reset('padding-bottom').disabled).toBe(false)
    shorthand.value = ''
    shorthand.dispatchEvent(new Event('input'))
    expect(input('padding-bottom').value).toBe('30px')
    reset('padding-bottom').focus()
    reset('padding-bottom').click()
    expect(document.activeElement).toBe(input('padding-bottom'))
    expect(input('padding-bottom').value).toBe('8px')
    panel.setDevice('desktop')
    expect(input('padding-bottom').value).toBe('1rem')
    expect(input('padding-bottom')).toBe(document.activeElement)
    expect(reset('padding-bottom').disabled).toBe(true)
  })

  it('驗證草稿與宿主限制；鍵盤存檔提交有效值，Escape 可復原輸入', () => {
    const { engine, input, toggle, draft } = mount(kind)
    toggle('padding').click()
    const bottom = draft('padding-bottom', '-5px')
    press(bottom, 'Enter')
    expect(bottom.getAttribute('aria-invalid')).toBe('true')
    expect(engine.canUndo()).toBe(false)
    expect(press(bottom, 's', { metaKey: true }).defaultPrevented).toBe(true)
    press(bottom, 'Escape')
    expect(bottom.value).toBe('8px')
    expect(bottom.hasAttribute('aria-invalid')).toBe(false)
    const validCSS = draft('padding-bottom', '5vw')
    expect(press(validCSS, 's', { ctrlKey: true }).defaultPrevented).toBe(true)
    const ids = validCSS.getAttribute('aria-describedby')!.split(' ')
    expect(
      ids.some((id) => document.getElementById(id)?.textContent === '此編輯器無法儲存這個間距'),
    ).toBe(true)
    expect(engine.canUndo()).toBe(false)
    expect(press(draft('padding-bottom', '3rem'), 's', { ctrlKey: true }).defaultPrevented).toBe(
      false,
    )
    expect(engine.getTree().responsiveStyles?.mobile?.['padding-bottom']).toBe('3rem')
    const margin = toggle('margin')
    margin.click()
    const left = draft('margin-left', '-2rem')
    left.dispatchEvent(new FocusEvent('blur'))
    expect(engine.getTree().responsiveStyles?.mobile?.['margin-left']).toBe('-2rem')
    engine.update('page', { locked: true })
    expect(input('margin-left').disabled).toBe(true)
    engine.update('page', { locked: false })
    engine.update('page', {
      responsiveStyles: { mobile: { 'margin-left': 'auto' } },
    })
    expect(input('margin-left').value).toBe('auto')
    press(input('margin-left'), 'Escape')
    expect(margin.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(margin)
  })

  it('簡寫保留合法值即時預覽，組字與無效草稿不變更已套用的單邊', () => {
    const { engine, box, input, toggle, draft } = mount(kind)
    toggle('padding').click()
    const raw = box.querySelector<HTMLInputElement>('[data-style-property="padding"]')!
    function type(value: string) {
      raw.value = value
      raw.dispatchEvent(new Event('input'))
    }
    raw.focus()
    raw.dispatchEvent(new CompositionEvent('compositionstart'))
    type('1rem 4%')
    expect(engine.canUndo()).toBe(false)
    raw.dispatchEvent(new CompositionEvent('compositionend'))
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ padding: '1rem 4%' })
    expect(input('padding-left').value).toBe('4%')
    press(draft('padding-left', '23px'), 'Enter')
    raw.focus()
    type('10px 2vw')
    expect(input('padding-left').value).toBe('23px')
    expect(press(raw, 's', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(raw.getAttribute('aria-invalid')).toBe('true')
    expect(engine.getTree().responsiveStyles?.mobile?.padding).toBe('1rem 4%')
    press(raw, 'Escape')
    expect(raw.value).toBe('1rem 4%')
    type('-1px')
    raw.dispatchEvent(new FocusEvent('blur'))
    expect(raw.getAttribute('aria-invalid')).toBe('true')
    expect(raw.value).toBe('-1px')
    type('9px 12px')
    expect(input('padding-left').value).toBe('12px')
    expect(raw.hasAttribute('aria-invalid')).toBe(false)
    expect(press(raw, 's', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(engine.getTree().responsiveStyles?.mobile?.padding).toBe('9px 12px')
  })
})

it('內距按鈕反映四個實際值；重套預設與單步復原會更新各邊', () => {
  const { engine, box, input, toggle, draft } = mount('inspector')
  const preset = () =>
    box.querySelector<HTMLButtonElement>('.sigil-padding-presets [value="1rem"]')!
  expect(
    box.querySelector<HTMLButtonElement>('.sigil-padding-presets [value="2rem"]')!.disabled,
  ).toBe(true)
  preset().click()
  toggle('padding').click()
  press(draft('padding-left', '24px'), 'Enter')
  expect(preset().getAttribute('aria-pressed')).toBe('false')
  preset().click()
  expect(input('padding-left').value).toBe('1rem')
  expect(preset().getAttribute('aria-pressed')).toBe('true')
  engine.undo()
  expect(input('padding-left').value).toBe('24px')
  expect(preset().getAttribute('aria-pressed')).toBe('false')
})
