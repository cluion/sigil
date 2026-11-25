import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
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
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  define: {
    __SIGIL_APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    {
      // 與 Vite 的 ?raw 匯入保持一致。
      name: 'sigil-raw',
      resolveId(id, importer) {
        if (!/\.(?:css|html)\?raw$/.test(id)) return null
        const base = id.slice(0, -'?raw'.length)
        const file = resolve(importer ? dirname(importer) : dir, base)
        const packagePath = relative(dir, file).split(sep).join('/')
        return '\0sigil-raw:' + packagePath + '?raw'
      },
      load(id) {
        if (!id.startsWith('\0sigil-raw:')) return null
        const filePath = id.slice('\0sigil-raw:'.length, -'?raw'.length)
        return `export default ${JSON.stringify(readFileSync(resolve(dir, filePath), 'utf8'))}`
      },
    },
  ],
})
