# Getting Started

## 安裝

```bash
pnpm add @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-store-json @cluion/sigil-shortcode @cluion/sigil-core
# 或 npm i …
```

## createApp

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import { defineShortcode } from '@cluion/sigil-shortcode'

const greet = defineShortcode({
  name: 'greet',
  props: { name: 'world' },
  schema: [{ name: 'name', type: 'text', label: 'Name' }],
  template: '<span>Hello, <b data-ref="n"></b></span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
})

const root = blockSection()
root.children = [blockText('Edit me'), blockShortcode('greet', { name: 'Sigil' })]

const app = createApp({
  mount: '#app',
  doc: { version: 1, root },
  store: new JsonProjectStore(),
  blocks: {
    ...basicBlocks,
    Greet: () => blockShortcode('greet', { name: 'Sigil' }),
  },
  shortcodes: [greet],
})

app.toJSON()
app.toHTML()
```

- `createEditor`：`@cluion/sigil`
- `createEngine`：`@cluion/sigil-core`

## shortcode

```ts
import { defineShortcode } from '@cluion/sigil-shortcode'

defineShortcode({
  name: 'counter',
  props: { step: 1 },
  schema: [{ name: 'step', type: 'number', label: 'Step' }],
  template: '<button type="button" data-ref="b">+</button> <b data-ref="n">0</b>',
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

`bind`：`props`、`effect`、`fetchJSON`、`store`、`emit`／`on`、`mode`、`abort`。

## ProjectStore

```ts
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'

const store: ProjectStore = {
  async load() {
    const r = await fetch('/api/page')
    return r.ok ? ((await r.json()) as SigilDoc) : null
  },
  async save(doc) {
    await fetch('/api/page', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
  },
}
```

`JsonProjectStore`：記憶體與 JSON 字串。Laravel：`examples/laravel/`。

## AssetStore

```ts
import { MemoryAssetStore } from '@cluion/sigil-store-json'

const assets = new MemoryAssetStore([
  { id: '1', url: 'https://placehold.co/120', name: 'demo' },
])

createApp({ mount: '#app', assets })
```

選中圖片區塊後，內容分頁可「選圖」或上傳。

## 本倉庫

```bash
pnpm install && pnpm dev
```

## License

MIT
