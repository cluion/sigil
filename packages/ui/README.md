# `@cluion/sigil-ui`

畫布與面板：`createCanvas`、`createBlocksPanel`、`createLayersPanel`、`createPropsPanel`、`createInspector`、`openContextMenu`。

```bash
pnpm add @cluion/sigil-ui
```

產品殼：`@cluion/sigil-app`。

`createCanvas()` 的 `setDevice()`／`subscribeDevice()` 可同步 Desktop、Tablet、Mobile 預覽與面板；`createPropsPanel()`、`createInspector()` 的 handle 提供 `setDevice()`，用來編輯對應 breakpoint 覆寫。

`createCanvas()` 與 `createLayersPanel()` 可透過 `onContextMenu` 回報命中節點與游標座標。`openContextMenu()` 提供 viewport 邊界定位、亮暗色主題、方向鍵焦點操作與 Esc 關閉。

`createCanvas(engine, canvasHost, { selectionToolbarContainer: actionsHost })` 可將元件操作放在宿主配置的專用區域，例如畫布下方。選取元件捲出畫布時，作者可按「在畫布定位」返回。省略此選項時，工具列會浮動於畫布內。

自組面板可用 `createLayersPanel(engine, container, { searchable: true })` 開啟圖層搜尋。選擇結果會展開對應分支並觸發 `onActivate(id)`。`createApp()` 和 `createEditor()` 預設提供搜尋欄。

自訂選圖按鈕可呼叫 `openMediaPicker({ pageImages: () => collectPageImages(engine.getTree()), onPick, onClose })`，讓作者依圖層名稱、替代文字或檔名重用本頁圖片。`onPick(item)` 可取用原始的 `item.url`。提供 `assets` 可加入宿主素材庫，有自訂富文字時將對應的 resolver 傳給 `collectPageImages` 的第二個參數。

若選圖器用於插入新圖片，可傳入 `onInsertUrl(url, alt)` 開啟「圖片網址」。使用者主動預覽且圖片載入成功後，才可確認插入。宿主可提供 `acceptsImageAttribute(name, value)` 檢查表單中的 `src` 和 `alt` 是否能保存。

傳入 `headingOutline: true` 可加入「標題大綱」，讓作者依 H1–H6 或標題文字找到章節並選取元件。`createApp()` 和 `createEditor()` 預設啟用。面板隱藏後，大綱會等到再次開啟才更新。

自訂匯出介面可用 `createPageLinksPanel(snapshot.root, { i18n, richText, onEdit })`。將 `handle.el` 加到對話框，使用者首次展開時才整理這份快照中的連結。`onEdit(id)` 收到連結的元件 ID；若文件仍可編輯，先用 `handle.hasSource(engine.getTree(), id)` 確認來源還在，再選取該元件。省略 `onEdit` 可顯示唯讀清單。切換語系時呼叫 `handle.refreshLocale()`，關閉時呼叫 `handle.destroy()`。

若宿主會從搜尋結果切換到另一個面板，可用 `preserveSearchOnActivate: () => true` 保留查詢與已載入的結果數。宿主隱藏圖層時呼叫 `handle.setSearchVisible(false)` 可暫停搜尋更新，再次顯示時呼叫 `handle.setSearchVisible(true)` 即會補上隱藏期間的變更。

`createBlocksPanel()` 可搜尋並釘選區塊與自訂範本。同源的面板預設共用釘選偏好。宿主可用 `blockPinStorageKey` 依帳號或工作區分開保存，或傳入 `false` 讓釘選只保留到該面板卸載。

`createSelectionPath(engine, container, { onActivate })` 顯示目前元件的上層路徑。元件名稱、HTML 的 `aria-label` 與 `id` 都可用來辨識匯入的區段。點擊上層會先選取該元件，再呼叫 `onActivate(id)`，宿主可在此呼叫 `canvas.revealSelection?.()`。用 `setCompact(true)` 可在窄版介面以單一按鈕開啟完整路徑。`setVisible(false)` 會收起路徑及其選擇視窗。

在自訂工具列上可用 `canvas.canMoveSelection?.()` 切換「移動元件」按鈕的可用狀態。呼叫 `canvas.moveSelection?.(button)` 後，使用者可選擇新容器與插入位置，取消時焦點會回到該按鈕。

`createCanvas()` 的 `richText` 可注入 `RichTextAdapter`；PropsPanel／Inspector 接受同一 resolver 並只顯示唯讀摘要。高階 App／Editor 的安全接線見 [富文字指南](../../docs/guide/rich-text.md)。

## License

MIT
