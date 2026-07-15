import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // 產出 ESM 與型別
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
})
