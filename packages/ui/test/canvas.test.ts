import { describe, it, expect, vi } from 'vitest'
import { createEngine, createI18n } from '@cluion/sigil-core'
import { createCanvas } from '../src/canvas.js'
import type { RichTextAdapter, RichTextEditContext } from '../src/index.js'

const doc = { version: 1 as const, root: { id: 'r', type: 'section', children: [] } }
const docWithText = {
  version: 1 as const,
  root: {
    id: 'r',
    type: 'section',
    children: [{ id: 't1', type: 'text', content: 'hello' }],
  },
}
const docWithRichText = {
  version: 1 as const,
  root: {
    id: 'r',
    type: 'section',
    children: [{ id: 'rt1', type: 'rich-text', content: '<p><strong>hello</strong></p>' }],
  },
}

function richTextHarness() {
  let value = '<p><em>next</em></p>'
  let context: RichTextEditContext | null = null
  const focus = vi.fn()
  const getValue = vi.fn(() => value)
  const destroy = vi.fn()
  const adapter: RichTextAdapter = {
    resolver: {
      supports: (node) => node.type === 'rich-text',
      read: (node) => node.content ?? '',
    },
    start: vi.fn((nextContext) => {
      context = nextContext
      return { focus, getValue, destroy }
    }),
  }
  return {
    adapter,
    focus,
    getValue,
    destroy,
    getContext: () => context,
    setValue: (next: string) => {
      value = next
    },
  }
}

function waitIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    if (iframe.contentDocument?.body?.childNodes.length) {
      resolve()
      return
    }
    iframe.addEventListener('load', () => resolve(), { once: true })
  })
}

describe('createCanvas — preview mode', () => {
  it('runtime locale 切換更新 chrome 與空容器提示並保留狀態', async () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const i18n = createI18n({
      zh: {},
      en: {
        'canvas.title': 'Canvas',
        'canvas.edit': 'Edit mode',
        'canvas.preview': 'Preview mode',
        'canvas.empty_container': 'Drop components here',
      },
    })
    const canvas = createCanvas(engine, container, { i18n })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const toggle = container.querySelector('.sigil-canvas-mode-btn') as HTMLButtonElement

    expect(canvas.iframe.title).toBe('編輯畫布')
    expect(toggle.textContent).toBe('✏ 編輯')
    canvas.setMode('preview')
    canvas.setDevice('tablet')
    const tree = engine.getTree()

    i18n.setLocale('en')

    expect(canvas.iframe.title).toBe('Canvas')
    expect(toggle.textContent).toBe('Preview mode')
    expect(canvas.getDevice()).toBe('tablet')
    expect(engine.getTree()).toBe(tree)
    expect(canvas.iframe.contentDocument?.head.textContent).toContain(
      'content:"Drop components here"',
    )

    canvas.destroy()
    i18n.setLocale('zh')
    expect(toggle.textContent).toBe('Preview mode')
    container.remove()
  })

  it('預設 edit:iframe pointerEvents none', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.style.pointerEvents).toBe('none')
  })

  it('setMode preview:iframe pointerEvents auto', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setMode } = createCanvas(engine, container)
    setMode('preview')
    expect(iframe.style.pointerEvents).toBe('auto')
  })

  it('setMode preview → edit:回到 none', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setMode } = createCanvas(engine, container)
    setMode('preview')
    setMode('edit')
    expect(iframe.style.pointerEvents).toBe('none')
  })
})

