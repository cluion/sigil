import { describe, it, expect, vi } from 'vitest'
import { createRenderer } from '../src/index.js'
import type { ShortcodeResolver, ShortcodeInstance } from '../src/index.js'

/**
 * 製造 stub resolver 與可觀測的 instance 呼叫紀錄
 */
function stubResolver() {
  const calls = { resolve: vi.fn(), setProps: vi.fn(), destroy: vi.fn() }
  const resolver: ShortcodeResolver = {
    resolve(node, host) {
      calls.resolve(node.shortcode?.name ?? '')
      host.textContent = `stub:${node.shortcode?.name ?? ''}`
      const inst: ShortcodeInstance = {
        el: host,
        setProps: calls.setProps,
        destroy: calls.destroy,
      }
      return inst
    },
  }
  return { resolver, calls }
}

const treeWithShortcode = {
  id: 'root',
  type: 'section',
  children: [
    { id: 's1', type: 'shortcode', shortcode: { name: 'counter', props: { count: 0 } } },
  ],
}

describe('renderer — shortcode', () => {
  it('mount 時 resolve shortcode 並填入 host', () => {
    const { resolver, calls } = stubResolver()
    const r = createRenderer({ shortcodeResolver: resolver })
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    expect(calls.resolve).toHaveBeenCalledWith('counter')
    const host = container.querySelector('[data-shortcode]')
    expect(host?.getAttribute('data-shortcode')).toBe('counter')
    expect(host?.textContent).toBe('stub:counter')
  })

  it('update shortcode props 走 setProps，host 元素 reference 不變', () => {
    const { resolver, calls } = stubResolver()
    const r = createRenderer({ shortcodeResolver: resolver })
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    const before = container.querySelector('[data-shortcode]')
    r.applyPatch({
      type: 'update',
      id: 's1',
      shortcode: { name: 'counter', props: { count: 5 } },
    })
    expect(calls.setProps).toHaveBeenCalledWith({ count: 5 })
    const after = container.querySelector('[data-shortcode]')
    expect(after).toBe(before) // 同一個元素，未重建
  })

  it('remove 時 destroy instance', () => {
    const { resolver, calls } = stubResolver()
    const r = createRenderer({ shortcodeResolver: resolver })
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    r.applyPatch({ type: 'remove', id: 's1' })
    expect(calls.destroy).toHaveBeenCalled()
  })

  it('replace 時先 destroy 舊 instance', () => {
    const { resolver, calls } = stubResolver()
    const r = createRenderer({ shortcodeResolver: resolver })
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    r.applyPatch({
      type: 'replace',
      id: 's1',
      node: { id: 's1', type: 'shortcode', shortcode: { name: 'counter', props: {} } },
    })
    expect(calls.destroy).toHaveBeenCalled()
  })

  it('reconcile 時 destroy 所有 instance', () => {
    const { resolver, calls } = stubResolver()
    const r = createRenderer({ shortcodeResolver: resolver })
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    r.reconcile({ id: 'root', type: 'section', children: [] })
    expect(calls.destroy).toHaveBeenCalled()
  })

  it('無 resolver 時 shortcode 僅標記屬性、不崩潰', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(treeWithShortcode, container)
    expect(container.querySelector('[data-shortcode]')?.getAttribute('data-shortcode')).toBe(
      'counter',
    )
  })
})
