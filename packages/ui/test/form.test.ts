import { afterEach, describe, it, expect, vi } from 'vitest'
import { createEngine, createI18n, type AssetItem, type PropSchema } from '@cluion/sigil-core'
import { createPropForm } from '../src/form.js'
import { createEnglishUiI18n } from './i18n.js'

const mediaCleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mediaCleanups.splice(0).reverse()) cleanup()
})

function deferredMedia() {
  let resolve!: (value: AssetItem) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<AssetItem>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function setup(schema: PropSchema[], props: Record<string, unknown> = {}) {
  const engine = createEngine({
    doc: {
      version: 1 as const,
      root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props } },
    },
  })
  const handle = createPropForm({ engine, node: engine.getTree(), schema })
  return { engine, form: handle.el, destroy: handle.destroy }
}

describe('createPropForm', () => {
  it('runtime locale 切換更新控制文字並保留欄位狀態', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'n',
          type: 'shortcode',
          shortcode: { name: 'x', props: { items: [{ label: 'A' }], src: '' } },
        },
      },
    })
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      i18n,
      schema: [
        {
          name: 'items',
          type: 'repeater',
          schema: [{ name: 'label', type: 'text' }],
        },
        { name: 'src', type: 'media' },
        { name: 'remote', type: 'select', optionsFrom: async () => [] },
      ],
      assets: { list: () => [] },
    })
    document.body.appendChild(handle.el)

    const input = handle.el.querySelector('.sigil-repeater-item input') as HTMLInputElement
    input.value = 'A2'
    input.dispatchEvent(new Event('input'))
    input.focus()
    expect(handle.el.textContent).toContain('+ 新增')
    expect(handle.el.textContent).toContain('刪除')
    expect(handle.el.textContent).toContain('選圖')
    expect(
      (handle.el.querySelector('[data-prop-field="remote"] select') as HTMLSelectElement)
        .textContent,
    ).toBe('無法載入')

    i18n.setLocale('en')

    expect(handle.el.textContent).toContain('+ Add')
    expect(handle.el.textContent).toContain('Delete')
    expect(handle.el.textContent).toContain('Choose image')
    expect(handle.el.querySelector('.sigil-repeater-item input')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect((engine.getTree().shortcode?.props.items as { label: string }[])[0]?.label).toBe('A2')
    expect(
      (handle.el.querySelector('[data-prop-field="remote"] select') as HTMLSelectElement)
        .textContent,
    ).toBe('Unavailable')
    handle.destroy()
    i18n.setLocale('zh')
    expect(handle.el.textContent).toContain('+ Add')
    handle.el.remove()
  })

  it('runtime locale 切換更新 optionsFrom 載入與失敗狀態', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined
    const request = new Promise<unknown>((_resolve, reject) => {
      rejectRequest = reject
    })
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props: {} } },
      },
    })
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      i18n,
      schema: [
        {
          name: 'remote',
          type: 'select',
          optionsFrom: async (ctx) => {
            await ctx.fetchJSON('/remote', ctx.signal)
            return []
          },
        },
      ],
      fetchJSON: () => request,
    })
    const select = handle.el.querySelector('select') as HTMLSelectElement

    expect(select.textContent).toBe('載入中…')
    i18n.setLocale('en')
    expect(select.textContent).toBe('Loading…')
    rejectRequest?.(new Error('failed'))
    await vi.waitFor(() => expect(select.textContent).toBe('Failed to load'))
    i18n.setLocale('zh')
    expect(select.textContent).toBe('載入失敗')
    handle.destroy()
    i18n.setLocale('en')
    expect(select.textContent).toBe('載入失敗')
  })

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
      {
        items: [
          { label: 'A', href: '/a' },
          { label: 'B', href: '/b' },
        ],
      },
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
      if (url.startsWith('/sizes'))
        return {
          sizes: [
            { value: 's', label: 'S' },
            { value: 'm', label: 'M' },
          ],
        }
      return {}
    })
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: {
          id: 'n',
          type: 'shortcode',
          shortcode: { name: 'x', props: { color: 'red', size: 'm' } },
        },
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
            const d = (await ctx.fetchJSON('/sizes', ctx.signal)) as {
              sizes: { value: string; label: string }[]
            }
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
      blue: [
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
    }
    const fetchJSON = vi.fn(async (url: string) => {
      const params = new URLSearchParams(url.split('?')[1] ?? '')
      return { sizes: sizesByColor[params.get('color') ?? 'red'] ?? [] }
    })
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: {
          id: 'n',
          type: 'shortcode',
          shortcode: { name: 'x', props: { color: 'red', size: 's' } },
        },
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