describe('createCanvas — preview fragment navigation', () => {
  async function harness() {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const canvas = createCanvas(engine, container)
    await waitIframeLoad(canvas.iframe)
    canvas.setMode('preview')
    const frame = canvas.iframe.contentDocument!
    // Happy DOM activates links during bubbling, before the document listener runs.
    vi.spyOn(frame.defaultView!, 'open').mockReturnValue(null)
    const link = frame.createElement('a')
    link.setAttribute('href', '#event-info')
    const label = frame.createElement('span')
    label.textContent = 'Details'
    link.appendChild(label)
    const destination = frame.createElement('a')
    destination.id = 'event-info'
    frame.body.append(link, destination)
    const scroll = vi.spyOn(destination, 'scrollIntoView').mockImplementation(() => {})
    const scrollTop = vi.spyOn(frame.defaultView!, 'scrollTo').mockImplementation(() => {})
    return {
      canvas,
      frame,
      link,
      destination,
      scroll,
      scrollTop,
      click(init?: MouseEventInit) {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
        label.dispatchEvent(event)
        return event
      },
      destroy() {
        canvas.destroy()
        container.remove()
      },
    }
  }

  it.each([
    { attribute: 'id', detail: 1 },
    { attribute: 'name', detail: 0 },
  ])(
    'scrolls to decoded $attribute on pointer or keyboard activation',
    async ({ attribute, detail }) => {
      const h = await harness()
      h.destination.removeAttribute('id')
      h.destination.setAttribute(attribute, '活動資訊')
      h.link.setAttribute('href', `#${encodeURIComponent('活動資訊')}`)
      h.link.setAttribute('target', '_self')

      expect(h.click({ detail }).defaultPrevented).toBe(true)
      expect(h.scroll).toHaveBeenCalledOnce()
      expect(h.scrollTop).not.toHaveBeenCalled()
      h.destroy()
    },
  )

  it('empty fragments scroll to the frame top and missing targets never navigate the host', async () => {
    const h = await harness()
    h.link.setAttribute('href', '#')
    expect(h.click().defaultPrevented).toBe(true)
    expect(h.scrollTop).toHaveBeenCalledExactlyOnceWith(0, 0)
    h.link.setAttribute('href', '#missing')
    expect(h.click().defaultPrevented).toBe(true)
    expect(h.scroll).not.toHaveBeenCalled()
    expect(h.scrollTop).toHaveBeenCalledOnce()
    h.destroy()
  })

  it('malformed encoding falls back to the literal id without throwing', async () => {
    const h = await harness()
    h.destination.id = 'bad%escape'
    h.link.setAttribute('href', '#bad%escape')
    expect(h.click().defaultPrevented).toBe(true)
    expect(h.scroll).toHaveBeenCalledOnce()
    h.destroy()
  })

  const untouched: {
    name: string
    mode?: 'edit'
    href?: string
    target?: string
    download?: boolean
    event?: MouseEventInit
  }[] = [
    { name: 'edit mode', mode: 'edit' },
    { name: 'absolute URL', href: 'https://example.test/#event-info' },
    { name: 'relative URL', href: '/another-page#event-info' },
    { name: 'new tab', target: '_blank' },
    { name: 'named frame', target: 'another-frame' },
    { name: 'download', download: true },
    { name: 'middle button', event: { button: 1 } },
    { name: 'control modifier', event: { ctrlKey: true } },
    { name: 'command modifier', event: { metaKey: true } },
    { name: 'shift modifier', event: { shiftKey: true } },
    { name: 'alt modifier', event: { altKey: true } },
  ]
  it.each(untouched)('leaves $name activation untouched', async (scenario) => {
    const h = await harness()
    if (scenario.mode) h.canvas.setMode(scenario.mode)
    if (scenario.href) h.link.setAttribute('href', scenario.href)
    if (scenario.target) h.link.setAttribute('target', scenario.target)
    if (scenario.download) h.link.setAttribute('download', '')
    expect(h.click(scenario.event).defaultPrevented).toBe(false)
    expect(h.scroll).not.toHaveBeenCalled()
    expect(h.scrollTop).not.toHaveBeenCalled()
    h.destroy()
  })

  it('respects an already handled event', async () => {
    const h = await harness()
    h.link.addEventListener('click', (event) => event.preventDefault())
    expect(h.click().defaultPrevented).toBe(true)
    expect(h.scroll).not.toHaveBeenCalled()
    expect(h.scrollTop).not.toHaveBeenCalled()
    h.destroy()
  })

  it('releases document and load listeners when destroyed', async () => {
    const h = await harness()
    const removeDocumentListener = vi.spyOn(h.frame, 'removeEventListener')
    const removeFrameListener = vi.spyOn(h.canvas.iframe, 'removeEventListener')
    const addDocumentListener = vi.spyOn(h.frame, 'addEventListener')
    h.destroy()

    expect(removeDocumentListener).toHaveBeenCalledWith('click', expect.any(Function))
    expect(removeFrameListener).toHaveBeenCalledWith('load', expect.any(Function))
    h.canvas.iframe.dispatchEvent(new Event('load'))
    expect(addDocumentListener).not.toHaveBeenCalled()
    expect(h.click().defaultPrevented).toBe(false)
    expect(h.scroll).not.toHaveBeenCalled()
  })
})

