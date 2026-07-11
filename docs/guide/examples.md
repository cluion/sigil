# 範例

在 monorepo 根目錄：

```bash
pnpm install
pnpm example:html     # 純 HTML 加 TypeScript
pnpm example:vue      # Vue 3
pnpm example:react    # React
pnpm dev              # 完整功能 demo，含商品卡
```

| 目錄 | 說明 |
|---|---|
| `examples/html` | 純 HTML 最小 embed |
| `examples/vue` | Vue 3，onMounted / destroy |
| `examples/react` | React，useEffect cleanup |
| `examples/laravel` | Laravel ProjectStore 參考，非完整專案 |

詳見 repo 內 `examples/README.md`
