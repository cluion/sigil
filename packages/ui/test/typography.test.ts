import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, type ComponentNode } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'
import {
  typographyValues,
  writeTypography,
  type AcceptsTypographyValue,
} from '../src/typography.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function mount(
  kind: 'inspector' | 'props',
  original: ComponentNode,
  acceptsTypographyValue?: AcceptsTypographyValue,
) {
  const engine = createEngine({ doc: { version: 1, root: original } })
  engine.select(original.id)
  const div = document.createElement('div')
  document.body.append(div)
  const panel =
    kind === 'props'
      ? createPropsPanel(engine, div, { acceptsTypographyValue })
      : createInspector(engine, div, { acceptsTypographyValue })
  if (kind === 'inspector') {
    div.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')!.click()
    Array.from(div.querySelectorAll<HTMLButtonElement>('.sigil-style-section-title button'))
      .find((el) => el.textContent === '文字')!
      .click()
  }
  cleanups.push(() => {
    panel.destroy()
    div.remove()
  })
  const preset = () => div.querySelector<HTMLSelectElement>('[data-typography-preset]')!
  const input = (prop: string) =>
    div.querySelector<HTMLInputElement>(`input[data-style-property="${prop}"]`)!
  function choose(value: string) {
    const select = preset()
    select.value = value
    select.dispatchEvent(new Event('change'))
  }
  function draft(prop: string, value: string) {
    const field = input(prop)
    field.focus()
    field.value = value
    field.dispatchEvent(new Event('input'))
    return field
  }
  return { engine, div, panel, preset, input, choose, draft }
}

function press(field: HTMLElement, key: string, ctrlKey = false) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  return event
}

