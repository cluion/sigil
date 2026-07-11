# `@cluion/sigil-store-json`

預設 `ProjectStore`：記憶體保存，並提供 JSON 匯入／匯出。

依賴：`@cluion/sigil-core`。

## 安裝

```bash
pnpm add @cluion/sigil-store-json
```

## 用法

```ts
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { ProjectStore } from '@cluion/sigil-core'

const store = new JsonProjectStore()

// ProjectStore
store.save(doc)
const loaded = store.load()

// JSON 專屬
const text = store.exportJSON(doc)
const again = store.importJSON(text)
```

`createEditor({ store })` 可傳任何 `ProjectStore`；只有需要字串匯出時才依賴本類別的 `exportJSON`／`importJSON`。

## 授權

MIT。
