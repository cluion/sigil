import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 商品卡 — Phase 4.5 showcase
 *
 * 能力：PropSchema(productId)、color→size→price 雙層連動 + fetchJSON race、
 * store 加購物、template &lt;slot&gt; 巢狀評論。
 * color/size 為實例內 UI（非面板 dependsOn）；跨 shortcode 狀態以 store 為主。
 */
export const productDef = defineShortcode({
  name: 'product',
  label: '商品卡',
  props: { productId: 1 },
  schema: [{ name: 'productId', type: 'number' as const, label: '商品 ID' }],
  template:
    '<div style="border:1px solid #ddd;padding:8px;width:240px">' +
    '<img data-ref="img" alt="" style="width:100%;display:block"/>' +
    '<div><b data-ref="name">商品</b></div>' +
    '<div>顏色:<select data-ref="color">' +
    '<option value="red">紅</option><option value="blue">藍</option><option value="green">綠</option>' +
    '</select></div>' +
    '<div>尺寸:<select data-ref="size"></select></div>' +
    '<div data-ref="price">載入中...</div>' +
    '<button data-ref="add" type="button">加購物</button>' +
    '<div data-ref="reviews" style="margin-top:4px;font-size:12px"><slot>拖入評論</slot></div>' +
    '</div>',
  bind(el, ctx) {
    const img = el.querySelector('[data-ref="img"]') as HTMLImageElement
    const name = el.querySelector('[data-ref="name"]') as HTMLElement
    const color = el.querySelector('[data-ref="color"]') as HTMLSelectElement
    const size = el.querySelector('[data-ref="size"]') as HTMLSelectElement
    const price = el.querySelector('[data-ref="price"]') as HTMLElement
    const add = el.querySelector('[data-ref="add"]') as HTMLButtonElement

    let sizesAc: AbortController | null = null
    let priceAc: AbortController | null = null

    function setPriceText(text: string): void {
      price.textContent = text
    }

    function loadPrice(): void {
      priceAc?.abort()
      priceAc = new AbortController()
      const sz = size.value
      if (!sz) {
        setPriceText('請選尺寸')
        return
      }
      setPriceText('載入中...')
      const id = ctx.props.productId
      ctx
        .fetchJSON(`/price?id=${id}&color=${color.value}&size=${sz}`, priceAc.signal)
        .then((d) => {
          setPriceText(`$${(d as { price: number }).price}`)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setPriceText('價格載入失敗')
        })
    }

    function fillSizes(options: { value: string; label: string }[], prefer?: string): void {
      size.replaceChildren()
      for (const opt of options) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label
        size.appendChild(o)
      }
      if (prefer && options.some((x) => x.value === prefer)) {
        size.value = prefer
      } else if (options[0]) {
        size.value = options[0].value
      }
    }

    function loadSizes(): void {
      sizesAc?.abort()
      sizesAc = new AbortController()
      priceAc?.abort()
      setPriceText('載入規格...')
      const prevSize = size.value
      size.replaceChildren()
      ctx
        .fetchJSON(`/sizes?color=${color.value}`, sizesAc.signal)
        .then((d) => {
          const options = (d as { sizes: { value: string; label: string }[] }).sizes ?? []
          fillSizes(options, prevSize)
          loadPrice()
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setPriceText('規格載入失敗')
        })
    }

    color.addEventListener('change', () => loadSizes())
    size.addEventListener('change', () => loadPrice())
    add.addEventListener('click', () => {
      const n = ctx.store.get<number>('cart') ?? 0
      ctx.store.set('cart', n + 1)
      // 可選事件：與 ping/pong 同路徑，方便訂閱者
      ctx.emit('cart:add', {
        productId: ctx.props.productId,
        color: color.value,
        size: size.value,
      })
    })

    ctx.effect(() => {
      const id = ctx.props.productId
      img.src = `https://placehold.co/200x120?text=product+${id}`
      name.textContent = `商品 #${id}`
      loadSizes()
      return () => {
        sizesAc?.abort()
        priceAc?.abort()
      }
    })
  },
})
