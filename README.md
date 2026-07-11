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

- 產品殼：`createApp`（`@cluion/sigil-app`）
- 自組 UI：`createEditor`（`@cluion/sigil`）
- 僅引擎：`createEngine`（`@cluion/sigil-core`）

詳見 [docs/guide/getting-started.md](./docs/guide/getting-started.md)

## 套件

| 套件 | 用途 |
|---|---|
| `@cluion/sigil-app` | `createApp` |
| `@cluion/sigil` | `createEditor` |
| `@cluion/sigil-core` | 引擎 |
| `@cluion/sigil-shortcode` | shortcode |
| `@cluion/sigil-ui` | 畫布／面板 |
| `@cluion/sigil-blocks` | 預設區塊 |
| `@cluion/sigil-store-json` | JSON store |

## 開發

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

Node ≥ 20、pnpm 10。[examples/](./examples/)

## License

MIT
