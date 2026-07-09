import { defineShortcode } from '@cluion/sigil-shortcode'

/** 購物車 — store 響應式:get('cart') 在 effect 內,A set 自動更新 */
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
