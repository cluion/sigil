import { describe, it, expect } from 'vitest'
import { createEditor } from '../src/index.js'
import { defineShortcode } from '@cluion/sigil-shortcode'

describe('editor — toHTML', () => {
  it('輸出 static HTML,shortcode 用 render 展開', () => {
    const def = defineShortcode({
      name: 'greet',
      props: { name: 'world' },
      template: '<span>fb</span>',
      render: (p, { escape }) => `<b>${escape(p.name)}</b>`,
    })
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'shortcode', shortcode: { name: 'greet', props: { name: 'sam' } } },
      },
      shortcodes: [def],
    })
    expect(editor.toHTML()).toBe('<b>sam</b>')
  })

  it('混合一般節點與 shortcode', () => {
    const def = defineShortcode({
      name: 'badge',
      template: '<i>badge</i>',
    })
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: {
          id: 'r', type: 'section',
          children: [
            { id: 't', type: 'text', content: 'Hi' },
            { id: 's', type: 'shortcode', shortcode: { name: 'badge', props: {} } },
          ],
        },
      },
      shortcodes: [def],
    })
    expect(editor.toHTML()).toBe('<section><span>Hi</span><i>badge</i></section>')
  })

  it('選取 shortcode 後 props 面板依 schema 生成控制項', () => {
    const def = defineShortcode({
      name: 'counter',
      props: { step: 1 },
      schema: [{ name: 'step', type: 'number', label: '步進' }],
      template: '<b></b>',
    })
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'shortcode', shortcode: { name: 'counter', props: { step: 1 } } },
      },
      shortcodes: [def],
    })
    editor.engine.select('r')
    const num = el.querySelector('input[type=number]') as HTMLInputElement
    expect(num).toBeTruthy()
    expect(num.value).toBe('1')
    // schema 路徑獨有:label「步進」(fallback 只會顯示 key 'step')
    expect(el.textContent).toContain('步進')
  })
})

describe('editor — 快捷鍵', () => {
  it('Delete 鍵刪除選取節點', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'x' }] },
      },
    })
    editor.engine.select('c')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(editor.engine.getTree().children).toHaveLength(0)
  })

  it('Delete 不刪 root', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    editor.engine.select('r')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(editor.engine.getTree().id).toBe('r')
  })

  it('Ctrl+Z undo', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'x' }] },
      },
    })
    editor.engine.remove('c')
    expect(editor.engine.getTree().children).toHaveLength(0)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    expect(editor.engine.getTree().children).toHaveLength(1)
  })

  it('Ctrl+C / Ctrl+V 複製貼上節點', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'hi' }] },
      },
    })
    editor.engine.select('c')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }))
    expect(editor.engine.getTree().children).toHaveLength(2)
    expect(editor.engine.getTree().children![1]!.content).toBe('hi')
  })
})
