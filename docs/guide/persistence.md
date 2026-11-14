# 保存、載入與遷移

本頁描述下一個**尚未發布的 minor 破壞性變更**。目前套件宣告版本仍為 `0.20.0`；以下新契約不能視為已發布套件的既有行為。升級時，將原本用來存檔的 `toJSON()` 改成 `await save()`。

## 快照與保存

`createApp()` 與 `createEditor()` 提供相同保存 API：

| API                         | 契約                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `toJSON(): SigilDoc`        | 回傳與 engine 分離的快照，不寫入 store、不執行保存 hooks，也不清除 dirty。修改回傳值不會修改文件或 Undo 歷史。 |
| `save(): Promise<SigilDoc>` | 呼叫時擷取快照，依呼叫順序執行保存；回傳經 `beforeSave` 處理且 store 已確認寫入的 payload，失敗會 reject。     |
| `isDirty(): boolean`        | 目前文件樹是否偏離最近成功提交的樹版本；初始文件作為起點。                                                     |
| `isSaving(): boolean`       | 是否仍有排隊或尚未結束的保存工作，包含保存 hooks。                                                             |

```ts
const snapshot = app.toJSON() // 只供讀取、備份或 JSON 匯出

try {
  const saved = await app.save()
  console.log('store 已確認寫入', saved)
  // 若等待期間又有編輯，此時 app.isDirty() 仍可能為 true。
} catch (error) {
  console.error('保存未成功，保留目前編輯內容', error)
}
```

預設 `await app.runCommand('save')`／`await editor.runCommand('save')` 同樣會等待保存，失敗會 reject；命令回傳值仍是是否執行的 boolean，不是文件。`toHTML()` 只輸出 HTML，不代表已保存。

快照與保存保留初始 `SigilDoc` 的 `meta`、`stylesheets`，以及目前文件樹；不會因編輯後重新儲存而只剩下 `version`／`root`。

未注入 `store` 時，App／Editor 使用 `JsonProjectStore`，只保存在記憶體。`isDirty() === false` 表示相對本實例起點或成功提交版本沒有新變更，不保證資料已寫入磁碟、遠端或能跨頁面重載。

## 載入由宿主負責

App／Editor 不會自動呼叫 `ProjectStore.load()`，也沒有高階 `load()` 方法。宿主先完成讀取與文件驗證，再建立實例：

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection } from '@cluion/sigil-blocks'
import type { ProjectStore } from '@cluion/sigil-core'

async function mountEditor(store: ProjectStore) {
  const loaded = await store.load()
  return createApp({
    mount: '#app',
    doc: loaded ?? { version: 1, root: blockSection() },
    store,
    blocks: basicBlocks,
  })
}
```

`load()` 的 `null` 應只代表確認不存在；認證失效、沒有權限、網路中斷或伺服器錯誤應拋錯，不能回傳空白文件繼續編輯。HTTP adapter 也須在保存時檢查 `response.ok`，因為 `fetch()` 遇到 HTTP 4xx／5xx 不會自行 reject。參考[Getting Started 的 HTTP adapter](/guide/getting-started#projectstore)。

此 API 不包含自動重載或合併遠端文件。需要切換／重新載入文件時，宿主應先處理本機未存內容，再完成自己的讀取與掛載流程。

## 保存期間的編輯與重試

每次 `save()` 都保留呼叫當下的快照，單一實例的 store 寫入依序執行。較早的請求不會晚於較新的請求寫入同一 adapter；排隊的快照也不會被後續編輯替換。

例如提交 A 後繼續編輯成 B：A 成功只確認 A，B 仍為 dirty。Undo 回成功提交的 A 樹版本可恢復 clean；Redo 到 B 又會變成 dirty。裝置預覽或選取變化不等於文件樹變更。

`beforeSave` 或 store 失敗不會更新成功提交的 checkpoint，也不會清除目前文件或破壞後續保存佇列。宿主可處理錯誤後再次呼叫 `save()`；重試會提交**重試當下**的文件，而非自動重送舊快照。已排隊的其他保存仍會依序執行，不因前一筆失敗而永久卡住。

## 保存 hooks

```ts
const app = createApp({
  mount: '#app',
  doc,
  store,
  hooks: {
    beforeSave: (snapshot) => ({
      ...snapshot,
      meta: { ...snapshot.meta, updatedAt: new Date().toISOString() },
    }),
    afterSave: (saved) => console.log('已確認寫入', saved.meta?.updatedAt),
    onSaveError: (error, { doc: attempted }) => {
      console.error('未能保存這次提交', attempted.meta?.title, error)
    },
  },
})
```

- `beforeSave(doc, { engine })` 可同步或非同步轉換隔離 payload；修改該 payload 不會寫回 engine。它拋錯時會阻止該次 store 寫入，並使 `save()` reject。
- `afterSave(doc, { engine })` 在 store 確認成功後通知宿主。其錯誤被隔離，不會把已確認的保存變成失敗。
- `onSaveError(error, { engine, doc })` 接收 `beforeSave` 或 store 的失敗，以及該次提交的隔離快照。API、預設保存命令、快捷鍵與 App 按鈕都走此通知；通知本身的錯誤不會取代原始錯誤。API 呼叫者仍須處理 `save()`／`runCommand()` 的 rejection。

dirty 對照的是提交時的 engine 樹版本。`beforeSave` 若轉換持久化內容，不會把轉換結果變成新的編輯歷史；宿主須確保轉換符合再次載入時的內容語意。`afterLoad` 只表示傳入的初始文件已掛載。

## 銷毀與併發界限

`destroy()` 後新的保存與尚未送往 store 的排隊保存會 reject。已送出的 adapter 請求無法由編輯器取消，仍可能完成寫入；其 promise 依 adapter 結果完成，但不再回寫 UI 或呼叫保存通知 hooks。因此，`destroy()` 不是撤回存檔的方法。

目前佇列只保障**同一 App／Editor 實例**的提交順序，不涵蓋多個實例、瀏覽器分頁、使用者或網路重試的伺服器版本衝突。倉庫 `examples/laravel/README.md` 的活動頁範例示範由後端以 owner 與 revision 執行原子條件寫入；衝突時 adapter reject，宿主保留本機修改並提供下載備份與明確重新載入。這層保護屬於宿主整合，並非 core 自動提供；請依範例 README 在此工作樹建置，相關變更尚未發布。

伺服器身分驗證、授權、CSRF、文件驗證及素材持久化仍由宿主負責，詳見[安全模型](/guide/security)。

## 從 0.20.x 遷移

```ts
// 0.20.x：曾依賴 toJSON() 的寫入副作用，無法等待 adapter 完成。
editor.toJSON()

// 新契約：需要存檔時明確等待；純讀取／匯出仍使用 toJSON()。
await editor.save()
const snapshot = editor.toJSON()
```

將成功提示移到 `await save()` 完成之後，失敗提示接到 `catch` 或 `onSaveError`。移除「呼叫 `toJSON()` 就已保存」的假設，也不要以 `afterSave` 通知失敗當作重新寫入的理由。若 adapter 是 HTTP，先補齊非 2xx 的錯誤檢查，才能讓新保存契約反映伺服器結果。
