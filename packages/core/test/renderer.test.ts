import { describe, it, expect } from 'vitest'
import {
  createDefaultPolicy,
  createEngine,
  createRenderer,
  createTypeRegistry,
  type RichTextResolver,
  type ShortcodeResolver,
} from '../src/index.js'

const richTextResolver: RichTextResolver = {
  supports: (node) => node.type === 'rich-text',
  read: (node) => node.content ?? '',
}

describe('renderer — mount', () => {
  it('渲染樹', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      { id: 'root', type: 'section', children: [{ id: 'a', type: 'text', content: 'Hi' }] },
      container,
    )
    expect(container.querySelector('span')?.textContent).toBe('Hi')
  })

  it('type 推導 tagName（image→img）', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        children: [{ id: 'img', type: 'image', attributes: { src: 'x' } }],
      },
      container,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('x')
  })

  it('style 走 setProperty', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'section', style: { 'padding-top': '10px' } }, container)
    expect((container.firstElementChild as HTMLElement).style.paddingTop).toBe('10px')
  })

  it('依裝置套用 desktop／tablet／mobile 樣式繼承', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        style: { color: 'red', padding: '16px' },
        responsiveStyles: {
          tablet: { color: 'blue', padding: '12px' },
          mobile: { padding: '8px' },
        },
      },
      container,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.color).toBe('red')
    expect(el.style.padding).toBe('16px')

    r.setDevice('tablet')
    expect(el.style.color).toBe('blue')
    expect(el.style.padding).toBe('12px')

    r.setDevice('mobile')
    expect(el.style.color).toBe('blue')
    expect(el.style.padding).toBe('8px')
  })
})

