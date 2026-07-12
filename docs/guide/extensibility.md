# 擴充：Commands、Hooks、圖層、PropSchema

0.4–0.5 起產品殼與表單的主要擴充點。本機可 `pnpm dev` 對照 demo。

## createApp 概覽

```ts
import { createApp, defineCommand } from '@cluion/sigil-app'
import { basicBlocks } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'

const app = createApp({
  mount: '#app',
  store: new JsonProjectStore(),
  blocks: basicBlocks,
  commands: [
    defineCommand({
      id: 'demo-ping',
      label: 'Ping',
      toolbar: true, // 出現在 Topbar
      toolbarGroup: 'main', // history | main | end
      shortcut: 'mod+shift+p',
      run: () => console.log('ping'),
    }),
  ],
  hooks: {
    onSelect: (id) => console.log('select', id),
    beforeSave: (doc) => doc,
    afterSave: () => console.log('saved'),
    afterLoad: () => console.log('loaded'),
  },
})

await app.runCommand('undo')
app.isDirty()
```

`createEditor`（`@cluion/sigil`）同樣支援 `commands`／`hooks`／`runCommand`（無產品殼 Topbar 時，`toolbar` 僅語意標記，需自繪按鈕）。

---

## Commands

| 欄位 | 說明 |
|------|------|
| `id` | 唯一 id；同 id 可覆寫預設 |
| `shortcut` | 如 `mod+s`、`mod+shift+z`（`mod` = Ctrl／Cmd） |
| `toolbar` | `true` 或 `'primary'` → createApp Topbar 顯示 |
| `toolbarGroup` | `history`／`main`／`end` |
| `when` | 回傳 false 則不可執行（按鈕 disabled） |
| `run` | 執行體，參數為 `CommandContext` |

預設命令：`undo`／`redo`／`delete`／`copy`／`paste`／`save`（app 另註冊 `export`）。

DevTools（demo 會掛 `window.__sigil`）：

```js
await __sigil.runCommand('undo')
await __sigil.runCommand('demo-ping')
```

---

## Hooks

| Hook | 時機 |
|------|------|
| `onSelect` | 選取變更 |
| `beforeSave` | 寫入 ProjectStore 前；可回傳新 doc |
| `afterSave` | 寫入後 |
| `afterLoad` | 殼掛載完成 |
| `beforeDestroy` | destroy 前 |

宿主錯誤在多數 hook 會被隔離，避免拖垮編輯器。

---

## 圖層：name／locked／hidden

節點可選欄位（可序列化進 JSON）：

```ts
{
  id: 't1',
  type: 'text',
  content: 'Hello',
  name: '標題',      // 圖層顯示名；選取標籤優先顯示
  locked: true,     // 不可刪除／拖移／改內容（可解鎖）
  hidden: true,     // 畫布半透；toHTML 加 display:none
}
```

圖層面板：

- **雙擊**列 → 重命名  
- **●／○** → 隱藏  
- **🔓／🔒** → 鎖定  

---

## PropSchema：group 與 dependsOn

```ts
defineShortcode({
  name: 'callout',
  props: { kind: 'info', title: 'Hi', ctaLabel: 'Go' },
  schema: [
    {
      name: 'kind',
      type: 'select',
      group: '基本',
      options: [
        { value: 'info', label: '資訊' },
        { value: 'cta', label: '行動呼籲' },
      ],
    },
    { name: 'title', type: 'text', group: '基本' },
    {
      name: 'ctaLabel',
      type: 'text',
      group: 'CTA',
      dependsOn: { prop: 'kind', eq: 'cta' },
      // 或 in: ['a', 'b']；或只寫 prop 表示 truthy 才顯示
    },
  ],
  // template / bind / render …
})
```

demo 左側區塊庫有 **提示框（callout）**，可直接試。

---

## 本機 demo 怎麼走

```bash
pnpm install
pnpm dev
```

建議路徑：

1. 頂欄 **Ping**（或 Cmd/Ctrl+Shift+P）→ 上方 hook 狀態列  
2. 點畫布元件 → `hook:onSelect`  
3. 頂欄 **存檔** → `beforeSave`／`afterSave`  
4. 右側圖層：雙擊改名、鎖、隱  
5. 選「提示 callout」→ 屬性把類型改成「行動呼籲」→ 出現按鈕文字欄位  

另見 [範例](/guide/examples)、[Getting Started](/guide/getting-started)。
