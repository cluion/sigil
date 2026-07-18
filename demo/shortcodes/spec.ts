import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 規格選擇器 — 示範 select optionsFrom + dependsOn 連動
 *
 * size 選項依 color 動態載入（fetchJSON /sizes?color=xxx）
 * 改 color → size 選項重載
 */
export const specDef = defineShortcode({
  name: 'spec',
  label: '規格選擇器',
  props: { color: 'red', size: 'm' },
  schema: [
    {
      name: 'color',
      type: 'select' as const,
      label: '顏色',
      options: [
        { value: 'red', label: '紅' },
        { value: 'blue', label: '藍' },
        { value: 'green', label: '綠' },
      ],
    },
    {
      name: 'size',
      type: 'select' as const,
      label: '尺寸（依顏色載入）',
      dependsOn: { prop: 'color' },
      optionsFrom: async (ctx) => {
        const color = String(ctx.props.color ?? 'red')
        const data = (await ctx.fetchJSON(`/sizes?color=${color}`, ctx.signal)) as {
          sizes: { value: string; label: string }[]
        }
        return data.sizes ?? []
      },
    },
  ],
  template:
    '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;max-width:240px">' +
    '<div>顏色：<b data-ref="color"></b></div>' +
    '<div>尺寸：<b data-ref="size"></b></div>' +
    '</div>',
  bind(el, ctx) {
    const colorEl = el.querySelector('[data-ref="color"]') as HTMLElement
    const sizeEl = el.querySelector('[data-ref="size"]') as HTMLElement
    ctx.effect(() => {
      colorEl.textContent = String(ctx.props.color ?? '')
      sizeEl.textContent = String(ctx.props.size ?? '')
    })
  },
})
