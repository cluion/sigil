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
    onSaveError: (error) => console.error('save failed', error),
    afterLoad: () => console.log('loaded'),
  },
})

await app.runCommand('undo')
app.isDirty()
app.isSaving()
```

`createEditor`（`@cluion/sigil`）同樣支援 `commands`／`hooks`／`runCommand`（無產品殼 Topbar 時，`toolbar` 僅語意標記，需自繪按鈕）。

---

## Commands

| 欄位           | 說明                                           |
| -------------- | ---------------------------------------------- |
| `id`           | 唯一 id；同 id 可覆寫預設                      |
| `shortcut`     | 如 `mod+s`、`mod+shift+z`（`mod` = Ctrl／Cmd） |
| `toolbar`      | `true` 或 `'primary'` → createApp Topbar 顯示  |
| `toolbarGroup` | `history`／`main`／`end`                       |
| `when`         | 回傳 false 則不可執行（按鈕 disabled）         |
| `run`          | 執行體，參數為 `CommandContext`                |

預設命令：`undo`／`redo`／`delete`／`copy`／`paste`／`save`（app 另註冊 `export`）。

預設 `save` 命令與公開 `save()` 共用保存佇列；`await app.runCommand('save')` 或 `await editor.runCommand('save')` 會等待完成，`beforeSave`／store 失敗會 reject，呼叫者須處理錯誤。快捷鍵／App 按鈕啟動的失敗會經 `onSaveError` 通知宿主；App 也會顯示保存失敗。

DevTools（demo 會掛 `window.__sigil`）：

```js
await __sigil.runCommand('undo')
await __sigil.runCommand('demo-ping')
```

---

## Hooks

| Hook            | 時機                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `onSelect`      | 選取變更                                                                      |
| `beforeSave`    | 寫入 ProjectStore 前；接收隔離快照，可回傳新 doc；拋錯中止該次寫入            |
| `afterSave`     | store 確認成功後的通知；錯誤被隔離，不改變已成功寫入的結果                    |
| `onSaveError`   | `beforeSave` 或 store 失敗；參數為 `error`、`{ engine, doc }`，通知錯誤被隔離 |
| `afterLoad`     | 殼掛載完成                                                                    |
| `beforeDestroy` | destroy 前                                                                    |

`beforeSave` 是保存閘門，不能吞掉錯誤繼續寫入。它修改的是該次提交的隔離 payload，不會將轉換結果寫回 engine；dirty 仍以呼叫 `save()` 時提交的樹版本為準。`afterSave`／`onSaveError` 是通知，通知失敗不會取代原本的保存結果。`onSelect`、`afterLoad`、`beforeDestroy` 的宿主錯誤也會隔離。

`toJSON()` 現在只回傳隔離快照，不呼叫任何保存 hook。此契約為下一個**尚未發布的 minor 破壞性變更**；從 `0.20.x` 遷移時須將用來存檔的 `toJSON()` 改為 `await save()`。初始載入由宿主先 `await store.load()` 再建立 App／Editor；`afterLoad` 表示初始文件已掛載，不代表編輯器會自行讀取遠端。完整重試、dirty 與 destroy 契約見[保存指南](/guide/persistence)。

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
