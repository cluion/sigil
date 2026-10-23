# 公開 API 與相容性契約

本頁界定 Sigil 朝 `1.0` 穩定版收斂的公開契約。**目前工作區的 7 個套件版本仍為 `0.20.0`，含尚未發布的變更；本頁不代表 `1.0` 已發布，也不代表 npm 上既有 `0.20.0` 已具備以下全部行為。** 保存 API 的破壞性調整已記錄為未發布的 minor changeset，遷移方式見[文件保存](/guide/persistence)。

## 合法套件入口

以下 7 個套件的根入口均提供 ESM 與 TypeScript 宣告，App 另提供 CSS 入口。套件目前宣告 Node.js `>=24`，沒有 CommonJS `require` 入口；瀏覽器能力與實際驗證範圍另見[瀏覽器支援](/guide/browser-support)。

| 入口                           | 公開用途                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `@cluion/sigil-app`            | 完整產品殼層：`createApp`、`AppOptions`、`SigilApp`，以及匯出的命令、hooks、rich-text 型別                        |
| `@cluion/sigil`                | 輕量編輯器 SDK：`createEditor`、`EditorOptions`、`SigilEditor`，以及匯出的命令、hooks、rich-text 型別             |
| `@cluion/sigil-core`           | 文件模型、engine、renderer、HTML policy、序列化、hydration、signals、i18n、命令、hooks、保存協調器與 adapter 型別 |
| `@cluion/sigil-ui`             | Canvas、Inspector、圖層、區塊、表單、素材、模板庫、主題、選單、拖曳與對齊等組件、工具及其型別                     |
| `@cluion/sigil-blocks`         | 區塊工廠、定義、基本與行銷區塊、模板轉區塊工具                                                                    |
| `@cluion/sigil-shortcode`      | Shortcode 定義、registry、resolver、render／bind context 與型別                                                   |
| `@cluion/sigil-store-json`     | `JsonProjectStore`、`MemoryAssetStore`、`MemoryTemplateStore`、`JsonTemplateStore`                                |
| `@cluion/sigil-app/tokens.css` | 產品殼層樣式及 `--sigil-*` 設計 token；由支援 CSS 的建置工具載入                                                  |

這張表是用途分類，並非縮減公開 API 的白名單。**從上述套件根入口實際匯出的所有值與型別都是公開 API**，包括 `runBeforeSave`、`runAfterSave`、`createProjectPersistence`、tree helpers、DnD、alignment 與 template-library 等低階工具。既有 re-export 也受相容性政策約束，不能因未列在快速入門就改稱 internal。

目前完整名稱清單存於 repository 的 `tests/public-api/exports.json`，由消費端契約檢查與實際 `dist` 宣告、ESM exports 比對。`packages/*/src/index.ts` 及 `package.json#exports` 是實作端的對照來源。

```ts
import { createApp } from '@cluion/sigil-app'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
import '@cluion/sigil-app/tokens.css'
```

`@cluion/sigil-core/src/...`、`@cluion/sigil-core/dist/...` 等未列入 export map 的深層路徑不是合法入口，即使檔案恰好存在於安裝目錄也不例外。CSS 入口實際位於套件的 `src/tokens.css`，不代表其餘 `src` 路徑可以匯入。

## 版本與棄用政策

`1.0` 起，公開入口、匯出名稱、型別與記載的行為遵守以下相容性政策：

| 變更                                                                                      | 版本原則                                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 保持契約的錯誤修正                                                                        | patch                                                                              |
| 相容的新 API、選用欄位或功能                                                              | minor；新增 union 成員等情況仍須評估消費端的窮舉檢查                               |
| 移除／更名入口或 export、收窄可接受輸入、改變回傳型別、同步改非同步、改變已承諾的保存語意 | major                                                                              |
| 廢棄既有 API                                                                              | 先標示 `@deprecated`，記錄 changeset、替代 API 與遷移方法；移除須在後續 major 發生 |

