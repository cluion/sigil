# `@cluion/sigil`

`createEditor` SDK。

```bash
pnpm add @cluion/sigil @cluion/sigil-blocks
```

```ts
import { createEditor, defineCommand } from '@cluion/sigil'
import { basicBlocks } from '@cluion/sigil-blocks'

const editor = createEditor({
  mount: '#app',
  blocks: basicBlocks,
  commands: [
    defineCommand({
      id: 'log-tree',
      label: 'Log tree',
      shortcut: 'mod+shift+l',
      // createApp 時可 toolbar: true 掛到 Topbar
      run: ({ engine }) => console.log(engine.getTree()),
    }),
  ],
  hooks: {
    onSelect: (id) => console.log('select', id),
    beforeSave: (doc) => doc,
  },
})
await editor.runCommand('undo')
editor.toJSON() // 純快照，不寫入 store
await editor.save() // Promise<SigilDoc>；等待寫入，失敗會 reject
editor.isDirty()
editor.isSaving()
editor.toHTML()
editor.destroy()
```

以上保存 API 是下一個**尚未發布的 minor 破壞性變更**；`0.20.x` 依賴 `toJSON()` 存檔的程式需改成 `await editor.save()`。`toJSON()` 回傳與 engine 分離的快照；存檔才會執行保存 hooks。未注入 `store` 時只使用記憶體保存。

`await editor.runCommand('save')` 也會等待寫入，失敗會 reject。自組 UI 可讀取 `isDirty()`／`isSaving()`，並透過 `hooks.onSaveError` 接收快捷鍵或 API 的保存錯誤。保存佇列只涵蓋同一實例，跨分頁衝突仍需後端實作。完整載入、重試與生命週期見[保存契約](../../docs/guide/persistence.md)。

預設命令：`undo`／`redo`／`delete`／`copy`／`paste`／`move-up`／`move-down`／`save`。畫布與圖層的右鍵選單會依目前選取狀態顯示可執行命令。

`createEditor()` 可注入 `RichTextAdapter`；啟用時必須同時提供 `sanitize`。完整契約見 [富文字指南](../../docs/guide/rich-text.md)。

產品殼：`@cluion/sigil-app`（同樣支援 `commands`／`hooks`）。

## License

MIT