describe('createCanvas — 右鍵選單', () => {
  it('回報命中節點並同步選取', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onContextMenu = vi.fn()
    const canvas = createCanvas(engine, container, { onContextMenu })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const target = canvas.iframe.contentDocument?.querySelector('[data-sigil-id="t1"]') as Element
    vi.spyOn(canvas.iframe.contentDocument!, 'elementFromPoint').mockReturnValue(target)
    const overlay = container.querySelector('.sigil-canvas-overlay') as HTMLElement
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 16,
    })

    overlay.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(engine.getSelection()).toBe('t1')
    expect(onContextMenu).toHaveBeenCalledWith('t1', 12, 16)
    canvas.destroy()
    container.remove()
  })

  it('右鍵空白會清除既有選取', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onContextMenu = vi.fn()
    const canvas = createCanvas(engine, container, { onContextMenu })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))
    vi.spyOn(canvas.iframe.contentDocument!, 'elementFromPoint').mockReturnValue(null)
    engine.select('t1')
    const overlay = container.querySelector('.sigil-canvas-overlay') as HTMLElement

    overlay.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 24 }),
    )

    expect(engine.getSelection()).toBeNull()
    expect(onContextMenu).toHaveBeenCalledWith(null, 20, 24)
    canvas.destroy()
    container.remove()
  })
})

describe('createCanvas — device', () => {
  it('預設 desktop:width 100%', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.style.width).toBe('100%')
  })

  it('iframe 有 title(無障礙名稱)', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.title).toBeTruthy()
  })

  it('setDevice tablet:width 768px', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setDevice } = createCanvas(engine, container)
    setDevice('tablet')
    expect(iframe.style.width).toBe('768px')
  })

  it('setDevice mobile:width 375px', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setDevice } = createCanvas(engine, container)
    setDevice('mobile')
    expect(iframe.style.width).toBe('375px')
  })

  it('getDevice／subscribeDevice 回報目前裝置', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const canvas = createCanvas(engine, container)
    const values: string[] = []
    const unsubscribe = canvas.subscribeDevice((device) => values.push(device))
    canvas.setDevice('tablet')
    canvas.setDevice('mobile')
    unsubscribe()
    canvas.setDevice('desktop')
    expect(canvas.getDevice()).toBe('desktop')
    expect(values).toEqual(['desktop', 'tablet', 'mobile'])
    canvas.destroy()
  })

  it('切換裝置會套用對應 responsive style', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          style: { color: 'red' },
          responsiveStyles: {
            tablet: { color: 'blue' },
            mobile: { color: 'green' },
          },
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const canvas = createCanvas(engine, container)
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const root = canvas.iframe.contentDocument?.querySelector('[data-sigil-id="r"]') as HTMLElement
    expect(root.style.color).toBe('red')
    canvas.setDevice('tablet')
    expect(root.style.color).toBe('blue')
    canvas.setDevice('mobile')
    expect(root.style.color).toBe('green')
    canvas.destroy()
    container.remove()
  })
})

describe('createCanvas — selection chrome', () => {
  it('選取後標記 data-sigil-selected 與類型 badge', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    // 給 srcdoc 一點時間 mount
    await new Promise((r) => setTimeout(r, 30))
    engine.select('t1')
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    const el = d?.querySelector('[data-sigil-id="t1"]')
    expect(el?.getAttribute('data-sigil-selected')).toBe('1')
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge).toBeTruthy()
    expect(badge.style.display).not.toBe('none')
    expect(badge.textContent).toBe('text')
    engine.update('t1', { name: '標題' })
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect((d?.querySelector('[data-sigil-type-badge]') as HTMLElement).textContent).toBe('標題')
    destroy()
    container.remove()
  })

  it('選取 image 也顯示類型 badge（iframe 內 fixed）', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'img1',
              type: 'image',
              tagName: 'img',
              attributes: { src: 'https://example.com/a.png', alt: 'a' },
            },
          ],
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    engine.select('img1')
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    const el = d?.querySelector('[data-sigil-id="img1"]')
    expect(el?.tagName.toLowerCase()).toBe('img')
    expect(el?.getAttribute('data-sigil-selected')).toBe('1')
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge.style.display).not.toBe('none')
    expect(badge.textContent).toBe('image')
    destroy()
    container.remove()
  })

  it('取消選取清除標記與 badge', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    engine.select('t1')
    engine.select(null)
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    expect(d?.querySelector('[data-sigil-selected]')).toBeNull()
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement | null
    // 可能尚未建立，或已隱藏
    if (badge) expect(badge.style.display).toBe('none')
    destroy()
    container.remove()
  })

  it('inject 含 hover／selected 樣式', async () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    const css = iframe.contentDocument?.head.querySelector('style')?.textContent ?? ''
    expect(css).toContain('data-sigil-selected')
    expect(css).toContain('data-sigil-hover')
    expect(css).not.toContain('::after')
    destroy()
    container.remove()
  })
})

