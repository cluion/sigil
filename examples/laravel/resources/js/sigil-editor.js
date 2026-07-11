/**
 * Laravel Vite 入口參考
 * 複製到 resources/js 並在 vite.config 註冊
 * 需能 resolve @cluion 套件・npm workspace 或發佈後的套件皆可
 */
import { createEditor } from '@cluion/sigil'
import { basicBlocks, blockSection, blockText } from '@cluion/sigil-blocks'

/**
 * @param {string} pageKey
 * @param {string | undefined} csrf
 */
function createHttpStore(pageKey, csrf) {
  const base = `/api/pages/${encodeURIComponent(pageKey)}`
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (csrf) headers['X-CSRF-TOKEN'] = csrf

  return {
    async load() {
      const r = await fetch(base, { headers, credentials: 'same-origin' })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`load failed: ${r.status}`)
      return r.json()
    },
    async save(doc) {
      const r = await fetch(base, {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(doc),
      })
      if (!r.ok) throw new Error(`save failed: ${r.status}`)
    },
  }
}

async function main() {
  const el = document.getElementById('sigil-root')
  if (!el) return

  const pageKey = el.dataset.pageKey || 'home'
  const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || undefined
  const store = createHttpStore(pageKey, csrf)

  const loaded = await store.load()
  const section = blockSection()
  section.children = [blockText('Laravel + Sigil')]
  const doc = loaded ?? { version: 1, root: section }

  createEditor({
    mount: el,
    doc,
    store,
    blocks: basicBlocks,
  })
}

main().catch((err) => {
  console.error(err)
  document.body.prepend(Object.assign(document.createElement('p'), { textContent: String(err) }))
})
