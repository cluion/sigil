import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { sigilVersionDefines } from './scripts/sigil-version-defines.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))

// 測試直接引用套件 src
// build 仍透過 package exports 引用 dist
const alias: Record<string, string> = {
  '@cluion/sigil-core': path.resolve(root, 'packages/core/src/index.ts'),
  '@cluion/sigil-shortcode': path.resolve(root, 'packages/shortcode/src/index.ts'),
  '@cluion/sigil-ui': path.resolve(root, 'packages/ui/src/index.ts'),
  '@cluion/sigil-blocks': path.resolve(root, 'packages/blocks/src/index.ts'),
  '@cluion/sigil-store-json': path.resolve(root, 'packages/store-json/src/index.ts'),
  '@cluion/sigil': path.resolve(root, 'packages/editor/src/index.ts'),
  '@cluion/sigil-app': path.resolve(root, 'packages/app/src/index.ts'),
}

export default defineConfig({
  resolve: { alias },
  // 與 tsdown／vite define 對齊：測試走 src 時注入 package.json version
  define: sigilVersionDefines(),
  test: {
    environment: 'happy-dom',
    include: ['packages/**/test/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src'],
    },
  },
})
