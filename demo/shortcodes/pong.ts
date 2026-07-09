import { state } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

/** pong — on 'ping' 事件,顯示收到次數 */
export const pongDef = defineShortcode({
  name: 'pong',
  label: '接收(pong)',
  template: '收到 <b data-ref="n">0</b> 次',
  bind(el, ctx) {
    const n = state(0)
    const disp = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.on('ping', () => {
      n.set(n.get() + 1)
      disp.textContent = String(n.get())
    })
  },
})
