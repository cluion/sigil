# `@cluion/sigil-blocks`

預設區塊工廠：section、text、image、button、column、shortcode 節點。

依賴：`@cluion/sigil-core`。

## 安裝

```bash
pnpm add @cluion/sigil-blocks
```

## 用法

```ts
import { createEditor } from '@cluion/sigil'
import {
  basicBlocks,
  blockSection,
  blockText,
  blockButton,
  blockShortcode,
} from '@cluion/sigil-blocks'

const page = blockSection()
page.children = [
  blockText('標題'),
  blockButton('送出'),
  blockShortcode('greet', { name: 'Ada' }),
]

createEditor({
  mount: '#app',
  doc: { version: 1, root: page },
  blocks: {
    ...basicBlocks,
    問候: () => blockShortcode('greet', { name: 'Ada' }),
  },
})
```

## 授權

MIT。
