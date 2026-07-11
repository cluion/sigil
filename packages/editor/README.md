# `@cluion/sigil`

`createEditor` SDK。

```bash
pnpm add @cluion/sigil @cluion/sigil-blocks
```

```ts
import { createEditor } from '@cluion/sigil'
import { basicBlocks } from '@cluion/sigil-blocks'

const editor = createEditor({ mount: '#app', blocks: basicBlocks })
editor.toJSON()
editor.toHTML()
editor.destroy()
```

產品殼：`@cluion/sigil-app`。

## License

MIT