describe('renderer — applyPatch', () => {
  it('只改父元件的前置文字，保留動態插入／搬移的子元件、焦點與輸入值', () => {
    const renderer = createRenderer()
    const container = document.createElement('div')
    document.body.append(container)
    try {
      renderer.mount(
        {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'parent',
              type: 'section',
              content: '原開頭',
              attributes: { 'data-shortcode': '匯入標記' },
            },
            {
              id: 'other',
              type: 'section',
              children: [{ id: 'moved', type: 'text', content: '結尾' }],
            },
          ],
        },
        container,
      )
      const parent = container.querySelector('[data-sigil-id=parent]')!
      const moved = container.querySelector('[data-sigil-id=moved]')!
      const originalText = parent.firstChild
      renderer.applyPatch({
        type: 'insert',
        parentId: 'parent',
        beforeId: null,
        node: { id: 'field', type: 'input', tagName: 'input' },
      })
      renderer.applyPatch({ type: 'move', id: 'moved', newParentId: 'parent', beforeId: null })
      const field = parent.querySelector('input')!
      field.value = '保留草稿'
      field.focus()
      renderer.applyPatch({ type: 'update', id: 'parent', content: '新開頭' })
      expect(parent.textContent).toBe('新開頭結尾')
      expect(parent.firstChild?.textContent).toBe('新開頭')
      expect(parent.firstChild).toBe(originalText)
      expect(Array.from(parent.children)).toEqual([field, moved])
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('保留草稿')
      renderer.applyPatch({ type: 'update', id: 'moved', content: '新結尾' })
      expect(moved.textContent).toBe('新結尾')
      renderer.applyPatch({ type: 'move', id: 'moved', newParentId: 'other', beforeId: null })
      renderer.applyPatch({ type: 'remove', id: 'field' })
      renderer.applyPatch({ type: 'update', id: 'parent', content: '' })
      expect(parent.textContent).toBe('')
      expect(parent.children.length).toBe(0)
      expect(container.querySelector('[data-sigil-id=other]')?.firstElementChild).toBe(moved)
      parent.replaceChildren('行內編輯後')
      renderer.applyPatch({
        type: 'insert',
        parentId: 'parent',
        beforeId: null,
        node: { id: 'new', type: 'text', content: '子' },
      })
      const newChild = parent.lastElementChild
      renderer.applyPatch({ type: 'update', id: 'parent', content: '重新編輯' })
      expect(parent.textContent).toBe('重新編輯子')
      expect(parent.lastElementChild).toBe(newChild)
    } finally {
      renderer.destroy()
      container.remove()
    }
  })

  it('在自訂預設標籤上更換外層、保留子節點與裝置樣式，之後仍可復原', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'article',
          attributes: { id: 'event' },
          className: 'intro',
          style: { color: 'red' },
          responsiveStyles: { mobile: { color: 'blue' } },
          children: [{ id: 'child', type: 'text', content: '講座' }],
        },
      },
    })
    const r = createRenderer({
      device: 'mobile',
      registry: createTypeRegistry({ article: { tagName: 'article' } }),
    })
    const container = document.createElement('div')
    r.mount(engine.getTree(), container)
    engine.subscribe((event) => {
      if (event.type === 'patch') r.applyPatch(event.patch)
      if (event.type === 'tree') r.reconcile(event.tree)
    })
    const original = container.querySelector('article')!
    const child = original.firstElementChild
    original.setAttribute('data-transient', 'canvas-only')
    engine.update('root', { tagName: 'header' })
    const header = container.querySelector<HTMLElement>('header#event.intro[data-sigil-id="root"]')!
    expect(header.hasAttribute('data-transient')).toBe(false)
    expect(header.firstElementChild).toBe(child)
    expect(header.style.color).toBe('blue')
    engine.update('root', { tagName: 'header' })
    expect(container.firstElementChild).toBe(header)
    engine.update('child', { content: '春季講座' })
    expect(child?.textContent).toBe('春季講座')
    engine.undo()
    engine.undo()
    expect(container.querySelector('article')?.textContent).toBe('講座')
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expect(container.querySelector('header')?.textContent).toBe('講座')
  })

  it('shortcode 宿主換標籤時重新綁定 instance，後續 props 使用新元素', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'box', type: 'shortcode', shortcode: { name: 'card', props: { title: 'A' } } },
      },
    })
    const disposed: HTMLElement[] = []
    const r = createRenderer({
      shortcodeResolver: {
        resolve(node, host) {
          host.textContent = String(node.shortcode?.props.title)
          return {
            el: host,
            setProps(props) {
              host.textContent = String(props.title)
            },
            destroy() {
              disposed.push(host)
            },
          }
        },
      },
    })
    const container = document.createElement('div')
    r.mount(engine.getTree(), container)
    engine.subscribe((event) => {
      if (event.type === 'patch') r.applyPatch(event.patch)
      if (event.type === 'tree') r.reconcile(event.tree)
    })
    const before = container.firstElementChild!
    engine.update('box', { tagName: 'aside' })
    expect(disposed).toEqual([before])
    engine.update('box', { shortcode: { name: 'card', props: { title: 'B' } } })
    expect(container.querySelector('aside[data-shortcode="card"]')?.textContent).toBe('B')
    engine.undo()
    engine.undo()
    expect(container.querySelector('div[data-shortcode="card"]')?.textContent).toBe('A')
  })

  it('insert / update / remove', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'section', children: [] }, container)
    r.applyPatch({
      type: 'insert',
      parentId: 'root',
      beforeId: null,
      node: { id: 'a', type: 'text', content: 'A' },
    })
    expect(container.textContent).toBe('A')
    r.applyPatch({ type: 'update', id: 'a', content: 'B' })
    expect(container.textContent).toBe('B')
    r.applyPatch({ type: 'remove', id: 'a' })
    expect(container.textContent).toBe('')
  })

  it('responsiveStyles patch 更新目前裝置並可回到繼承', () => {
    const r = createRenderer({ device: 'mobile' })
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        style: { color: 'red' },
        responsiveStyles: { tablet: { color: 'blue' } },
      },
      container,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.color).toBe('blue')

    r.applyPatch({
      type: 'update',
      id: 'root',
      responsiveStyles: { mobile: { color: 'green' } },
    })
    expect(el.style.color).toBe('green')

    r.applyPatch({
      type: 'update',
      id: 'root',
      responsiveStyles: { mobile: { color: '' } },
    })
    expect(el.style.color).toBe('blue')
  })

  it('move 保留元素（跨 parent）', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'section',
        children: [
          { id: 'p1', type: 'section', children: [{ id: 'a', type: 'text', content: 'A' }] },
          { id: 'p2', type: 'section', children: [] },
        ],
      },
      container,
    )
    const root = container.firstElementChild as HTMLElement
    const p1 = root.children[0] as HTMLElement
    const p2 = root.children[1] as HTMLElement
    r.applyPatch({ type: 'move', id: 'a', newParentId: 'p2', beforeId: null })
    expect(p1.children.length).toBe(0)
    expect(p2.children.length).toBe(1)
  })
})

