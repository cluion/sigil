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

app.toJSON() // 只取得隔離快照，不存檔
await app.save() // 等待 ProjectStore 寫入成功；失敗會 reject
app.toHTML()
app.destroy()
```

保存 API 是下一個**尚未發布的 minor 破壞性變更**：既有 `0.20.x` 呼叫者若以 `toJSON()` 觸發存檔，須改成 `await save()`。`toJSON()` 現在只取快照；App／Editor 都提供 `isDirty()`、`isSaving()`。未注入 `store` 時只使用記憶體保存。載入、錯誤處理、併發限制與遷移方式見[保存契約](./docs/guide/persistence.md)。

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

`1.0` 交付準備的公開邊界見 [API 契約](./docs/guide/public-api.md)、[瀏覽器支援](./docs/guide/browser-support.md)、[效能與容量](./docs/guide/performance.md)及[升級指南](./docs/guide/upgrading.md)。目前套件宣告仍為 `0.20.0`，新變更尚未發布；[交付流程](./RELEASING.md)另列真人試用、固定版本與遠端驗證條件。

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

[Laravel 活動頁編輯器](./examples/laravel/README.md) 提供可執行的登入、文件保存、版本衝突與圖片上傳範例，使用本工作樹的未發布 API。安裝與獨立 PHP／瀏覽器驗證命令見範例 README。

視覺回歸使用固定 Linux／amd64 容器：`pnpm test:visual:docker`。
三個畫面、基準更新及差異檢查流程見 [e2e/README.md](./e2e/README.md)。

## License

MIT
