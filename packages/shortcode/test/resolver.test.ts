import { describe, it, expect } from 'vitest'
import { createDefaultPolicy, createEventBus, createStore } from '@cluion/sigil-core'
import { createShortcodeRegistry, createShortcodeResolver, defineShortcode } from '../src/index.js'

describe('resolver', () => {
  it('resolve 填 template 進 host', () => {
    const def = defineShortcode({
      name: 'hello',
      template: '<span data-ref="x">0</span>',
    })
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([def]),
      policy: createDefaultPolicy(),
    })
    const host = document.createElement('div')
    const inst = resolver.resolve(
      { id: 's1', type: 'shortcode', shortcode: { name: 'hello', props: {} } },
      host,
      'edit',
    )
    expect(inst).not.toBeNull()
    expect(host.querySelector('[data-ref="x"]')?.textContent).toBe('0')
  })

  it('未知 shortcode 回傳 null', () => {
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry(),
      policy: createDefaultPolicy(),
    })
    const host = document.createElement('div')
    const inst = resolver.resolve(
      { id: 's1', type: 'shortcode', shortcode: { name: 'nope', props: {} } },
      host,
      'edit',
    )
    expect(inst).toBeNull()
  })

  it('setProps 觸發細粒度，input 元素 reference 不變', () => {
    const def = defineShortcode({
      name: 'counter',
      props: { step: 1 },
      template: '<input data-ref="qty" type="number"/><b data-ref="disp">0</b>',
      bind(el, ctx) {
        const qty = el.querySelector('[data-ref="qty"]') as HTMLInputElement
        const disp = el.querySelector('[data-ref="disp"]') as HTMLElement
        ctx.effect(() => {
          disp.textContent = String((Number(qty.value) || 0) * Number(ctx.props.step))
        })
      },
    })
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([def]),
      policy: createDefaultPolicy(),
    })
    const host = document.createElement('div')
    const inst = resolver.resolve(
      { id: 's1', type: 'shortcode', shortcode: { name: 'counter', props: { step: 1 } } },
      host,
      'edit',
    )!
    const qty = host.querySelector('[data-ref="qty"]') as HTMLInputElement
    qty.value = '3'
    inst.setProps({ step: 2 })
    const disp = host.querySelector('[data-ref="disp"]') as HTMLElement
    expect(disp.textContent).toBe('6') // 3 * 2
    // input 元素 reference 不變（未重建）
    expect(host.querySelector('[data-ref="qty"]')).toBe(qty)
  })

  it('destroy 後 setProps 不再觸發 effect', () => {
    let runs = 0
    const def = defineShortcode({
      name: 'c',
      props: { v: 0 },
      template: '<b data-ref="d">0</b>',
      bind(el, ctx) {
        const d = el.querySelector('[data-ref="d"]') as HTMLElement
        ctx.effect(() => {
          runs++
          d.textContent = String(ctx.props.v)
        })
      },
    })
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([def]),
      policy: createDefaultPolicy(),
    })
    const host = document.createElement('div')
    const inst = resolver.resolve(
      { id: 's1', type: 'shortcode', shortcode: { name: 'c', props: { v: 0 } } },
      host,
      'edit',
    )!
    expect(runs).toBe(1) // 初始 effect
    inst.setProps({ v: 1 })
    expect(runs).toBe(2)
    inst.destroy()
    inst.setProps({ v: 2 })
    expect(runs).toBe(2) // destroy 後不再跑
  })
})

