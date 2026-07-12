# `@cluion/sigil-shortcode`

`defineShortcode`、registry、resolver。

```bash
pnpm add @cluion/sigil-shortcode
```

```ts
import { defineShortcode } from '@cluion/sigil-shortcode'

defineShortcode({
  name: 'counter',
  props: { step: 1 },
  template: '<button type="button" data-ref="b">+</button><b data-ref="n">0</b>',
  bind(el, ctx) {
    let n = 0
    el.querySelector('[data-ref="b"]')!.addEventListener('click', () => {
      n += Number(ctx.props.step) || 1
      el.querySelector('[data-ref="n"]')!.textContent = String(n)
    })
  },
})
```

PropSchema：`text`｜`number`｜`boolean`｜`select`｜`color`｜`media`  
進階：`group`（分組標題）、`dependsOn`（`{ prop, eq? | in? }` 控制欄位顯示）

## License

MIT

