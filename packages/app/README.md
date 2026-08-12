# `@cluion/sigil-app`

`createApp` 產品殼。

```bash
pnpm add @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-shortcode
```

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks } from '@cluion/sigil-blocks'

const app = createApp({ mount: '#app', blocks: basicBlocks })
app.toJSON()
app.toHTML()
app.destroy()
```

樣式於執行時注入，或 `import '@cluion/sigil-app/tokens.css'`。  
畫布與圖層支援右鍵選單，可複製、貼上、上下移動或刪除目前節點。
產品殼會依 mount 容器寬度自動切換；窄於 900px 時，區塊與圖層／設定面板改為可用鍵盤操作的互斥抽屜。

富文字可注入 `RichTextAdapter`；啟用時必須同時提供 `sanitize`，Canvas 與 static／hydrated 匯出才會共用安全邊界。完整契約見 [富文字指南](../../docs/guide/rich-text.md)。

自組 UI：`@cluion/sigil`。

## License

MIT