describe('renderer — reconcile', () => {
  it('全量重建', () => {
    const r = createRenderer()
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'section', children: [] }, container)
    r.reconcile({
      id: 'root',
      type: 'section',
      children: [{ id: 'a', type: 'text', content: 'X' }],
    })
    expect(container.textContent).toBe('X')
  })
})

describe('renderer — rich text', () => {
  it('父元件在純文字與富文字間切換，消毒時保留子元件身分及順序', () => {
    const resolver: RichTextResolver = {
      supports: (node) => node.attributes?.format === 'rich',
      read: (node) => node.content ?? '',
    }
    const container = document.createElement('div')
    const sanitized: string[] = []
    const renderer = createRenderer({
      richTextResolver: resolver,
      htmlPolicy: createDefaultPolicy({
        sanitize: (html) => {
          sanitized.push(html)
          return html.replace(/<script>[\s\S]*?<\/script>/gi, '')
        },
      }),
    })
    renderer.mount(
      {
        id: 'parent',
        type: 'section',
        content: '開頭',
        children: [{ id: 'child', type: 'button', content: '按鈕' }],
      },
      container,
    )
    const child = container.querySelector('button')!
    const host = container.firstElementChild!
    const rich = '<em>斜體</em><script>blocked()</script><strong>粗體</strong>'
    renderer.applyPatch({ type: 'update', id: 'parent', attrs: { format: 'rich' }, content: rich })
    expect(Array.from(host.children).map((el) => el.localName)).toEqual(['em', 'strong', 'button'])
    expect(host.lastChild).toBe(child)
    expect(sanitized).toEqual([rich])
    renderer.applyPatch({ type: 'update', id: 'parent', content: '<b>新版</b>' })
    expect(Array.from(host.children).map((el) => el.localName)).toEqual(['b', 'button'])
    renderer.applyPatch({
      type: 'update',
      id: 'parent',
      removeAttributes: ['format'],
      content: '<b>純文字</b>',
    })
    expect(host.textContent).toBe('<b>純文字</b>按鈕')
    expect(host.lastChild).toBe(child)
    expect(host.children.length).toBe(1)
    expect(sanitized).toEqual([rich, '<b>新版</b>'])
  })
  it('透過 HtmlPolicy render，patch／reconcile 共用安全路徑', () => {
    const inputs: string[] = []
    const htmlPolicy = createDefaultPolicy({
      sanitize: (input) => {
        inputs.push(input)
        return input.replace(/<script[\s\S]*?<\/script>/gi, '')
      },
    })
    const r = createRenderer({ richTextResolver, htmlPolicy })
    const container = document.createElement('div')

    r.mount(
      {
        id: 'rich',
        type: 'rich-text',
        content: '<strong>初始</strong><script>alert(1)</script>',
      },
      container,
    )
    expect(container.querySelector('strong')?.textContent).toBe('初始')
    expect(container.querySelector('script')).toBeNull()
    const originalText = container.querySelector('strong')
    r.applyPatch({ type: 'update', id: 'rich', tagName: 'article' })
    expect(container.querySelector('article > strong')).toBe(originalText)

    r.applyPatch({ type: 'update', id: 'rich', content: '<strong>更新</strong>' })
    expect(container.querySelector('strong')?.textContent).toBe('更新')

    r.reconcile({ id: 'rich', type: 'rich-text', content: '<em>重建</em>' })
    expect(container.querySelector('em')?.textContent).toBe('重建')
    expect(inputs).toEqual([
      '<strong>初始</strong><script>alert(1)</script>',
      '<strong>更新</strong>',
      '<em>重建</em>',
    ])
  })

  it('沒有 HtmlPolicy 時把 markup 當純文字，不建立元素', () => {
    const r = createRenderer({ richTextResolver })
    const container = document.createElement('div')
    r.mount({ id: 'rich', type: 'rich-text', content: '<strong>安全降級</strong>' }, container)

    expect(container.textContent).toBe('<strong>安全降級</strong>')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('未命中 resolver 的既有節點維持純文字語意', () => {
    let sanitized = false
    const r = createRenderer({
      richTextResolver,
      htmlPolicy: createDefaultPolicy({
        sanitize: (input) => {
          sanitized = true
          return input
        },
      }),
    })
    const container = document.createElement('div')
    r.mount({ id: 'plain', type: 'text', content: '<strong>純文字</strong>' }, container)

    expect(sanitized).toBe(false)
    expect(container.textContent).toBe('<strong>純文字</strong>')
    expect(container.querySelector('strong')).toBeNull()
  })
})

describe('renderer — shortcode slot', () => {
  it.each(['append', 'replace'])(
    '更新前置內容不影響 %s 型 shortcode 的模板、slot 子元件和 props',
    (behavior) => {
      const renderer = createRenderer({
        shortcodeResolver: {
          resolve(_, host) {
            const wrapper = host.ownerDocument.createElement('article')
            wrapper.append(host.ownerDocument.createElement('slot'))
            if (behavior === 'replace') host.replaceChildren(wrapper)
            else host.append(wrapper)
            return {
              el: host,
              setProps(props) {
                wrapper.title = String(props.label)
              },
              destroy() {},
            }
          },
        },
      })
      const container = document.createElement('div')
      const shortcode = { name: 'card', props: { label: 'title' } }
      renderer.mount(
        {
          id: 'owner',
          type: 'shortcode',
          shortcode,
          content: '前置',
          children: [{ id: 'child', type: 'text', content: '內容' }],
        },
        container,
      )
      const article = container.querySelector('article')
      const child = container.querySelector('[data-sigil-id=child]')
      renderer.applyPatch({
        type: 'update',
        id: 'owner',
        content: '更新',
        shortcode: { ...shortcode, props: { label: '新標題' } },
      })
      expect(container.querySelector('article')).toBe(article)
      expect(article?.title).toBe('新標題')
      expect(container.querySelector('[data-sigil-id=child]')).toBe(child)
      expect(container.textContent).toBe(behavior === 'append' ? '更新內容' : '內容')
    },
  )
  const slotResolver = (fallback: string | null): ShortcodeResolver => ({
    resolve: (_n, host) => {
      if (fallback === null) {
        const d = document.createElement('div')
        d.textContent = 'noslot'
        host.append(d)
      } else {
        const slot = document.createElement('slot')
        slot.textContent = fallback
        host.append(slot)
      }
      return { el: host, setProps() {}, destroy() {} }
    },
  })

  it('shortcode children 填 <slot>(slot 被取代)', () => {
    const r = createRenderer({ shortcodeResolver: slotResolver('fb') })
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'shortcode',
        shortcode: { name: 'card', props: {} },
        children: [{ id: 'c', type: 'text', content: 'Hi' }],
      },
      container,
    )
    const host = container.firstElementChild as HTMLElement
    expect(host.querySelector('slot')).toBeNull()
    expect(host.querySelector('span')?.textContent).toBe('Hi')
  })

  it('無 children → slot fallback 保留', () => {
    const r = createRenderer({ shortcodeResolver: slotResolver('fb') })
    const container = document.createElement('div')
    r.mount({ id: 'root', type: 'shortcode', shortcode: { name: 'card', props: {} } }, container)
    expect(container.querySelector('slot')?.textContent).toBe('fb')
  })

  it('shortcode 無 <slot> → children 忽略', () => {
    const r = createRenderer({ shortcodeResolver: slotResolver(null) })
    const container = document.createElement('div')
    r.mount(
      {
        id: 'root',
        type: 'shortcode',
        shortcode: { name: 'x', props: {} },
        children: [{ id: 'c', type: 'text', content: 'Hi' }],
      },
      container,
    )
    expect(container.textContent).toBe('noslot')
  })
})
