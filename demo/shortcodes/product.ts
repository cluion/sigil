import { defineShortcode } from '@cluion/sigil-shortcode'

/** 商品卡 — 整合 PropSchema + fetchJSON race + emit/on + slots 的驗收 demo */
export const productDef = defineShortcode({
  name: 'product',
  label: '商品卡',
  props: { productId: 1 },
  schema: [{ name: 'productId', type: 'number' as const, label: '商品 ID' }],
  template:
    '<div style="border:1px solid #ddd;padding:8px;width:220px">' +
    '<img data-ref="img" style="width:100%"/>' +
    '<b data-ref="name">商品</b> ' +
    '顏色:<select data-ref="color"><option value="red">紅</option><option value="blue">藍</option><option value="green">綠</option></select> ' +
    '<span data-ref="price">載入中...</span> ' +
    '<button data-ref="add" type="button">加購物</button>' +
    '<div data-ref="reviews" style="margin-top:4px"><slot>拖入評論</slot></div>' +
    '</div>',
  bind(el, ctx) {
    const img = el.querySelector('[data-ref="img"]') as HTMLImageElement
    const color = el.querySelector('[data-ref="color"]') as HTMLSelectElement
    const price = el.querySelector('[data-ref="price"]') as HTMLElement
    const add = el.querySelector('[data-ref="add"]') as HTMLButtonElement

    let ac: AbortController | null = null
    function loadPrice(): void {
      ac?.abort()
      ac = new AbortController()
      price.textContent = '載入中...'
      ctx
        .fetchJSON(`/price?id=${ctx.props.productId}&color=${color.value}`, ac.signal)
        .then((d) => {
          price.textContent = `$${(d as { price: number }).price}`
        })
        .catch(() => {})
    }

    color.addEventListener('change', loadPrice)
    add.addEventListener('click', () =>
      ctx.emit('cart:add', { id: ctx.props.productId, color: color.value }),
    )
    // productId 變(props 面板改)→ 換圖 + 重載價格(race:cleanup abort 舊)
    ctx.effect(() => {
      const id = ctx.props.productId
      img.src = `https://placehold.co/200x120?text=product+${id}`
      loadPrice()
      return () => ac?.abort()
    })
  },
})
