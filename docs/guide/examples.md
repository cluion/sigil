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
| `demo/`（`pnpm dev`） | 完整產品殼：commands／hooks、圖層、callout dependsOn、商品卡… |
| `examples/html` | 純 HTML 最小 embed |
| `examples/vue` | Vue 3，onMounted / destroy |
| `examples/react` | React，useEffect cleanup |
| `examples/laravel` | Laravel ProjectStore 參考，非完整專案 |

### demo 試 0.5 功能

1. 頂欄 **Ping** 或 `Cmd/Ctrl+Shift+P`  
2. 選取元件 → 上方 hook 狀態；**存檔** 看 before／afterSave  
3. 圖層雙擊改名、鎖、隱  
4. 選 **提示框** shortcode → 屬性「類型」改成行動呼籲 → 出現 dependsOn 欄位  

詳見 [擴充指南](/guide/extensibility) 與 repo 內 `examples/README.md`。
