# 瀏覽器相容性驗證

相容性驗證使用目前 lockfile 對應的 Playwright Chromium、Firefox 與 WebKit。每個引擎執行相同功能斷言，沒有因引擎名稱略過案例，也不以重試掩蓋失敗。

已驗證範圍以本頁列出的實際版本與平台為準；這些版本不是推定的最低支援版本。更新 Playwright 或變更瀏覽器相關行為後，應重新執行矩陣並更新證據。

這是桌面引擎與 390px viewport 的自動化驗證；不代表實體行動裝置、全部作業系統或所有歷史瀏覽器版本已驗收。Playwright WebKit 使用帶測試支援的 WebKit build，並不是安裝在使用者電腦上的正式 Safari。[Playwright 瀏覽器說明](https://playwright.dev/docs/browsers#webkit)

## 驗證範圍

| 範圍                     | 每個引擎的案例 | 主要契約                                                                                                                       |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Demo Editor              | 9              | 鍵盤與焦點、排序、Undo／Redo、文字與富文字、範本、響應式區塊、390px 抽屜、語系切換、localStorage 失敗與重試                    |
| HTTP persistence fixture | 2              | 保存期間的新修改仍 dirty、第二次保存、503 重試與重載                                                                           |
| CSP 與安全輸出           | 1              | 實際 CSP header、可信範本、動態內容清理、安全匯出、raw sink 能力探測、解析 policy 拒絕負例                                     |
| Laravel 活動頁           | 3              | 真登入與建立、圖片原始 bytes、Mobile 樣式存載、預覽片段連結、HTML 匯出、409 備份／確認重載、載入時鍵盤保護、503 重試、匿名 401 |

Laravel 每個引擎使用獨立 Playwright invocation，因此會重新建立暫存 SQLite、storage、PHP server 與登入限流狀態。不修改開發者 `.env`、既有資料庫或應用程式的登入限流。Laravel 其他後端 HTTP／Feature 測試有自己的執行入口，不計入這 45 個跨瀏覽器案例。

## 重現方式

先依倉庫 `examples/laravel/README.md` 安裝 PHP／Composer 依賴。Node 依賴使用專案 lockfile，瀏覽器 runtime 必須與安裝的 Playwright 版本一致。

```sh
node node_modules/@playwright/test/cli.js install chromium firefox webkit
node scripts/test-compat.mjs
```

Runner 會重建 Laravel 前端，依序執行每個引擎的 Demo 與 Laravel 案例。它使用目前 `PATH` 中的 PHP，需可用的 `gd`、SQLite 與範例要求的其他 PHP extensions。僅執行一個引擎：

```sh
node scripts/test-compat.mjs firefox
```

需要單獨除錯 Demo 時，可使用 [Playwright projects](https://playwright.dev/docs/test-projects) 選擇引擎：

```sh
node node_modules/@playwright/test/cli.js test --config playwright.compat.config.ts --project=webkit
```

`playwright.laravel.config.ts` 未設定 `SIGIL_COMPAT_BROWSER` 時仍使用 Chromium。跨瀏覽器 runner 會設定該變數並只選擇活動頁案例；不要把三個 Laravel 引擎塞進同一個 server invocation，否則會共享安全限流與資料。

## 安全能力的判讀

是否能清理不可信內容，與瀏覽器是否能以 Trusted Types 阻擋 raw HTML sink，是兩個分別驗證的契約。[Trusted Types 規格](https://w3c.github.io/trusted-types/dist/spec/)

- 所有引擎都必須清除動態內容中的 `script`、事件屬性與 `javascript:` URL，並產生安全匯出；安全流程不因 Trusted Types 缺席而跳過。
- 同一案例直接驗證 demo sanitizer 的 `p/strong/em/a/br` 白名單、重複呼叫與空的 default policy；不能只靠原生 `setHTML` 通過。
- 若有 Trusted Types API，在相同 CSP 下必須以 `TypeError` 阻擋 raw sink，並記錄 enforcement violation。
- 若有 Trusted Types API，另以新 realm 移除 CSP 的 demo 解析 policy 許可並關閉原生 `setHTML` 路徑，確認 sanitizer 拒絕解析且沒有建立 default policy。
- 若沒有 Trusted Types API，測試明確記錄 raw sink 不受該指令保護；安全來源是原生安全 HTML API 或注入的 sanitizer，不宣稱具有 Trusted Types enforcement。
- `nativeSanitizer` 記錄 `Element.prototype.setHTML` 是否存在；實際信任邊界仍須由安全輸出斷言驗證。

## 執行證據

每次完整 runner 會產生：

- `test-results/compat/summary.json`：作業系統、Node／Playwright、實際 `browser.version()`、各範圍統計與狀態。
- `test-results/compat/{demo,laravel}/{engine}/report.json`：每一案例的結果；安全案例附有 `browser-security` annotation 與 JSON attachment。
- `playwright-report/compat/{demo,laravel}/{engine}/`：可用 `playwright show-report` 開啟的 HTML 報告；失敗時保留 trace 與 screenshot。

零 skipped、零 flaky 且所有案例通過，才由 runner 回傳成功。報告屬於本機忽略的產物；不代表已提交的固定 SHA、CI 或發布驗收。

2026-10-23 修正 Undo／Redo 歷史邊界及 Laravel E2E 取消清理後，於 macOS 26.5.2 arm64、Node 24.18.0、Playwright 1.62.1 重跑完整矩陣，45／45 通過，零 skipped、零 flaky。本次使用 PHP 8.3.36，記錄時間為 11:55:05.784Z–11:55:51.822Z；各引擎的實際版本與結果如下。

| 引擎實際版本           | Demo／安全／保存 | Laravel 活動頁 | 狀態   |
| ---------------------- | ---------------- | -------------- | ------ |
| Chromium 151.0.7922.34 | 12/12            | 3/3            | 已通過 |
| Firefox 153.0          | 12/12            | 3/3            | 已通過 |
| WebKit 26.5            | 12/12            | 3/3            | 已通過 |

三個引擎的報告均確認 Trusted Types API 與 raw sink 的 `TypeError` enforcement。Chromium 與 Firefox 使用原生 `setHTML`；WebKit 沒有該 API，使用注入的 demo sanitizer，並通過相同安全輸出斷言。本輪沒有執行缺少 Trusted Types API 的舊版引擎，因此不把條件分支視為那些版本的驗收證據。

跨引擎輸入步驟會保留既有富文字段落；焦點還原案例以鍵盤啟動匯出，再驗證 focus trap 與關閉後回到原按鈕。WebKit 的滑鼠點擊不保證按鈕取得焦點，App 依開啟對話框時實際的 `document.activeElement` 還原；不將不同引擎的原生滑鼠焦點行為當作相同前提。
