# Sigil

可嵌入的網頁視覺編輯器。CSP／Trusted Types，shortcode DSL，`core` 零第三方依賴。

## 安裝

```bash
pnpm add @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-store-json @cluion/sigil-shortcode
# npm i @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-store-json @cluion/sigil-shortcode
```

## 使用

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText } from '@cluion/sigil-blocks'

const root = blockSection()
root.children = [blockText('Hello')]

const app = createApp({
  mount: '#app',
  doc: { version: 1, root },
  blocks: basicBlocks,
})

app.toJSON()
app.toHTML()
app.destroy()
```

宿主可覆寫內建中英文字串，並在不重建 App／engine 的情況下切換語系：

```ts
const app = createApp({
  mount: '#app',
  locale: 'zh',
  messages: {
    en: { 'app.brand': 'My Editor' },
  },
})

app.setLocale('en')
app.getLocale() // 'en'
```

`createEditor()` 提供相同的 `locale`、`messages`、`getLocale()` 與 `setLocale()` 契約。未覆寫的 key 沿用內建字串，空字串也是有效 override。

- 產品殼：`createApp`（`@cluion/sigil-app`）
- 自組 UI：`createEditor`（`@cluion/sigil`）
- 僅引擎：`createEngine`（`@cluion/sigil-core`）

詳見 [docs/guide/getting-started.md](./docs/guide/getting-started.md)

安全信任邊界、CSP／Trusted Types 設定與已審核 DOM sink 見[安全模型](./docs/guide/security.md)。

## 套件

| 套件                       | 用途           |
| -------------------------- | -------------- |
| `@cluion/sigil-app`        | `createApp`    |
| `@cluion/sigil`            | `createEditor` |
| `@cluion/sigil-core`       | 引擎           |
| `@cluion/sigil-shortcode`  | shortcode      |
| `@cluion/sigil-ui`         | 畫布／面板     |
| `@cluion/sigil-blocks`     | 預設區塊       |
| `@cluion/sigil-store-json` | JSON store     |

## 開發

```bash
pnpm install
pnpm dev
pnpm test
pnpm exec playwright install chromium # 第一次執行 E2E 前
pnpm test:e2e
pnpm build
```

Node ≥ 24、pnpm 10。[examples/](./examples/)

## License

MIT
