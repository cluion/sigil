# 效能量測與產品預算

這份量測針對完整 `createApp` 的本機成本，使用 100、1,000、5,000 節點的固定文件。Laravel 的文件接收上限與節點數限制是安全邊界，不能當作效能或所有裝置的支援承諾。

## 重跑方式

在儲存庫根目錄、完成依 lock 安裝後執行：

```bash
node scripts/measure-performance.mjs --label=baseline
```

工具會使用 `demo/vite.config.ts` 的 source aliases 做 Vite production build，輸出到 `test-results/performance/<時間>-<label>/build/`，建立僅綁定 `127.0.0.1` 的暫時 preview server，再啟動 Playwright Chromium。結束會關閉 browser／server，保留 `results.json`、原始樣本與當次建置。預設量測上限 15 分鐘；中斷或錯誤會保留部分結果並標成 `failed`，不得引用成完整 baseline。

需要已安裝 Playwright Chromium；工具不自動下載瀏覽器。Sandbox 若限制 loopback 或 browser process，需依執行環境取得本機程序權限。正式比較前應停止其他 build／test、瀏覽器工作與重負載；不要在量測過程修改 runtime。結果記錄開始／結束 source SHA256，若不同即標記失敗。

僅檢查工具接線時可縮小樣本，但不得混入正式基準：

```bash
node scripts/measure-performance.mjs --nodes=100 --mounts=1 --samples=1 --history=1 --label=harness-smoke
```

可以調整 `--nodes=100,1000,5000`、`--mounts=5`、`--samples=6`、`--history=100`、`--timeout=900`；比較時必須保留相同 protocol。`status` 表示量測是否完成，頂層 `budgetStatus` 另分為 `within-budget`、`exceeded`、`incomplete`。縮小樣本的 smoke、缺少量測或來源變動都不能宣稱原定預算通過；即使 smoke 執行完成，仍為 `incomplete`。

預設在 console 明列每項超標，仍正常輸出 artifact，讓 CI 收集證據而不硬 gate 機器敏感數值。若要在固定 reference 環境執行嚴格預算檢查：

```bash
node scripts/measure-performance.mjs --label=reference --enforce-budgets
```

此選項只接受完整原定 protocol（100／1,000／5,000 節點，各 5 次 mount、每頁 6 組操作、100 步 history）；不符合時拒絕啟動，完整量測超標時 exit 1。量測本身失敗無論是否 enforce 都 exit 1。沒有承諾 CI 或排程執行的硬體與背景負載不變。

## 方法與樣本

- 固定 1440×900 viewport、DPR 1、中文亮色、reduced motion、headless Chromium，不套用 CPU throttling。每個規模獨立暖機一頁，完成 mount 與一組操作後丟棄暖機樣本。
- 每規模測 5 個新 browser context／page；每頁操作 6 組，因此每個操作有 30 筆樣本。依序交替文件前／中／後的文字節點。各頁循序執行，沒有並行壓力。分位值使用 nearest rank；只有 5 個 mount 的 p95 等於最大樣本，不是高信賴的母體尾端估計。
- 文件節點數包含 root，固定深度 3；每個 section 最多 20 個文字節點，包含有限的 desktop／mobile 樣式，沒有圖片、網路字型、shortcode、富文字或外部 API。記錄實際 UTF-8 JSON bytes。這個 workload 不代表所有同節點數文件。
- `workMs` 是呼叫到同步工作／Promise 完成；`readyMs` 再等待兩次 `requestAnimationFrame`。後者代表瀏覽器有呈現機會的時間代理值，並非顯示器實際出光時間；會包含刷新週期量化及排程噪音，不能與純 CPU 時間混用。
- Mount 從 `createApp()` 前開始，直到 iframe 畫布與圖層節點數正確、layout 可讀且跨過兩個 animation frame。排除導覽、JavaScript 下載／模組初始化與 fixture 文件生成，故不是冷網路載入時間。
- 選取／更新／Undo／Redo 從公開 engine API 發起，包含完整 App、Inspector、Layers 與 Canvas 的同步反應，並驗證畫布內容。沒有把 Playwright 跨程序 RPC、滑鼠 hit testing 或鍵盤事件分派時間算進來。
- 保存測 `await app.save()`，adapter 同步 `JSON.stringify` 到記憶體；包含保存快照與狀態切換，不含 HTTP、資料庫或磁碟延遲。匯出測 `app.toHTML()` 產生字串，不含對話框與下載。兩者以完成時間比較預算，額外的 ready 時間仍保留在 JSON。

## History 與記憶體

