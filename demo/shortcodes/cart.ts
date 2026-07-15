import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 讀取共享購物車 store
 *
 * 以 store 驅動畫面
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
