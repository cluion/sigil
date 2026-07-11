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
自組 UI：`@cluion/sigil`。

## License

MIT
