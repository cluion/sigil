import { describe, it, expect, vi } from 'vitest'
import type { ProjectStore, SigilDoc, TemplateDef } from '@cluion/sigil-core'
import { createEditor, defineCommand, type RichTextAdapter } from '../src/index.js'
import { defineShortcode } from '@cluion/sigil-shortcode'

const richTextAdapter: RichTextAdapter = {
  resolver: {
    supports: (node) => node.type === 'rich-text',
    read: (node) => node.content ?? '',
  },
  start: () => ({
    focus: () => {},
    getValue: () => '',
    destroy: () => {},
  }),
}

function sanitizeRichText(input: string): string {
  return input.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
}

describe('editor — toHTML', () => {
  it('richText 缺少 sanitizer 時 fail fast', () => {
    const mount = document.createElement('div')
    expect(() => createEditor({ mount, richText: richTextAdapter })).toThrow(
      'createEditor：richText 必須搭配 sanitize',
    )
    expect(mount.childNodes).toHaveLength(0)
  })

  it('richText 對稱接到 Canvas、Props 與 static／hydrated 輸出', async () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'rt',
              type: 'rich-text',
              content: '<p><em>Editor</em><script>bad()</script></p>',
            },
          ],
        },
      },
      richText: richTextAdapter,
      sanitize: sanitizeRichText,
    })

    const iframe = mount.querySelector('iframe') as HTMLIFrameElement
    await vi.waitFor(() => {
      const rich = iframe.contentDocument?.querySelector('[data-sigil-id="rt"]')
      expect(rich?.querySelector('em')?.textContent).toBe('Editor')
      expect(rich?.querySelector('script')).toBeNull()
    })

    editor.engine.select('rt')
    expect(mount.querySelector('.sigil-rich-text-summary')?.textContent).toContain('Editor')
    expect(mount.querySelector('.sigil-rich-text-hint')?.textContent).toBe(
      'Edit rich text on the canvas',
    )
    expect(mount.querySelector('.sigil-rich-text-field input')).toBeNull()

    expect(editor.toHTML()).toContain('<em>Editor</em>')
    expect(editor.toHTML()).not.toContain('<script')
    expect(editor.toHTML('hydrated')).toContain('<em>Editor</em>')

    editor.destroy()
    mount.remove()
  })

  it('範本載入失敗顯示英文 retry，重試後恢復項目', async () => {
    const value: TemplateDef = {
      id: 'hero',
      label: 'Hero',
      node: { id: 'hero-node', type: 'section', children: [] },
    }
    let attempts = 0
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      locale: 'en',
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
      templates: {
        list: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('load failed')
          return [value]
        },
        save: vi.fn(),
      },
    })

    await vi.waitFor(() =>
      expect(el.querySelector('.sigil-blocks-status')?.textContent).toContain(
        'Failed to load templates',
      ),
    )
    const retry = el.querySelector('.sigil-blocks-retry') as HTMLButtonElement
    expect(retry.textContent).toBe('Retry')
    retry.click()
    await vi.waitFor(() =>
      expect(el.querySelector('[aria-label="Hero Template actions"]')).toBeTruthy(),
    )
    expect(attempts).toBe(2)
    expect((el.querySelector('.sigil-blocks-status') as HTMLElement).hidden).toBe(true)

    editor.destroy()
  })

  it('英文 locale 套用 Blocks 與 Layers 主要互動字串', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      locale: 'en',
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: '' }] },
      },
      blocks: {
        Text: () => ({ id: 'new-text', type: 'text', content: '' }),
      },
    })

    const search = el.querySelector('.sigil-blocks-panel input') as HTMLInputElement
    expect(search.placeholder).toBe('Search blocks…')
    expect(search.getAttribute('aria-label')).toBe('Search blocks')
    expect(el.querySelector('.sigil-block-item')?.getAttribute('aria-label')).toBe('Insert Text')
    expect(el.querySelector('.sigil-layers-panel')?.getAttribute('aria-label')).toBe('Layers')
    const rootActions = el.querySelectorAll<HTMLButtonElement>(
      '.sigil-layer-row[data-layer-id="r"] .sigil-layer-icon-btn',
    )
    expect(rootActions[0]?.getAttribute('aria-label')).toBe('Hide')
    expect(rootActions[1]?.getAttribute('aria-label')).toBe('Lock')
    expect([...el.querySelectorAll('h4')].map((heading) => heading.textContent)).toEqual([
      'Layers',
      'Properties',
    ])
    expect(el.textContent).toContain('No node selected')

    editor.engine.select('t')
    expect(el.textContent).toContain('Content:')
    expect(el.textContent).toContain('Styles · Desktop')

    editor.destroy()
  })

  it('runtime locale 與宿主 messages override 保留 engine、device 與 history', async () => {
    const save = vi.fn()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Host template')
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      theme: 'dark',
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'before' }],
        },
      },
      blocks: { Text: () => ({ id: 'new-text', type: 'text', content: '' }) },
      templates: { list: () => [], save },
      messages: {
        en: {
          'props.title': '',
          'blocks.search_placeholder': 'Host search',
          'editor.template_name': 'Host template name',
        },
      },
    })
    const layout = el.firstElementChild
    const iframe = el.querySelector('iframe')
    const tablet = el.querySelector('[data-device="tablet"]') as HTMLButtonElement

    expect(editor.getLocale()).toBe('zh')
    editor.engine.select('t')
    editor.engine.update('t', { content: 'after' })
    tablet.click()
    const tree = editor.engine.getTree()

    editor.setLocale('en')

    expect(editor.getLocale()).toBe('en')
    expect(el.firstElementChild).toBe(layout)
    expect(el.querySelector('iframe')).toBe(iframe)
    expect(editor.engine.getTree()).toBe(tree)
    expect(editor.engine.getSelection()).toBe('t')
    expect(layout?.classList.contains('sigil-theme-dark')).toBe(true)
    expect(tablet.getAttribute('aria-pressed')).toBe('true')
    expect((el.querySelector('.sigil-blocks-panel input') as HTMLInputElement).placeholder).toBe(
      'Host search',
    )
    expect(
      [...el.querySelectorAll('h4')].slice(0, 2).map((heading) => heading.textContent),
    ).toEqual(['Layers', ''])
    expect(await editor.runCommand('save-as-template')).toBe(true)
    expect(prompt).toHaveBeenCalledWith('Host template name', 'text')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: 'Host template' }))
    expect(await editor.runCommand('undo')).toBe(true)
    expect(editor.engine.getTree().children?.[0]?.content).toBe('before')

    editor.setLocale('zh')
    expect(editor.getLocale()).toBe('zh')
    expect((el.querySelector('.sigil-blocks-panel input') as HTMLInputElement).placeholder).toBe(
      '搜尋區塊…',
    )
    expect(
      [...el.querySelectorAll('h4')].slice(0, 2).map((heading) => heading.textContent),
    ).toEqual(['圖層', '屬性'])

    prompt.mockRestore()
    editor.destroy()
  })

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
          id: 'r',
          type: 'section',
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
    // schema 顯示自訂 label
    expect(el.textContent).toContain('步進')
  })

  it('Canvas 裝置切換同步 props 樣式裝置', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', style: { padding: '16px' } },
      },
    })
    editor.engine.select('r')
    const mobile = el.querySelector('button[data-device="mobile"]') as HTMLButtonElement
    mobile.click()
    expect(el.querySelector('[data-style-device="mobile"]')).toBeTruthy()
    expect(el.textContent).toContain('未覆寫時繼承 Tablet')
    editor.destroy()
  })
})

