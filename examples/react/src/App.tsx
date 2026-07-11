import { useCallback, useEffect, useRef, useState } from 'react'
import { createEditor, type SigilEditor } from '@cluion/sigil'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import type { SigilDoc } from '@cluion/sigil-core'
import { defineShortcode } from '@cluion/sigil-shortcode'

const store = new JsonProjectStore()

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
  const editorRef = useRef<SigilEditor | null>(null)
  const [status, setStatus] = useState('')

  const mountEditor = useCallback((doc: SigilDoc) => {
    const el = mountRef.current
    if (!el) return
    editorRef.current?.destroy()
    editorRef.current = createEditor({
      mount: el,
      doc,
      store,
      blocks,
      shortcodes: [greet],
    })
  }, [])

  useEffect(() => {
    mountEditor(initialDoc())
    return () => {
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [mountEditor])

  function save() {
    const ed = editorRef.current
    if (!ed) return
    localStorage.setItem('sigil-ex-react', store.exportJSON(ed.toJSON()))
    setStatus('已存')
  }

  function load() {
    const raw = localStorage.getItem('sigil-ex-react')
    if (!raw) {
      setStatus('無資料')
      return
    }
    mountEditor(store.importJSON(raw))
    setStatus('已讀')
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', margin: 16 }}>
      <h1>Sigil · React</h1>
      <p>
        用 <code>ref</code> 掛載 DOM；在 <code>useEffect</code> cleanup 呼叫{' '}
        <code>destroy</code>
      </p>
      <div style={{ marginBottom: 8 }}>
        <button type="button" onClick={save}>
          存 JSON
        </button>{' '}
        <button type="button" onClick={load}>
          讀 JSON
        </button>{' '}
        <span>{status}</span>
      </div>
      <div ref={mountRef} />
    </div>
  )
}
