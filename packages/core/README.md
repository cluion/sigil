# `@cluion/sigil-core`

引擎：模型、Engine、renderer、policy、序列化。零第三方依賴。

```bash
pnpm add @cluion/sigil-core
```

```ts
import { createEngine } from '@cluion/sigil-core'

const engine = createEngine({
  doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
})
```

## License

MIT
