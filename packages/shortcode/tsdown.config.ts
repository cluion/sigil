import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const dir = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
  version: string
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // 產出 .js／.d.ts（配合 type: module，非 .mjs／.d.mts）
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  define: {
    __SIGIL_SHORTCODE_VERSION__: JSON.stringify(version),
  },
})
