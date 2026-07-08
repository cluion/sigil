import { createEditor, type SigilEditor } from '@cluion/sigil'
import { blockSection, blockText, blockButton, blockImage } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'

const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

const store = new JsonProjectStore()

// 範例頁
const section = blockSection()
section.children = [blockText('點我編輯'), blockButton('按鈕'), blockImage('https://placehold.co/120')]
const doc: SigilDoc = { version: 1, root: section }

let editor: SigilEditor = createEditor({ mount: root, doc, store })

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
  editor = createEditor({ mount: root, doc: store.importJSON(json), store })
  status.textContent = '已讀'
})

toolbar.append(saveBtn, loadBtn, status)
