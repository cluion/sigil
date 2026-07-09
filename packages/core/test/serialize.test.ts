import { describe, it, expect } from 'vitest'
import { toHTML } from '../src/index.js'
import type { SigilDoc, ComponentNode, ShortcodeResolver } from '../src/index.js'

describe('toHTML — 基本節點', () => {
  it('section + text 子節點', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'Hi' }] },
    }
    expect(toHTML(doc)).toBe('<section><span>Hi</span></section>')
  })

  it('type 推導 tagName(image→img)', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'image', attributes: { src: 'x.png', alt: 'x' } },
    }
    expect(toHTML(doc)).toBe('<img src="x.png" alt="x">')
  })

  it('未知 type fallback div', () => {
    const doc: SigilDoc = { version: 1, root: { id: 'r', type: 'unknown-type' } }
    expect(toHTML(doc)).toBe('<div></div>')
  })
})

describe('toHTML — escape 動態值', () => {
  it('content 含 <script> 被 escape', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'text', content: '<script>alert(1)</script>' },
    }
    expect(toHTML(doc)).toBe('<span>&lt;script&gt;alert(1)&lt;/script&gt;</span>')
  })

  it('attribute 值含 " 被 escape', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'image', attributes: { alt: 'a "b" c' } },
    }
    expect(toHTML(doc)).toBe('<img alt="a &quot;b&quot; c">')
  })

  it('style 與 className 序列化', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'section', className: 'box', style: { color: 'red', 'padding-top': '4px' } },
    }
    expect(toHTML(doc)).toBe('<section class="box" style="color:red;padding-top:4px"></section>')
  })
})

describe('toHTML — void elements', () => {
  it('img 無閉合、不含 children', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r', type: 'image', attributes: { src: 'x' },
        children: [{ id: 'c', type: 'text', content: 'nope' }],
      },
    }
    expect(toHTML(doc)).toBe('<img src="x">')
  })
})

describe('toHTML — 剝除編輯器屬性', () => {
  it('略過 data-sigil-id / data-shortcode', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'section', attributes: { 'data-sigil-id': 'r', id: 'keep' } },
    }
    expect(toHTML(doc)).toBe('<section id="keep"></section>')
  })
})

describe('toHTML — shortcode', () => {
  const mkResolver = (fn: (node: ComponentNode) => string | null): ShortcodeResolver => ({
    resolve: () => null,
    renderStatic: fn,
  })

  it('有 renderStatic → 用其結果;children 忽略', () => {
    const resolver = mkResolver((n) => `<div data-x="${n.shortcode!.name}">static</div>`)
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r', type: 'shortcode', shortcode: { name: 'counter', props: { step: 2 } },
        children: [{ id: 'c', type: 'text', content: 'ignored' }],
      },
    }
    expect(toHTML(doc, { shortcodeResolver: resolver })).toBe('<div data-x="counter">static</div>')
  })

  it('無 resolver → 空字串', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'shortcode', shortcode: { name: 'counter', props: {} } },
    }
    expect(toHTML(doc)).toBe('')
  })

  it('renderStatic 回 null → 空字串', () => {
    const resolver = mkResolver(() => null)
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'shortcode', shortcode: { name: 'x', props: {} } },
    }
    expect(toHTML(doc, { shortcodeResolver: resolver })).toBe('')
  })
})
