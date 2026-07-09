import { defineShortcode } from '@cluion/sigil-shortcode'

/** loader — 示範 fetchJSON 非同步載入 + props 變動 abort race */
export const loaderDef = defineShortcode({
  name: 'loader',
  label: '載入器(fetchJSON)',
  props: { id: 1 },
  schema: [{ name: 'id', type: 'number', label: 'ID' }],
  template: '<div data-ref="out">載入中...</div>',
  bind(el, ctx) {
    const out = el.querySelector('[data-ref="out"]') as HTMLElement
    ctx.effect(() => {
      const ac = new AbortController()
      out.textContent = `載入 id=${ctx.props.id}...`
      ctx.fetchJSON(`/data?id=${ctx.props.id}`, ac.signal)
        .then((d) => {
          out.textContent = `已載入:${JSON.stringify(d)}`
        })
        .catch(() => {
          /* abort/錯誤忽略 */
        })
      return () => ac.abort()
    })
  },
})
