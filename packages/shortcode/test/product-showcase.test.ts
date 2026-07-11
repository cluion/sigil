import { describe, it, expect, vi } from 'vitest'
import { createDefaultPolicy, createStore } from '@cluion/sigil-core'
import { createShortcodeRegistry, createShortcodeResolver } from '../src/index.js'
import { productDef } from '../../../demo/shortcodes/product.js'
import { cartDef } from '../../../demo/shortcodes/cart.js'

function mockApi(url: string, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (url.startsWith('/sizes')) {
        const color = new URLSearchParams(url.split('?')[1] ?? '').get('color')
        resolve({
          sizes:
            color === 'blue'
              ? [
                  { value: 'm', label: 'M' },
                  { value: 'l', label: 'L' },
                ]
              : [
                  { value: 's', label: 'S' },
                  { value: 'm', label: 'M' },
                ],
        })
        return
      }
      if (url.startsWith('/price')) {
        const p = new URLSearchParams(url.split('?')[1] ?? '')
        resolve({ price: 100 + Number(p.get('id')) * 10 })
        return
      }
      resolve({})
    }, 20)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })
}

describe('product showcase (demo shortcodes)', () => {
  it('color→size 連動後顯示價格；加購更新 store cart', async () => {
    const store = createStore()
    const registry = createShortcodeRegistry([productDef, cartDef])
    const resolver = createShortcodeResolver({
      registry,
      policy: createDefaultPolicy(),
      store,
      fetchJSON: mockApi,
    })

    const productHost = document.createElement('div')
    const cartHost = document.createElement('div')
    resolver.resolve(
      { id: 'p1', type: 'shortcode', shortcode: { name: 'product', props: { productId: 2 } } },
      productHost,
      'live',
    )
    resolver.resolve(
      { id: 'c1', type: 'shortcode', shortcode: { name: 'cart', props: {} } },
      cartHost,
      'live',
    )

    await vi.waitFor(() => {
      const price = productHost.querySelector('[data-ref="price"]')?.textContent ?? ''
      expect(price.startsWith('$')).toBe(true)
    })

    const size = productHost.querySelector('[data-ref="size"]') as HTMLSelectElement
    expect([...size.options].map((o) => o.value)).toEqual(['s', 'm'])

    const color = productHost.querySelector('[data-ref="color"]') as HTMLSelectElement
    color.value = 'blue'
    color.dispatchEvent(new Event('change'))

    await vi.waitFor(() => {
      const sz = productHost.querySelector('[data-ref="size"]') as HTMLSelectElement
      expect([...sz.options].map((o) => o.value)).toEqual(['m', 'l'])
    })
    await vi.waitFor(() => {
      expect(productHost.querySelector('[data-ref="price"]')?.textContent?.startsWith('$')).toBe(
        true,
      )
    })

    const add = productHost.querySelector('[data-ref="add"]') as HTMLButtonElement
    add.click()
    expect(store.get<number>('cart')).toBe(1)
    expect(cartHost.querySelector('[data-ref="n"]')?.textContent).toBe('1')
  })

  it('fetch 失敗顯示錯誤文案', async () => {
    const resolver = createShortcodeResolver({
      registry: createShortcodeRegistry([productDef]),
      policy: createDefaultPolicy(),
      fetchJSON: () => Promise.reject(new Error('network')),
    })
    const host = document.createElement('div')
    resolver.resolve(
      { id: 'p1', type: 'shortcode', shortcode: { name: 'product', props: { productId: 1 } } },
      host,
      'live',
    )
    await vi.waitFor(() => {
      expect(host.querySelector('[data-ref="price"]')?.textContent).toBe('規格載入失敗')
    })
  })
})
