# 交付與發布流程

目前七個公開套件宣告版本均為 `0.20.0`，工作樹包含未發布變更。`1.0` 是交付目標，不是目前的完成狀態。保存契約已有 minor changeset；不得只改版本號或將本機測試綠燈當作正式交付。

此文件提供維護者的可重現流程，不會自動執行版本變更、commit、push、tag、發布或部署。這些交付動作須依使用者的明確授權執行。

## 版本與產物

- `.changeset/config.json` 將七個套件放在同一 fixed group；公開入口、同步／非同步契約及棄用規則見[公開 API](docs/guide/public-api.md)。
- `pnpm version-packages` 會消耗 changesets 並改動 package versions／套件 changelogs；它不是驗證命令。選定交付版本後，先檢查所有內部依賴、lock、README 與[升級指南](docs/guide/upgrading.md)一致。
- `pnpm release` 會呼叫 `changeset publish`，可能向 registry 發布套件；本機準備或測試時不要執行。
- 目前 `.github/workflows/ci.yml` 只配置驗證，沒有 tag 自動發布或部署流程。新增流程時須另外審查，不能把 tag 成功當作 registry 或網站交付成功。
- JSON 的 `SigilDoc.version` 仍為 `1`，與套件版本獨立，不因 package 升版而改寫使用者資料。

## 本機候選驗證

一般修改先跑相關測試。進入整體候選交付階段時，對同一份來源完成下列檢查，保存命令、版本與結果：

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm security:check
pnpm typecheck
pnpm typecheck:e2e
pnpm build
pnpm test:public-api
pnpm publint
pnpm attw
pnpm test
pnpm size
pnpm docs:build
```

公開 API 檢查使用隔離的發布檔案消費端，必須在 build 之後執行；不等同 npm tarball 或 registry 安裝驗收。另以目標版本的實際打包產物在隔離消費端安裝，確認根 ESM／types、CSS 入口與相依套件可用，且不會解析回本工作樹的 `src`。不要在使用者的原消費端直接試升級。

Laravel 依[範例 README](examples/laravel/README.md)安裝，PHP 測試只經 `php scripts/test.php` 安全入口、使用獨立測試資料庫。至少驗證 PHP 8.3 與支援的較新 PHP 版本、前端 adapters、型別／build、真 HTTP 與完整活動頁流程。

```bash
pnpm test:laravel:adapters
pnpm --filter sigil-example-laravel typecheck
pnpm --filter sigil-example-laravel build
pnpm exec playwright install chromium firefox webkit
pnpm test:laravel:e2e
pnpm test:compat
pnpm test:visual:docker
```

三畫面視覺使用固定 Linux／amd64 映像，基準不能因失敗而直接覆寫。跨瀏覽器結果須零 skipped／flaky；Playwright WebKit 不等同正式 Safari 或實體 iOS 裝置。實際承諾範圍見[瀏覽器支援](docs/guide/browser-support.md)。

效能測量另在背景負載可比較的 reference machine 執行 `pnpm test:performance --enforce-budgets`，避免與 build／browser tests 同時跑。方法、固定預算、測量限制及容量界限見[效能文件](docs/guide/performance.md)。CI hosted runner 保留量測 artifact 供審查，不把其機器差異冒充穩定 reference 硬體。

## 正式交付條件

1. 上述工程結果對應明確的來源與實際打包版本。dirty 工作樹的本機結果是準備證據，不能只憑 HEAD SHA 重建；版本、changelog 或實作改變後，重跑受影響的檢查。
2. [非工程師 15 分鐘活動頁任務](docs/guide/usability-check.md)取得真實操作記錄。此項目前尚未安排，保留為待驗收；自動化測試與 AI 操作不能取代。
3. 取得交付候選的遠端 CI 結果。目前只有 workflow 配置與本機證據，沒有把遠端執行標為成功。
4. 經授權建立正式候選後，核對 commit／tag／tarball checksum 與套件版本、README、CHANGELOG、升級及支援承諾，使用該固定版本完成消費端驗收。不要混用較早 SHA 或未提交檔案的通過結果。
5. 若另外授權發布，再執行發布並驗證 registry 版本與安裝結果；若另外授權部署，依宿主環境處理備份、資料遷移與部署驗證。套件發布、範例可跑與正式系統部署是不同結果，分別記錄。

出現資料格式或宿主整合差異時，先保留文件／素材備份與目前可用產物。回退方式依[升級指南](docs/guide/upgrading.md)評估；不要以刪資料、重建正式資料庫或自動覆寫衝突來完成驗收。
