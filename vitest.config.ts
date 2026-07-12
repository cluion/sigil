import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

function pkgVersion(rel: string): string {
  const j = JSON.parse(readFileSync(path.resolve(root, rel, 'package.json'), 'utf8')) as {
    version: string
  }
  return j.version
}

// dev-only:未 build 時讓測試直接吃各套件 src,繞過 package.json exports(僅指向 dist)。
// build(tsdown)不讀此處,仍走 node_modules → dist,core 不會被打進下游套件
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
  // 與 tsdown define 對齊：測試走 src 時注入 package.json version
  define: {
    __SIGIL_CORE_VERSION__: JSON.stringify(pkgVersion('packages/core')),
    __SIGIL_SHORTCODE_VERSION__: JSON.stringify(pkgVersion('packages/shortcode')),
    __SIGIL_APP_VERSION__: JSON.stringify(pkgVersion('packages/app')),
  },
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
