# Sigil

> Cluion Sigil — CSP-safe, shortcode-oriented, embeddable web editor engine.

開源（MIT）、framework-agnostic 的網頁編輯器引擎。從零打造，`core` 零依賴（gzip < 30KB 硬目標），符合嚴格 CSP／Trusted Types，內建 shortcode DSL。

## 狀態

monorepo 骨架已就位，install／test／build／lint／size 全綠。

## Monorepo 套件

| 套件 | 職責 |
|---|---|
| `@cluion/sigil-core` | 引擎地基：零依賴、ComponentNode、Engine、renderer、HtmlPolicy（三層防禦） |
| `@cluion/sigil-shortcode` | shortcode DSL（`defineShortcode`） |
| `@cluion/sigil-ui` | 預設 Web Components（畫布 `<iframe>`、面板） |
| `@cluion/sigil-blocks` | 預設區塊（容器／文字／圖片／按鈕／欄） |
| `@cluion/sigil-store-json` | JSON `ProjectStore` adapter |
| `@cluion/sigil` | `createEditor()` 一站式入口 |

## 開發

```bash
pnpm install
pnpm dev          # 跑 demo（Vite）
pnpm test         # 全倉測試（vitest + happy-dom）
pnpm build        # 建置六套件（tsdown → ESM + d.ts）
pnpm lint         # ESLint（含 HTML sink 安全鐵律）
pnpm size         # size-limit（core gzip < 30KB）
```

需求：Node ≥ 20、pnpm 10。

## 授權

MIT。
