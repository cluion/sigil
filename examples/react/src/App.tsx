import { useCallback, useEffect, useRef, useState } from 'react'
import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore, MemoryAssetStore } from '@cluion/sigil-store-json'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

const store = new JsonProjectStore()
const projectStore: ProjectStore = {
  load() {
    const json = localStorage.getItem('sigil-ex-react')
    return json === null ? null : store.importJSON(json)
  },
  save(doc) {
    localStorage.setItem('sigil-ex-react', store.exportJSON(doc))
  },
}
const assets = new MemoryAssetStore([
  { id: 'r1', url: 'https://placehold.co/160x100/png?text=React', name: 'React' },
])

const greet = defineShortcode({
  name: 'greet',
  label: '問候',
  props: { name: 'React' },
  schema: [{ name: 'name', type: 'text', label: '名字' }],
  template: '<span>Hello, <b data-ref="n"></b>!</span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
})

const blocks = {
  ...basicBlocks,
  問候: () => blockShortcode('greet', { name: 'React' }),
}

function initialDoc(): SigilDoc {
  const section = blockSection()
  section.children = [blockText('React embed'), blockShortcode('greet', { name: 'React' })]
  return { version: 1, root: section }
}

export function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<SigilApp | null>(null)
  const [status, setStatus] = useState('')

  const mount = useCallback((doc: SigilDoc) => {
    const el = mountRef.current
    if (!el) return
    appRef.current?.destroy()
    appRef.current = createApp({
      mount: el,
      doc,
      store: projectStore,
      assets,
      blocks,
      shortcodes: [greet],
    })
  }, [])

  useEffect(() => {
    mount(initialDoc())
    return () => {
      appRef.current?.destroy()
      appRef.current = null
    }
  }, [mount])

  async function save(): Promise<void> {
    const a = appRef.current
    if (!a) return
    try {
      await a.save()
      if (appRef.current === a) setStatus('已存')
    } catch (error) {
      if (appRef.current === a) {
        setStatus(`存檔失敗：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  function load() {
    const raw = localStorage.getItem('sigil-ex-react')
    if (!raw) {
      setStatus('無資料')
      return
    }
    mount(store.importJSON(raw))
    setStatus('已讀')
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ margin: '0 0 8px', fontSize: 18 }}>Sigil · React · createApp</h1>
      <div style={{ marginBottom: 8 }}>
        <button type="button" onClick={save}>
          存 JSON
        </button>{' '}
        <button type="button" onClick={load}>
          讀 JSON
        </button>{' '}
        <span>{status}</span>
      </div>
      <div ref={mountRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}
