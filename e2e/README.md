# E2E 與視覺回歸

## 現有行為測試

`pnpm test:e2e` 包含 12 個 Chromium 案例，均由 Vite `csp-e2e` 模式提供 CSP／Trusted Types enforcement：

| 檔案                          | 範圍                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `editor.spec.ts`（9 個）      | 桌面編輯與鍵盤操作、範本管理、富文字、localStorage 額度不足／保存重試、Hero／Pricing／FAQ、390px 抽屜／焦點／overflow、runtime locale |
| `security.spec.ts`（1 個）    | policy enforcement、可信 render／export／remount 路徑與 raw sink 阻擋                                                                 |
| `persistence.spec.ts`（2 個） | HTTP 延遲儲存期間繼續編輯、再次儲存與重新載入，以及 HTTP 503 失敗後保留修改並重試                                                     |

保存案例使用 `demo/fixtures/persistence.html` 的真實 App 與 HTTP adapter，由 Playwright 控制回應時機及錯誤；不依賴固定延遲。這些案例驗證前端保存契約，完整 Laravel 後端整合仍需另外驗收。

失敗截圖原本只用於診斷，並非畫面基準比對。

## 三個視覺基準

`visual.spec.ts` 沿用真實 demo 與 CSP 設定，透過既有 JSON 載入操作建立固定 ID 的文件；不改產品 DOM 或遮罩畫布／Inspector。外部示意圖由共用 fixture 攔截為固定 SVG，截圖前等待圖片與字型就緒，游標移出 App。

| 基準                                | viewport    | 狀態                                      |
| ----------------------------------- | ----------- | ----------------------------------------- |
| `desktop-zh-light.png`              | 1440 × 1000 | 中文、亮色、選取文字節點及內容 Inspector  |
| `desktop-en-dark.png`               | 1440 × 1000 | 在同一 App 切換英文與暗色，保留選取與文件 |
| `compact-390-zh-light-settings.png` | 390 × 844   | 中文、亮色、開啟圖層／設定抽屜並選取文字  |

截圖範圍是 `.sigil-app`，包含產品頂欄、面板、畫布及狀態列；外部 demo 工具列不列入。固定 DPR 1、瀏覽器 locale、時區與 reduced motion，停用截圖時動畫及 caret。比對使用 Playwright 預設色差門檻、`maxDiffPixels: 0`，不允許額外差異像素。

## 執行與更新

系統字型與瀏覽器會影響像素，因此本機及 CI 都使用 `e2e/Dockerfile.visual` 的 Playwright **1.62.1 Noble／linux/amd64** 環境。這與 [Playwright 官方建議](https://playwright.dev/docs/test-snapshots)一致。需要 Docker；首次執行會下載映像與安裝鎖定的依賴，Apple Silicon 使用 amd64 模擬。

```sh
pnpm test:visual:docker
# 沒有本機 pnpm 時，同一入口：
sh scripts/test-visual.sh

# 驗證重跑穩定性（3 張，各跑 3 次）
pnpm test:visual:docker --repeat-each=3

# 僅在已確認的預期介面變更後更新
pnpm test:visual:docker --update-snapshots
```

一般執行使用唯讀基準並設定 `updateSnapshots: 'none'`；缺失或不符都失敗，不會自動接受新畫面。`pnpm test:visual` 是容器內入口，會拒絕非 Linux／x64 執行環境。原有 `pnpm test:e2e` 不包含視覺案例；CI 另設 `visual` job 執行相同 Docker 入口。

基準在 `e2e/visual.spec.ts-snapshots/`，需與測試一起納入版本控制。失敗時檢查 `test-results/visual/` 的 actual／expected／diff PNG，以及 `playwright-report/visual/index.html`；CI 會保留 `visual-report` artifact。更新後必須逐張檢視，確認沒有把溢位、缺字或錯誤狀態納入基準，再執行一般比對。

升級 Playwright 時，需同步 lockfile 與 Dockerfile 的映像版本，重新產生並檢視基準。首次驗證或修改比對流程時，應在可還原的測試副本中刻意改變間距，確認截圖比對失敗，且正常基準未被改寫。
