# Getting Started

五分鐘內在本機跑起 Sigil 編輯器  
並自訂一個 shortcode

需求：Node ≥ 20、[pnpm](https://pnpm.io/) 10

## 1. 安裝與 demo

```bash
git clone <repo-url> sigil
cd sigil
pnpm install
pnpm dev
```

瀏覽器開啟 Vite 提示的本機位址  
demo 含區塊拖拽、屬性面板、shortcode，含商品卡與購物車，以及 JSON／HTML 匯出

```bash
pnpm test    # 單元測試
pnpm build   # 建置 packages/*
```

> 套件尚未正式發佈到 npm 時  
> 請以 monorepo workspace 依賴使用  
> 發佈後可改為 `pnpm add @cluion/sigil`

## 2. 最小 embed

開箱產品殼用 `createApp`，自組 UI 用 `createEditor`

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'

const root = document.getElementById('app')!
const store = new JsonProjectStore()

const doc: SigilDoc = {
  version: 1,
  root: {
    ...blockSection(),
    children: [blockText('Hello Sigil')],
  },
}

const app = createApp({
  mount: root,
  doc,
  store,
  blocks: basicBlocks,
  locale: 'zh',
})

const json = app.toJSON()
const html = app.toHTML()
const hydrated = app.toHTML('hydrated')

app.destroy()
```

`createApp` 含 Topbar、區塊搜尋、畫布選取框、Inspector 分頁、狀態列  
SDK 級 `createEditor` 或 core `createEngine` 可完全自組

## 3. 定義 shortcode

```ts
import { defineShortcode } from '@cluion/sigil-shortcode'
import { blockShortcode } from '@cluion/sigil-blocks'

const greet = defineShortcode({
  name: 'greet',
  label: '問候',
  props: { name: 'world' },
  schema: [{ name: 'name', type: 'text', label: '名字' }],
  template: '<span>Hello, <b data-ref="n"></b>!</span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
  // 可選：static HTML 輸出
  render: (p, { escape }) => `<span>Hello, <b>${escape(String(p.name))}</b>!</span>`,
})

createEditor({
  mount: '#app',
  shortcodes: [greet],
  blocks: {
    ...basicBlocks,
    問候: () => blockShortcode('greet', { name: 'Sigil' }),
  },
})
```

### BindContext 常用能力

| 能力 | 用途 |
|---|---|
| `ctx.props` | 節點 props，signal getter，請在 `effect` 內讀取 |
| `ctx.effect` | 細粒度副作用，回傳 cleanup |
| `ctx.fetchJSON` | 非同步資料，可傳 `AbortSignal` 避 race |
| `ctx.store` | 跨 shortcode 共享狀態 |
| `ctx.emit` / `ctx.on` | 跨 shortcode 事件 |
| `ctx.mode` | `edit` 或 `live`，編輯／預覽 |

結構請放在 `template` 或 HTMLTemplateElement  
動態值用 `textContent`／`setAttribute`  
不要拼接 HTML 字串

## 4. 存檔：ProjectStore

```ts
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'

// 預設：記憶體 + JSON 字串
import { JsonProjectStore } from '@cluion/sigil-store-json'

const store = new JsonProjectStore()
createEditor({ mount: '#app', store })

const doc = editor.toJSON() // 內部會 store.save(doc)
const text = store.exportJSON(doc)
const again = store.importJSON(text)
```

自訂後端只需實作介面：

```ts
const apiStore: ProjectStore = {
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

createEditor({ mount: '#app', store: apiStore })
```

## 5. 輸出 HTML

```ts
editor.toHTML()            // static：shortcode 盡量展開為靜態 HTML
editor.toHTML('hydrated')  // 附帶可水合標記；正式站用 hydrate() 重綁 shortcode
```

```ts
import { hydrate } from '@cluion/sigil-core'
// 在正式頁將 shortcode resolver 注入後：
// hydrate(document.body, { shortcodeResolver })
```

詳見 [API Reference](/api/) 與 [套件總覽](/guide/packages)

## 6. 套件一覽

| 套件 | 何時用 |
|---|---|
| `@cluion/sigil` | 一站式 `createEditor` |
| `@cluion/sigil-core` | 引擎、模型、序列化、policy |
| `@cluion/sigil-shortcode` | `defineShortcode` / resolver |
| `@cluion/sigil-ui` | 畫布與面板，進階自組 |
| `@cluion/sigil-blocks` | 預設區塊工廠 |
| `@cluion/sigil-store-json` | JSON `ProjectStore` |

## 安全提示

- 核心路徑使用 `createElement`／`textContent`・避免 `innerHTML` 拼接
- shortcode `template` 視為受信任結構，動態資料勿直接寫進 HTML 字串
- `render` 輸出請對動態值使用 `escape`，見 `RenderContext.escape`

## 框架範例

| 指令 | 說明 |
|---|---|
| `pnpm example:html` | 純 HTML 加 TypeScript |
| `pnpm example:vue` | Vue 3，`onMounted` / `destroy` |
| `pnpm example:react` | React，`useEffect` cleanup |

Laravel 後端 `ProjectStore`  
含 migration、controller、Blade／Vite 入口  
見 repo 內 `examples/laravel/`

## 下一步

- 跑 `pnpm dev` 看商品卡：顏色 → 尺寸 → 價格、購物車 `store`
- 用 `createEngine` 做客製工具列
- 接自己的 `ProjectStore`，HTTP 或 Laravel 等