棄用本身不使 API 立即失效。公開 export 的新增或刪除都需要審查並同步更新契約清單，不能只重錄 baseline 來略過相容性判斷。UI 外觀修正仍需維持公開行為與可操作性，但不承諾每個像素不變。

目前仍在 `0.x`：已排定的 `toJSON()`／`save()` 調整會透過 minor 發布破壞性變更，須依 changeset 與遷移文件升級。這是進入 `1.0` 前的狀態，不延伸為 `1.x` 允許 minor 任意破壞 API。

## 文件格式與資料所有權

`SigilDoc.version` 與 `SCHEMA_VERSION` 目前均為 `1`。**資料格式版本與套件 SemVer 是不同的版本系統**；套件升到 `1.0` 不表示文件必須變成 `version: 2`。

```ts
const doc: SigilDoc = {
  version: 1,
  root: {
    id: 'root',
    type: 'section',
    attributes: {},
    style: {},
    children: [],
  },
  meta: { title: '活動頁', device: 'desktop' },
  stylesheets: [],
}
```

`root` 是 `ComponentNode`，其中 `id`、`type` 必填；整棵樹的 ID 須唯一。屬性與樣式是 map，`children`、`stylesheets` 是陣列。後端必須保留空 map `{}` 與空陣列 `[]` 的差別，並保留文件支援的 `meta`、`stylesheets`、responsive styles 與 shortcode props。`meta` 現有欄位為 `title`、`device`、`updatedAt`；應用自訂 metadata 不應假設有任意頂層欄位的保留保證。

`migrate(unknown)` 提供資料版本閘門，遇到過新版本或缺少 migration step 會拋錯。它目前沒有完整的結構驗證、HTML 清理或任意舊格式轉換能力，不能代替宿主的輸入驗證。schema 未來若改變，必須另外說明讀寫範圍與 migration 路徑。

資料所有權有明確區別：

- `app.toJSON()`／`editor.toJSON()` 回傳 detached snapshot；修改快照不會修改 engine，也不會觸發保存。
- `engine.getTree()` 與 `engine.toJSON()` 會共享內部樹或其他巢狀資料的參考。請視為唯讀，透過 engine 方法修改文件；需要可修改副本時自行 `structuredClone()`。
- 傳入 engine 的文件、tree helper 或記憶體 store 所持有的物件，也不應假設全部都會深拷貝。繞過 engine 直接改物件會破壞 history、訂閱與 dirty 判斷的前提。

## 同步、非同步與保存

| API                                                                         | 執行契約                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `createApp(options)`／`createEditor(options)`                               | 同步建立並掛載；需要 DOM，不會代為等待 store load                                  |
| Engine 編輯、選取、undo／redo、`toJSON()`                                   | 同步；engine 本身沒有 `save()`                                                     |
| App／Editor `toJSON()`、`toHTML()`、`isDirty()`、`isSaving()`               | 同步；讀取與輸出不代表已寫入後端                                                   |
| App／Editor `save()`                                                        | `Promise<SigilDoc>`；等待該次保存完成，失敗 reject                                 |
| App／Editor `runCommand(id)`                                                | `Promise<boolean>`；未知或不可執行時為 `false`，成功執行為 `true`，命令失敗 reject |
| `ProjectStore.load()`／`save()`                                             | adapter 可同步或回傳 Promise；高階保存會等待 `save()`                              |
| `AssetStore.list()`／選用的 `upload(file)`                                  | adapter 可同步或回傳 Promise；`upload` 不存在表示沒有上傳能力                      |
| `TemplateStore.list()`／`save()`／選用的 `remove(id)`                       | adapter 可同步或回傳 Promise                                                       |
| `SanitizeFn`、rich-text resolver、`RichTextAdapter.start()` 與 session 方法 | 同步；不能回傳 Promise 取代 HTML 字串或 session                                    |
| Shortcode `render`／`bind`、resolver `resolve`／`renderStatic`              | 同步；`bind` 可回傳 cleanup，非同步工作須由 context 與生命週期自行管理             |