每個規模另開新 App，先強制 GC 取得 baseline，再對不同 ID 交替做 100 次文字更新，避開 engine 的 500ms 同欄位合併規則。每次更新後讓畫面取得呈現機會；100 步後分別記錄未要求 GC 與強制 GC 後的 heap／DOM counters。GC 不放在操作 latency 計時範圍內。

使用 Chromium CDP `Runtime.getHeapUsage` 與 `Memory.getDOMCounters`。`usedSize` 是該 renderer target 可觀測的 JavaScript heap，不是整個 browser process 的 RSS，也不涵蓋所有 DOM 原生記憶體、GPU 或共享資源。強制 GC 與當下背景分配仍有噪音；memory 每規模目前只有一次觀測，不能稱 p95 或 leak 證明。

在 heap 採樣之後才銷毀 UI，保留公開 engine reference，透過 `canUndo()`／`undo()`／`canRedo()`／`redo()` 數出實際步數。此時使用 WeakSet 計算各歷史 root 間的不同 ComponentNode、children array 與 child reference 數，避免將共享子樹誤算成 101 份完整複製。這些物件計數不是 byte 數，也沒有作為採樣前額外保留文件的容器。

目前 engine 的 history 沒有步數／記憶體上限；100 步是本次固定樣本，並不證明無限制使用安全。此文件的短文字修改也不代表大型富文字或大量圖片／shortcode props 的歷史成本。

## 暫定產品預算

下列是在第一次正式 baseline 前固定的本機 reference 預算，非所有機型的普世承諾。5,000 節點同樣比較並回報超標，不能因其是壓力規模而免除改善討論；不得為讓結果通過而調寬。

| 指標                                | 100 節點 | 1,000 節點 | 5,000 節點 |
| ----------------------------------- | -------: | ---------: | ---------: |
| Mount ready p95                     | 1,000 ms |   2,000 ms |   5,000 ms |
| 選取／文字更新 ready p95            |   100 ms |     150 ms |     250 ms |
| Undo／Redo ready p95                |   200 ms |     350 ms |     500 ms |
| 保存／匯出 work p95                 |   100 ms |     250 ms |     500 ms |
| 100 步 history 的 post-GC heap 增量 |   20 MiB |     50 MiB |    150 MiB |

## 首次基準證據

首次完整 baseline 已完成，三個規模的所有固定預算均未超標，`budgetStatus=within-budget`，沒有為結果調寬預算，也沒有修改 runtime。日期為 **2026-10-23**，執行時間約 **70.4 秒**。這是一次完整觀測，不是多日穩定性或正式發布驗收。報告層後續補上獨立預算狀態與可選 enforce，既有 baseline 追加狀態欄位，並將 history 方法描述移至 `historyMethod`，避免覆蓋已驗證的 100 步設定；原始樣本不變且未重跑量測。

- 環境：**Apple M4 Pro、14 logical CPUs、64 GiB RAM、macOS arm64（Darwin 25.5.0）**。
- Browser：**Chromium 151.0.7922.34**；Playwright **1.62.1**、Vite **6.4.3**、Node **v24.18.0**。
- Production minify、source aliases、1440×900／DPR 1／headless／無 CPU throttle；開始與結束的 1 分鐘 load average 約 4.97／6.13，並非宣稱 OS 無其他背景工作。
- Mount 每規模 **5 筆**；每項操作 **30 筆**；history 每規模 **100 步、1 次 heap 前後觀測**。
- 當次 Git HEAD：`ad16f3fd0f6ac7bed8e45a8f1a4db6b0aa740805`，包含未提交 runtime 變更；65 個來源檔的開始／結束 hash 相同：`9bdf8312669cfa99117c55ebc53736a18cfd348fdb544b72a4a71f9ef3117672`。僅 Git SHA 不足以重建這個未提交工作樹。
- 完整原始樣本與記憶體欄位：`test-results/performance/2026-10-23T11-29-16-635Z-baseline/results.json`。結果為 `completed`、來源穩定且無 browser runtime errors。此路徑是忽略的本機 artifact，不是已發布套件。

### 畫面 ready 延遲

單位 ms；每格為 **p50 / p95 / max**。包含前述兩次 animation-frame 邊界。

