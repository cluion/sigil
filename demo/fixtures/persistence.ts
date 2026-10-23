import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlockDefs } from '@cluion/sigil-blocks'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'

const initialDoc: SigilDoc = {
  version: 1,
  root: {
    id: 'page-root',
    type: 'section',
    name: '活動頁',
    children: [{ id: 'page-title', type: 'text', name: '活動標題', content: '初始活動標題' }],
  },
}

const store: ProjectStore = {
  async load() {
    const response = await fetch('/__e2e/page', { cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Load failed: HTTP ${response.status}`)
    return (await response.json()) as SigilDoc
  },
  async save(doc) {
    const response = await fetch('/__e2e/page', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
    if (!response.ok) throw new Error(`Save failed: HTTP ${response.status}`)
  },
}

const app = createApp({
  mount: '#app',
  doc: (await store.load()) ?? initialDoc,
  store,
  blocks: basicBlockDefs,
  locale: 'zh',
  theme: 'light',
})

;(window as unknown as { __sigil: SigilApp }).__sigil = app
