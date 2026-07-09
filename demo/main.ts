import { createEditor, type SigilEditor } from '@cluion/sigil'
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

const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

const mockFetchJSON = (url: string, signal?: AbortSignal) =>
  new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => resolve({ url, ts: 123 }), 300)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

const store = new JsonProjectStore()

// 範例頁
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
}

let editor: SigilEditor = createEditor({
  mount: root,
  doc,
  store,
  blocks,
  shortcodes: [counterDef, cardDef, pingDef, pongDef, loaderDef],
  fetchJSON: mockFetchJSON,
})

// 工具列：存／讀 JSON
const toolbar = document.getElementById('toolbar')!
const status = document.createElement('span')
status.style.marginLeft = '8px'

const saveBtn = document.createElement('button')
saveBtn.textContent = '存 JSON'
saveBtn.addEventListener('click', () => {
  const json = store.exportJSON(editor.toJSON())
  localStorage.setItem('sigil-demo', json)
  status.textContent = '已存'
})

const loadBtn = document.createElement('button')
loadBtn.textContent = '讀 JSON'
loadBtn.addEventListener('click', () => {
  const json = localStorage.getItem('sigil-demo')
  if (!json) {
    status.textContent = '無資料'
    return
  }
  editor.destroy()
  editor = createEditor({
    mount: root,
    doc: store.importJSON(json),
    store,
    blocks,
    shortcodes: [counterDef, cardDef, pingDef, pongDef, loaderDef],
    fetchJSON: mockFetchJSON,
  })
  status.textContent = '已讀'
})

const exportBtn = document.createElement('button')
exportBtn.textContent = '匯出 HTML'
const htmlOut = document.createElement('textarea')
htmlOut.readOnly = true
htmlOut.style.cssText =
  'display:block;width:100%;min-height:120px;margin-top:8px;font-family:monospace;font-size:12px'

exportBtn.addEventListener('click', () => {
  htmlOut.value = editor.toHTML()
  status.textContent = `已輸出 ${htmlOut.value.length} 字`
})

toolbar.append(saveBtn, loadBtn, exportBtn, status, htmlOut)
