import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 購物車 — 讀共享 store 鍵 `cart`（product 加購寫入）
 *
 * 主路徑為 store 響應式；亦可 on('cart:add') 做附加邏輯（此處不依賴事件計數）。
 */
export const cartDef = defineShortcode({
  name: 'cart',
  label: '購物車',
  template: '🛒 購物車:<b data-ref="n">0</b> 件',
  bind(el, ctx) {
    const disp = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      disp.textContent = String(ctx.store.get<number>('cart') ?? 0)
    })
  },
})
