import { describe, it, expect } from 'vitest'
import {
  createDefaultPolicy,
  createRenderer,
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
