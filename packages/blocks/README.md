# `@cluion/sigil-blocks`

區塊工廠與 `defineBlock`。

```bash
pnpm add @cluion/sigil-blocks
```

```ts
import { defineBlock, basicBlockDefs, blockShortcode } from '@cluion/sigil-blocks'

const blocks = [
  ...basicBlockDefs,
  defineBlock({
    id: 'hero',
    label: '主視覺',
    category: '媒體',
    icon: '🖼',
    keywords: ['banner', 'hero'],
    create: () => blockShortcode('banner', { title: 'Hi' }),
  }),
]

createApp({ mount: '#app', blocks })
```

仍支援舊式 `Record<string, () => ComponentNode>`（如 `basicBlocks`）。

## License

MIT
