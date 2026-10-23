# Laravel 活動頁編輯器範例

這是可在 Sigil monorepo 內執行的完整本機 Laravel app：登入後建立活動頁、編輯內容、上傳與選取圖片，並將文件和素材保存到 SQLite 與本機磁碟。前端使用 `createApp({ store, assets })`，後端提供 session 認證、owner 隔離、文件驗證與版本衝突保護。

這份範例是 Sigil 邁向 `1.0` 的整合實作，**不代表 `1.0` 已發布或完成交付驗收**。它直接使用 workspace 原始碼；其中 `await app.save()` 保存契約屬於下一個尚未發布的 minor 破壞性變更，不能假設已發布的 `0.20.x` 套件具有相同行為。

## 環境需求

- Node.js **24 以上**、pnpm **10.27.0**，依根目錄 `package.json`。
- PHP **8.3 以上**、Composer 2，以及 GD、Fileinfo、PDO SQLite extensions；其餘 Laravel 所需 extensions 由 Composer 檢查。本機已在 PHP **8.3.36** 與 **8.5.12** 實際驗證。
- Composer lock 固定 Laravel **13.36.0** 與 PHPUnit **12.5.36**。
- 此範例只支援 **SQLite**。PHP 程序需要能寫入 `database/`、`storage/` 與 `bootstrap/cache/`。

圖片上傳的應用程式上限為 4 MiB。請先用 `php --ini` 找到 CLI 使用的設定，確認 `upload_max_filesize` 至少為 `4M`、`post_max_size` 大於 `4M`，例如 `8M`；變更後重啟伺服器。PHP 預設常見的 `upload_max_filesize=2M` 會先於應用程式拒絕較大的檔案。只在 `php artisan serve` 前加上 `php -d ...` 不會將該設定傳給它建立的 PHP server 子程序。

## 安裝與啟動

先在儲存庫根目錄安裝並建置前端：

```bash
pnpm install --frozen-lockfile
pnpm --filter sigil-example-laravel build
```

Vite 會輸出 `examples/laravel/public/build/manifest.json` 與靜態資源。Blade 使用此 manifest，不需要另外啟動 Vite dev server。

接著進入 Laravel 目錄：

```bash
cd examples/laravel
composer install
test -e .env || cp .env.example .env
```

上述複製不會覆寫既有 `.env`。繼續前確認 `.env` 的 `DB_DATABASE=database/database.sqlite` 是這個範例專用的資料庫，`DB_URL` 留空，`APP_URL=http://127.0.0.1:4175`。不要將範例指向既有業務資料庫。

第一次安裝、`.env` 的 `APP_KEY` 尚為空值時執行：

```bash
php artisan key:generate
```

若已有 `APP_KEY`，保留原值；重新產生金鑰會使既有加密 cookie／session 失效。

建立 SQLite 檔案並執行 migration：

```bash
touch database/database.sqlite
php artisan migrate
php artisan sigil:user editor@example.test --name="Content Editor"
```

`touch` 不會清空既有檔案；`migrate` 會修改 `.env` 所指定的資料庫。帳號指令會以隱藏輸入詢問密碼，要求至少 12 字元、最多 72 bytes，並拒絕重複 email。沒有預設帳號或密碼。自動化可使用 `--password-stdin` 從標準輸入讀取單一密碼；不要把真實密碼放進命令參數、版本庫或紀錄檔。

啟動本機伺服器：

```bash
php artisan serve --host=127.0.0.1 --port=4175
```

