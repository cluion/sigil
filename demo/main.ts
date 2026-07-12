import { createApp, type SigilApp } from '@cluion/sigil-app'
import {
  basicBlockDefs,
  defineBlock,
  blockSection,
  blockText,
  blockButton,
  blockImage,
  blockShortcode,
} from '@cluion/sigil-blocks'
import { JsonProjectStore, MemoryAssetStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { counterDef } from './shortcodes/counter'
import { cardDef } from './shortcodes/card'
import { pingDef } from './shortcodes/ping'
import { pongDef } from './shortcodes/pong'
import { loaderDef } from './shortcodes/loader'
import { productDef } from './shortcodes/product'
import { cartDef } from './shortcodes/cart'
import { bannerDef } from './shortcodes/banner'

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
const assets = new MemoryAssetStore([
  { id: 'a1', url: 'https://placehold.co/200x120/png?text=A', name: '圖 A' },
  { id: 'a2', url: 'https://placehold.co/200x120/png?text=B', name: '圖 B' },
  { id: 'a3', url: 'https://placehold.co/200x120/png?text=C', name: '圖 C' },
])

const section = blockSection()
section.children = [blockText('點我編輯'), blockButton('按鈕'), blockImage('https://placehold.co/120')]
const doc: SigilDoc = { version: 1, root: section }

const blocks = [
  ...basicBlockDefs,
  defineBlock({
    id: 'counter',
    label: '計數器',
    category: '互動',
    icon: '＋',
    keywords: ['counter'],
    create: () => blockShortcode('counter', { step: 1 }),
  }),
  defineBlock({
    id: 'card',
    label: '卡片',
    category: '版面',
    icon: '▭',
    create: () => blockShortcode('card', {}),
  }),
  defineBlock({
    id: 'ping',
    label: '發送',
    category: '互動',
    icon: '↑',
    create: () => blockShortcode('ping', {}),
  }),
  defineBlock({
    id: 'pong',
    label: '接收',
    category: '互動',
    icon: '↓',
    create: () => blockShortcode('pong', {}),
  }),
  defineBlock({
    id: 'loader',
    label: '載入器',
    category: '互動',
    icon: '↻',
    create: () => blockShortcode('loader', { id: 1 }),
  }),
  defineBlock({
    id: 'product',
    label: '商品卡',
    category: '電商',
    icon: '🏷',
    keywords: ['product', 'shop'],
    create: () => blockShortcode('product', { productId: 1 }),
  }),
  defineBlock({
    id: 'cart',
    label: '購物車',
    category: '電商',
    icon: '🛒',
    create: () => blockShortcode('cart', {}),
  }),
  defineBlock({
    id: 'banner',
    label: '橫幅',
    category: '媒體',
    icon: '🖼',
    keywords: ['banner', 'hero'],
    create: () =>
      blockShortcode('banner', {
        src: 'https://placehold.co/320x80/png?text=Banner',
        title: '橫幅標題',
      }),
  }),
]

const shortcodes = [
  counterDef,
  cardDef,
  pingDef,
  pongDef,
  loaderDef,
  productDef,
  cartDef,
  bannerDef,
]

let locale: 'zh' | 'en' = 'zh'
function mountApp(d: SigilDoc): SigilApp {
  return createApp({
    mount: root,
    doc: d,
    store,
    assets,
    blocks,
    shortcodes,
    fetchJSON: mockFetchJSON,
    locale,
  })
}

let app: SigilApp = mountApp(doc)

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
    app = mountApp(loaded)
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
  app = mountApp(d)
  status.textContent = ` 語系 ${locale}`
})

const note = document.createElement('span')
note.style.marginLeft = '12px'
note.style.color = '#64748b'
note.style.fontSize = '13px'
note.textContent = '選圖片區塊 → 內容 → 選圖；存檔／匯出在頂欄'

toolbar.append(persistBtn, loadBtn, localeBtn, status, note)
