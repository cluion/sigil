import { createEditor, type SigilEditor } from '@cluion/sigil'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

const greet = defineShortcode({
  name: 'greet',
  label: '問候',
  props: { name: 'HTML' },
  schema: [{ name: 'name', type: 'text', label: '名字' }],
  template: '<span>Hello, <b data-ref="n"></b>!</span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
  render: (p, { escape }) => `<span>Hello, <b>${escape(String(p.name))}</b>!</span>`,
})

const section = blockSection()
section.children = [blockText('HTML embed'), blockShortcode('greet', { name: 'HTML' })]
const doc: SigilDoc = { version: 1, root: section }

const store = new JsonProjectStore()
const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

let editor: SigilEditor = createEditor({
  mount: root,
  doc,
  store,
  blocks: {
    ...basicBlocks,
    問候: () => blockShortcode('greet', { name: 'HTML' }),
  },
  shortcodes: [greet],
})

const toolbar = document.getElementById('toolbar')!
const status = document.createElement('span')

const saveBtn = document.createElement('button')
saveBtn.type = 'button'
saveBtn.textContent = '存 JSON'
saveBtn.addEventListener('click', () => {
  localStorage.setItem('sigil-ex-html', store.exportJSON(editor.toJSON()))
  status.textContent = ' 已存'
})

const loadBtn = document.createElement('button')
loadBtn.type = 'button'
loadBtn.textContent = '讀 JSON'
loadBtn.addEventListener('click', () => {
  const raw = localStorage.getItem('sigil-ex-html')
  if (!raw) {
    status.textContent = ' 無資料'
    return
  }
  editor.destroy()
  editor = createEditor({
    mount: root,
    doc: store.importJSON(raw),
    store,
    blocks: {
      ...basicBlocks,
      問候: () => blockShortcode('greet', { name: 'HTML' }),
    },
    shortcodes: [greet],
  })
  status.textContent = ' 已讀'
})

const htmlBtn = document.createElement('button')
htmlBtn.type = 'button'
htmlBtn.textContent = 'toHTML'
htmlBtn.addEventListener('click', () => {
  status.textContent = ` ${editor.toHTML().slice(0, 80)}…`
})

toolbar.append(saveBtn, loadBtn, htmlBtn, status)
