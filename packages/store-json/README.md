# `@cluion/sigil-store-json`

- `JsonProjectStore`：記憶體 `ProjectStore`，`exportJSON`／`importJSON`
- `MemoryAssetStore`：記憶體 `AssetStore`，支援 `upload`

```bash
pnpm add @cluion/sigil-store-json
```

```ts
import { MemoryAssetStore } from '@cluion/sigil-store-json'

const assets = new MemoryAssetStore([
  { id: '1', url: 'https://placehold.co/120', name: 'demo' },
])

createApp({ mount: '#app', assets })
```

## License

MIT