describe('createCanvas — inline 文字編輯', () => {
  it('startEditing text 節點 → contenteditable + iframe pointerEvents auto', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, startEditing, getEditingId, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))

    startEditing('t1')
    await new Promise((r) => setTimeout(r, 0))

    expect(getEditingId()).toBe('t1')
    const el = iframe.contentDocument?.querySelector('[data-sigil-id="t1"]') as HTMLElement
    expect(el.getAttribute('contenteditable')).toBe('true')
    // 進入編輯：iframe 開放 pointer、overlay 隱藏
    expect(iframe.style.pointerEvents).toBe('auto')
    destroy()
    container.remove()
  })

  it('commitEditing → 寫回 content', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, startEditing, commitEditing, getEditingId, destroy } = createCanvas(
      engine,
      container,
    )
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))

    startEditing('t1')
    await new Promise((r) => setTimeout(r, 0))
    // 模擬使用者改字（直接改 DOM，因 blur 才寫回）
    const el = iframe.contentDocument?.querySelector('[data-sigil-id="t1"]') as HTMLElement
    el.textContent = 'world'
    commitEditing()
    await new Promise((r) => setTimeout(r, 0))

    expect(getEditingId()).toBeNull()
    expect(engine.getTree().children?.[0]?.content).toBe('world')
    // 退出後 contenteditable 移除、pointer 復原
    expect(el.getAttribute('contenteditable')).toBeNull()
    expect(iframe.style.pointerEvents).toBe('none')
    destroy()
    container.remove()
  })

  it('cancelEditing → 不寫回', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, startEditing, cancelEditing, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))

    startEditing('t1')
    await new Promise((r) => setTimeout(r, 0))
    const el = iframe.contentDocument?.querySelector('[data-sigil-id="t1"]') as HTMLElement
    el.textContent = 'changed'
    cancelEditing()
    await new Promise((r) => setTimeout(r, 0))

    expect(engine.getTree().children?.[0]?.content).toBe('hello')
    destroy()
    container.remove()
  })

  it('startEditing 非 text/button 節點 → 無反應', async () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, startEditing, getEditingId, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))

    startEditing('r') // root section
    expect(getEditingId()).toBeNull()
    destroy()
    container.remove()
  })
})