| 指標     |           100 節點 |           1,000 節點 |            5,000 節點 |
| -------- | -----------------: | -------------------: | --------------------: |
| Mount    | 64.4 / 64.9 / 64.9 | 99.0 / 100.5 / 100.5 | 293.7 / 296.4 / 296.4 |
| 選取     | 25.6 / 26.4 / 26.4 |   31.0 / 34.0 / 34.8 | 169.4 / 195.5 / 196.7 |
| 文字更新 | 26.7 / 27.6 / 28.1 |   35.2 / 46.4 / 48.0 | 168.0 / 178.9 / 195.6 |
| Undo     | 26.6 / 27.5 / 27.7 |   53.6 / 68.1 / 68.9 | 250.6 / 266.7 / 324.9 |
| Redo     | 26.6 / 27.1 / 27.6 |   53.3 / 66.8 / 66.9 | 253.4 / 295.5 / 341.7 |

### 同步工作與 Promise 完成時間

單位 ms；每格為 **p50 / p95 / max**，不含後續 animation-frame 等待。保存／匯出預算使用本表。

| 指標           |           100 節點 |         1,000 節點 |            5,000 節點 |
| -------------- | -----------------: | -----------------: | --------------------: |
| Mount 同步建構 | 15.6 / 16.1 / 16.1 | 28.7 / 30.5 / 30.5 |    88.1 / 88.8 / 88.8 |
| 選取           |    2.3 / 2.8 / 2.9 | 15.5 / 17.5 / 17.7 |  79.2 / 108.8 / 109.3 |
| 文字更新       |    2.4 / 2.7 / 3.1 | 15.7 / 17.3 / 17.5 |    79.0 / 88.2 / 89.2 |
| Undo           |    4.2 / 4.7 / 4.8 | 32.9 / 38.3 / 39.4 | 159.1 / 169.2 / 169.5 |
| Redo           |    4.0 / 4.4 / 4.4 | 31.4 / 36.5 / 38.1 | 159.3 / 193.5 / 212.3 |
| 保存完成       |    0.6 / 1.1 / 7.1 |    3.8 / 4.2 / 4.3 |    19.0 / 28.4 / 30.0 |
| 匯出完成       |    0.2 / 0.8 / 0.9 |    1.7 / 3.2 / 4.0 |      6.0 / 8.8 / 11.1 |

### History 與記憶體觀測

JavaScript heap 單位為 MiB；未要求 GC 的數值是某一時點觀測，**不是執行期間峰值**。

| 節點數 | 文件 bytes | 初始 post-GC JS heap | 100 步後未要求 GC | 100 步後 post-GC | post-GC 增量 |
| -----: | ---------: | -------------------: | ----------------: | ---------------: | -----------: |
|    100 |     26,953 |                1.816 |             2.318 |            1.965 |        0.149 |
|  1,000 |    273,701 |                2.498 |             4.407 |            2.831 |        0.333 |
|  5,000 |  1,381,996 |                5.358 |            16.773 |            6.643 |        1.285 |

| 節點數 | Undo／Redo 步數 | 歷史含目前 root | 不同 ComponentNode | 不同 children array | child references |
| -----: | --------------: | --------------: | -----------------: | ------------------: | ---------------: |
|    100 |       100 / 100 |             101 |                400 |                 206 |            2,401 |
|  1,000 |       100 / 100 |             101 |              1,300 |                 249 |            7,502 |
|  5,000 |       100 / 100 |             101 |              5,300 |                 440 |           30,899 |

各規模初始及 100 步後 post-GC 的 DOM／listener 數相同；中間未收集的暫時物件更多：

| 節點數 | post-GC DOM nodes | post-GC listeners | 100 步後未 GC DOM nodes | 未 GC listeners |
| -----: | ----------------: | ----------------: | ----------------------: | --------------: |
|    100 |             1,281 |               864 |                   3,095 |           2,464 |
|  1,000 |            11,138 |             8,064 |                  20,145 |          16,064 |
|  5,000 |            54,948 |            40,064 |                 164,178 |         120,064 |

Chromium 同時回報的實驗性 `embedderHeapUsedSize` 也保留在 JSON。5,000 節點的初始／100 步後 post-GC 約 **78.607 / 78.713 MiB**，100 步後未要求 GC 約 **274.667 MiB**。它與 JS heap 不同，也不能等同整個 browser RSS；不能只拿 1.285 MiB 的 JS 增量描述整個 App 記憶體需求。一次 GC 前後觀測不是長時間無洩漏證明。

5,000 節點 fixture 的 **1,381,996 bytes 超過 Laravel 預設 1 MiB 接收界限**。這次仍按原定規模量完整 App，沒有縮小資料或調高後端上限；結果不能宣稱該文件已通過 Laravel 保存。雖未超出本機預算，5,000 節點選取／Undo／Redo 的同步工作已達約 109／169／194 ms p95，慢速裝置與其他瀏覽器仍需實測。

## 歷史邊界修正後的重測