App 與 Editor 共用保存契約：呼叫 `save()` 時擷取文件，單一實例依序寫入 store；成功後以提交當下的 tree 作為 checkpoint。存檔期間的新編輯仍為 dirty，undo 回到該 checkpoint 可恢復 clean。失敗不會清除 dirty，也不會讓後續重試永久卡住。`beforeSave` 可轉換保存 payload，但不會把轉換結果寫回 engine。

初始文件先被視為 clean；這不證明它已存在於後端。首次建立文件的狀態、revision、備份與離頁策略由宿主追蹤。`isDirty()` 也不代表後端是否被其他分頁更新。單一實例的寫入佇列沒有跨分頁、跨使用者的版本衝突防護，宿主須在 adapter／後端實作 revision 或 ETag 的條件寫入。

App／Editor 沒有 `load()` API，也不會自動呼叫 `ProjectStore.load()`。請先 `await store.load()`、完成驗證，再傳 `doc` 建立實例。只有確認不存在才回傳 `null`；HTTP 失敗應拋錯，保存也必須檢查 `response.ok`。

預設的 JSON／Memory stores 保存於記憶體，不會自動寫入檔案、LocalStorage 或伺服器。`MemoryAssetStore` 的 object URL 也不是可跨重啟使用的永久素材網址。完整例子與錯誤處理見[文件保存](/guide/persistence)與[擴充機制](/guide/extensibility)。

`destroy()` 後，高階實例的新保存與尚未送出的排隊保存會 reject。已交給 adapter 的請求無法由 Sigil 撤回；卸載後不再回寫 UI 或觸發保存通知。宿主仍須管理自己建立的網路請求、訂閱及外部編輯器資源。

## Hooks 與低階工具

`EditorHooks` 的 callback 都是選用項，但執行時機及錯誤語意不同：

| Hook                                  | App／Editor 行為                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `onSelect(id, { engine })`            | 同步通知；錯誤隔離                                                                        |
| `beforeSave(doc, { engine })`         | 可同步或非同步回傳轉換後文件；throw／reject 阻止寫入並使保存失敗                          |
| `afterSave(doc, { engine })`          | 已確認寫入後的通知，可回傳 Promise；通知錯誤不把成功寫入改成保存失敗                      |
| `onSaveError(error, { engine, doc })` | 通知保存前處理或 store 的失敗，含 UI／快捷鍵觸發的保存；自身錯誤隔離，不取代原錯誤        |
| `afterLoad(doc, { engine })`          | 初始文件掛載後通知，可回傳 Promise；同步的 `createApp`／`createEditor` 不等待它，錯誤隔離 |
| `beforeDestroy({ engine })`           | 同步卸載通知；錯誤隔離                                                                    |

`beforeSave`、store 與保存通知收到隔離的文件資料。呼叫者仍需處理 `save()`／`runCommand()` 的 rejection，不能只安裝 `onSaveError` 就省略 `await` 的錯誤處理。

低階工具保留自身的簽章與語意。例如直接呼叫匯出的 `runAfterSave()` 會等待 callback，且將其 rejection 傳給呼叫者；是高階保存協調器負責隔離它。`runOnSaveError()` 本身則會隔離通知失敗。不要把高階殼層的錯誤處理一律套用到所有 helper。

同樣地，`createTemplateLibraryController()` 的 `reload()`／`save()` 回傳 `Promise<boolean>`，以 `false` 表示未完成並更新 UI 狀態；這與 `ProjectStore.save()` 的 reject 契約不同。以各個公開介面為準。

## 擴充點與宿主責任

`AppOptions` 提供 `assets`，`EditorOptions` 目前沒有這個選項；兩者均可接受文件 store、templates、blocks、shortcodes、rich text、hooks 與自訂 commands。既有 `basicBlocks` 的 record 形式與新的 `BlockDefinition[]` 都是受支援輸入，不能僅因後者較新就視前者為已移除。