describe('resolver — renderStatic', () => {
  it('render 優先,合併 def.props 與 node.props', () => {
    const def = defineShortcode({
      name: 'greet',
      props: { name: 'world' },
      template: '<span>fallback</span>',
      render: (p, { escape }) => `<b>hi ${escape(p.name)}</b>`,
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const html = resolver.renderStatic!({
      id: 'x', type: 'shortcode', shortcode: { name: 'greet', props: { name: 'sam' } },
    })
    expect(html).toBe('<b>hi sam</b>')
  })

  it('render 的 escape 真實作用(props 含 < > 被 escape)', () => {
    const def = defineShortcode({
      name: 'greet',
      props: { name: '' },
      template: '<b>fb</b>',
      render: (p, { escape }) => `<b>${escape(p.name)}</b>`,
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const html = resolver.renderStatic!({
      id: 'x', type: 'shortcode', shortcode: { name: 'greet', props: { name: '<script>' } },
    })
    expect(html).toBe('<b>&lt;script&gt;</b>')
  })

  it('無 render → fallback string template', () => {
    const def = defineShortcode({ name: 'plain', template: '<div>static</div>' })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const html = resolver.renderStatic!({
      id: 'x', type: 'shortcode', shortcode: { name: 'plain', props: {} },
    })
    expect(html).toBe('<div>static</div>')
  })

  it('無 def → null', () => {
    const registry = createShortcodeRegistry([])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const html = resolver.renderStatic!({
      id: 'x', type: 'shortcode', shortcode: { name: 'missing', props: {} },
    })
    expect(html).toBeNull()
  })
})

describe('defineShortcode — schema', () => {
  it('schema 欄位可設定(PropSchema 表單描述)', () => {
    const def = defineShortcode({
      name: 'x',
      template: '<i></i>',
      schema: [{ name: 'a', type: 'text', label: 'A' }],
    })
    expect(def.schema?.[0]).toMatchObject({ name: 'a', type: 'text', label: 'A' })
  })
})

describe('resolver — emit/on', () => {
  it('ctx.emit/on 連 bus(A emit、B on 收到)', () => {
    const bus = createEventBus()
    const received: unknown[] = []
    const defB = defineShortcode({
      name: 'b', template: '<i></i>',
      bind: (_el, ctx) => { ctx.on('hi', (d) => received.push(d)) },
    })
    const defA = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => { ctx.emit('hi', 1) },
    })
    const registry = createShortcodeRegistry([defA, defB])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy(), bus })
    resolver.resolve({ id: 'b', type: 'shortcode', shortcode: { name: 'b', props: {} } }, document.createElement('div'), 'edit')
    resolver.resolve({ id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } }, document.createElement('div'), 'edit')
    expect(received).toEqual([1])
  })

  it('destroy 後 on 不再收', () => {
    const bus = createEventBus()
    let received = 0
    const def = defineShortcode({
      name: 'b', template: '<i></i>',
      bind: (_el, ctx) => { ctx.on('hi', () => received++) },
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy(), bus })
    const inst = resolver.resolve(
      { id: 'b', type: 'shortcode', shortcode: { name: 'b', props: {} } },
      document.createElement('div'),
      'edit',
    )!
    bus.emit('hi')
    inst.destroy()
    bus.emit('hi')
    expect(received).toBe(1)
  })

  it('無 bus 時 emit/on noop', () => {
    const def = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => {
        ctx.emit('hi', 1)
        const off = ctx.on('hi', () => undefined)
        off()
      },
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const inst = resolver.resolve(
      { id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } },
      document.createElement('div'),
      'edit',
    )
    expect(inst).not.toBeNull()
  })
})

describe('resolver — fetchJSON', () => {
  it('ctx.fetchJSON 注入:bind 收到資料', async () => {
    let received: unknown
    const fetchJSON = async (url: string) => ({ url })
    const def = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => { ctx.fetchJSON('/x').then((d) => { received = d }) },
    })
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([def]), policy: createDefaultPolicy(), fetchJSON,
    })
    resolver.resolve({ id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } }, document.createElement('div'), 'edit')
    await new Promise((r) => setTimeout(r, 0))
    expect(received).toEqual({ url: '/x' })
  })

  it('未注入:fetchJSON reject', async () => {
    let err: unknown
    const def = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => { ctx.fetchJSON('/x').catch((e) => { err = e }) },
    })
    const resolver = createShortcodeResolver({ registry: createShortcodeRegistry([def]), policy: createDefaultPolicy() })
    resolver.resolve({ id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } }, document.createElement('div'), 'edit')
    await new Promise((r) => setTimeout(r, 0))
    expect(err).toBeInstanceOf(Error)
  })

  it('destroy 觸發 cleanup abort signal', async () => {
    let aborted = false
    const fetchJSON = (_url: string, signal?: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => { aborted = true; reject(new Error('abort')) })
      })
    const def = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => {
        const ac = new AbortController()
        ctx.fetchJSON('/x', ac.signal).catch(() => {})
        return () => ac.abort()
      },
    })
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([def]), policy: createDefaultPolicy(), fetchJSON,
    })
    const inst = resolver.resolve(
      { id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } },
      document.createElement('div'),
      'edit',
    )!
    inst.destroy()
    await new Promise((r) => setTimeout(r, 0))
    expect(aborted).toBe(true)
  })
})

describe('resolver — store', () => {
  it('ctx.store 共享(A set → B get 響應式更新)', () => {
    const store = createStore()
    let val: number | undefined
    const defB = defineShortcode({
      name: 'b', template: '<i></i>',
      bind: (_el, ctx) => { ctx.effect(() => { val = ctx.store.get<number>('n') }) },
    })
    const defA = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => { ctx.store.set('n', 7) },
    })
    const registry = createShortcodeRegistry([defA, defB])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy(), store })
    resolver.resolve({ id: 'b', type: 'shortcode', shortcode: { name: 'b', props: {} } }, document.createElement('div'), 'edit')
    resolver.resolve({ id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } }, document.createElement('div'), 'edit')
    expect(val).toBe(7)
  })

  it('未注入 store:fallback 不拋錯', () => {
    const def = defineShortcode({
      name: 'a', template: '<i></i>',
      bind: (_el, ctx) => { ctx.store.set('x', 1) },
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const inst = resolver.resolve(
      { id: 'a', type: 'shortcode', shortcode: { name: 'a', props: {} } },
      document.createElement('div'),
      'edit',
    )
    expect(inst).not.toBeNull()
  })
})
