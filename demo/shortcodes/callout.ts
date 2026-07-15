import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 提示框 — 示範 PropSchema group + dependsOn
 *
 * kind=info → 只顯示標題／內文
 * cta 類型顯示按鈕文字
 */
export const calloutDef = defineShortcode({
  name: 'callout',
  label: '提示框',
  props: {
    kind: 'info',
    title: '提示',
    body: '選取後在右側屬性面板試 group／dependsOn',
    ctaLabel: '了解更多',
  },
  schema: [
    {
      name: 'kind',
      type: 'select',
      label: '類型',
      group: '基本',
      options: [
        { value: 'info', label: '資訊' },
        { value: 'cta', label: '行動呼籲' },
      ],
    },
    { name: 'title', type: 'text', label: '標題', group: '基本' },
    { name: 'body', type: 'text', label: '內文', group: '基本' },
    {
      name: 'ctaLabel',
      type: 'text',
      label: '按鈕文字',
      group: 'CTA',
      dependsOn: { prop: 'kind', eq: 'cta' },
    },
  ],
  template:
    '<div data-ref="box" style="border:1px solid #c7d2fe;border-radius:8px;padding:12px;max-width:360px;background:#eef2ff">' +
    '<div data-ref="title" style="font-weight:700;margin-bottom:4px"></div>' +
    '<div data-ref="body" style="font-size:13px;color:#334155;margin-bottom:8px"></div>' +
    '<button data-ref="cta" type="button" style="display:none;font-size:12px;padding:4px 10px"></button>' +
    '</div>',
  bind(el, ctx) {
    const title = el.querySelector('[data-ref="title"]') as HTMLElement
    const body = el.querySelector('[data-ref="body"]') as HTMLElement
    const cta = el.querySelector('[data-ref="cta"]') as HTMLButtonElement
    ctx.effect(() => {
      title.textContent = String(ctx.props.title ?? '')
      body.textContent = String(ctx.props.body ?? '')
      const isCta = ctx.props.kind === 'cta'
      cta.style.display = isCta ? 'inline-block' : 'none'
      cta.textContent = String(ctx.props.ctaLabel ?? '')
    })
  },
  render: (p, { escape }) => {
    const cta =
      p.kind === 'cta'
        ? `<button type="button">${escape(String(p.ctaLabel ?? ''))}</button>`
        : ''
    return (
      `<div><strong>${escape(String(p.title ?? ''))}</strong>` +
      `<p>${escape(String(p.body ?? ''))}</p>${cta}</div>`
    )
  },
})
