import { createApp, defineCommand, type SigilApp } from '@cluion/sigil-app'
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
import { calloutDef } from './shortcodes/callout'

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

// 初始文件：圖層已命名，方便試重命名／鎖／隱；含 callout 試 dependsOn
const title = blockText('點我編輯')
title.name = '標題文字'
const cta = blockButton('按鈕')
cta.name = '主按鈕'
const hero = blockImage('https://placehold.co/120')
hero.name = '主圖'
const tip = blockShortcode('callout', {
  kind: 'info',
  title: '提示框',
  body: '選我 → 右側屬性：改「類型」為行動呼籲，會出現按鈕文字欄位',
  ctaLabel: '開始',
})
tip.name = '提示 callout'

const section = blockSection()
section.name = '首區'
section.children = [title, cta, hero, tip]
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
  defineBlock({
    id: 'callout',
    label: '提示框',
    category: '版面',
    icon: '💬',
    keywords: ['callout', 'dependsOn', 'group'],
    create: () =>
      blockShortcode('callout', {
        kind: 'info',
        title: '提示',
        body: '試 group／dependsOn',
        ctaLabel: '了解更多',
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
  calloutDef,
]

const hookLog = document.createElement('span')
hookLog.style.marginLeft = '8px'
hookLog.style.color = '#4f46e5'
hookLog.style.fontSize = '12px'
hookLog.style.fontFamily = 'ui-monospace, monospace'

function setHookLog(msg: string): void {
  hookLog.textContent = msg
  console.log('[sigil-demo]', msg)
}

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
    commands: [
      defineCommand({
        id: 'demo-ping',
        label: 'Ping',
        toolbar: true,
        toolbarGroup: 'main',
        shortcut: 'mod+shift+p',
        run: () => {
          setHookLog('command: demo-ping')
        },
      }),
    ],
    hooks: {
      onSelect: (id) => {
        setHookLog(id ? `hook:onSelect ${id}` : 'hook:onSelect (none)')
      },
      beforeSave: (doc) => {
        setHookLog(`hook:beforeSave root=${doc.root.id}`)
        return doc
      },
      afterSave: () => {
        setHookLog('hook:afterSave ok')
      },
      afterLoad: () => {
        setHookLog('hook:afterLoad')
      },
    },
  })
}

let app: SigilApp = mountApp(doc)
// 方便 DevTools：await __sigil.runCommand('undo')
;(window as unknown as { __sigil: SigilApp }).__sigil = app

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
    ;(window as unknown as { __sigil: SigilApp }).__sigil = app
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
  ;(window as unknown as { __sigil: SigilApp }).__sigil = app
  status.textContent = ` 語系 ${locale}`
})

const note = document.createElement('span')
note.style.marginLeft = '12px'
note.style.color = '#64748b'
note.style.fontSize = '13px'
note.textContent =
  '試：頂欄 Ping · 圖層雙擊改名／鎖／隱 · 選提示框改類型 · 存檔看 hook'

toolbar.append(persistBtn, loadBtn, localeBtn, status, hookLog, note)
