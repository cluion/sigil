import { describe, it, expect } from 'vitest'
import { createDefaultPolicy } from '@cluion/sigil-core'
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
      render: (p) => `<b>hi ${p.name}</b>`,
    })
    const registry = createShortcodeRegistry([def])
    const resolver = createShortcodeResolver({ registry, policy: createDefaultPolicy() })
    const html = resolver.renderStatic!({
      id: 'x', type: 'shortcode', shortcode: { name: 'greet', props: { name: 'sam' } },
    })
    expect(html).toBe('<b>hi sam</b>')
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
