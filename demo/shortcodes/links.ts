import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 連結清單 — 示範 repeater（每筆多欄位）
 *
 * repeater 值為 [{ label, href }][]
 */
export const linksDef = defineShortcode({
  name: 'links',
  label: '連結清單',
  props: {
    heading: '相關連結',
    items: [{ label: 'Sigil', href: 'https://github.com/cluion/sigil' }],
  },
  schema: [
    { name: 'heading', type: 'text' as const, label: '標題' },
    {
      name: 'items',
      type: 'repeater' as const,
      label: '連結',
      schema: [
        { name: 'label', type: 'text' as const, label: '名稱' },
        { name: 'href', type: 'text' as const, label: '網址' },
      ],
    },
  ],
  template:
    '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;max-width:360px">' +
    '<b data-ref="h"></b>' +
    '<ul data-ref="list" style="margin:4px 0 0;padding-left:20px"></ul>' +
    '</div>',
  bind(el, ctx) {
    const h = el.querySelector('[data-ref="h"]') as HTMLElement
    const list = el.querySelector('[data-ref="list"]') as HTMLUListElement
    ctx.effect(() => {
      h.textContent = String(ctx.props.heading ?? '')
      const items = (ctx.props.items as { label?: string; href?: string }[]) ?? []
      list.replaceChildren()
      for (const it of items) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.textContent = String(it.label ?? '')
        a.href = String(it.href ?? '#')
        a.target = '_blank'
        a.rel = 'noopener'
        li.appendChild(a)
        list.appendChild(li)
      }
    })
  },
})
