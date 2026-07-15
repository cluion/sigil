# `@cluion/sigil-core`

引擎：模型、Engine、renderer、policy、序列化。零第三方依賴。

```bash
pnpm add @cluion/sigil-core
```

```ts
import { createEngine } from '@cluion/sigil-core'

const engine = createEngine({
  doc: {
    version: 1,
    root: {
      id: 'r',
      type: 'section',
      style: { padding: '32px' },
      responsiveStyles: {
        tablet: { padding: '24px' },
        mobile: { padding: '16px' },
      },
    },
  },
})
```

`style` 是 Desktop 基礎值；Tablet 與 Mobile 只保存差異覆寫，Mobile 會依序繼承 Desktop、Tablet。`toHTML()` 會在需要時輸出 scoped media queries。

## License

MIT
