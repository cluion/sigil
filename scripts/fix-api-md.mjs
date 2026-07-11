/**
 * TypeDoc markdown 後處理：讓 VitePress/Vue 不會把泛型轉義當成 HTML 標籤
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../docs/api', import.meta.url).pathname

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path)
      continue
    }
    if (!name.endsWith('.md')) continue
    let text = readFileSync(path, 'utf8')
    // typedoc-plugin-markdown 輸出 `Promise`\<`T`\> — Vue 會炸
    text = text.replace(/\\</g, '&lt;').replace(/\\>/g, '&gt;')
    // 註解裡未包住的 HTML 標籤名
    text = text.replace(/(?<!`)(<[/]?[a-zA-Z][\w:-]*)(?!`)/g, '`$1`')
    writeFileSync(path, text)
  }
}

walk(root)
console.log('fixed typedoc markdown for VitePress')
