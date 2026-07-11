# Sigil

> Cluion Sigil — CSP-safe, shortcode-oriented, embeddable web editor engine.

開源 MIT、framework-agnostic 的網頁編輯器引擎  
`core` 零第三方依賴・gzip 硬目標小於 30KB  
符合嚴格 CSP／Trusted Types・內建 shortcode DSL

## 快速開始

```bash
pnpm install
pnpm dev              # 完整功能 demo
pnpm example:html     # 純 HTML 最小 embed
pnpm example:vue      # Vue 3
pnpm example:react    # React
```

完整步驟、最小 embed、自訂 shortcode、`ProjectStore` 與 HTML 輸出：

**→ [docs/guide/getting-started.md](./docs/guide/getting-started.md)**

文件站：

```bash
pnpm docs:dev      # VitePress + TypeDoc API
pnpm docs:build    # 靜態輸出 docs/.vitepress/dist
```

框架範例與 Laravel 後端參考：**→ [examples/](./examples/)**

## 套件

| 套件 | 職責 | 說明 |
|---|---|---|
| [`@cluion/sigil`](./packages/editor/README.md) | `createEditor` 一站式入口 | 多數整合只需這包 |
| [`@cluion/sigil-core`](./packages/core/README.md) | Engine、模型、renderer、HtmlPolicy、序列化 | 零第三方依賴 |
| [`@cluion/sigil-shortcode`](./packages/shortcode/README.md) | `defineShortcode`、resolver | 宣告式區塊 |
| [`@cluion/sigil-ui`](./packages/ui/README.md) | 畫布、面板、拖拽 | 進階自組 UI |
| [`@cluion/sigil-blocks`](./packages/blocks/README.md) | 預設區塊工廠 | section／text／… |
| [`@cluion/sigil-store-json`](./packages/store-json/README.md) | JSON `ProjectStore` | 記憶體 + 匯入匯出 |

## 開發指令

```bash
pnpm test         # vitest + happy-dom
pnpm build        # 六套件 ESM + d.ts・tsdown
pnpm lint
pnpm typecheck
pnpm size         # core gzip < 30KB
```

需求：Node ≥ 20、pnpm 10

## 設計原則摘要

1. 頁面為可序列化 JSON 樹・`ComponentNode`・DOM 是投影  
2. 不拼接 HTML 字串・動態值走 `textContent`／`setAttribute`  
3. HTML sink 集中在 `HtmlPolicy`・Trusted Types  
4. shortcode 結構／邏輯分離・`template` + `bind`  
5. 後端經 `ProjectStore` 等 adapter 接入・引擎不綁框架  

## 授權

MIT
