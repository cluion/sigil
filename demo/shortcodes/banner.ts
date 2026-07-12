import { defineShortcode } from '@cluion/sigil-shortcode'

/** 橫幅 — 示範 PropSchema type media + 選圖 */
export const bannerDef = defineShortcode({
  name: 'banner',
  label: '橫幅',
  props: {
    src: 'https://placehold.co/320x80/png?text=Banner',
    title: '橫幅標題',
  },
  schema: [
    { name: 'src', type: 'media' as const, label: '圖片' },
    { name: 'title', type: 'text' as const, label: '標題' },
  ],
  template:
    '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;max-width:360px">' +
    '<img data-ref="img" alt="" style="display:block;width:100%;height:auto"/>' +
    '<div data-ref="title" style="padding:8px;font-weight:600"></div>' +
    '</div>',
  bind(el, ctx) {
    const img = el.querySelector('[data-ref="img"]') as HTMLImageElement
    const title = el.querySelector('[data-ref="title"]') as HTMLElement
    ctx.effect(() => {
      img.src = String(ctx.props.src ?? '')
      title.textContent = String(ctx.props.title ?? '')
    })
  },
  render: (p, { escape }) =>
    `<div><img src="${escape(String(p.src ?? ''))}" alt=""/><div>${escape(String(p.title ?? ''))}</div></div>`,
})
