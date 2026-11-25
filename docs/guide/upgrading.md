# 從 0.20.x 升級

本頁說明從既有 `0.20.x` 整合移到**目前尚未發布的工作區候選版本**時，需要調整與驗證的事項。7 個套件的宣告版本目前仍為 `0.20.0`；這不是已發布套件的安裝指南，也不表示 `1.0` 已完成。保存契約的 breaking change 已記錄為待發布的 minor changeset，最終版本以實際 release notes 為準。

## 先固定升級範圍

Sigil 的 7 個套件在 Changesets 中屬於同一個 fixed version group：`@cluion/sigil-app`、`@cluion/sigil`、`@cluion/sigil-core`、`@cluion/sigil-ui`、`@cluion/sigil-blocks`、`@cluion/sigil-shortcode`、`@cluion/sigil-store-json`。

升級時，讓實際使用的 Sigil 套件解析到同一個已核對版本，並保留原 lockfile、建置產物、宿主 adapter 設定及資料備份。不要混用已發布 `0.20.x` 與這份工作區的原始碼或型別宣告，也不要只替換 App 而讓其他套件留在不同版本。沒有使用的套件不必為了湊齊 7 個而額外安裝。

目前套件採 ESM、提供根入口的 TypeScript 宣告，宣告 Node.js `>=24`；沒有 CommonJS `require` 入口。使用 package root，CSS 使用 `@cluion/sigil-app/tokens.css`，移除對 `src/*`、`dist/*` 的深層匯入。完整邊界見[公開 API 契約](/guide/public-api)。

`createApp()`／`createEditor()` 需要 DOM。SSR 宿主應在瀏覽器掛載階段建立實例，在卸載時 `destroy()`；能在 Node 載入 ESM 模組不等於能在伺服器建立編輯器，也不是完整 SSR 支援保證。

## 將保存改成可等待的操作

最重要的變更是 `toJSON()` 不再觸發寫入。檢查保存按鈕、快捷鍵、自訂命令、離頁處理，以及曾用來判斷「已保存」的程式：

```ts
// 舊整合：依賴 toJSON() 的保存副作用，無法等待 store 完成。
app.toJSON()

// 新契約：明確等待保存；失敗仍須保留使用者目前的內容。
try {
  const saved = await app.save()
  showSaved(saved)
} catch (error) {
  showSaveError(error)
}

// 純讀取、下載備份或 JSON 匯出。
const snapshot = app.toJSON()
```

上述 `showSaved`／`showSaveError` 由宿主提供。Editor 使用相同的 `await editor.save()` 契約；預設保存命令可用 `await app.runCommand('save')`，回傳的是是否執行的 boolean，且錯誤會 reject。若宿主覆寫了同名命令，必須自行接回保存流程。

需要一併調整的地方：

- 成功提示放在 `await save()` 完成之後。`beforeSave` 可轉換隔離的保存 payload；它與 store 失敗都會使保存 reject。
- `afterSave` 是寫入成功後的通知，其錯誤不會使已成功寫入的保存變成失敗。不要以通知失敗作為自動重寫同一文件的理由。
- `onSaveError` 可統一接收 API、預設按鈕與快捷鍵的保存失敗；它不會取代 API 呼叫端的 `try/catch`。
- 以 `isDirty()`／`isSaving()` 呈現狀態。先前版本的保存完成時，之後新增的編輯仍保持 dirty；不要自行在任何成功通知中無條件清除修改標記。
- 初始文件的 clean 狀態不代表後端已有資料。新文件仍需由宿主完成首次建立，才能視為已保存。
- 卸載後不再發起保存。已送出的 adapter 請求無法撤回，離頁備份或等待策略須在卸載前決定。

完整的佇列、checkpoint、hooks 與 retry 語意見[文件保存與遷移](/guide/persistence)。

## 核對 adapter 與文件往返

App／Editor 沒有新的遠端 `load()` 方法，也不會自動呼叫 store load。宿主仍先 `await store.load()`，驗證資料後再以 `doc` 建立實例。

HTTP adapter 只有在確認文件不存在時才能回傳 `null`。認證失效、403、網路錯誤或伺服器故障不能被轉成空白文件。保存時必須檢查 `response.ok` 或端點明確接受的成功狀態；`fetch()` 收到 4xx／5xx 不會自行 reject。若後端有 revision／ETag，保留其條件寫入邏輯；核心的單實例保存佇列不能代替跨分頁衝突防護。

文件 schema 仍是 `version: 1`。**不要因 package 版本改變就重寫 `SigilDoc.version`。** `migrate()` 不是通用結構驗證器，也沒有把任意舊資料轉成安全文件的能力。

以代表性的真實文件檢查 `root`、`meta`、`stylesheets`、responsive styles、shortcode props 及素材 URL 的保存／重載。`attributes`、`style`、`responsiveStyles` 等 map 必須保留 `{}`，`children` 與 `stylesheets` 則保留 `[]`；不要在 PHP 中將兩者都轉成空陣列。候選版本會保留原本的 metadata 與 stylesheets，但無法還原舊整合先前已丟失的內容；保真保存也不表示未支援的 stylesheet 已會自動套用。

