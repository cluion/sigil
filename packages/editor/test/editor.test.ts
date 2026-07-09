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