`RichTextAdapter` 透過同步的 resolver 讀取內容，`start(context)` 回傳含 `focus()`、`getValue()`、`destroy()` 的 session；session 應能安全重複清理。啟用 rich text 時必須提供同步 `sanitize`，目前這個配對要求會在執行期檢查，並未由 options 型別完全表達。見[Rich text adapter](/guide/rich-text)。

Shortcode 的 template、`render` 與 `bind` 是宿主信任的程式碼，並非不受信任外掛的隔離環境。動態字串必須依上下文 escape 或 sanitize。`bind` 中的非同步工作應使用 `ctx.abort` 或 cleanup；需追蹤 props 更新時，在 `ctx.effect()` 內讀取 `ctx.props`，不要把先前解構的值視為持續響應。

宿主負責權限、登入、CSRF、輸入驗證、持久保存、衝突處理、素材 MIME／大小／URL 驗證，以及與自身 CSP 一致的 HTML 清理策略。Sigil 的型別、HtmlPolicy 與 iframe 不構成整個應用的安全邊界。`toHTML()` 提供同步的 static／hydrated 輸出；hydrate 所需 shortcode 定義及執行資源也由宿主供應。詳見[安全設計](/guide/security)。

## DOM、CSS 與實作細節

以下屬於可依賴的公開介面：

- 公開 handle 明列的成員，例如 `CanvasHandle.iframe`，以及其方法與回傳的 cleanup。
- `tokens.css` 入口內宣告的 `--sigil-*` token 名稱及用途；目前契約清單記錄 32 個 token。預設色值、尺寸及外觀可在保持用途的前提下調整。
- 產品殼層 `.sigil-app` 的 token 作用域，以及公開 `applyTheme()` 記載的 `.sigil-theme-dark` 主題 class。
- 文件輸出與對應 hydrate／responsive stylesheet 的互通行為。既有 `data-shortcode`、`data-props`、`data-sigil-id`、`data-sigil-r` 等協定用途不因屬於 DOM attribute 而自動失去相容性承諾。

其餘未記載的工具列 DOM 層級、面板子節點、選取框、CSS selector、測試定位方式、生成 ID 的具體字串、attribute 排列與 HTML 空白格式，均不保證固定。不要把所有 `.sigil-*` 或 `data-*` 都當成額外的擴充 API；自訂 UI 應優先使用公開 handle、options、commands 與 tokens。

原始碼的私有 helper、未匯出模組、demo fixture、視覺截圖 baseline 及效能測量值也不是 package API。這不排除它們具有品質驗收用途，僅表示消費端不應依賴其內部形狀。

## 消費端契約驗證

在 repository 根目錄先建立新的套件產物，再執行：

```sh
pnpm build
node scripts/check-public-api.mjs
```

檢查器把各 package manifest 的 `files` 所列產物複製到隔離的暫存消費端，不複製工作區的 `src/index.ts`，也不繼承根目錄 tsconfig 的 source `paths`。它會：

1. 分別用 TypeScript `Bundler` 與 `NodeNext` resolution、`skipLibCheck: false` 編譯 `tests/public-api/consumer.ts`。
2. 確認 7 個根入口的型別來自宣告的 `dist/index.d.ts`，並比對全部公開型別與值的名稱。
3. 實際載入 ESM 根入口、比對 runtime exports 與版本常數，確認 `tokens.css` 可解析且 token 清單一致。
4. 確認 14 個未公開的 `src/index.js`／`dist/index.js` 深層匯入遭 export map 拒絕。

Compile fixture 覆蓋核心型別與同步／非同步契約，不代表每個函式的完整行為都已測試。這項驗證也不會自動重建 `dist`，必須搭配前一步 build；它檢查的是 staged 發布檔案，不等於實際 registry 安裝、npm tarball、瀏覽器互動、SSR 或完整 `1.0` 發布驗收。封裝檢查、行為測試與使用者驗收仍須分別完成。
