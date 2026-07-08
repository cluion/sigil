import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // 產出 .js／.d.ts（配合 type: module，非 .mjs／.d.mts）
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
