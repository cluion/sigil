import { createApp, type SigilApp } from '@cluion/sigil-app'
import {
  basicBlocks,
  blockSection,
  blockText,
  blockButton,
  blockImage,
  blockShortcode,
} from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { counterDef } from './shortcodes/counter'
import { cardDef } from './shortcodes/card'
import { pingDef } from './shortcodes/ping'
import { pongDef } from './shortcodes/pong'
import { loaderDef } from './shortcodes/loader'
import { productDef } from './shortcodes/product'
import { cartDef } from './shortcodes/cart'

const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

/** mock：/sizes?color= → 規格；/price?id&color&size → 價格；/error → 失敗；其餘 loader 用 */
const mockFetchJSON = (url: string, signal?: AbortSignal) =>
  new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => {
      if (url.startsWith('/error')) {
        reject(new Error('mock fail'))
        return
      }
      if (url.startsWith('/sizes')) {
        const params = new URLSearchParams(url.split('?')[1] ?? '')
        const color = params.get('color') ?? 'red'
        const byColor: Record<string, { value: string; label: string }[]> = {
          red: [
            { value: 's', label: 'S' },
            { value: 'm', label: 'M' },
          ],
          blue: [
            { value: 'm', label: 'M' },
            { value: 'l', label: 'L' },
          ],
          green: [
            { value: 'l', label: 'L' },
            { value: 'xl', label: 'XL' },
          ],
        }
        resolve({ sizes: byColor[color] ?? byColor.red })
        return
      }
      if (url.startsWith('/price')) {
        const params = new URLSearchParams(url.split('?')[1] ?? '')
        const color = params.get('color')
        const size = params.get('size') ?? 'm'
        const id = Number(params.get('id'))
        const base: Record<string, number> = { red: 100, blue: 150, green: 200 }
        const sizeAdd: Record<string, number> = { s: 0, m: 10, l: 20, xl: 30 }
        const colorBase = color ? (base[color] ?? 100) : 100
        resolve({ price: colorBase + (sizeAdd[size] ?? 0) + id * 10 })
        return
      }
      resolve({ url, ts: 123 })
    }, 300)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

const store = new JsonProjectStore()

const section = blockSection()
section.children = [blockText('點我編輯'), blockButton('按鈕'), blockImage('https://placehold.co/120')]
const doc: SigilDoc = { version: 1, root: section }

const blocks = {
  ...basicBlocks,
  計數器: () => blockShortcode('counter', { step: 1 }),
  卡片: () => blockShortcode('card', {}),
  發送: () => blockShortcode('ping', {}),
  接收: () => blockShortcode('pong', {}),
  載入器: () => blockShortcode('loader', { id: 1 }),
  商品卡: () => blockShortcode('product', { productId: 1 }),
  購物車: () => blockShortcode('cart', {}),
}

const shortcodes = [counterDef, cardDef, pingDef, pongDef, loaderDef, productDef, cartDef]

let locale: 'zh' | 'en' = 'zh'
let app: SigilApp = createApp({
  mount: root,
  doc,
  store,
  blocks,
  shortcodes,
  fetchJSON: mockFetchJSON,
  locale,
})

const toolbar = document.getElementById('toolbar')!
const status = document.createElement('span')
status.style.marginLeft = '8px'

const loadBtn = document.createElement('button')
loadBtn.textContent = '讀 localStorage'
loadBtn.addEventListener('click', () => {
  const json = localStorage.getItem('sigil-demo')
  if (!json) {
    status.textContent = ' 無資料'
    return
  }
  try {
    const loaded = store.importJSON(json)
    app.destroy()
    app = createApp({
      mount: root,
      doc: loaded,
      store,
      blocks,
      shortcodes,
      fetchJSON: mockFetchJSON,
      locale,
    })
    status.textContent = ' 已讀'
  } catch (e) {
    status.textContent = ` 讀取失敗：${e instanceof Error ? e.message : String(e)}`
  }
})

const persistBtn = document.createElement('button')
persistBtn.textContent = '寫入 localStorage'
persistBtn.addEventListener('click', () => {
  localStorage.setItem('sigil-demo', store.exportJSON(app.toJSON()))
  status.textContent = ' 已寫入 LS'
})

const localeBtn = document.createElement('button')
localeBtn.textContent = '中/EN'
localeBtn.addEventListener('click', () => {
  locale = locale === 'zh' ? 'en' : 'zh'
  const d = app.toJSON()
  app.destroy()
  app = createApp({
    mount: root,
    doc: d,
    store,
    blocks,
    shortcodes,
    fetchJSON: mockFetchJSON,
    locale,
  })
  status.textContent = ` 語系 ${locale}`
})

const note = document.createElement('span')
note.style.marginLeft = '12px'
note.style.color = '#64748b'
note.style.fontSize = '13px'
note.textContent = '主 UI 已改 createApp 產品殼 · 存檔／匯出／裝置／預覽在編輯器頂欄'

toolbar.append(persistBtn, loadBtn, localeBtn, status, note)
