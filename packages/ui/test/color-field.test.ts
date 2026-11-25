import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, type ComponentNode, type ResponsiveDevice } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function mount(
  selected: Partial<ComponentNode>,
  options: {
    device?: ResponsiveDevice
    panel?: 'props' | 'inspector'
    acceptsColorValue?: (color: string) => boolean
  } = {},
) {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'page',
        type: 'section',
        children: [
          { id: 'subject', type: 'text', ...selected },
          { id: 'other', type: 'text', style: { color: '#773344', background: '#334455' } },
        ],
      },
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  engine.select('subject')
  const panel =
    options.panel === 'props'
      ? createPropsPanel(engine, box, options)
      : createInspector(engine, box, options)
  box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')?.click()
  cleanup.push(() => {
    panel.destroy()
    engine.destroy()
    box.remove()
  })
  const root = () => engine.getTree()
  const field = (property: string) => {
    const group = box.querySelector<HTMLElement>(`[data-color-property="${property}"]`)!
    const text = group.querySelector<HTMLInputElement>('input[type="text"]')!
    return {
      group,
      text,
      reset: group.querySelector<HTMLButtonElement>('[data-style-reset]'),
      native: group.querySelector<HTMLInputElement>('input[type="color"]')!,
      palette: group.querySelector<HTMLButtonElement>('.sigil-color-palette-toggle')!,
      fill(value: string) {
        text.value = value
        text.dispatchEvent(new Event('input'))
      },
      key(key: string, extras: KeyboardEventInit = {}) {
        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key,
          ...extras,
        })
        text.dispatchEvent(event)
        return event
      },
    }
  }
  return { box, root, engine, field, node: () => root().children![0]! }
}

describe('裝置色彩欄位', () => {
  it.each(['inspector', 'props'] as const)(
    '%s 精確呈現色值，只在提交有效文字時寫入，目前裝置可清除覆寫',
    (panel) => {
      const h = mount(
        {
          style: { color: '#0fa8', background: '#dcb' },
          responsiveStyles: { mobile: { gap: '8px' } },
        },
        { panel, device: 'mobile' },
      )
      const original = h.root()
      const color = h.field('color')
      expect(color.text.value).toBe('#0fa8')
      expect(color.native.value).toBe('#00ffaa')
      expect(color.reset?.disabled).toBe(true)
      expect(h.field('background-color').native.value).toBe('#ddccbb')
      color.fill('#1')
      expect(color.key('s', { ctrlKey: true }).defaultPrevented).toBe(true)
      expect(color.text.getAttribute('aria-invalid')).toBe('true')
      expect(h.root()).toBe(original)
      color.key('Escape')
      expect(color.text.value).toBe('#0fa8')
      const precise = 'var(--accent)'
      color.fill(precise)
      color.text.dispatchEvent(new Event('compositionstart'))
      color.key('Enter')
      expect(h.root()).toBe(original)
      color.text.dispatchEvent(new Event('compositionend'))
      color.key('Enter')
      expect(h.node().responsiveStyles?.mobile).toEqual({ color: precise, gap: '8px' })
      expect(color.text.value).toBe(precise)
      color.reset?.focus()
      color.reset?.click()
      expect(document.activeElement).toBe(color.text)
      expect(color.text.value).toBe('#0fa8')
      expect(h.node().responsiveStyles?.mobile).toEqual({ gap: '8px' })
      h.engine.undo()
      expect(h.field('color').text.value).toBe(precise)
      h.engine.undo()
      expect(h.root()).toBe(original)
    },
  )

  it('重設同裝置簡寫前的背景長屬性，保留背景圖層及一次復原邊界', () => {
    const background = 'linear-gradient(red, blue)'
    const h = mount({ style: { 'background-color': '#334455', background } })
    const original = h.root()
    const bg = h.field('background-color')
    bg.fill('#334455')
    bg.key('Enter')
    const updated = h.node().style!
    expect(updated.background).toBe(background)
    expect(Object.keys(updated)).toEqual(['background', 'background-color'])
    expect(bg.text.value).toBe('#334455')
    h.engine.undo()
    expect(h.root()).toBe(original)
    expect(h.engine.canUndo()).toBe(false)
  })

  it('擷取頁面可用色票並套用一次，拒絕宿主無法保存的色值', () => {
    const accepts = vi.fn((value: string) => !value.startsWith('var(') && value !== '#773344')
    const h = mount({ style: { color: 'transparent' } }, { acceptsColorValue: accepts })
    const original = h.root()
    const color = h.field('color')
    expect(accepts).not.toHaveBeenCalled()
    expect(color.text.value).toBe('transparent')
    expect(color.group.querySelectorAll('.sigil-color-option')).toHaveLength(0)
    color.fill('var(--brand)')
    color.key('Enter')
    expect(color.group.textContent).toContain('無法儲存')
    expect(h.root()).toBe(original)
    color.palette.click()
    expect(color.group.querySelector('button[value="#773344"]')).toBeNull()
    const swatch = color.group.querySelector<HTMLButtonElement>('button[value="#334455"]')!
    swatch.click()
    expect(document.activeElement).toBe(color.palette)
    expect(color.palette.getAttribute('aria-expanded')).toBe('false')
    expect(color.text.value).toBe('#334455')
    expect(h.node().style?.color).toBe('#334455')
    h.engine.undo()
    expect(h.root()).toBe(original)
    expect(h.engine.canUndo()).toBe(false)
  })

  it('鎖定或切換選取會棄置編輯中的草稿，舊欄位不會更動文件', () => {
    const h = mount({ style: { color: 'red' } })
    const field = h.field('color')
    field.fill('navy')
    h.engine.update('subject', { locked: true })
    expect(field.text.disabled).toBe(true)
    expect(field.text.value).toBe('red')
    field.key('Enter')
    h.engine.update('subject', { locked: false })
    field.fill('blue')
    h.engine.select('other')
    field.key('Enter')
    expect(h.node().style?.color).toBe('red')
    expect(h.field('color').text.value).toBe('#773344')
  })

  it('等價色票會標為已選，點選不會改寫色值，直接輸入可保留指定的寫法', () => {
    const h = mount({ style: { color: '#AbC' } })
    h.engine.update('page', { style: { 'background-color': '#aabbcc' } })
    const before = h.root()
    const { group, palette, fill, key } = h.field('color')
    palette.click()
    const swatch = group.querySelector<HTMLButtonElement>('button[value="#aabbcc"]')!
    expect(swatch.getAttribute('aria-pressed')).toBe('true')
    swatch.click()
    expect(h.root()).toBe(before)
    fill('#aabbcc')
    key('Enter')
    expect(h.node().style?.color).toBe('#aabbcc')
    h.engine.undo()
    expect(h.root()).toBe(before)
  })
})
