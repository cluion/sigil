import { describe, it, expect } from 'vitest'
import { createApp } from '../src/index.js'
import { defineShortcode } from '@cluion/sigil-shortcode'

describe('createApp', () => {
  it('掛載產品殼並可 toJSON / toHTML', () => {
    const def = defineShortcode({
      name: 'greet',
      props: { name: 'a' },
      template: '<span>x</span>',
      render: (p, { escape }) => `<b>${escape(String(p.name))}</b>`,
    })
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'shortcode',
          shortcode: { name: 'greet', props: { name: 'sam' } },
        },
      },
      shortcodes: [def],
    })
    expect(mount.querySelector('.sigil-app')).toBeTruthy()
    expect(mount.querySelector('.sigil-topbar')).toBeTruthy()
    expect(mount.querySelector('.sigil-inspector')).toBeTruthy()
    expect(app.toHTML()).toBe('<b>sam</b>')
    expect(app.toJSON().root.id).toBe('r')
    app.destroy()
    expect(mount.querySelector('.sigil-app')).toBeNull()
  })

  it('Inspector 分頁存在', () => {
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'hi' }] },
      },
    })
    app.engine.select('t')
    const tabs = mount.querySelectorAll('.sigil-tab')
    expect(tabs.length).toBe(3)
    app.destroy()
  })
})
