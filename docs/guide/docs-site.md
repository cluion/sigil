# 文件站

本文件站使用 **VitePress** 承載指南，**TypeDoc** 加 **typedoc-plugin-markdown** 產生 API

## 指令

```bash
pnpm docs:api      # 只產生 docs/api
pnpm docs:dev      # 本機預覽・預設 http://localhost:5173
pnpm docs:build    # 靜態輸出至 docs/.vitepress/dist
pnpm docs:preview  # 預覽 build 產物
```

## 結構

| 路徑 | 說明 |
|---|---|
| `docs/.vitepress/config.ts` | VitePress 設定，API 側欄自動掃描 |
| `docs/guide/` | 上手與範例指南 |
| `docs/api/` | TypeDoc 產出，已 gitignore |
| `typedoc.json` | TypeDoc 設定 |
| `scripts/fix-api-md.mjs` | 修正泛型轉義以免 Vue 編譯失敗 |

## 備註

- API markdown 不進版控，建置前必須跑 `docs:api`
- 套件 README 不併入 TypeDoc，避免與 API 重複
