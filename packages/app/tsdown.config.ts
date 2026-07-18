import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
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
      // rolldown 預設不認 ?raw query；攔截 *.css?raw 回傳原始字串
      // vite（dev/test）原生支援，此 plugin 僅 build 生效
      name: 'sigil-css-raw',
      resolveId(id, importer) {
        if (!id.endsWith('.css?raw')) return null
        // 把相對路徑（相對 importer）解析成絕對路徑，再附上 virtual 前綴
        // 前綴不含 .css 結尾，避免 tsdown css-guard 誤攔
        const base = id.replace(/\.css\?raw$/, '')
        const abs = isAbsolute(base) ? base : resolve(dirname(importer ?? dir), base)
        return '\0sigil-css-raw:' + abs
      },
      load(id) {
        if (!id.startsWith('\0sigil-css-raw:')) return null
        const filePath = id.slice('\0sigil-css-raw:'.length) + '.css'
        const css = readFileSync(filePath, 'utf8')
        return `export default ${JSON.stringify(css)}`
      },
    },
  ],
})