開啟 [活動頁編輯器](http://127.0.0.1:4175/editor/activity)，使用剛建立的帳號登入。此命令是本機開發伺服器，不是正式部署方式。`.env.example` 的 `SESSION_SECURE_COOKIE=false` 對應本機 HTTP；正式 HTTPS 宿主需要自己的部署與安全設定。

修改前端時，在另一個終端機從儲存庫根目錄執行：

```bash
pnpm --filter sigil-example-laravel dev
```

這會持續重建靜態資源；完成後手動重新整理瀏覽器。

## 完成一張活動頁

1. 首次開啟未存在的 page key 時，按「建立活動頁」將範本實際保存後再開始編輯；只有讀取頁面不會建立資料。
2. 修改活動標題、圖片、內容與常見問題，切換手機尺寸並預覽。
3. 選取圖片區塊，從素材面板上傳或選取圖片。素材保存成功後才會回傳持久化網址。
4. 按儲存，等待成功狀態，再重新整理確認內容與圖片仍存在。匯出 HTML 是下載檔案，不會發布網站或複製圖片素材。
5. 在另一個分頁開啟相同 page key，先讓一個分頁儲存，再從舊版本儲存，確認衝突提示與本機內容保留。

`/editor/activity` 的 `activity` 是文件 key，也可開啟 `/editor/summer-event`。key 限英數開頭，後續可含英數、點、底線及連字號，總長最多 120 字元。同一 key 在不同帳號下是不同文件。

收到 **409** 時，不會自動合併或覆寫伺服器內容。請先按「下載內容備份」保存本機 JSON，再決定是否重新載入較新的遠端版本；重新載入會捨棄目前尚未儲存的修改。JSON 備份目前沒有配套的自動匯入／衝突合併介面。401／419 表示需要重新確認登入狀態，也應先備份修改。

## 文件與素材契約

所有文件與素材清單／上傳路由都在 `routes/web.php` 的 `auth` group，使用 session 與 Laravel CSRF middleware。前端請求使用同源 credentials，寫入另帶 Blade 提供的 `X-CSRF-TOKEN`。

| 請求                      | 成功回應                            | 行為                                           |
| ------------------------- | ----------------------------------- | ---------------------------------------------- |
| `GET /sigil/pages/{key}`  | `{ "revision": 1, "doc": { ... } }` | 僅讀取登入者的文件；不存在才回 404             |
| `PUT /sigil/pages/{key}`  | `{ "revision": 2 }`                 | 請求為 `{ "baseRevision": 1, "doc": { ... } }` |
| `GET /sigil/assets`       | `AssetItem[]`                       | 僅列出登入者上傳的素材，不暴露磁碟路徑         |
| `POST /sigil/assets`      | `AssetItem`，HTTP 201               | multipart form 的 `file` 欄位                  |
| `GET /sigil/media/{uuid}` | 圖片 bytes                          | **公開讀取**；知道網址者不必登入               |

首次保存使用 `baseRevision: 0`，成功建立後回傳 revision 1 與 HTTP 201；owner 與 key 的唯一約束防止兩個首次保存互相覆寫。後續更新以同一條 SQL 同時檢查 owner、key、revision 並更新，成功回 HTTP 200。舊 revision 回 409，其他資料庫故障保留為伺服器錯誤，不偽裝成衝突或不存在。

HTTP adapter 只將載入時的 404 視為新文件；其他錯誤中止載入。宿主先 `await store.load()`、檢查回應，再建立 App；App 本身沒有遠端 `load()` API。初始範本也必須成功寫入，才能把它視為已保存內容。

`app.toJSON()` 是隔離的純快照，**不會寫入**；保存請使用 `await app.save()`。`isDirty()` 與 `isSaving()` 分別表示未保存修改與寫入狀態。保存期間繼續編輯，不會因較早的寫入完成而錯誤清除 dirty。`0.20.x` 依賴 `toJSON()` 觸發保存的呼叫者需要遷移，完整說明見[保存、載入與遷移](../../docs/guide/persistence.md)。

### JSON 物件不能轉成陣列

文件使用 Sigil version 1。以下是可接受的最小文件範例：

```json
{
  "version": 1,
  "root": {
    "id": "root",
    "type": "section",
    "attributes": {},
    "style": {},
    "responsiveStyles": {},
    "children": []
  },
  "meta": { "title": "活動頁", "device": "desktop" },
  "stylesheets": []
}
```

`style`、`attributes`、`responsiveStyles` 等 map 即使為空也必須是 `{}`；`children` 與 `stylesheets` 是 `[]`。Controller 從 raw JSON 解碼成 `stdClass`，model 使用 `object` cast，保留這項差異。不要改成 `$request->all()` 或 PHP array cast 再寫回，否則空 map 會變成空陣列。`meta` 與 `stylesheets` 會保真保存；本範例不宣稱 Sigil 會把 `stylesheets` 套用到畫布或 HTML 輸出。

### 圖片保存與公開範圍

僅接受實際可解碼的 PNG、JPEG、WebP，單檔最多 4 MiB、寬高各最多 4096 px；拒絕 SVG、偽造圖片及超限檔案。檔名使用隨機 UUID，bytes 存在 `storage/app/private/sigil-media/`，透過 controller 回傳圖片內容及正確 MIME、`nosniff` header，不需要 `storage:link`。

**上傳圖片對外可讀，請只使用可公開的素材。** 隨機網址不是權限控制；只有素材清單與上傳操作限本人。資料庫寫入失敗會清理該次上傳的檔案。此範例未提供素材刪除、配額、遠端物件儲存、掃毒或備份排程。部署者必須同時保存 SQLite 資料庫與圖片檔案；單獨複製 HTML 或資料庫不會帶走圖片。

## 驗證與安全邊界

`SigilDocumentValidator` 是此範例對原生區塊的接收規則，並非完整 Sigil 格式的通用驗證器：

- 支援 `section`、`column`、`text`、`image`、`button`；檢查 version、遞迴結構、唯一 ID、欄位型別，以及 tag、attributes、URL、CSS allowlist。
- 預設限制整個保存 request body 1 MiB、節點深度 32、節點數 5000；調整 `config/sigil.php` 時，也要同步前端 `document-validation.ts` 的接收規則與共享 fixture 測試。這些是接收界限，不是效能保證。
- 拒絕事件屬性、危險 URL、未允許的 CSS，以及此範例未支援的 shortcode／自訂節點。新增區塊時需要同步擴充驗證與測試。

登入會更新 session ID，登出會使 session 失效並更新 CSRF token；登入及上傳均有限流。此範例沒有註冊、忘記密碼、角色管理或多因素認證流程。

安全 middleware 提供 CSP、`X-Content-Type-Options: nosniff`、Referrer Policy，以及編輯頁／API 的 `private, no-store`。CSP 限制同源腳本、連線及 iframe，圖片允許同源與 HTTPS，並啟用 Sigil 的 Trusted Types policies；樣式仍允許 inline style。Laravel 13 的 CSRF middleware 可能接受可信同源來源訊號，否則檢查 token；範例仍主動送出 token，沒有停用 CSRF。這些措施不取代文件驗證與[Sigil 安全模型](../../docs/guide/security.md)。

## 測試與目前證據

PHP 測試會重建測試資料表，**只能對獨立測試資料庫執行**。目前 `phpunit.xml` 固定 `APP_ENV=testing`、SQLite `DB_DATABASE=database/sigil_testing`、空 `DB_URL`，與開發用的 `database/database.sqlite` 分離。不要改成開發資料庫、共用檔案或正式資料庫，也不要使用 Laravel 的已快取設定執行測試。

於 `examples/laravel` 使用儲存庫提供的安全入口。它會核對 `.env`、`phpunit.xml` 與 Laravel 實際解析的資料庫，拒絕設定快取、共用資料庫及不安全的路徑；測試檔不存在時以不覆寫的方式建立：

```bash
php scripts/test.php --check-only
php scripts/test.php tests/Feature
php scripts/test.php tests/Unit/SigilDocumentValidatorTest.php
```

`composer test -- --testsuite=Feature` 也會使用相同入口。若 PATH 中已有本機 `safe-laravel-test`，入口會沿用它；其他使用者不需要安裝這個個人工具。不要繞過資料庫檢查直接執行 PHPUnit。

HTTP adapters 的 Vitest 測試可從儲存庫根目錄執行：

```bash
pnpm exec vitest run --config examples/laravel/vitest.config.ts
pnpm --filter sigil-example-laravel typecheck
```

瀏覽器與真 HTTP 驗證使用獨立入口，不會讓一般 Vite E2E 依賴 PHP：

```bash
pnpm --filter sigil-example-laravel build
pnpm exec playwright install chromium
pnpm test:laravel:e2e
```

啟動器只綁定 `127.0.0.1:4185`，每次建立新的暫存 SQLite、storage 與測試帳號，結束後清理。它不重用既有伺服器或開發資料庫；測試用密碼只對該次暫存帳號有效。PHP server 明確設定 `upload_max_filesize=4M`、`post_max_size=8M`。

本機證據（SQLite、macOS Chromium）：

- Feature **23 案／174 assertions**、文件驗證 Unit **124 案／236 assertions**、前端 adapters **55 案**通過。
- 最低 PHP 版本以 **8.3.36** 實際執行安全測試入口，**147 案／410 assertions** 全數通過，`composer check-platform-reqs` 通過；同一版本的 **5 個端到端／真 HTTP 案例**亦全部通過。
- **5 個端到端／真 HTTP 案例**通過：登入、範本建立、Undo／Redo、圖片上傳與原始 bytes 重載、Mobile 樣式編輯與保存、預覽錨點、HTML 匯出、409 備份與確認重載、503 重試、匿名權限及 CSRF 拒絕。
- 真 HTTP 上傳超過 2 MiB 的合法 PNG 成功，匿名讀取可取得相同原始 bytes；缺失或錯誤 CSRF token 被拒，非法文件不覆寫既存版本。
- 在不含原有 `.env`、vendor、node_modules 或資料庫的暫存來源副本，完成依 lock 安裝、建置、migration、stdin 建帳與 HTTP 登入；pnpm 使用複製的快取，並非全冷快取下載驗收。Composer audit 未回報已知公告或 abandoned packages。

三個引擎的活動頁各 **3／3** 通過；連同 demo、保存及安全流程的完整矩陣為 **45／45**，實際版本與平台見[瀏覽器支援](../../docs/guide/browser-support.md)。[效能量測](../../docs/guide/performance.md)另有 100／1,000／5,000 節點的本機證據；5,000 節點 fixture 超過此範例的 1 MiB 接收界限，不能據此宣稱該文件可在 Laravel 保存。

CI 已配置 PHP 8.3／8.5 的獨立 Laravel job，但尚未遠端執行。真實使用者 [15 分鐘任務驗收](../../docs/guide/usability-check.md) 目前尚未安排，保留待驗收，不以自動化測試替代。固定版本交付、正式部署與備份復原演練也不在本次已驗證範圍。

## 實作入口

- [Web routes](routes/web.php)、[帳號 CLI](routes/console.php)
- [文件 Controller](app/Http/Controllers/SigilPageController.php)、[文件驗證](app/Support/SigilDocumentValidator.php)
- [素材 Controller](app/Http/Controllers/SigilAssetController.php)
- [前端入口](resources/js/sigil-editor.ts)、[HTTP ProjectStore](resources/js/http-project-store.ts)、[HTTP AssetStore](resources/js/http-asset-store.ts)
- [Getting Started](../../docs/guide/getting-started.md)、[App API](../../packages/app/README.md)
