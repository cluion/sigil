import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
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
const projectStore: ProjectStore = {
  load() {
    const json = localStorage.getItem('sigil-ex-html')
    return json === null ? null : store.importJSON(json)
  },
  save(doc) {
    localStorage.setItem('sigil-ex-html', store.exportJSON(doc))
  },
}
const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

const blocks = {
  ...basicBlocks,
  問候: () => blockShortcode('greet', { name: 'HTML' }),
}

let app: SigilApp = createApp({
  mount: root,
  doc,
  store: projectStore,
  blocks,
  shortcodes: [greet],
})

const toolbar = document.getElementById('toolbar')!
const status = document.createElement('span')

const saveBtn = document.createElement('button')
saveBtn.type = 'button'
saveBtn.textContent = '寫入 localStorage'
saveBtn.addEventListener('click', async () => {
  const currentApp = app
  try {
    await currentApp.save()
    if (app === currentApp) status.textContent = ' 已寫入'
  } catch (error) {
    if (app === currentApp) {
      status.textContent = ` 寫入失敗：${error instanceof Error ? error.message : String(error)}`
    }
  }
})

const loadBtn = document.createElement('button')
loadBtn.type = 'button'
loadBtn.textContent = '讀 localStorage'
loadBtn.addEventListener('click', () => {
  const raw = localStorage.getItem('sigil-ex-html')
  if (!raw) {
    status.textContent = ' 無資料'
    return
  }
  app.destroy()
  app = createApp({
    mount: root,
    doc: store.importJSON(raw),
    store: projectStore,
    blocks,
    shortcodes: [greet],
  })
  status.textContent = ' 已讀'
})

toolbar.append(saveBtn, loadBtn, status)
