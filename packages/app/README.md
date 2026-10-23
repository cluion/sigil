# `@cluion/sigil-app`

`createApp` 產品殼。

```bash
pnpm add @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-shortcode
```

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks } from '@cluion/sigil-blocks'

const app = createApp({ mount: '#app', blocks: basicBlocks })
app.toJSON() // 純快照，不寫入 store
await app.save() // Promise<SigilDoc>；等待寫入，失敗會 reject
app.isDirty()
app.isSaving()
app.toHTML()
app.destroy()
```

以上保存 API 是下一個**尚未發布的 minor 破壞性變更**；`0.20.x` 依賴 `toJSON()` 存檔的程式需改成 `await app.save()`。未注入 `store` 時使用記憶體保存，不會在重新載入頁面後保留資料。

`save()` 在呼叫時取得快照，依呼叫順序寫入。存檔期間的新編輯保留 dirty；Undo 回成功提交的樹版本可恢復 clean。API／`runCommand('save')` 的呼叫者應處理 rejection；UI／快捷鍵失敗可由 `hooks.onSaveError` 通知宿主。這不包含跨分頁或跨使用者的伺服器版本衝突防護。完整載入、hook 與 destroy 行為見[保存契約](../../docs/guide/persistence.md)。

樣式於執行時注入，或 `import '@cluion/sigil-app/tokens.css'`。  
畫布與圖層支援右鍵選單，可複製、貼上、上下移動或刪除目前節點。
產品殼會依 mount 容器寬度自動切換；窄於 900px 時，區塊與圖層／設定面板改為可用鍵盤操作的互斥抽屜。

富文字可注入 `RichTextAdapter`；啟用時必須同時提供 `sanitize`，Canvas 與 static／hydrated 匯出才會共用安全邊界。完整契約見 [富文字指南](../../docs/guide/rich-text.md)。

自組 UI：`@cluion/sigil`。

## License

MIT