describe('createCanvas — 富文字編輯 session', () => {
  it('啟動 adapter 並以單次 update commit，可 undo／redo', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const harness = richTextHarness()
    const canvas = createCanvas(engine, container, { richText: harness.adapter })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    const context = harness.getContext()
    const element = canvas.iframe.contentDocument?.querySelector(
      '[data-sigil-id="rt1"]',
    ) as HTMLElement
    expect(context?.node.id).toBe('rt1')
    expect(context?.element).toBe(element)
    expect(context?.document).toBe(canvas.iframe.contentDocument)
    expect(context?.value).toBe('<p><strong>hello</strong></p>')
    expect(harness.focus).toHaveBeenCalledOnce()
    expect(element.getAttribute('contenteditable')).toBeNull()
    expect(canvas.iframe.style.pointerEvents).toBe('auto')

    const restoreFocus = vi.spyOn(element, 'focus')
    canvas.commitEditing()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><em>next</em></p>')
    expect(harness.getValue).toHaveBeenCalledOnce()
    expect(harness.destroy).toHaveBeenCalledOnce()
    expect(canvas.getEditingId()).toBeNull()
    expect(canvas.iframe.style.pointerEvents).toBe('none')
    expect(restoreFocus).toHaveBeenCalledOnce()
    expect(canvas.iframe.contentDocument?.activeElement).toBe(element)
    expect(element.getAttribute('tabindex')).toBe('-1')

    engine.undo()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')
    engine.redo()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><em>next</em></p>')
    canvas.destroy()
    container.remove()
  })

  it('adapter 可請求 commit 或 cancel', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const harness = richTextHarness()
    const canvas = createCanvas(engine, container, { richText: harness.adapter })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    harness.getContext()?.requestCancel()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')
    expect(harness.getValue).not.toHaveBeenCalled()

    canvas.startEditing('rt1')
    harness.getContext()?.requestCommit()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><em>next</em></p>')
    expect(harness.destroy).toHaveBeenCalledTimes(2)
    canvas.destroy()
    container.remove()
  })

  it('Escape 與 destroy 取消且不寫回', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const harness = richTextHarness()
    const canvas = createCanvas(engine, container, { richText: harness.adapter })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    const element = canvas.iframe.contentDocument?.querySelector(
      '[data-sigil-id="rt1"]',
    ) as HTMLElement
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(canvas.getEditingId()).toBeNull()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')

    canvas.startEditing('rt1')
    canvas.destroy()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')
    expect(harness.destroy).toHaveBeenCalledTimes(2)
    container.remove()
  })

  it('模式與裝置切換前 commit', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const harness = richTextHarness()
    const canvas = createCanvas(engine, container, { richText: harness.adapter })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    canvas.setMode('preview')
    expect(engine.getTree().children?.[0]?.content).toBe('<p><em>next</em></p>')
    expect(canvas.iframe.style.pointerEvents).toBe('auto')

    canvas.setMode('edit')
    harness.setValue('<p>mobile</p>')
    canvas.startEditing('rt1')
    canvas.setDevice('mobile')
    expect(engine.getTree().children?.[0]?.content).toBe('<p>mobile</p>')
    expect(canvas.getDevice()).toBe('mobile')
    expect(harness.destroy).toHaveBeenCalledTimes(2)
    canvas.destroy()
    container.remove()
  })

  it('節點移除或外部 content patch 時取消 session', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const harness = richTextHarness()
    const canvas = createCanvas(engine, container, { richText: harness.adapter })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    engine.update('rt1', { content: '<p>external</p>' })
    expect(canvas.getEditingId()).toBeNull()
    expect(engine.getTree().children?.[0]?.content).toBe('<p>external</p>')

    canvas.startEditing('rt1')
    engine.remove('rt1')
    expect(canvas.getEditingId()).toBeNull()
    expect(engine.getTree().children).toEqual([])
    expect(harness.destroy).toHaveBeenCalledTimes(2)
    canvas.destroy()
    container.remove()
  })

  it('start／focus／getValue／destroy 例外會復原畫布並回報', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const errors: unknown[] = []
    const startError = new Error('start failed')
    const startAdapter: RichTextAdapter = {
      resolver: {
        supports: (node) => node.type === 'rich-text',
        read: (node) => node.content ?? '',
      },
      start: () => {
        throw startError
      },
    }
    const canvas = createCanvas(engine, container, {
      richText: startAdapter,
      onEditingError: (error) => errors.push(error),
    })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    canvas.startEditing('rt1')
    expect(errors).toEqual([startError])
    expect(canvas.getEditingId()).toBeNull()
    expect(canvas.iframe.style.pointerEvents).toBe('none')
    canvas.destroy()
    container.remove()

    const focusEngine = createEngine({ doc: docWithRichText })
    const focusContainer = document.createElement('div')
    document.body.appendChild(focusContainer)
    const focusError = new Error('focus failed')
    const focusDestroy = vi.fn()
    const focusCanvas = createCanvas(focusEngine, focusContainer, {
      richText: {
        resolver: startAdapter.resolver,
        start: () => ({
          focus: () => {
            throw focusError
          },
          getValue: () => '<p>unused</p>',
          destroy: focusDestroy,
        }),
      },
      onEditingError: (error) => errors.push(error),
    })
    await waitIframeLoad(focusCanvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    focusCanvas.startEditing('rt1')
    expect(errors).toEqual([startError, focusError])
    expect(focusDestroy).toHaveBeenCalledOnce()
    expect(focusCanvas.getEditingId()).toBeNull()
    expect(focusCanvas.iframe.style.pointerEvents).toBe('none')
    focusCanvas.destroy()
    focusContainer.remove()

    const nextEngine = createEngine({ doc: docWithRichText })
    const nextContainer = document.createElement('div')
    document.body.appendChild(nextContainer)
    const getValueError = new Error('getValue failed')
    const destroyError = new Error('destroy failed')
    const destroy = vi.fn(() => {
      throw destroyError
    })
    const nextCanvas = createCanvas(nextEngine, nextContainer, {
      richText: {
        resolver: startAdapter.resolver,
        start: () => ({
          focus: () => {},
          getValue: () => {
            throw getValueError
          },
          destroy,
        }),
      },
      onEditingError: (error) => errors.push(error),
    })
    await waitIframeLoad(nextCanvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))

    nextCanvas.startEditing('rt1')
    nextCanvas.commitEditing()
    expect(errors).toEqual([startError, focusError, getValueError, destroyError])
    expect(destroy).toHaveBeenCalledOnce()
    expect(nextEngine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')
    expect(nextCanvas.getEditingId()).toBeNull()
    nextCanvas.destroy()
    nextContainer.remove()
  })
})
