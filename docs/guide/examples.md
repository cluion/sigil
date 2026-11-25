# 範例

在 monorepo 根目錄：

```bash
pnpm install
pnpm example:html     # 純 HTML 加 TypeScript
pnpm example:vue      # Vue 3
pnpm example:react    # React
pnpm dev              # 完整功能 demo，含商品卡
```

| 目錄                  | 說明                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `demo/`（`pnpm dev`） | 完整產品殼：commands／hooks、圖層、callout dependsOn、商品卡…              |
| `demo/activity/`      | 工作坊活動頁，可直接試用文字、排版、圖片選擇與匯出，草稿保存在目前瀏覽器。 |
| `examples/html`       | 純 HTML 最小 embed                                                         |
| `examples/vue`        | Vue 3，onMounted / destroy                                                 |
| `examples/react`      | React，useEffect cleanup                                                   |
| `examples/laravel`    | 可執行的 Laravel 活動頁後台：登入、版本衝突保護、圖片上傳與公開素材 URL    |

Laravel 範例需要 PHP、Composer 與 SQLite，安裝及測試步驟見倉庫 `examples/laravel/README.md`。完整活動頁流程可依[15 分鐘試用任務](/guide/usability-check)驗收；真人結果尚待取得。

啟動 `pnpm dev` 後，可從工程示例點「活動頁範例」，或直接開啟同一網站的 `/activity/`。雙擊範本的主圖，或選取圖片後按「更換圖片」，再按「加入裝置照片」。支援 PNG、JPEG、WebP，單張上限 2 MiB、長寬各最多 4096 像素。裝置照片保留在目前瀏覽器的 IndexedDB。下載 HTML 會內嵌頁面使用的裝置照片與預設封面，可直接離線開啟。自行貼入的其他圖片網址會保留。伺服器端圖片上傳、帳號隔離與文件版本衝突可在 Laravel 範例實測。

### 工程示例

1. 頂欄 **Ping** 或 `Cmd/Ctrl+Shift+P`
2. 選取元件 → 上方 hook 狀態；**存檔** 看 before／afterSave
3. 圖層雙擊改名、鎖、隱
4. 選 **提示框** shortcode → 屬性「類型」改成行動呼籲 → 出現 dependsOn 欄位

詳見 [擴充指南](/guide/extensibility) 與 repo 內 `examples/README.md`。
