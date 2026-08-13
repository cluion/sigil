# 安全模型

Sigil 以 CSP 與 Trusted Types 相容為設計目標，但不會把任意 HTML、任意 `SigilDoc` 或第三方 shortcode 自動變成可信內容。本頁定義 0.19.0 的信任邊界、HTML 寫入路徑與宿主責任；它不是安全認證。

## 信任邊界

| 輸入                                                | 信任層級       | 責任                                                                 |
| --------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| 一般文字、props、富文字 HTML、外部資料              | 不可信         | escape 或交給宿主提供的 allowlist sanitizer                          |
| shortcode 定義、template、`render`／`bind` callback | 可信宿主程式碼 | 只註冊受審核程式碼；自行處理插入值與 URL                             |
| `RichTextAdapter`、sanitizer、store／fetch adapter  | 可信宿主程式碼 | 維持一致的驗證、授權與生命週期                                       |
| `SigilDoc` 的 `type`、`tagName`、attributes、style  | 經授權的結構   | 只從可信儲存載入，或在進入 Sigil 前驗證並正規化結構、屬性與 URL 協定 |

目前 renderer 會依文件結構動態建立元素、設定 attributes 與 styles，核心尚未提供 tag／attribute 結構 allowlist。因此，不應直接載入攻擊者控制的 `SigilDoc` JSON。一般文字 escaping 與富文字 sanitizer 不能取代這層驗證。

## HTML 寫入路徑

- 一般文字內容使用 DOM text node，HTML 匯出時使用 `escapeHtml`。
- 富文字由 `RichTextAdapter` 明確標記，宿主必須提供 `sanitize`；低階匯出缺少 sanitizer 時會退回 escaped plain text。
- `HtmlPolicy.setSanitized()` 優先使用瀏覽器 `Element.setHTML()`；不支援時依序使用注入的 sanitizer 與 Trusted Types，兩者都沒有時使用 `textContent`。
- `HtmlPolicy.setTemplate()` 只接受可信宿主 template，也負責建立 Canvas iframe 文件；兩者都透過 `sigil#template` Trusted Types policy 寫入。
- 同一個 JavaScript realm 重複建立 App／Editor 時，Sigil 會重用相同名稱的 Trusted Types policies，避免 CSP 拒絕重複 policy。
- shortcode definition 的 static template 與 `render()` 結果屬於可信宿主程式碼，不是處理任意使用者 HTML 的 sanitizer。

`Element.setHTML()` 會移除 XSS-unsafe 元素與屬性，但瀏覽器支援仍有限，因此 fallback 路徑是安全契約的一部分。詳見 [MDN：Element.setHTML()](https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTML)。

## 已審核的敏感操作

`pnpm security:check` 會掃描 raw HTML、`srcdoc`、DOM parser、Trusted Types policy 建立、動態 element／attribute 與 eval 類操作。每個既有操作都必須以「檔案、操作類型、精確程式碼與預期次數」列入 allowlist；新增或移動操作都會讓檢查失敗並要求重新審核。

| 模組                         | 操作                                       | 核准理由或剩餘風險                                                  |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `core/policy/html-policy.ts` | policy、`innerHTML`、`srcdoc`、`setHTML()` | raw HTML 與 iframe 文件的集中入口；只寫入 policy 產物               |
| `core/renderer/renderer.ts`  | dynamic tag／attribute                     | 已知結構信任邊界；宿主必須驗證外部文件                              |
| `shortcode/resolver.ts`      | template `innerHTML` read                  | 只讀取宿主註冊的可信 template                                       |
| `ui/canvas.ts`               | iframe `srcdoc` fallback                   | 高階入口走 `HtmlPolicy`；低階 Canvas 未注入 policy 時使用固定空文件 |
| `app/index.ts`               | dynamic `createElement`                    | 內部 helper 只由原始碼中的 tag literal 呼叫                         |
| `demo/rich-text.ts`          | safe parser／sanitizer／editor DOM 操作    | 優先用 `setHTML()`，再套 demo allowlist；非產品依賴                 |

修改 allowlist 時，必須同步更新本頁的風險說明；不得用整個路徑或 glob 直接豁免。

## CSP 與 Trusted Types

Sigil 預設 policy base name 是 `sigil`。啟用 Trusted Types 的宿主可從 Report-Only 開始驗證，再部署類似以下 policy：

```http
Content-Security-Policy:
  default-src 'self';
  base-uri 'none';
  object-src 'none';
  script-src 'self';
  require-trusted-types-for 'script';
  trusted-types sigil#template sigil#sanitized;
```

實際 CSP 還需依應用程式的 script、style、image、connect 與 frame 來源調整。若自訂 `HtmlPolicy` 的 base name，`trusted-types` 也必須列出對應的 `#template` 與 `#sanitized` policy。語法與 enforcement 行為以 [W3C Trusted Types 規格](https://www.w3.org/TR/trusted-types/)為準。

本倉庫的 Playwright server 以 `csp-e2e` mode 送出 enforcement header；全部產品 E2E 都在該 policy 下執行。專用安全案例另外驗證 shortcode template、富文字、匯出、重掛載沒有 violation，且 raw `innerHTML` 字串會被瀏覽器拒絕。

直接使用低階 `createCanvas()` 的宿主若啟用 Trusted Types，必須在 `rendererOptions.htmlPolicy` 傳入可處理 template 與 iframe 文件的 `HtmlPolicy`。`createApp()`／`createEditor()` 已自動接線。

## 宿主檢查清單

- 富文字使用持續維護的 allowlist sanitizer，限制 element、attribute、style 與 URL protocol。
- sanitizer 若以 `DOMParser.parseFromString()` 等 injection sink 解析輸入，也必須能在宿主的 Trusted Types enforcement 下運作。
- 外部 `SigilDoc` 先驗證版本、node type、tag、attributes、styles 與 URL，再交給 engine／renderer。
- shortcode 只註冊受信任程式碼，`render()` 插入 props 或外部資料前必須 escape 或 sanitize。
- CSP 先以 Report-Only 觀察既有違規，再開啟 enforcement 與 Trusted Types。
- store／fetch adapter 在伺服器端執行身分驗證、授權、大小限制與併發控制。
- 變更 DOM sink 後執行 `pnpm security:check`、單元測試與 CSP 瀏覽器測試。

## 非目標與未解風險

- Sigil core 不內建第三方 sanitizer；宿主必須選擇並更新實作。
- 0.19.0 安全基線先將 `SigilDoc` 結構風險公開並納入 CI，尚未加入核心 tag／attribute policy。
- shortcode/plugin sandbox、伺服器授權、資料庫隔離與上傳檔案掃描不在核心執行範圍。
