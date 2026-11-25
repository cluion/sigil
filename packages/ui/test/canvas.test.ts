import { describe, it, expect, vi } from 'vitest'
import {
  createCommandRegistry,
  createEngine,
  createI18n,
  createTypeRegistry,
  type ComponentNode,
} from '@cluion/sigil-core'
import { createCanvas, type CanvasOptions } from '../src/canvas.js'
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

describe('畫布行內編輯操作', () => {
  async function setup(children: ComponentNode[], options: CanvasOptions = {}) {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'root', type: 'section', children } },
    })
    const host = document.createElement('div')
    const dock = document.createElement('div')
    const inspector = document.createElement('input')
    document.body.append(host, dock, inspector)
    const canvas = createCanvas(engine, host, { selectionToolbarContainer: dock, ...options })
    await waitIframeLoad(canvas.iframe)
    const frame = canvas.iframe.contentDocument!
    const element = (id: string) => frame.querySelector<HTMLElement>(`[data-sigil-id="${id}"]`)!
    const edit = dock.querySelector<HTMLButtonElement>('[aria-label="編輯文字"]')!
    const actions = dock.querySelector('.sigil-inline-edit-controls')!
    const [done, cancel] = Array.from(actions.querySelectorAll('button')) as [
      HTMLButtonElement,
      HTMLButtonElement,
    ]
    return {
      engine,
      canvas,
      element,
      frame,
      edit,
      editLeading: dock.querySelector<HTMLButtonElement>('[aria-label="編輯開頭文字"]')!,
      done,
      cancel,
      actions,
      inspector,
      cleanup() {
        canvas.destroy()
        host.remove()
        dock.remove()
        inspector.remove()
      },
    }
  }

  it('批次更新開頭文字與巢狀連結，保留連結元素、屬性及其他元件的行內草稿', async () => {
    const ui = await setup([
      {
        id: 'para',
        type: 'text',
        tagName: 'p',
        content: '現在',
        children: [
          {
            id: 'link',
            type: 'text',
            tagName: 'a',
            attributes: { href: '#signup' },
            content: '報名',
          },
        ],
      },
      { id: 'other', type: 'button', content: '回首頁' },
    ])
    try {
      const para = ui.element('para')
      const link = ui.element('link')
      ui.canvas.startEditing('other')
      const draft = ui.element('other')
      draft.textContent = '尚未套用'
      ui.engine.updateTextContents(
        new Map([
          ['para', '今天'],
          ['link', '登記'],
        ]),
      )
      expect(ui.element('para')).toBe(para)
      expect(ui.element('link')).toBe(link)
      expect(para.textContent).toBe('今天登記')
      expect(link.getAttribute('href')).toBe('#signup')
      expect(ui.element('other')).toBe(draft)
      expect(ui.canvas.getEditingId()).toBe('other')
      expect(draft.textContent).toBe('尚未套用')
      ui.engine.updateTextContents(
        new Map([
          ['other', '返回'],
          ['link', '註冊'],
        ]),
      )
      expect(ui.canvas.getEditingId()).toBeNull()
      expect(ui.element('other').localName).toBe('button')
      expect(ui.element('other').textContent).toBe('返回')
      expect(para.textContent).toBe('今天註冊')
    } finally {
      ui.cleanup()
    }
  })

  it('在單行 textbox 內修改按鈕文字，完成一次可復原，還原原生按鈕及屬性', async () => {
    const attrs = {
      type: 'button',
      'aria-label': '報名活動',
      enterkeyhint: 'go',
      role: 'button',
      contenteditable: 'false',
    }
    const ui = await setup([
      { id: 'cta', type: 'button', name: '報名', content: '報名', attributes: attrs },
    ])
    try {
      const original = ui.element('cta')
      ui.engine.select('cta')
      ui.edit.click()
      const surface = ui.element('cta')
      expect(surface.localName).toBe('span')
      expect(surface.dataset.sigilSelected).toBe('1')
      expect(surface.getAttribute('role')).toBe('textbox')
      expect(surface.getAttribute('aria-label')).toBe('報名活動')
      expect(surface.getAttribute('aria-multiline')).toBe('false')
      expect(surface.getAttribute('enterkeyhint')).toBe('done')
      surface.textContent = '登記 2'
      ui.done.click()
      expect(ui.element('cta')).toBe(original)
      expect(ui.element('cta').textContent).toBe('登記 2')
      for (const [key, value] of Object.entries(attrs))
        expect(original.getAttribute(key)).toBe(value)
      expect(document.activeElement).toBe(ui.edit)
      ui.engine.undo()
      expect(ui.element('cta').textContent).toBe('報名')
      expect(ui.engine.canUndo()).toBe(false)
      ui.edit.click()
      ui.done.click()
      expect(ui.element('cta').localName).toBe('button')
      expect(ui.engine.canUndo()).toBe(false)
    } finally {
      ui.cleanup()
    }
  })

  it('在原生按鈕前插入與排序時保留輸入焦點，完成後每一步都能個別復原', async () => {
    const ui = await setup([
      { id: 'cta', type: 'button', content: '舊文字' },
      { id: 'next', type: 'section' },
    ])
    try {
      ui.canvas.startEditing('cta')
      const draft = ui.element('cta')
      draft.textContent = '進行中'
      ui.engine.insert('root', { id: 'new', type: 'text', content: '新' }, 0)
      ui.engine.move('next', 'root', 1)
      expect(ui.frame.activeElement).toBe(draft)
      expect(ui.canvas.getEditingId()).toBe('cta')
      expect(ui.element('cta')).toBe(draft)
      const order = () =>
        Array.from(ui.element('root').children).map((el) => (el as HTMLElement).dataset.sigilId)
      expect(order()).toEqual(['new', 'next', 'cta'])
      ui.done.click()
      expect(ui.element('cta').textContent).toBe('進行中')
      ui.engine.undo()
      expect(ui.element('cta').textContent).toBe('舊文字')
      expect(order()).toEqual(['new', 'next', 'cta'])
      ui.engine.undo()
      expect(order()).toEqual(['new', 'cta', 'next'])
      ui.engine.undo()
      expect(order()).toEqual(['cta', 'next'])
      expect(ui.engine.canUndo()).toBe(false)
    } finally {
      ui.cleanup()
    }
  })

  it('帶 href 的葉連結可編輯，取消與失焦各自保留目標、屬性和焦點', async () => {
    const attrs = { href: '/report', target: '_blank', role: 'link', 'aria-multiline': 'true' }
    const ui = await setup([
      {
        id: 'link',
        type: 'section',
        tagName: 'a',
        name: '活動連結',
        content: '閱讀',
        attributes: attrs,
      },
    ])
    try {
      ui.engine.select('link')
      ui.edit.click()
      const input = ui.element('link')
      expect(input.getAttribute('aria-label')).toBe('活動連結')
      input.textContent = '草稿'
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )
      expect(document.activeElement).toBe(ui.done)
      input.dispatchEvent(new Event('blur'))
      ui.cancel.focus()
      await new Promise((r) => setTimeout(r, 5))
      expect(ui.canvas.getEditingId()).toBe('link')
      ui.cancel.click()
      expect(document.activeElement).toBe(ui.edit)
      expect(ui.engine.canUndo()).toBe(false)
      expect(ui.element('link').textContent).toBe('閱讀')
      expect(ui.element('link').hasAttribute('aria-label')).toBe(false)
      for (const [key, value] of Object.entries(attrs))
        expect(ui.element('link').getAttribute(key)).toBe(value)
      ui.edit.click()
      ui.element('link').textContent = '新活動'
      ui.inspector.focus()
      ui.element('link').dispatchEvent(new Event('blur'))
      await vi.waitFor(() => expect(ui.canvas.getEditingId()).toBeNull())
      expect(ui.engine.getTree().children?.[0]?.content).toBe('新活動')
      expect(document.activeElement).toBe(ui.inspector)
    } finally {
      ui.cleanup()
    }
  })

  it('組字期間保留草稿並暫停完成及取消，再選其他元件會保留新的選取', async () => {
    const ui = await setup([
      { id: 'label', type: 'text', content: '舊' },
      { id: 'other', type: 'section' },
    ])
    try {
      ui.engine.select('label')
      ui.edit.click()
      const input = ui.element('label')
      input.dispatchEvent(new Event('compositionstart'))
      input.textContent = '新'
      expect(ui.done.disabled).toBe(true)
      expect(ui.cancel.disabled).toBe(true)
      ui.cancel.click()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(ui.canvas.getEditingId()).toBe('label')
      expect(() => ui.canvas.commitEditing({ forSave: true })).toThrow()
      input.dispatchEvent(new Event('compositionend'))
      expect(ui.done.disabled).toBe(false)
      ui.engine.select('other')
      expect(ui.canvas.getEditingId()).toBeNull()
      expect(ui.engine.getSelection()).toBe('other')
      expect(ui.engine.getTree().children?.[0]?.content).toBe('新')
    } finally {
      ui.cleanup()
    }
  })

  it('overlay 上快速點選兩個不同元件只切換選取，連點同一元件才開始編輯', async () => {
    const ui = await setup([
      { id: 'first', type: 'text', content: '一' },
      { id: 'second', type: 'text', content: '二' },
    ])
    try {
      const overlay =
        ui.canvas.iframe.parentElement!.querySelector<HTMLElement>('.sigil-canvas-overlay')!
      const hit = vi.spyOn(ui.frame, 'elementFromPoint')
      function click(id: string, detail: number) {
        hit.mockReturnValue(ui.element(id))
        overlay.dispatchEvent(new MouseEvent('click', { detail }))
      }
      click('first', 1)
      click('second', 2)
      overlay.dispatchEvent(new MouseEvent('dblclick', { detail: 2 }))
      expect(ui.engine.getSelection()).toBe('second')
      expect(ui.canvas.getEditingId()).toBeNull()
      click('second', 1)
      click('second', 2)
      overlay.dispatchEvent(new MouseEvent('dblclick', { detail: 2 }))
      expect(ui.canvas.getEditingId()).toBe('second')
    } finally {
      ui.cleanup()
    }
  })

  it('不得覆寫子元件、宿主管理內容或 registry 對應的 void 標籤', async () => {
    const children: ComponentNode[] = [
      { id: 'mixed', type: 'button', children: [{ id: 'child', type: 'text', content: '保留' }] },
      { id: 'managed', type: 'button', shortcode: { name: 'cta', props: {} } },
      { id: 'void', type: 'text' },
      { id: 'rich', type: 'button' },
      { id: 'leaf', type: 'button', content: '原文' },
    ]
    const ui = await setup(children, {
      rendererOptions: {
        registry: createTypeRegistry({ text: { tagName: 'input' } }),
        richTextResolver: { supports: (node) => node.id === 'rich', read: () => '<b>Rich</b>' },
      },
    })
    try {
      for (const id of ['mixed', 'managed', 'void', 'rich']) {
        ui.engine.select(id)
        expect(ui.edit.hidden).toBe(true)
        expect(ui.editLeading.hidden).toBe(true)
        ui.canvas.startEditing(id)
        expect(ui.canvas.getEditingId()).toBeNull()
      }
      ui.canvas.startEditing('leaf')
      ui.element('leaf').textContent = '草稿'
      ui.engine.insert('leaf', { id: 'inserted', type: 'section', content: '新子元件' })
      expect(ui.canvas.getEditingId()).toBeNull()
      expect(ui.element('leaf').contains(ui.element('inserted'))).toBe(true)
      expect(ui.engine.getTree().children?.at(-1)?.content).toBe('原文')
    } finally {
      ui.cleanup()
    }
  })

  it('混合文字、按鈕與連結可開啟開頭文字欄位，雙擊仍編輯命中的子元件', async () => {
    const onEditLeadingText = vi.fn()
    const nodes: ComponentNode[] = [
      { id: 'text', type: 'text', content: '開頭' },
      { id: 'button', type: 'button' },
      { id: 'anchor', type: 'custom', tagName: 'A' },
    ].map((node) => ({
      ...node,
      children: [{ id: node.id + '-child', type: 'text', content: '孩子' }],
    }))
    const ui = await setup(nodes, { onEditLeadingText, onEditLink: vi.fn() })
    const action = ui.editLeading
    try {
      for (const node of nodes) {
        ui.engine.select(node.id)
        expect(ui.edit.hidden).toBe(true)
        expect(action.hidden).toBe(false)
        expect(action.hasAttribute('data-primary-action')).toBe(true)
        action.click()
        expect(onEditLeadingText).toHaveBeenLastCalledWith(node.id, action)
        expect(ui.canvas.getEditingId()).toBeNull()
      }
      const host = ui.canvas.iframe.parentElement!
      const overlay = host.querySelector<HTMLElement>('.sigil-canvas-overlay')!
      const hit = vi.spyOn(ui.frame, 'elementFromPoint').mockReturnValue(ui.element('text'))
      overlay.dispatchEvent(new MouseEvent('dblclick'))
      expect(ui.canvas.getEditingId()).toBeNull()
      hit.mockReturnValue(ui.element('text-child'))
      overlay.dispatchEvent(new MouseEvent('dblclick'))
      expect(ui.canvas.getEditingId()).toBe('text-child')
      ui.canvas.cancelEditing()
      expect(onEditLeadingText).toHaveBeenCalledTimes(3)
      expect(ui.engine.getTree().children).toEqual(nodes)
    } finally {
      ui.cleanup()
    }
  })

  it('開頭文字入口依子元件與鎖定即時更新，並略過 shortcode、原生空標籤與富文字', async () => {
    const onEditLeadingText = vi.fn()
    const managed: ComponentNode[] = [
      { id: 'short', type: 'text', shortcode: { name: 'managed', props: {} } },
      { id: 'image', type: 'button', tagName: 'IMG' },
      { id: 'rich', type: 'rich-text' },
      { id: 'rendered', type: 'button' },
      { id: 'container', type: 'section' },
    ]
    const ui = await setup(
      [
        { id: 'line', type: 'text' },
        ...managed.map((node) => ({
          ...node,
          children: [{ id: node.id + '-child', type: 'text' }],
        })),
      ],
      {
        onEditLeadingText,
        richText: richTextHarness().adapter,
        rendererOptions: {
          richTextResolver: {
            supports: (node) => node.id === 'rendered',
            read: () => '由宿主管理',
          },
        },
      },
    )
    const action = ui.editLeading
    try {
      for (const node of managed) {
        ui.engine.select(node.id)
        expect(action.hidden).toBe(true)
        action.click()
      }
      ui.engine.select('line')
      expect(action.hidden).toBe(true)
      ui.engine.insert('line', { id: 'child', type: 'text' })
      expect(action.hidden).toBe(false)
      ui.engine.update('line', { locked: true })
      expect(action.disabled).toBe(true)
      action.click()
      ui.engine.update('line', { locked: false })
      expect(action.disabled).toBe(false)
      ui.engine.remove('child')
      expect(action.hidden).toBe(true)
      expect(ui.edit.hidden).toBe(false)
      expect(onEditLeadingText).not.toHaveBeenCalled()
    } finally {
      ui.cleanup()
    }
  })

  it('富文字明確完成或 adapter 請求讀取失敗，保留 session 直到重試', async () => {
    const rich = richTextHarness()
    const onEditingError = vi.fn()
    const ui = await setup(docWithRichText.root.children, {
      richText: rich.adapter,
      onEditingError,
    })
    try {
      ui.engine.select('rt1')
      ui.edit.click()
      rich.getValue.mockImplementationOnce(() => {
        throw Error('adapter read')
      })
      rich.getContext()!.requestCommit()
      expect(ui.canvas.getEditingId()).toBe('rt1')
      expect(ui.actions.querySelector('[role=status]')?.textContent).toContain('草稿已保留')
      expect(rich.destroy).not.toHaveBeenCalled()
      expect(onEditingError).toHaveBeenCalledOnce()
      ui.done.click()
      expect(ui.canvas.getEditingId()).toBeNull()
      expect(ui.engine.getTree().children?.[0]?.content).toBe('<p><em>next</em></p>')
      expect(document.activeElement).toBe(ui.edit)
      expect(rich.destroy).toHaveBeenCalledOnce()
    } finally {
      ui.cleanup()
    }
  })
})

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

  it('宿主收到工具列與 API 的實際模式變更時，畫布已套用新模式', () => {
    const container = document.createElement('div')
    const changes: string[] = []
    const canvas = createCanvas(createEngine({ doc }), container, {
      onModeChange(mode) {
        changes.push(`${mode}/${canvas.iframe.style.pointerEvents}`)
      },
    })
    const toggle = container.querySelector<HTMLButtonElement>('.sigil-canvas-mode-btn')!
    canvas.setMode('edit')
    toggle.click()
    canvas.setMode('preview')
    canvas.setMode('edit')
    expect(changes).toEqual(['preview/auto', 'edit/none'])
    canvas.destroy()
  })

  it('每次進入預覽都從巢狀問答的文件設定開始，讀者開闔不改動文件', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'closed',
          type: 'container',
          tagName: 'details',
          children: [
            { id: 'question', type: 'text', tagName: 'summary', content: '外層問題' },
            {
              id: 'open',
              type: 'container',
              tagName: 'details',
              attributes: { open: '' },
              children: [
                { id: 'nested-question', type: 'text', tagName: 'summary', content: '內層問題' },
                { id: 'answer', type: 'text', content: '內層答案' },
              ],
            },
          ],
        },
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const dirty = vi.fn()
    const canvas = createCanvas(engine, container, { onEditingDirtyChange: dirty })
    try {
      await waitIframeLoad(canvas.iframe)
      const frame = canvas.iframe.contentDocument!
      const closed = frame.querySelector('details[data-sigil-id="closed"]')!
      const open = frame.querySelector('details[data-sigil-id="open"]')!
      const unmanaged = frame.createElement('details')
      open.append(unmanaged)
      const tree = engine.getTree()

      canvas.startEditing('answer')
      expect(canvas.getEditingId()).toBe('answer')
      canvas.setMode('preview')
      expect(closed.hasAttribute('open')).toBe(false)
      expect(open.hasAttribute('open')).toBe(true)
      closed.setAttribute('open', '')
      open.removeAttribute('open')
      unmanaged.setAttribute('open', '')
      canvas.setMode('preview')
      expect(closed.hasAttribute('open')).toBe(true)
      expect(open.hasAttribute('open')).toBe(false)

      canvas.setMode('edit')
      canvas.setMode('preview')
      expect(closed.hasAttribute('open')).toBe(false)
      expect(open.hasAttribute('open')).toBe(true)
      expect(unmanaged.hasAttribute('open')).toBe(true)
      expect(engine.getTree()).toBe(tree)
      expect(engine.canUndo()).toBe(false)
      expect(dirty).not.toHaveBeenCalled()
    } finally {
      canvas.destroy()
      container.remove()
    }
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
    { attribute: 'id', detail: 1, target: '_self' },
    { attribute: 'name', detail: 0, target: '_self' },
    { attribute: 'id', detail: 0, target: '_blank' },
  ])(
    'scrolls to decoded $attribute on pointer or keyboard activation',
    async ({ attribute, detail, target }) => {
      const h = await harness()
      h.destination.removeAttribute('id')
      h.destination.setAttribute(attribute, '活動資訊')
      h.link.setAttribute('href', `#${encodeURIComponent('活動資訊')}`)
      h.link.setAttribute('target', target)

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

  it('reveals linked content in closed disclosures, keeping links to their summary collapsed', async () => {
    const h = await harness()
    const group = h.frame.createElement('details')
    const question = h.frame.createElement('details')
    const summary = h.frame.createElement('summary')
    const answer = h.frame.createElement('button')
    summary.id = 'question'
    answer.id = 'answer'
    h.frame.body.append(group)
    group.append(question)
    question.append(summary, answer)
    h.link.setAttribute('href', '#question')
    h.click()
    expect(group.open).toBe(true)
    expect(question.open).toBe(false)
    h.link.setAttribute('href', '#answer')
    h.click()
    expect(question.open).toBe(true)
    expect(h.frame.activeElement).toBe(answer)
    h.destroy()
  })

  it('preview prefers a literal anchor and recognizes the page top after lookup', async () => {
    const h = await harness()
    const literal = h.frame.createElement('section')
    literal.id = 'a%2Fb'
    h.destination.id = 'a/b'
    h.frame.body.append(literal)
    const scrollLiteral = vi.spyOn(literal, 'scrollIntoView').mockImplementation(() => {})
    h.link.setAttribute('href', '#a%2Fb:~:text=example')
    h.click()
    expect(scrollLiteral).toHaveBeenCalledOnce()
    expect(h.scroll).not.toHaveBeenCalled()
    h.link.setAttribute('href', '#Top')
    h.click()
    expect(h.scrollTop).toHaveBeenCalledExactlyOnceWith(0, 0)
    literal.id = 'Top'
    h.click()
    expect(scrollLiteral).toHaveBeenCalledTimes(2)
    expect(h.scrollTop).toHaveBeenCalledOnce()
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
    { name: 'external URL in a new tab', href: 'https://example.test/', target: '_blank' },
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
  it('從沒有 slot 的 shortcode 移出子項時補回畫布，移回時再次隱藏', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'host',
              type: 'shortcode',
              shortcode: { name: 'custom', props: {} },
              children: [{ id: 'child', type: 'text', content: '正文' }],
            },
          ],
        },
      },
    })
    const mount = document.createElement('div')
    document.body.append(mount)
    const canvas = createCanvas(engine, mount)
    try {
      await waitIframeLoad(canvas.iframe)
      const frame = canvas.iframe.contentDocument!
      expect(frame.querySelector('[data-sigil-id="child"]')).toBeNull()
      engine.move('child', 'r', 0)
      expect(frame.querySelector('[data-sigil-id="r"] > :first-child')?.textContent).toBe('正文')
      engine.move('child', 'host')
      expect(frame.querySelector('[data-sigil-id="child"]')).toBeNull()
      engine.undo()
      expect(frame.querySelector('[data-sigil-id="r"] > :first-child')?.textContent).toBe('正文')
    } finally {
      canvas.destroy()
      mount.remove()
    }
  })

  it('預覽與卸載會關閉移動對話框並保留原狀', async () => {
    const engine = createEngine({ doc: docWithText })
    const mount = document.createElement('div')
    document.body.append(mount)
    const canvas = createCanvas(engine, mount)
    try {
      await waitIframeLoad(canvas.iframe)
      engine.select('t1')
      expect(canvas.canMoveSelection?.()).toBe(true)
      canvas.moveSelection?.()
      expect(document.querySelector('.sigil-move-dialog[open]')).toBeTruthy()
      canvas.setMode('preview')
      expect(document.querySelector('.sigil-move-dialog')).toBeNull()
      expect(canvas.canMoveSelection?.()).toBe(false)
      canvas.moveSelection?.()
      expect(document.querySelector('.sigil-move-dialog')).toBeNull()
      canvas.setMode('edit')
      canvas.moveSelection?.()
      expect(document.querySelector('.sigil-move-dialog[open]')).toBeTruthy()
    } finally {
      canvas.destroy()
      mount.remove()
    }
    expect(document.querySelector('.sigil-move-dialog')).toBeNull()
    expect(engine.canUndo()).toBe(false)
  })

  it('文字排版捷徑會交付選取來源，鎖定的文字與預覽不會觸發編輯', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.append(container)
    const edit = vi.fn()
    const canvas = createCanvas(engine, container, { onEditTypography: edit })
    try {
      await waitIframeLoad(canvas.iframe)
      const button = container.querySelector<HTMLButtonElement>('[aria-label="調整文字排版"]')!
      engine.select('r')
      expect(button.hidden).toBe(true)
      engine.select('t1')
      expect(button.hidden).toBe(false)
      button.click()
      expect(edit).toHaveBeenCalledExactlyOnceWith('t1', button)
      expect(engine.canUndo()).toBe(false)
      engine.update('t1', { locked: true })
      expect(button.disabled).toBe(true)
      button.click()
      engine.update('t1', { locked: false })
      canvas.setMode('preview')
      button.click()
      expect(edit).toHaveBeenCalledOnce()
    } finally {
      canvas.destroy()
      container.remove()
      engine.destroy()
    }
  })

  it('提供下方插入操作、工具列方向鍵與可供還原焦點的按鈕，預覽或卸載會關閉選擇器', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.append(container)
    const close = vi.fn()
    const open = vi.fn(() => close)
    const canvas = createCanvas(engine, container, { onInsertAfter: open })
    try {
      await waitIframeLoad(canvas.iframe)
      const toolbar = container.querySelector<HTMLElement>('[role="toolbar"]')!
      const button = toolbar.querySelector<HTMLButtonElement>('[aria-label="在下方新增區塊"]')!
      const parent = toolbar.querySelector<HTMLButtonElement>('[aria-label="選取父層"]')!
      engine.select('r')
      expect(button.hidden).toBe(true)
      engine.select('t1')
      expect(button.hidden).toBe(false)
      expect(button.textContent).toBe('在下方新增區塊')
      parent.focus()
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      expect(document.activeElement).toBe(button)
      button.click()
      expect(open).toHaveBeenCalledExactlyOnceWith('t1', button)
      canvas.setMode('preview')
      expect(close).toHaveBeenCalledOnce()
      button.click()
      expect(open).toHaveBeenCalledOnce()
      canvas.setMode('edit')
      engine.update('r', { locked: true })
      expect(button.disabled).toBe(true)
      engine.update('r', { locked: false })
      engine.update('t1', { locked: true })
      expect(button.disabled).toBe(false)
      button.click()
      expect(open).toHaveBeenCalledTimes(2)
    } finally {
      canvas.destroy()
      container.remove()
    }
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('只在要求顯示視口外的選取元件時捲動畫布', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.append(container)
    const canvas = createCanvas(engine, container)
    try {
      await waitIframeLoad(canvas.iframe)
      const title = canvas.iframe.contentDocument!.querySelector('[data-sigil-id="t1"]')!
      const bounds = vi.spyOn(title, 'getBoundingClientRect')
      const scroll = vi.spyOn(canvas.iframe.contentWindow!, 'scrollBy').mockImplementation(() => {})
      for (const el of [container, canvas.iframe])
        Object.defineProperties(el, { clientWidth: { value: 400 }, clientHeight: { value: 320 } })
      Object.defineProperty(
        title.ownerDocument.scrollingElement ?? title.ownerDocument.documentElement,
        'scrollHeight',
        { value: 1200 },
      )
      bounds.mockReturnValue(new DOMRect(12, 600, 90, 40))
      engine.select('t1')
      expect(scroll).not.toHaveBeenCalled()
      expect(
        container.querySelector<HTMLButtonElement>('[aria-label="在下方新增區塊"]')!.hidden,
      ).toBe(true)
      canvas.revealSelection!()
      expect(scroll).toHaveBeenCalledExactlyOnceWith(0, 552)
      bounds.mockReturnValue(new DOMRect(12, 48, 90, 40))
      canvas.revealSelection!()
      expect(scroll).toHaveBeenCalledOnce()
    } finally {
      canvas.destroy()
      container.remove()
    }
  })

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

  it('mounts docked actions in the host slot and removes only its own controls on teardown', async () => {
    const engine = createEngine({ doc: docWithText })
    const host = document.createElement('div')
    const slot = document.createElement('aside')
    const existing = document.createElement('span')
    slot.append(existing)
    document.body.append(host, slot)
    const canvas = createCanvas(engine, host, { selectionToolbarContainer: slot })
    try {
      await waitIframeLoad(canvas.iframe)
      const bar = slot.querySelector<HTMLElement>('[role="toolbar"]')!
      expect(host.querySelector('[role="toolbar"]')).toBeNull()
      expect(bar.hidden).toBe(true)
      engine.select('t1')
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      expect(bar.hidden).toBe(false)
      bar.focus()
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      expect(document.activeElement?.getAttribute('aria-label')).toBe('刪除元件')
      canvas.startEditing('t1')
      expect(bar.hidden).toBe(true)
      canvas.cancelEditing()
      canvas.setMode('preview')
      expect(bar.hidden).toBe(true)
      expect(engine.canUndo()).toBe(false)
    } finally {
      canvas.destroy()
      expect(Array.from(slot.children)).toEqual([existing])
      slot.remove()
      host.remove()
      engine.destroy()
    }
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

  it('由宿主接管的圖片雙擊後開啟富文字編輯，非 img 元件不顯示換圖按鈕', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [
            { id: 'managed', type: 'image' },
            { id: 'custom', type: 'image', tagName: 'div' },
          ],
        },
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const { adapter, focus } = richTextHarness()
    adapter.resolver.supports = (node) => node.id === 'managed'
    const onReplaceImage = vi.fn()
    const canvas = createCanvas(engine, container, { richText: adapter, onReplaceImage })
    try {
      await waitIframeLoad(canvas.iframe)
      const doc = canvas.iframe.contentDocument!
      await vi.waitFor(() => expect(doc.querySelector('[data-sigil-id="managed"]')).toBeTruthy())
      const hit = vi.spyOn(doc, 'elementFromPoint')
      const overlay = container.querySelector<HTMLElement>('.sigil-canvas-overlay')!
      const button = container.querySelector<HTMLButtonElement>('[aria-label="更換圖片"]')!
      for (const id of ['custom', 'managed']) {
        engine.select(id)
        expect(button.hidden).toBe(true)
        hit.mockReturnValue(doc.querySelector('[data-sigil-id="' + id + '"]'))
        overlay.dispatchEvent(new MouseEvent('dblclick'))
      }
      expect(focus).toHaveBeenCalledOnce()
      expect(canvas.getEditingId()).toBe('managed')
      expect(onReplaceImage).not.toHaveBeenCalled()
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

  it('改標題格式時保留輸入中的文字與選取，預覽跟著復原、重做', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.append(container)
    const canvas = createCanvas(engine, container)
    try {
      await waitIframeLoad(canvas.iframe)
      const frame = canvas.iframe.contentDocument!
      const title = () => frame.querySelector<HTMLElement>('[data-sigil-id="t1"]')!
      canvas.startEditing('t1')
      title().textContent = '春季講座'
      engine.update('t1', { tagName: 'h2' })
      expect(canvas.getEditingId()).toBeNull()
      expect(engine.getSelection()).toBe('t1')
      expect(title().tagName).toBe('H2')
      expect(title().textContent).toBe('春季講座')
      expect(title().getAttribute('contenteditable')).toBeNull()
      expect(title().getAttribute('data-sigil-selected')).toBe('1')
      expect(engine.getTree().children?.[0]?.content).toBe('春季講座')
      canvas.setMode('preview')
      engine.update('t1', { tagName: 'h3' })
      expect(title().tagName).toBe('H3')
      engine.undo()
      expect(title().tagName).toBe('H2')
      engine.redo()
      expect(title().tagName).toBe('H3')
      expect(container.querySelector<HTMLElement>('[role="toolbar"]')?.hidden).toBe(true)
      engine.update('t1', { locked: true })
      engine.update('t1', { tagName: 'p' })
      expect(title().tagName).toBe('H3')
    } finally {
      canvas.destroy()
      container.remove()
    }
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