describe.each(['inspector', 'props'] as const)('%s 的文字排版', (kind) => {
  it('以單步歷程套用預設；手機只寫入和較寬裝置相異的值，保留標籤/其他樣式/焦點', () => {
    const original = {
      id: 'n',
      type: 'text',
      tagName: 'p',
      content: '長篇介紹',
      style: { color: 'teal', 'font-size': '1rem', 'font-weight': 'normal', 'line-height': '1.2' },
      responsiveStyles: {
        tablet: { 'letter-spacing': 'normal' },
        mobile: { 'text-align': 'center' },
      },
    }
    const { engine, panel, preset, input, choose } = mount(kind, original)
    panel.setDevice('mobile')
    preset().focus()
    choose('body')
    expect(engine.getTree()).toEqual({
      ...original,
      responsiveStyles: {
        tablet: original.responsiveStyles.tablet,
        mobile: { 'text-align': 'center', 'line-height': '1.6' },
      },
    })
    expect(input('line-height').value).toBe('1.6')
    expect(input('font-size').placeholder).toContain('1rem')
    expect(preset().value).toBe('body')
    const after = engine.getTree()
    choose('body')
    expect(engine.getTree()).toBe(after)
    engine.undo()
    expect(engine.canUndo()).toBe(false)
    expect(engine.getTree()).toEqual(original)
    expect(preset().value).toBe('')
    expect(document.activeElement).toBe(preset())
    engine.redo()
    expect(preset().value).toBe('body')
    expect(input('line-height').value).toBe('1.6')
    panel.setDevice('desktop')
    expect(preset().value).toBe('')
    choose('display')
    expect(engine.getTree().style).toMatchObject({
      'font-size': 'clamp(2rem, 5vw, 4rem)',
      'font-weight': '700',
      'line-height': '1.1',
      'letter-spacing': '-0.035em',
      color: 'teal',
    })
    const weight = input('font-size')
      .closest('.sigil-typography-fields')!
      .querySelector<HTMLSelectElement>('select[data-style-property="font-weight"]')!
    expect(weight.value).toBe('bold')
    expect(Array.from(weight.options).map((option) => option.value)).toEqual([
      '',
      'normal',
      '600',
      'bold',
      '__sigil_custom__',
    ])
    engine.update('n', { locked: true })
    expect(preset().disabled).toBe(true)
    expect(input('line-height').disabled).toBe(true)
    const locked = engine.getTree()
    choose('caption')
    expect(engine.getTree()).toBe(locked)
  })
  it('區分輸入草稿與已套用值，保留有效字級即時預覽，外部更新、Esc 和按鍵存檔會同步', () => {
    const { engine, input, draft, preset, div, panel } = mount(
      kind,
      { id: 'n', type: 'text', style: { 'line-height': '1.2' } },
      (prop, value) => value !== 'var(--tracking)' && !(prop === 'font-weight' && value === '700'),
    )
    expect(preset().querySelector<HTMLOptionElement>('option[value="display"]')!.disabled).toBe(
      true,
    )
    const size = draft('font-size', '1.25em')
    expect(engine.getTree().style?.['font-size']).toBe('1.25em')
    draft('font-size', 'clamp(1rem,')
    press(size, 'Enter')
    expect(size.getAttribute('aria-invalid')).toBe('true')
    expect(size.value).toBe('clamp(1rem,')
    press(size, 'Escape')
    expect(size.value).toBe('1.25em')
    panel.setDevice('mobile')
    const invalid = draft('line-height', 'not-a-size')
    press(invalid, 'Enter')
    expect(invalid.getAttribute('aria-invalid')).toBe('true')
    expect(invalid.value).toBe('not-a-size')
    expect(engine.getTree().responsiveStyles).toBeUndefined()
    press(invalid, 'Escape')
    const leading = draft('line-height', '1.75')
    expect(engine.getTree().responsiveStyles).toBeUndefined()
    expect(press(leading, 's', true).defaultPrevented).toBe(false)
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'line-height': '1.75' })
    const track = draft('letter-spacing', 'var(--tracking)')
    expect(press(track, 's', true).defaultPrevented).toBe(true)
    expect(track.getAttribute('aria-invalid')).toBe('true')
    engine.update('n', { responsiveStyles: { mobile: { 'letter-spacing': '0.04em' } } })
    expect(track.value).toBe('0.04em')
    expect(track.hasAttribute('aria-invalid')).toBe(false)
    draft('letter-spacing', '-0.03em').dispatchEvent(new FocusEvent('blur'))
    expect(engine.getTree().responsiveStyles?.mobile?.['letter-spacing']).toBe('-0.03em')
    div.querySelector<HTMLButtonElement>('[data-style-reset="letter-spacing"]')!.click()
    expect(engine.getTree().responsiveStyles?.mobile?.['letter-spacing']).toBeUndefined()
    expect(document.activeElement).toBe(input('letter-spacing'))
    const weight = div.querySelector<HTMLSelectElement>('[data-style-property="font-weight"]')!
    weight.value = '__sigil_custom__'
    weight.dispatchEvent(new Event('change'))
    const custom = div.querySelector<HTMLInputElement>(
      '.sigil-typography-fields .sigil-style-custom',
    )!
    custom.value = '700'
    custom.dispatchEvent(new Event('input'))
    press(custom, 'Enter')
    expect(custom.getAttribute('aria-invalid')).toBe('true')
    expect(engine.getTree().responsiveStyles?.mobile?.['font-weight']).toBeUndefined()
  })
})

it('編輯相同裝置的舊長寫時移到 font 簡寫後；保留字型家族、字型樣式和其他裝置', () => {
  const original = {
    id: 'n',
    type: 'text',
    style: { 'font-size': '20px', font: 'italic bold 18px/1.3 serif', 'letter-spacing': '1px' },
    responsiveStyles: { tablet: { 'font-weight': '400' } },
  }
  const engine = createEngine({ doc: { version: 1, root: original } })
  engine.select('n')
  writeTypography(engine, 'n', 'desktop', { 'font-size': '24px', 'line-height': '1.5' }, true)
  const keys = Object.keys(engine.getTree().style!)
  expect(keys.indexOf('font-size')).toBeGreaterThan(keys.indexOf('font'))
  expect(keys.indexOf('line-height')).toBeGreaterThan(keys.indexOf('font'))
  expect(engine.getTree().style?.font).toBe(original.style.font)
  expect(typographyValues(engine.getTree(), 'tablet')['font-weight'].effective).toBe('400')
  engine.undo()
  expect(engine.getTree()).toBe(original)
  expect(engine.canUndo()).toBe(false)
})