describe('createPropForm — media lifecycle', () => {
  it.each(['resolve', 'reject'] as const)(
    'destroy 關閉 picker，延遲 %s 與舊控制項都不再更新 engine',
    async (outcome) => {
      const gate = deferredMedia()
      const engine = createEngine({
        doc: {
          version: 1,
          root: {
            id: 'media',
            type: 'shortcode',
            shortcode: { name: 'hero', props: { src: 'original.png' } },
          },
        },
      })
      const list = vi.fn(() => [])
      const handle = createPropForm({
        engine,
        node: engine.getTree(),
        schema: [{ name: 'src', type: 'media' }],
        assets: { list, upload: () => gate.promise },
      })
      document.body.append(handle.el)
      mediaCleanups.push(() => {
        handle.destroy()
        handle.el.remove()
        engine.destroy()
      })
      const pick = handle.el.querySelector('button') as HTMLButtonElement
      const input = handle.el.querySelector('input') as HTMLInputElement
      pick.click()
      pick.click()
      expect(list).toHaveBeenCalledOnce()
      expect(document.querySelectorAll('.sigil-media-backdrop')).toHaveLength(1)
      const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
      const file = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(file, 'files', { value: [new File(['image'], 'image.png')] })
      file.dispatchEvent(new Event('change'))

      handle.destroy()
      expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
      pick.click()
      input.value = 'stale.png'
      input.dispatchEvent(new Event('input'))
      if (outcome === 'resolve') gate.resolve({ id: 'new', url: 'late-upload.png' })
      else gate.reject(new Error('late error'))
      await gate.promise.catch(() => {})
      expect(engine.getTree().shortcode?.props.src).toBe('original.png')
      expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
      expect(dialog.isConnected).toBe(false)
    },
  )

  it('runtime locale 原地更新開啟的 picker，上傳完成仍套用至存活表單', async () => {
    const gate = deferredMedia()
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'media',
          type: 'shortcode',
          shortcode: { name: 'hero', props: { src: '' } },
        },
      },
    })
    const i18n = createI18n({
      zh: {},
      en: {
        'media.title': 'Media library',
        'media.uploading': 'Uploading…',
        'form.pick_image': 'Choose image',
      },
    })
    const handle = createPropForm({
      engine,
      node: engine.getTree(),
      i18n,
      schema: [{ name: 'src', type: 'media' }],
      assets: { list: () => [], upload: () => gate.promise },
    })
    document.body.append(handle.el)
    mediaCleanups.push(() => {
      handle.destroy()
      handle.el.remove()
      engine.destroy()
    })
    const pick = handle.el.querySelector('button') as HTMLButtonElement
    pick.click()
    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    const file = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(file, 'files', { value: [new File(['image'], 'image.png')] })
    file.dispatchEvent(new Event('change'))
    i18n.setLocale('en')
    expect(document.querySelector('.sigil-media-backdrop')).toBe(dialog)
    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
    expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Uploading…')
    expect(pick.textContent).toBe('Choose image')
    gate.resolve({ id: 'new', url: 'uploaded.png' })
    await gate.promise
    expect(engine.getTree().shortcode?.props.src).toBe('uploaded.png')
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    pick.click()
    expect(document.querySelector('.sigil-media-backdrop')).toBeTruthy()
  })
})
