# `@cluion/sigil-ui`

預設編輯 UI：iframe 畫布、區塊／圖層／屬性面板與拖拽。函式式 mount（非必用 custom element）。

依賴：`@cluion/sigil-core`。

## 安裝

```bash
pnpm add @cluion/sigil-ui
```

一般請用 [`@cluion/sigil`](../editor/README.md) 的 `createEditor`。僅在自組版面時直接引用本套件。

## 主要 API

| 函式 | 說明 |
|---|---|
| `createCanvas` | 編輯／預覽、裝置寬度、iframe 渲染 |
| `createBlocksPanel` | 區塊拖入 |
| `createLayersPanel` | 圖層樹 |
| `createPropsPanel` | 屬性／樣式；可接 shortcode schema |
| `createPropForm` | 依 `PropSchema` 產表單 |
| DnD helpers | `startInsertDrag` / `startMoveDrag` / `hitTest` 等 |

## 授權

MIT。