describe('editor — ProjectStore 注入', () => {
  it('toJSON 匯出快照，save 才呼叫注入的 store.save', async () => {
    const saved: SigilDoc[] = []
    const store: ProjectStore = {
      load: () => null,
      save: (doc) => {
        saved.push(doc)
      },
    }
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'a' }] },
      },
      store,
    })
    const doc = editor.toJSON()
    expect(doc.root.children?.[0]?.content).toBe('a')
    expect(saved).toHaveLength(0)
    await editor.save()
    expect(saved).toHaveLength(1)
    expect(saved[0]!.root.id).toBe('r')
    editor.destroy()
  })

  it('主路徑：update → toJSON → toHTML', () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'old' }],
        },
      },
    })
    editor.engine.update('t', { content: 'new' })
    const json = editor.toJSON()
    expect(json.root.children?.[0]?.content).toBe('new')
    expect(editor.toHTML()).toContain('new')
    expect(editor.toHTML('hydrated')).toContain('new')
    editor.destroy()
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

describe('editor — commands / hooks', () => {
  it('中文 locale 翻譯另存範本命令與 prompt', async () => {
    const save = vi.fn()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('我的範本')
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      locale: 'zh',
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'x' }] },
      },
      templates: { list: () => [], save },
    })
    editor.engine.select('c')

    expect(await editor.runCommand('save-as-template')).toBe(true)
    expect(prompt).toHaveBeenCalledWith('範本名稱', 'text')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: '我的範本' }))

    prompt.mockRestore()
    editor.destroy()
  })

  it('runCommand undo', async () => {
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'x' }] },
      },
    })
    editor.engine.remove('c')
    expect(await editor.runCommand('undo')).toBe(true)
    expect(editor.engine.getTree().children).toHaveLength(1)
    editor.destroy()
  })

  it('自訂 command 可覆寫並觸發', async () => {
    const run = vi.fn()
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
      commands: [defineCommand({ id: 'ping', run })],
    })
    expect(await editor.runCommand('ping')).toBe(true)
    expect(run).toHaveBeenCalledOnce()
    editor.destroy()
  })

  it('hooks onSelect / beforeSave', async () => {
    const onSelect = vi.fn()
    const beforeSave = vi.fn((doc: SigilDoc) => doc)
    const saved: SigilDoc[] = []
    const store: ProjectStore = {
      load: () => null,
      save: (doc) => {
        saved.push(doc)
      },
    }
    const el = document.createElement('div')
    const editor = createEditor({
      mount: el,
      store,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'c', type: 'text', content: 'a' }] },
      },
      hooks: { onSelect, beforeSave },
    })
    editor.engine.select('c')
    expect(onSelect).toHaveBeenCalledWith('c', expect.objectContaining({ engine: editor.engine }))
    await editor.runCommand('save')
    await vi.waitFor(() => expect(beforeSave).toHaveBeenCalled())
    await vi.waitFor(() => expect(saved.length).toBeGreaterThanOrEqual(1))
    editor.destroy()
  })
})

