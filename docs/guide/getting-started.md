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

`createApp()` 會依 mount 容器寬度調整產品殼。窄於 900px 時，左右面板會改成互斥抽屜；可用面板按鈕開關，或按 Escape／點擊背景關閉。這項判斷以嵌入容器為準，不依賴整個瀏覽器視窗寬度。

## 語系與宿主字串

App／Editor 內建 `zh` 與 `en`。`messages` 會依語系淺層覆寫內建 catalog；未提供的 key 保留內建翻譯，空字串也是有效值。

```ts
const app = createApp({
  mount: '#app',
  locale: 'zh',
  messages: {
    zh: { 'app.brand': '內容編輯器' },
    en: { 'app.brand': 'Content Editor' },
  },
})

app.setLocale('en')
app.getLocale() // 'en'
```

`setLocale()` 會原地更新產品 chrome、面板、ARIA 與後續開啟的 prompt／confirm，不會重建 engine，也不改 tree、selection、history、dirty、theme 或 device。文件內容、區塊名稱、範本名稱與 schema label 屬宿主資料，不會被翻譯。

自組 UI 的 `createEditor()` 提供相同契約；直接使用低階 UI 時，也可把同一個 `createI18n()` 結果注入各面板後呼叫 `setLocale()`。

- `createEditor`：`@cluion/sigil`
- `createEngine`：`@cluion/sigil-core`
- 官方區塊：[Marketing Blocks 與 Hero](/guide/marketing-blocks)
- 可選富文字：[RichTextAdapter 與安全輸出](/guide/rich-text)
- 響應式樣式：見 [Desktop／Tablet／Mobile 覆寫](/guide/responsive-styles)
- 擴充（commands／hooks／圖層／dependsOn）：見 [擴充指南](/guide/extensibility)
- 本機完整 demo：`pnpm dev`

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

const assets = new MemoryAssetStore([{ id: '1', url: 'https://placehold.co/120', name: 'demo' }])

createApp({ mount: '#app', assets })
```

選中圖片區塊後，內容分頁可「選圖」或上傳。  
shortcode 的 PropSchema 可設 `type: 'media'`，表單同樣接 AssetStore。

## 本倉庫

```bash
pnpm install && pnpm dev
```

## License

MIT
