# `@cluion/sigil-ui`

畫布與面板：`createCanvas`、`createBlocksPanel`、`createLayersPanel`、`createPropsPanel`、`createInspector`、`openContextMenu`。

```bash
pnpm add @cluion/sigil-ui
```

產品殼：`@cluion/sigil-app`。

`createCanvas()` 的 `setDevice()`／`subscribeDevice()` 可同步 Desktop、Tablet、Mobile 預覽與面板；`createPropsPanel()`、`createInspector()` 的 handle 提供 `setDevice()`，用來編輯對應 breakpoint 覆寫。

`createCanvas()` 與 `createLayersPanel()` 可透過 `onContextMenu` 回報命中節點與游標座標。`openContextMenu()` 提供 viewport 邊界定位、亮暗色主題、方向鍵焦點操作與 Esc 關閉。

## License

MIT