describe('editor — 右鍵選單', () => {
  it('圖層右鍵選單執行下移', () => {
    const mount = document.createElement('div')
    const editor = createEditor({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', content: 'A' },
            { id: 'b', type: 'text', content: 'B' },
          ],
        },
      },
    })
    const row = mount.querySelector('.sigil-layer-row[data-layer-id="a"]') as HTMLElement

    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 50 }),
    )

    const moveDown = document.querySelector(
      '.sigil-context-menu [data-menu-item-id="move-down"]',
    ) as HTMLButtonElement
    expect(moveDown).toBeTruthy()
    expect(moveDown.textContent).toBe('下移')
    expect(document.querySelector('.sigil-context-menu')?.getAttribute('aria-label')).toBe(
      '節點操作',
    )
    moveDown.click()
    expect(editor.engine.getTree().children?.map((node) => node.id)).toEqual(['b', 'a'])
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    editor.destroy()
  })

  it('destroy 關閉已開啟選單', () => {
    const mount = document.createElement('div')
    const editor = createEditor({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 'a', type: 'text', content: 'A' }] },
      },
    })
    const row = mount.querySelector('.sigil-layer-row[data-layer-id="a"]') as HTMLElement
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(document.querySelector('.sigil-context-menu')).toBeTruthy()

    editor.destroy()

    expect(document.querySelector('.sigil-context-menu')).toBeNull()
  })
})
