# `@cluion/sigil`

一站式編輯器入口：`createEditor()` 組合 core、shortcode、ui、blocks、store。

## 安裝

```bash
pnpm add @cluion/sigil
```

## 用法

```ts
import { createEditor } from '@cluion/sigil'
import { basicBlocks } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'

const editor = createEditor({
  mount: document.getElementById('app')!,
  store: new JsonProjectStore(),
  blocks: basicBlocks,
  shortcodes: [/* defineShortcode(...) */],
  fetchJSON: (url, signal) => fetch(url, { signal }).then((r) => r.json()),
  locale: 'zh',
})

editor.toJSON()
editor.toHTML()
editor.toHTML('hydrated')
editor.engine // 進階：直接操作樹
editor.destroy()
```

## EditorOptions

| 選項 | 說明 |
|---|---|
| `mount` | 掛載點 `HTMLElement` 或選擇器 |
| `doc` | 初始 `SigilDoc` |
| `store` | `ProjectStore`（預設 `JsonProjectStore`） |
| `blocks` | 區塊工廠 `Record<string, () => ComponentNode>` |
| `shortcodes` | `ShortcodeDefinition[]` |
| `fetchJSON` | 注入 shortcode 非同步資料 |
| `locale` | `'zh'` \| `'en'` |
| `sanitize` / `trustedTypesPolicyName` | HtmlPolicy 客製 |

完整上手見 [Getting Started](../../docs/getting-started.md)。

## 授權

MIT。
