# `@cluion/sigil-app`

開箱即用產品殼：Design tokens、Topbar、三欄版面、Inspector 分頁、狀態列

## 安裝

```bash
pnpm add @cluion/sigil-app
```

## 用法

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks } from '@cluion/sigil-blocks'

const app = createApp({
  mount: '#app',
  blocks: basicBlocks,
  shortcodes: [/* defineShortcode(...) */],
})

app.toJSON()
app.toHTML()
app.destroy()
```

進階自組 UI 請用 `@cluion/sigil` 的 `createEditor` 或 core + ui 面板

## 樣式

tokens 會在 `createApp` 時自動注入  
亦可 `import '@cluion/sigil-app/tokens.css'`

## 授權

MIT
