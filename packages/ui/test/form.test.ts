import { describe, it, expect, vi } from 'vitest'
import { createEngine, type PropSchema } from '@cluion/sigil-core'
import { createPropForm } from '../src/form.js'

function setup(schema: PropSchema[], props: Record<string, unknown> = {}) {
  const engine = createEngine({
    doc: { version: 1 as const, root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props } } },
  })
  const handle = createPropForm({ engine, node: engine.getTree(), schema })
  return { engine, form: handle.el, destroy: handle.destroy }
}

describe('createPropForm', () => {
  it('text 生成 input[type=text],初始值取自 props', () => {
    const { form } = setup([{ name: 'label', type: 'text' }], { label: 'hi' })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(input.value).toBe('hi')
  })

  it('number 生成 input[type=number],初始值取自 props', () => {
    const { form } = setup([{ name: 'step', type: 'number' }], { step: 3 })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('number')
    expect(input.value).toBe('3')
  })

  it('number 變動 → Number 轉換並寫入 engine', () => {
    const { engine, form } = setup([{ name: 'step', type: 'number' }], { step: 1 })
    const input = form.querySelector('input') as HTMLInputElement
    input.value = '5'
    input.dispatchEvent(new Event('input'))
    expect(engine.getTree().shortcode!.props.step).toBe(5)
  })

  it('boolean 生成 checkbox,變動寫入 boolean', () => {
    const { engine, form } = setup([{ name: 'on', type: 'boolean' }], { on: false })
    const cb = form.querySelector('input') as HTMLInputElement
    expect(cb.type).toBe('checkbox')
    expect(cb.checked).toBe(false)
    cb.checked = true
    cb.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.on).toBe(true)
  })

  it('select 生成 select + options,變動寫入值', () => {
    const { engine, form } = setup(
      [{ name: 'align', type: 'select', options: [{ value: 'l' }, { value: 'r' }] }],
      { align: 'l' },
    )
    const sel = form.querySelector('select') as HTMLSelectElement
    expect(sel.options.length).toBe(2)
    expect(sel.value).toBe('l')
    sel.value = 'r'
    sel.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.align).toBe('r')
  })

  it('color 生成 input[type=color]', () => {
    const { form } = setup([{ name: 'c', type: 'color' }], { c: '#ff0000' })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('color')
    expect(input.value).toBe('#ff0000')
  })

  it('label 顯示(label 或 name)', () => {
    const { form } = setup([{ name: 'k', type: 'text', label: '自訂' }])
    expect(form.querySelector('label')?.textContent).toContain('自訂')
  })

  it('group 產生分組標題', () => {
    const { form } = setup([
      { name: 'a', type: 'text', group: '基本' },
      { name: 'b', type: 'text', group: '基本' },
      { name: 'c', type: 'text', group: '進階' },
    ])
    const titles = [...form.querySelectorAll('[data-prop-group]')].map((el) => el.textContent)
    expect(titles).toEqual(['基本', '進階'])
  })

  it('dependsOn 隱藏不符條件的欄位', () => {
    const { engine, form } = setup(
      [
        {
          name: 'kind',
          type: 'select',
          options: [
            { value: 'simple', label: '簡單' },
            { value: 'full', label: '完整' },
          ],
        },
        {
          name: 'detail',
          type: 'text',
          label: '細節',
          dependsOn: { prop: 'kind', eq: 'full' },
        },
      ],
      { kind: 'simple' },
    )
    const detail = form.querySelector('[data-prop-field="detail"]') as HTMLElement
    expect(detail.hidden).toBe(true)

    const sel = form.querySelector('select') as HTMLSelectElement
    sel.value = 'full'
    sel.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.kind).toBe('full')
    expect(detail.hidden).toBe(false)
  })

  it('media 生成 url 輸入與選圖', async () => {
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: {
          id: 'n',
          type: 'shortcode',
          shortcode: { name: 'x', props: { src: 'https://a.test/x.png' } },
        },
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      schema: [{ name: 'src', type: 'media', label: '圖' }],
      assets: {
        list: () => [{ id: '1', url: 'https://b.test/y.png', name: 'Y' }],
      },
    })
    const form = handle.el
    const input = form.querySelector('input.sigil-input') as HTMLInputElement
    expect(input.value).toBe('https://a.test/x.png')
    const pick = form.querySelector('button') as HTMLButtonElement
    expect(pick.textContent).toBe('選圖')
    pick.click()
    await vi.waitFor(() => {
      expect(document.querySelector('.sigil-media-card')).toBeTruthy()
    })
    ;(document.querySelector('.sigil-media-card') as HTMLButtonElement).click()
    expect(engine.getTree().shortcode!.props.src).toBe('https://b.test/y.png')
  })

  it('date 生成 input[type=date]，變動寫入字串', () => {
    const { engine, form } = setup([{ name: 'd', type: 'date' }], { d: '2026-07-01' })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe('2026-07-01')
    input.value = '2026-08-15'
    input.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.d).toBe('2026-08-15')
  })

  it('repeater 初始渲染多筆，子欄位變動寫入陣列', () => {
    const { engine, form } = setup(
      [
        {
          name: 'items',
          type: 'repeater',
          schema: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
          ],
        },
      ],
      { items: [{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }] },
    )
    const inputs = [...form.querySelectorAll('.sigil-repeater-item input')] as HTMLInputElement[]
    expect(inputs.length).toBe(4) // 2 筆 × 2 欄位
    // 改第一筆的 label
    inputs[0]!.value = 'A2'
    inputs[0]!.dispatchEvent(new Event('input'))
    expect((engine.getTree().shortcode!.props.items as { label: string }[])[0]!.label).toBe('A2')
  })

  it('repeater 新增一筆 → props 陣列 +1', () => {
    const { engine, form } = setup(
      [
        {
          name: 'items',
          type: 'repeater',
          schema: [{ name: 'label', type: 'text' }],
        },
      ],
      { items: [{ label: 'A' }] },
    )
    const addBtn = [...form.querySelectorAll('button')].find((b) => b.textContent === '+ 新增')!
    addBtn.click()
    const items = engine.getTree().shortcode!.props.items as unknown[]
    expect(items.length).toBe(2)
    expect(items[1]).toEqual({})
  })

  it('repeater 刪除一筆 → props 陣列 -1', () => {
    const { engine, form } = setup(
      [
        {
          name: 'items',
          type: 'repeater',
          schema: [{ name: 'label', type: 'text' }],
        },
      ],
      { items: [{ label: 'A' }, { label: 'B' }] },
    )
    const delBtn = [...form.querySelectorAll('button')].find((b) => b.textContent === '刪除')!
    delBtn.click()
    const items = engine.getTree().shortcode!.props.items as { label: string }[]
    expect(items.length).toBe(1)
    expect(items[0]!.label).toBe('B')
  })

  it('repeater 子欄位含 select 正確渲染', () => {
    const { form } = setup(
      [
        {
          name: 'items',
          type: 'repeater',
          schema: [
            {
              name: 'align',
              type: 'select',
              options: [{ value: 'l' }, { value: 'r' }],
            },
          ],
        },
      ],
      { items: [{ align: 'l' }] },
    )
    const sel = form.querySelector('.sigil-repeater-item select') as HTMLSelectElement
    expect(sel.options.length).toBe(2)
    expect(sel.value).toBe('l')
  })

  it('optionsFrom select 初始載入選項', async () => {
    const fetchJSON = vi.fn(async (url: string) => {
      if (url.startsWith('/sizes')) return { sizes: [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }] }
      return {}
    })
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props: { color: 'red', size: 'm' } } },
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      schema: [
        {
          name: 'size',
          type: 'select',
          dependsOn: { prop: 'color' },
          optionsFrom: async (ctx) => {
            const d = (await ctx.fetchJSON('/sizes', ctx.signal)) as { sizes: { value: string; label: string }[] }
            return d.sizes ?? []
          },
        },
      ],
      fetchJSON,
    })
    const sel = handle.el.querySelector('select') as HTMLSelectElement
    // 載入中 placeholder
    expect(sel.options.length).toBe(1)
    await vi.waitFor(() => expect(sel.options.length).toBe(2))
    expect(sel.value).toBe('m') // 保留已選值
    handle.destroy()
  })

  it('dependsOn prop 變動 → optionsFrom 重載', async () => {
    const sizesByColor: Record<string, { value: string; label: string }[]> = {
      red: [{ value: 's', label: 'S' }],
      blue: [{ value: 'm', label: 'M' }, { value: 'l', label: 'L' }],
    }
    const fetchJSON = vi.fn(async (url: string) => {
      const params = new URLSearchParams(url.split('?')[1] ?? '')
      return { sizes: sizesByColor[params.get('color') ?? 'red'] ?? [] }
    })
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props: { color: 'red', size: 's' } } },
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      schema: [
        { name: 'color', type: 'select', options: [{ value: 'red' }, { value: 'blue' }] },
        {
          name: 'size',
          type: 'select',
          dependsOn: { prop: 'color' },
          optionsFrom: async (ctx) => {
            const d = (await ctx.fetchJSON(`/sizes?color=${ctx.props.color}`, ctx.signal)) as {
              sizes: { value: string; label: string }[]
            }
            return d.sizes ?? []
          },
        },
      ],
      fetchJSON,
    })
    const selects = handle.el.querySelectorAll('select')
    const colorSel = selects[0] as HTMLSelectElement
    const sizeSel = selects[1] as HTMLSelectElement

    await vi.waitFor(() => expect(sizeSel.options.length).toBe(1)) // red → 1 個 size

    // 改 color → blue，觸發 size 重載
    colorSel.value = 'blue'
    colorSel.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(sizeSel.options.length).toBe(2)) // blue → 2 個 size
    handle.destroy()
  })

  it('optionsFrom 載入失敗顯示提示、不崩', async () => {
    const fetchJSON = vi.fn(async () => Promise.reject(new Error('fail')))
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props: {} } },
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      schema: [
        {
          name: 'size',
          type: 'select',
          optionsFrom: async (ctx) => {
            await ctx.fetchJSON('/sizes', ctx.signal)
            return []
          },
        },
      ],
      fetchJSON,
    })
    const sel = handle.el.querySelector('select') as HTMLSelectElement
    await vi.waitFor(() => expect(sel.options[0]?.textContent).toBe('載入失敗'))
    handle.destroy()
  })

  it('無 fetchJSON → 顯示無法載入', async () => {
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props: {} } },
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      schema: [
        {
          name: 'size',
          type: 'select',
          optionsFrom: async () => [],
        },
      ],
      // 不傳 fetchJSON
    })
    const sel = handle.el.querySelector('select') as HTMLSelectElement
    expect(sel.options[0]?.textContent).toBe('無法載入')
    handle.destroy()
  })
})

