# `@cluion/sigil-core`

零第三方依賴的編輯器引擎地基：文件模型、Engine、renderer、HtmlPolicy、序列化與 signal。

## 安裝

```bash
pnpm add @cluion/sigil-core
```

（monorepo 開發時為 `workspace:*`。）

## 主要匯出

| API | 說明 |
|---|---|
| `ComponentNode` / `SigilDoc` | 可序列化頁面樹 |
| `createEngine` | 增刪改移、選取、undo/redo、subscribe |
| `createRenderer` | JSON → DOM（key-based patch） |
| `toHTML` / `hydrate` | static／hydrated 輸出與水合 |
| `parse` / `stringify` | shortcode 字串 ↔ 節點 |
| `createDefaultPolicy` | Trusted Types／HTML sink 唯一入口 |
| `ProjectStore` | 頁面存取 adapter 介面 |
| `createStore` / `createEventBus` / signal | 響應式與跨元件通訊原語 |
| `createI18n` | 簡易 i18n |

## 最小引擎

```ts
import { createEngine } from '@cluion/sigil-core'

const engine = createEngine({
  doc: {
    version: 1,
    root: { id: 'r', type: 'section', children: [] },
  },
})

engine.insert('r', { id: 't', type: 'text', content: 'Hi' })
engine.subscribe((e) => {
  if (e.type === 'tree') console.log(e.tree)
})
```

## ProjectStore

```ts
import type { ProjectStore } from '@cluion/sigil-core'

interface ProjectStore {
  load(): SigilDoc | null | Promise<SigilDoc | null>
  save(doc: SigilDoc): void | Promise<void>
}
```

預設實作見 [`@cluion/sigil-store-json`](../store-json/README.md)。

## 體積

gzip 硬目標 &lt; 30KB（repo 內 `pnpm size` 監控）。

## 授權

MIT。
