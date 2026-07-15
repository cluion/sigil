import { defineShortcode } from '@cluion/sigil-shortcode'

/** emit ping 事件 */
export const pingDef = defineShortcode({
  name: 'ping',
  label: '發送(ping)',
  template: '<button data-ref="btn" type="button">ping</button>',
  bind(el, ctx) {
    el.querySelector('[data-ref="btn"]')?.addEventListener('click', () => ctx.emit('ping'))
  },
})
