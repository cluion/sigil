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
      root: {
        id: 'r',
        type: 'section',
        className: 'box',
        style: { color: 'red', 'padding-top': '4px' },
      },
    }
    expect(toHTML(doc)).toBe('<section class="box" style="color:red;padding-top:4px"></section>')
  })

  it('style property name 不可跳出 attribute', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        style: {
          color: 'red',
          'color" onmouseover="alert(1)': 'blue',
        },
      },
    }
    expect(toHTML(doc)).toBe('<section style="color:red"></section>')
  })
})

describe('toHTML — void elements', () => {
  it('img 無閉合、不含 children', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'image',
        attributes: { src: 'x' },
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
        id: 'r',
        type: 'shortcode',
        shortcode: { name: 'counter', props: { step: 2 } },
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

describe('toHTML — shortcode slot', () => {
  const mkResolver = (fn: (n: ComponentNode) => string | null): ShortcodeResolver => ({
    resolve: () => null,
    renderStatic: fn,
  })

  it('shortcode children 填 <slot>', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'shortcode',
        shortcode: { name: 'card', props: {} },
        children: [{ id: 'c', type: 'text', content: 'Hi' }],
      },
    }
    expect(toHTML(doc, { shortcodeResolver: mkResolver(() => '<div><slot>fb</slot></div>') })).toBe(
      '<div><span>Hi</span></div>',
    )
  })

  it('無 children → fallback 保留', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 'r', type: 'shortcode', shortcode: { name: 'card', props: {} } },
    }
    expect(toHTML(doc, { shortcodeResolver: mkResolver(() => '<div><slot>fb</slot></div>') })).toBe(
      '<div><slot>fb</slot></div>',
    )
  })

  it('render 無 <slot> → 不 replace(children 忽略)', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'shortcode',
        shortcode: { name: 'x', props: {} },
        children: [{ id: 'c', type: 'text', content: 'Hi' }],
      },
    }
    expect(toHTML(doc, { shortcodeResolver: mkResolver(() => '<div>noslot</div>') })).toBe(
      '<div>noslot</div>',
    )
  })
})

describe('toHTML — hydrated', () => {
  const resolver: ShortcodeResolver = {
    resolve: () => null,
    renderStatic: () => '<b>hi</b>',
  }

  it('shortcode 包 host 標記(data-shortcode/data-props)', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 's', type: 'shortcode', shortcode: { name: 'card', props: { a: 1 } } },
    }
    expect(toHTML(doc, { shortcodeResolver: resolver, mode: 'hydrated' })).toBe(
      '<div data-sigil-id="s" data-shortcode="card" data-props="{&quot;a&quot;:1}"><b>hi</b></div>',
    )
  })

  it('static 模式不加 host(現有行為)', () => {
    const doc: SigilDoc = {
      version: 1,
      root: { id: 's', type: 'shortcode', shortcode: { name: 'card', props: { a: 1 } } },
    }
    expect(toHTML(doc, { shortcodeResolver: resolver })).toBe('<b>hi</b>')
  })
})

describe('toHTML — responsive styles', () => {
  it('輸出 scoped tablet／mobile media queries，且 mobile 規則排在後面', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        style: { color: 'red' },
        responsiveStyles: {
          tablet: { color: 'blue', padding: '8px' },
          mobile: { color: 'green' },
        },
      },
    }
    expect(toHTML(doc)).toBe(
      '<style data-sigil-responsive>' +
        '@media (max-width:768px){[data-sigil-r="r0"]{color:blue;padding:8px}}' +
        '@media (max-width:480px){[data-sigil-r="r0"]{color:green}}' +
        '</style><section data-sigil-r="r0" style="color:red"></section>',
    )
  })

  it('只標記有 responsive 規則的節點，key 依樹順序穩定', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        children: [
          { id: 'plain', type: 'text', content: 'plain' },
          {
            id: 'responsive',
            type: 'text',
            content: 'small',
            responsiveStyles: { mobile: { 'font-size': '12px' } },
          },
        ],
      },
    }
    const html = toHTML(doc)
    expect(html).toContain('@media (max-width:480px){[data-sigil-r="r0"]{font-size:12px}}')
    expect(html).toContain('<span>plain</span>')
    expect(html).toContain('<span data-sigil-r="r0">small</span>')
  })

  it('static shortcode 有樣式時建立 host，hydrated host 保留 presentation', () => {
    const resolver: ShortcodeResolver = {
      resolve: () => null,
      renderStatic: () => '<b>card</b>',
    }
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 's',
        type: 'shortcode',
        className: 'card-host',
        style: { color: 'red' },
        responsiveStyles: { tablet: { color: 'blue' } },
        shortcode: { name: 'card', props: {} },
      },
    }
    const staticHtml = toHTML(doc, { shortcodeResolver: resolver })
    expect(staticHtml).toContain(
      '<div data-sigil-r="r0" class="card-host" style="color:red"><b>card</b></div>',
    )
    const hydratedHtml = toHTML(doc, { shortcodeResolver: resolver, mode: 'hydrated' })
    expect(hydratedHtml).toContain(
      'data-props="{}" data-sigil-r="r0" class="card-host" style="color:red"',
    )
  })

  it('responsive CSS value 不可跳出 style/rule', () => {
    const doc: SigilDoc = {
      version: 1,
      root: {
        id: 'r',
        type: 'section',
        responsiveStyles: {
          tablet: {
            color: 'red}</style><script>alert(1)</script>',
            'bad;property': 'ignored',
          },
        },
      },
    }
    const html = toHTML(doc)
    expect(html).not.toContain('</style><script>')
    expect(html).not.toContain('bad;property')
    expect(html).toContain('color:red\\7d \\3c /style\\3e ')
  })
})
