import { state } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

/** 購物車 — on 'cart:add' 顯示件數(跨 shortcode 通訊) */
export const cartDef = defineShortcode({
  name: 'cart',
  label: '購物車',
  template: '🛒 購物車:<b data-ref="n">0</b> 件',
  bind(el, ctx) {
    const n = state(0)
    const disp = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.on('cart:add', () => {
      n.set(n.get() + 1)
      disp.textContent = String(n.get())
    })
  },
})
