# `@cluion/sigil-shortcode`

Shortcode DSL：`defineShortcode`、registry、resolver（template clone + bind）。

依賴：`@cluion/sigil-core`。

## 安裝

```bash
pnpm add @cluion/sigil-shortcode
```

## 定義

```ts
import { defineShortcode } from '@cluion/sigil-shortcode'

export const counter = defineShortcode({
  name: 'counter',
  label: '計數器',
  props: { step: 1 },
  schema: [{ name: 'step', type: 'number', label: '步進' }],
  template: '<button data-ref="b">+</button><b data-ref="n">0</b>',
  bind(el, ctx) {
    let n = 0
    const disp = el.querySelector('[data-ref="n"]') as HTMLElement
    el.querySelector('[data-ref="b"]')!.addEventListener('click', () => {
      n += Number(ctx.props.step) || 1
      disp.textContent = String(n)
    })
  },
})
```

## Registry / Resolver

```ts
import {
  createShortcodeRegistry,
  createShortcodeResolver,
} from '@cluion/sigil-shortcode'
import { createDefaultPolicy } from '@cluion/sigil-core'

const registry = createShortcodeRegistry([counter])
const resolver = createShortcodeResolver({
  registry,
  policy: createDefaultPolicy(),
  fetchJSON: (url, signal) => fetch(url, { signal }).then((r) => r.json()),
})
```

多數情況直接把定義陣列傳給 `createEditor({ shortcodes })` 即可。

## PropSchema 型別（屬性面板）

`text`｜`number`｜`boolean`｜`select`｜`color`

## 授權

MIT。
