import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

// dev 直接指向各套件 src，改碼即時生效
export default defineConfig({
  resolve: {
    alias: {
      '@cluion/sigil-core': src('../packages/core/src/index.ts'),
      '@cluion/sigil-store-json': src('../packages/store-json/src/index.ts'),
      '@cluion/sigil-blocks': src('../packages/blocks/src/index.ts'),
      '@cluion/sigil-ui': src('../packages/ui/src/index.ts'),
      '@cluion/sigil-shortcode': src('../packages/shortcode/src/index.ts'),
      '@cluion/sigil': src('../packages/editor/src/index.ts'),
      '@cluion/sigil-app': src('../packages/app/src/index.ts'),
    },
  },
})

