import { defineShortcode } from '@cluion/sigil-shortcode'

/** ping — 點按鈕 emit 'ping' 事件(示範跨 shortcode 通訊) */
export const pingDef = defineShortcode({
  name: 'ping',
  label: '發送(ping)',
  template: '<button data-ref="btn" type="button">ping</button>',
  bind(el, ctx) {
    el.querySelector('[data-ref="btn"]')?.addEventListener('click', () => ctx.emit('ping'))
  },
})
