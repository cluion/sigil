# `@cluion/sigil-ui`

畫布與面板：`createCanvas`、`createBlocksPanel`、`createLayersPanel`、`createPropsPanel`、`createInspector`。

```bash
pnpm add @cluion/sigil-ui
```

產品殼：`@cluion/sigil-app`。

`createCanvas()` 的 `setDevice()`／`subscribeDevice()` 可同步 Desktop、Tablet、Mobile 預覽與面板；`createPropsPanel()`、`createInspector()` 的 handle 提供 `setDevice()`，用來編輯對應 breakpoint 覆寫。

## License

MIT
