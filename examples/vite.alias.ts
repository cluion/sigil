import { fileURLToPath } from 'node:url'

// monorepo 開發用：examples 直接 resolve 到各套件 src
export function sigilSrcAliases(): Record<string, string> {
  const root = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
  return {
    '@cluion/sigil-core': root('../packages/core/src/index.ts'),
    '@cluion/sigil-store-json': root('../packages/store-json/src/index.ts'),
    '@cluion/sigil-blocks': root('../packages/blocks/src/index.ts'),
    '@cluion/sigil-ui': root('../packages/ui/src/index.ts'),
    '@cluion/sigil-shortcode': root('../packages/shortcode/src/index.ts'),
    '@cluion/sigil': root('../packages/editor/src/index.ts'),
    '@cluion/sigil-app': root('../packages/app/src/index.ts'),
  }
}