2026-10-23 修正 Undo／Redo／batch 的輸入合併邊界後，使用同一台機器、瀏覽器與完整 protocol 執行 `--label=post-review --enforce-budgets`。原定預算未調整；三個規模均為 `completed`／`within-budget`，exit 0，無 browser runtime errors。11:56:11.132Z–11:57:21.193Z 共約 **70.1 秒**，開始／結束 1 分鐘 load average 約 **6.19／6.71**。

下表是本次 **p95**；Mount、選取、更新、Undo／Redo 為 ready ms，保存／匯出為 work ms，history 為 100 步 post-GC JS heap 增量 MiB。它保留首次 baseline 作為歷史對照，不將單次差異視為可靠的效能改善或退化。

| 節點數 | Mount |  選取 |  更新 |  Undo |  Redo | 保存 | 匯出 | History MiB |
| -----: | ----: | ----: | ----: | ----: | ----: | ---: | ---: | ----------: |
|    100 |  64.0 |  25.8 |  27.3 |  27.6 |  26.8 |  1.0 |  0.8 |       0.149 |
|  1,000 | 100.3 |  34.1 |  43.1 |  68.9 |  68.1 |  4.2 |  2.8 |       0.333 |
|  5,000 | 301.3 | 198.6 | 191.5 | 297.8 | 269.4 | 28.8 | 11.9 |       1.285 |

各規模仍確認 Undo／Redo 均為 100 步，歷史共享物件數與首次 baseline 相同。65 個 runtime 來源檔開始／結束 SHA256 相同：`f8279e3cc37c960a55e3781a6b858b34b7a709604c4cfdca241bbf31279b1a31`。原始樣本位於 `test-results/performance/2026-10-23T11-56-11-129Z-post-review/results.json`。5,000 節點 fixture 超過 Laravel 1 MiB、單機樣本及記憶體量測限制仍適用；本次是未提交工作樹驗證。

## 首個候選的 hosted CI 觀測

2026-10-23，候選 head `f814c8e851c697c415444ee726e71532afdcace5` 的 [CI run 39952171811](https://github.com/cluion/sigil/actions/runs/39952171811)（attempt 1）七個 jobs 成功；`performance-report` 記錄的實際 merge checkout 是 `6ad6115aa756829464f172a36dfc22d0c53448e8`，工作樹乾淨。環境為 Ubuntu 24.04.5 x64、AMD EPYC 7763（4 logical CPUs）、Node 24.21.0、Playwright 1.62.1、Chromium 151.0.7922.34。

完整 protocol 為 100／1,000／5,000 節點，各 5 次 mount、每頁 6 組操作及 100 步 history。量測結果是 `status=completed`、`budgetStatus=exceeded`、`enforceBudgets=false`；來源穩定、無 runtime errors，65 個 runtime 來源檔的 hash 與前述修正後 reference 記錄一致。100／1,000 節點沒有超標；5,000 節點的以下四項超過原定預算，數值為 ready ms 的 p95：

| 指標     | Hosted CI | Reference 預算 |
| -------- | --------: | -------------: |
| 選取     |     589.9 |            250 |
| 文字更新 |     571.4 |            250 |
| Undo     |     713.9 |            500 |
| Redo     |     872.8 |            500 |

Hosted job 未啟用預算硬門檻，成功只代表量測完整完成，不能解讀為效能預算全過。這份觀測與 M4 Pro reference 分開保留；硬體與負載不同，不能以單次差異判定回歸或取代 reference 驗收。原始 JSON 位於該 run 的 `performance-report` artifact：`2026-10-23T12-17-57-073Z-baseline/results.json`。本節是首次候選的歷史記錄，不代表後續 commit 已通過自己的 CI。

## 程式路徑與後續判讀

`packages/core/src/model/tree.ts` 使用不可變樹與共享子樹，更新仍需走訪樹；`packages/core/src/engine/engine.ts` 保存歷史 root。`packages/ui/src/layers.ts` 目前在 selection／patch／tree 事件完整重建圖層列，`packages/core/src/renderer/renderer.ts` 對 Undo／Redo 的 tree 事件完整 reconcile。這些是可核對的程式路徑，不等於已取得 CPU profile 的瓶頸歸因。

若互動超標，下一步先量各訂閱者及 layout 的時間分布，優先評估圖層增量更新／虛擬化與 history reconcile；修改後須在相同機器與 protocol 重跑，並保持行為與視覺驗證。跨瀏覽器、低階裝置、冷載入、真後端保存、大型富文字與長時間記憶體趨勢仍需各自的驗收，不能由這次 Chromium baseline 代替。
