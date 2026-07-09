import { state } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 計數器 shortcode — 示範 signal 細粒度
 *
 * 點按鈕／打字只更新數字（元素不重建、input 不失焦）；
 * step 為來自 engine 樹的 prop，從 props 面板改動走 patch → setProps → effect 重跑
 */
export const counterDef = defineShortcode({
  name: 'counter',
  label: '計數器',
  props: { step: 1 },
  schema: [{ name: 'step', type: 'number', label: '步進' }],
  template:
    '<span style="display:inline-flex;align-items:center;gap:6px">' +
    '<button data-ref="dec" type="button">－</button>' +
    '<input data-ref="qty" type="number" style="width:64px"/>' +
    '<button data-ref="inc" type="button">＋</button>' +
    '<span> × step = <b data-ref="disp">0</b></span>' +
    '</span>',
  bind(el, ctx) {
    const count = state(0)
    const qty = el.querySelector('[data-ref="qty"]') as HTMLInputElement
    const disp = el.querySelector('[data-ref="disp"]') as HTMLElement
    const inc = el.querySelector('[data-ref="inc"]') as HTMLButtonElement
    const dec = el.querySelector('[data-ref="dec"]') as HTMLButtonElement

    // count 變 → 同步 input.value
    ctx.effect(() => {
      qty.value = String(count.get())
    })
    // count 或 step 變 → 更新顯示（step 來自 props，改動只重跑此 effect）
    ctx.effect(() => {
      disp.textContent = String(count.get() * Number(ctx.props.step))
    })

    qty.addEventListener('input', () => count.set(Number(qty.value) || 0))
    inc.addEventListener('click', () => count.set(count.get() + 1))
    dec.addEventListener('click', () => count.set(count.get() - 1))
  },
})