`app.toJSON()`／`editor.toJSON()` 現在是可獨立修改的深拷貝快照。低階 `engine.getTree()`／`engine.toJSON()` 仍可能共享內部物件，請視為唯讀，透過 engine 方法編輯。若既有程式直接改這些回傳物件來改畫面，應改用 engine 操作；不要把高階快照的新保證套到低階 engine 上。

## Laravel 舊片段不能直接接用新資料表

目前 `examples/laravel` 已是具有 session 登入、owner 隔離、revision CAS 與素材保存的完整本機範例。舊版則是供宿主複製的參考片段：`sigil_pages.key` 全域唯一，路由只有加 auth 的提示註解，GET／PUT 使用裸 `SigilDoc`，未提供 owner 或 revision 欄位。

新範例使用 `(user_id, key)` 唯一約束，請求與回應改為：

| 操作     | 新契約                                                         |
| -------- | -------------------------------------------------------------- |
| 讀取     | `GET /sigil/pages/{key}` → `{ revision, doc }`                 |
| 首次建立 | `PUT` 的 body 為 `{ baseRevision: 0, doc }`，成功回 revision 1 |
| 後續保存 | `PUT` 帶上次讀取／保存的 `baseRevision`，成功回新的 revision   |
| 過期版本 | HTTP 409；不自動覆寫或合併                                     |

**儲存庫沒有將舊全域 key 表自動轉成新 owner 表的 migration，也沒有自動資料匯入工具。** 新範例的 migration 是建立新表，不能直接對既有同名資料表當作升級腳本執行。曾複製舊片段的宿主，需先完成下列資料決策，再另行實作及驗證自己的 migration：

1. 備份原資料庫、文件 JSON、素材 bytes 與 URL 對應，確認備份能讀取；保留舊程式及 lockfile。
2. 明確指定每份舊文件的 owner，處理 key 重複、無法辨識歸屬及權限規則。不得把所有內容自動分配給第一個登入者。
3. 制定已匯入文件的 revision 起點及切換期間的寫入規則，避免舊的無條件更新與新的 CAS 同時寫入。revision 0 是新協定的「尚未建立」，不是已存在文件可任意套用的版本。
4. 在隔離副本驗證轉換後的筆數、owner／key 對應、JSON map、內容與素材可讀性，再規劃正式切換。新範例的驗證器只接受原生區塊子集，既有 shortcode／自訂節點不能假設直接通過。

新的文件與素材清單／上傳需要 session 認證；寫入送出 CSRF token。素材圖片 bytes 則可透過網址公開讀取，這項可見性需要符合宿主的使用情境。詳細限制與本機啟動方式見[範例索引](/guide/examples)及倉庫 `examples/laravel/README.md`。

## 升級後必須實際驗證

在隔離環境使用有代表性的文件，完成下列操作並比較保存前後內容；只通過 build 不足以確認升級成功。

| 情境             | 應確認的結果                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 保存、重載與素材 | 成功提示在寫入確認後出現；重載仍有文字、responsive styles、metadata 與可讀圖片                                                      |
| 保存失敗與重試   | 模擬非 2xx／網路失敗；內容與 dirty 保留，錯誤可見，後續保存可重試                                                                   |
| 保存中繼續編輯   | 舊請求成功不清除較新的修改；下一次保存提交目前內容                                                                                  |
| 兩個分頁競爭     | 有 CAS 的宿主拒絕過期保存；Laravel 範例回 409，保留本機內容並允許先下載 JSON 備份                                                   |
| 衝突後重載       | 先備份或明確處理未保存修改，再確認重載；不要默默捨棄本機內容                                                                        |
| 登入／CSRF 失效  | 401／419 等錯誤不變成空白文件，不誤報保存成功                                                                                       |
| 富文字與 CSP     | 提供同步 sanitizer；編輯、取消、undo、重載及 static／hydrated 匯出維持預期內容，危險 markup 被清理，在宿主 CSP enforcement 下仍正常 |

富文字應同時核對 sanitizer 的內容 allowlist 與 Trusted Types／CSP 相容性；它不能代替 `SigilDoc` 的結構、tag、attribute 與 URL 驗證。請依[富文字 adapter](/guide/rich-text)與[安全模型](/guide/security)檢查自己的擴充，不能把 demo sanitizer 視為所有內容情境的通用產品方案。

若從 repository 建置候選版本，`pnpm build` 後的 `pnpm test:public-api` 可檢查 dist 入口、型別契約與 ESM exports。這項檢查不驗證宿主資料 migration、權限、實際保存流程或 SSR；相關驗收仍需在自己的整合中執行。

## 回退時保留升級後的內容

回退程式版本前，先保存升級後新增或修改的文件、revision、owner 對應與素材，確認舊 adapter 能否讀取目前資料格式與 API。即使文件仍為 version 1，新的 HTTP envelope、資料表與權限規則也不因此與舊程式相容。

不要為了讓舊程式啟動就直接執行資料表 rollback、丟棄 owner／revision，或以升級前備份覆蓋目前資料。若需要還原備份，必須先對升級後的修改制定保留與重播方式，再於隔離副本驗證。Laravel 範例目前沒有提供這種自動回退或雙向轉換；應用程式回退與資料復原要分別規劃。
