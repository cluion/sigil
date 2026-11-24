import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry, createEngine, createI18n } from '@cluion/sigil-core'
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
    expect(canvas.iframe.contentDocument?.head.textContent).not.toContain('Drop components here')
    canvas.setMode('edit')
    expect(canvas.iframe.contentDocument?.head.textContent).toContain(
      'content:"Drop components here"',
    )

    canvas.destroy()
    i18n.setLocale('zh')
    expect(toggle.textContent).toBe('Edit mode')
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

describe('createCanvas — 觸控捲動', () => {
  function setup() {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const canvas = createCanvas(engine, container)
    const overlay = container.querySelector<HTMLElement>('.sigil-canvas-overlay')!
    vi.spyOn(canvas.iframe, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 350, 600))
    const win = canvas.iframe.contentWindow!
    let scrollY = 0
    vi.spyOn(win, 'scrollY', 'get').mockImplementation(() => scrollY)
    const scroll = vi
      .spyOn(win, 'scrollBy')
      .mockImplementation((options?: ScrollToOptions | number) => {
        if (typeof options === 'object')
          scrollY = Math.max(0, Math.min(400, scrollY + (options.top ?? 0)))
      })
    function touch(type: string, points: Array<[number, number]>): Event {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', {
        value: points.map(([x, y], id) => ({ identifier: id, clientX: x, clientY: y })),
      })
      overlay.dispatchEvent(event)
      return event
    }
    function destroy() {
      canvas.destroy()
      engine.destroy()
      container.remove()
    }
    return { win, scroll, touch, destroy }
  }

  it('允許輕點，單指拖動會捲動畫布，碰到外緣的新手勢可捲動宿主', () => {
    const { win, scroll, touch, destroy } = setup()
    try {
      touch('touchstart', [[60, 480]])
      expect(touch('touchmove', [[62, 479]]).defaultPrevented).toBe(false)
      expect(scroll).not.toHaveBeenCalled()
      expect(touch('touchmove', [[60, 380]]).defaultPrevented).toBe(true)
      expect(win.scrollY).toBe(100)
      expect(touch('touchmove', [[60, 50]]).defaultPrevented).toBe(true)
      expect(win.scrollY).toBe(400)
      touch('touchend', [])
      touch('touchstart', [[60, 480]])
      expect(touch('touchmove', [[60, 350]]).defaultPrevented).toBe(false)
      expect(win.scrollY).toBe(400)
    } finally {
      destroy()
    }
  })

  it('跳過畫布外、多指及已取消的手勢', () => {
    const { scroll, touch, destroy } = setup()
    try {
      touch('touchstart', [[5, 100]])
      expect(touch('touchmove', [[50, 60]]).defaultPrevented).toBe(false)
      touch('touchstart', [[60, 180]])
      expect(
        touch('touchmove', [
          [60, 130],
          [120, 150],
        ]).defaultPrevented,
      ).toBe(false)
      expect(touch('touchmove', [[60, 100]]).defaultPrevented).toBe(false)
      touch('touchstart', [[60, 250]])
      touch('touchcancel', [])
      expect(touch('touchmove', [[60, 120]]).defaultPrevented).toBe(false)
      expect(scroll).not.toHaveBeenCalled()
    } finally {
      destroy()
    }
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
  it('獨立畫布採用宿主提供的命令條件，編輯或離開視口時隱藏工具列', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const duplicate = vi.fn()
    const canDuplicate = vi.fn(() => false)
    const registry = createCommandRegistry([
      { id: 'duplicate', run: duplicate, when: canDuplicate },
    ])
    const canvas = createCanvas(engine, container, {
      selectionCommands: {
        registry,
        context: () => ({
          engine,
          getDoc: () => engine.toJSON(),
          clipboard: { get: () => null, set: () => {} },
        }),
      },
    })
    await waitIframeLoad(canvas.iframe)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const frame = canvas.iframe.contentDocument!
    const title = frame.querySelector('[data-sigil-id="t1"]')!
    const bounds = vi
      .spyOn(title, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(25, 60, 90, 20))
    for (const el of [container, canvas.iframe]) {
      Object.defineProperties(el, { clientWidth: { value: 400 }, clientHeight: { value: 320 } })
    }
    const toolbar = container.querySelector<HTMLElement>('[role="toolbar"]')!
    const button = toolbar.querySelector<HTMLButtonElement>('[aria-label="複製元件"]')!
    const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    engine.select('t1')
    await paint()
    expect(toolbar.hidden).toBe(false)
    expect(button.disabled).toBe(true)
    button.click()
    expect(duplicate).not.toHaveBeenCalled()
    canDuplicate.mockReturnValue(true)
    engine.select('t1')
    button.click()
    expect(duplicate).toHaveBeenCalledOnce()
    bounds.mockReturnValue(new DOMRect(25, -90, 90, 20))
    frame.dispatchEvent(new Event('scroll'))
    await paint()
    expect(toolbar.hidden).toBe(true)
    bounds.mockReturnValue(new DOMRect(25, 60, 90, 20))
    frame.dispatchEvent(new Event('scroll'))
    await paint()
    expect(toolbar.hidden).toBe(false)
    canvas.startEditing('t1')
    expect(toolbar.hidden).toBe(true)
    canvas.commitEditing()
    await paint()
    expect(toolbar.hidden).toBe(false)
    canvas.setMode('preview')
    expect(toolbar.hidden).toBe(true)
    canvas.destroy()
    expect(toolbar.isConnected).toBe(false)
    container.remove()
  })

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
    const badge = container.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('text')
    engine.update('t1', { name: '標題' })
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect(badge.textContent).toBe('標題')
    destroy()
    container.remove()
  })

  it('選取 image 顯示名稱，工具列位於文件之外', async () => {
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
    const badge = container.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge.textContent).toBe('image')
    expect(container.querySelector<HTMLButtonElement>('[aria-label="更換圖片"]')!.hidden).toBe(true)
    destroy()
    container.remove()
  })

  it('雙擊圖片與畫布按鈕共用換圖操作，鎖定或預覽時不得操作', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'root', type: 'section', children: [{ id: 'photo', type: 'image' }] },
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const close = vi.fn()
    const open = vi.fn(() => close)
    const canvas = createCanvas(engine, container, { onReplaceImage: open })
    try {
      const frame = canvas.iframe
      await waitIframeLoad(frame)
      await vi.waitFor(() => expect(frame.contentDocument?.querySelector('img')).toBeTruthy())
      const doc = frame.contentDocument!
      vi.spyOn(doc, 'elementFromPoint').mockReturnValue(doc.querySelector('img'))
      const overlay = container.querySelector<HTMLElement>('.sigil-canvas-overlay')!
      const button = container.querySelector<HTMLButtonElement>('[aria-label="更換圖片"]')!
      overlay.dispatchEvent(new MouseEvent('dblclick'))
      expect(engine.getSelection()).toBe('photo')
      expect(open).toHaveBeenCalledExactlyOnceWith('photo', button)
      engine.update('photo', { locked: true })
      expect(close).toHaveBeenCalledOnce()
      expect(button.disabled).toBe(true)
      overlay.dispatchEvent(new MouseEvent('dblclick'))
      expect(open).toHaveBeenCalledTimes(1)

      engine.update('photo', { locked: false })
      button.click()
      expect(open).toHaveBeenCalledTimes(2)
      canvas.setMode('preview')
      expect(close).toHaveBeenCalledTimes(2)
      overlay.dispatchEvent(new MouseEvent('dblclick'))
      button.click()
      expect(open).toHaveBeenCalledTimes(2)
      canvas.setMode('edit')
      engine.select('root')
      expect(button.hidden).toBe(true)
    } finally {
      canvas.destroy()
      container.remove()
    }
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
    expect(container.querySelector<HTMLElement>('[role="toolbar"]')?.hidden).toBe(true)
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
  it('locked content cannot be edited and locking an active node discards its draft', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.append(container)
    const dirty = vi.fn()
    const canvas = createCanvas(engine, container, { onEditingDirtyChange: dirty })
    try {
      await waitIframeLoad(canvas.iframe)
      canvas.startEditing('t1')
      const frame = canvas.iframe.contentDocument!
      const title = frame.querySelector<HTMLElement>('[data-sigil-id="t1"]')!
      title.textContent = 'temporary'
      title.dispatchEvent(new Event('input', { bubbles: true }))
      expect(dirty).toHaveBeenLastCalledWith(true)
      engine.update('t1', { locked: true })
      expect(dirty).toHaveBeenLastCalledWith(false)
      canvas.startEditing('t1')
      expect(canvas.getEditingId()).toBeNull()
      expect(frame.querySelector('[data-sigil-id="t1"]')?.textContent).toBe('hello')
      expect(engine.getTree().children?.[0]?.content).toBe('hello')
    } finally {
      canvas.destroy()
      container.remove()
    }
  })

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
    expect(iframe.contentDocument?.querySelector('[data-sigil-id="t1"]')?.textContent).toBe('hello')
    destroy()
    container.remove()
  })

  it('組字時保留選字鍵；一般 Enter 提交，Escape 還原畫布與模型', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const canvas = createCanvas(engine, container)
    await waitIframeLoad(canvas.iframe)
    const frame = canvas.iframe.contentDocument!
    const title = () => frame.querySelector<HTMLElement>('[data-sigil-id="t1"]')!
    canvas.startEditing('t1')
    title().textContent = '春季'
    for (const options of [
      { key: 'Enter', isComposing: true },
      { key: 'Escape', isComposing: true },
      { key: 'Enter', keyCode: 229 },
    ]) {
      const key = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true })
      expect(title().dispatchEvent(key)).toBe(true)
      expect(canvas.getEditingId()).toBe('t1')
      expect(engine.getTree().children?.[0]?.content).toBe('hello')
    }
    title().textContent = '春季活動'
    title().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(canvas.getEditingId()).toBeNull()
    expect(engine.getTree().children?.[0]?.content).toBe('春季活動')
    canvas.startEditing('t1')
    title().textContent = '未送出的文字'
    title().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(canvas.getEditingId()).toBeNull()
    expect(title().textContent).toBe('春季活動')
    expect(engine.getTree().children?.[0]?.content).toBe('春季活動')
    engine.undo()
    expect(title().textContent).toBe('hello')
    canvas.destroy()
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
    element.textContent = '尚在選字'
    for (const options of [{ isComposing: true }, { keyCode: 229 }]) {
      const candidateKey = new KeyboardEvent('keydown', {
        key: 'Escape',
        ...options,
        bubbles: true,
        cancelable: true,
      })
      expect(element.dispatchEvent(candidateKey)).toBe(true)
      expect(canvas.getEditingId()).toBe('rt1')
      expect(harness.destroy).not.toHaveBeenCalled()
    }
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(canvas.getEditingId()).toBeNull()
    expect(engine.getTree().children?.[0]?.content).toBe('<p><strong>hello</strong></p>')
    expect(canvas.iframe.contentDocument?.activeElement?.getAttribute('data-sigil-id')).toBe('rt1')
    expect(canvas.iframe.contentDocument?.activeElement?.textContent).toBe(
      '<p><strong>hello</strong></p>',
    )

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

  it('protects rich drafts from normalization and read failures, then retries in one undo step', async () => {
    const engine = createEngine({ doc: docWithRichText })
    const container = document.createElement('div')
    document.body.append(container)
    const harness = richTextHarness()
    const normalized = '<p>normalized</p>'
    harness.setValue(normalized)
    const dirty = vi.fn()
    const canvas = createCanvas(engine, container, {
      richText: harness.adapter,
      onEditingDirtyChange: dirty,
    })
    try {
      await waitIframeLoad(canvas.iframe)
      canvas.startEditing('rt1')
      canvas.commitEditing({ forSave: true })
      expect(engine.canUndo()).toBe(false)
      canvas.startEditing('rt1')
      const element = harness.getContext()!.element
      const next = '<p><em>草稿</em></p>'
      harness.setValue(next)
      element.append(element.ownerDocument.createElement('em'))
      await vi.waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true))
      expect(engine.canUndo()).toBe(false)
      const error = new Error('Editor snapshot unavailable')
      harness.getValue.mockImplementationOnce(() => {
        throw error
      })
      expect(() => canvas.commitEditing({ forSave: true })).toThrow(error)
      expect(canvas.getEditingId()).toBe('rt1')
      expect(harness.destroy).toHaveBeenCalledTimes(1)
      expect(engine.canUndo()).toBe(false)
      element.dispatchEvent(new Event('compositionstart', { bubbles: true }))
      expect(() => canvas.commitEditing({ forSave: true })).toThrow()
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
      expect(element.dispatchEvent(escape)).toBe(true)
      element.dispatchEvent(new Event('compositionend', { bubbles: true }))
      canvas.commitEditing({ forSave: true })
      expect(dirty).toHaveBeenLastCalledWith(false)
      expect(engine.getTree().children?.[0]?.content).toBe(next)
      engine.undo()
      expect(engine.toJSON()).toEqual(docWithRichText)
      expect(engine.canUndo()).toBe(false)
    } finally {
      canvas.destroy()
      container.remove()
    }
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
