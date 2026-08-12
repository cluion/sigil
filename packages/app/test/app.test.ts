import { describe, it, expect, vi } from 'vitest'
import { createApp, defineCommand, type RichTextAdapter } from '../src/index.js'
import { defineShortcode } from '@cluion/sigil-shortcode'
import type { ProjectStore, SigilDoc, TemplateDef } from '@cluion/sigil-core'

function emptyDoc(): SigilDoc {
  return {
    version: 1,
    root: { id: 'r', type: 'section', children: [] },
  }
}

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
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+=(['"])[\s\S]*?\1/gi, '')
    .replace(/javascript:/gi, '')
}

describe('createApp', () => {
  it('richText 缺少 sanitizer 時 fail fast', () => {
    const mount = document.createElement('div')
    expect(() => createApp({ mount, richText: richTextAdapter })).toThrow(
      'createApp：richText 必須搭配 sanitize',
    )
    expect(mount.childNodes).toHaveLength(0)
  })

  it('richText 對稱接到 Canvas、Inspector、copy/paste 與 HTML 輸出', async () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'rt',
              type: 'rich-text',
              content:
                '<p onclick="evil()"><strong>Hello</strong><script>bad()</script><a href="javascript:evil()">link</a></p>',
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
      expect(rich?.querySelector('strong')?.textContent).toBe('Hello')
      expect(rich?.querySelector('script')).toBeNull()
      expect(rich?.getAttribute('onclick')).toBeNull()
    })

    app.engine.select('rt')
    expect(mount.querySelector('.sigil-rich-text-summary')?.textContent).toContain('Hello')
    expect(mount.querySelector('.sigil-rich-text-hint')?.textContent).toBe('請在畫布編輯富文字')
    expect(mount.querySelector('.sigil-inspector input')).toBeNull()

    await app.runCommand('copy')
    await app.runCommand('paste')
    expect(app.engine.getTree().children).toHaveLength(2)
    expect(app.engine.getTree().children?.[1]?.content).toBe(
      app.engine.getTree().children?.[0]?.content,
    )

    for (const html of [app.toHTML(), app.toHTML('hydrated')]) {
      expect(html).toContain('<strong>Hello</strong>')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('onclick')
      expect(html).not.toContain('javascript:')
    }

    ;(mount.querySelector('button[data-command-id="export"]') as HTMLButtonElement).click()
    const exported = document.querySelector('.sigil-export-out') as HTMLTextAreaElement
    expect(exported.value).toContain('<strong>Hello</strong>')
    expect(exported.value).not.toContain('<script')
    ;(document.querySelector('.sigil-dialog-head button') as HTMLButtonElement).click()

    app.destroy()
    mount.remove()
  })

  it('範本可重命名與刪除，reload 保留搜尋字串', async () => {
    let templates: TemplateDef[] = [
      {
        id: 'hero',
        label: 'Hero',
        node: { id: 'hero-node', type: 'section', children: [] },
      },
    ]
    const save = vi.fn((next: TemplateDef) => {
      templates = templates.map((value) => (value.id === next.id ? next : value))
    })
    const remove = vi.fn((id: string) => {
      templates = templates.filter((value) => value.id !== id)
    })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Hero 新版')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: emptyDoc(),
      blocks: { Text: () => ({ id: 'text', type: 'text', content: '' }) },
      templates: { list: () => templates, save, remove },
    })

    await vi.waitFor(() =>
      expect(mount.querySelector('[aria-label="Hero 範本操作"]')).toBeInstanceOf(HTMLButtonElement),
    )
    expect(mount.querySelector('[aria-label="插入 Text"]')).toBeTruthy()
    const search = mount.querySelector('.sigil-blocks-panel input') as HTMLInputElement
    search.value = 'hero'
    search.dispatchEvent(new Event('input'))

    ;(mount.querySelector('[aria-label="Hero 範本操作"]') as HTMLButtonElement).click()
    ;(document.querySelector('[data-menu-item-id="rename"]') as HTMLButtonElement).click()
    await vi.waitFor(() =>
      expect(mount.querySelector('[aria-label="Hero 新版 範本操作"]')).toBeTruthy(),
    )
    expect(prompt).toHaveBeenCalledWith('範本名稱', 'Hero')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'hero', label: 'Hero 新版' }))
    expect(search.value).toBe('hero')

    ;(mount.querySelector('[aria-label="Hero 新版 範本操作"]') as HTMLButtonElement).click()
    ;(document.querySelector('[data-menu-item-id="remove"]') as HTMLButtonElement).click()
    await vi.waitFor(() =>
      expect(mount.querySelector('[aria-label="Hero 新版 範本操作"]')).toBeNull(),
    )
    expect(confirm).toHaveBeenCalledWith('確定刪除範本「Hero 新版」？')
    expect(remove).toHaveBeenCalledWith('hero')

    prompt.mockRestore()
    confirm.mockRestore()
    app.destroy()
  })

  it('英文 locale 套用 Blocks、Layers 與 Media 主要互動字串', async () => {
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 'image', type: 'image', attributes: { src: '' } }],
        },
      },
      blocks: {
        Text: () => ({ id: 'text', type: 'text', content: '' }),
      },
      assets: { list: () => [] },
    })

    const search = mount.querySelector('.sigil-blocks-panel input') as HTMLInputElement
    expect(search.placeholder).toBe('Search blocks…')
    expect(search.getAttribute('aria-label')).toBe('Search blocks')
    expect(mount.querySelector('.sigil-block-item')?.getAttribute('aria-label')).toBe('Insert Text')
    expect(mount.querySelector('.sigil-layers-panel')?.getAttribute('aria-label')).toBe('Layers')
    const rootActions = mount.querySelectorAll<HTMLButtonElement>(
      '.sigil-layer-row[data-layer-id="r"] .sigil-layer-icon-btn',
    )
    expect(rootActions[0]?.getAttribute('aria-label')).toBe('Hide')
    expect(rootActions[1]?.getAttribute('aria-label')).toBe('Lock')
    const help = mount.querySelector('button[data-command-id="help"]') as HTMLButtonElement
    help.click()
    expect(
      [...mount.querySelectorAll('.sigil-help-panel li')].map((item) => item.textContent),
    ).toEqual([
      'Delete / Backspace — Delete',
      'Ctrl/Cmd+Z — Undo',
      'Ctrl/Cmd+Shift+Z / Y — Redo',
      'Ctrl/Cmd+C / V — Copy / Paste',
      'Ctrl/Cmd+S — Save',
    ])
    help.click()

    app.engine.select('image')
    expect([...mount.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      'Content',
      'Style',
      'Advanced',
    ])
    expect(mount.querySelector('.sigil-inspector .sigil-field-label')?.textContent).toBe('Image')
    const pick = [...mount.querySelectorAll<HTMLButtonElement>('.sigil-inspector button')].find(
      (button) => button.textContent === 'Choose image',
    )!
    pick.click()
    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-muted')?.textContent).toBe('No media yet'),
    )
    ;(dialog.querySelector('.sigil-media-head button') as HTMLButtonElement).click()

    ;(mount.querySelector('button[data-command-id="export"]') as HTMLButtonElement).click()
    expect(mount.querySelector('.sigil-status span:last-child')?.textContent).toMatch(
      /^HTML \d+ characters$/,
    )
    ;(
      document.querySelector(
        '.sigil-dialog-backdrop .sigil-dialog-head button',
      ) as HTMLButtonElement
    ).click()

    app.destroy()
  })

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

  it('Topbar 裝置切換同步 Inspector，樣式寫入該 breakpoint', () => {
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'hi', style: { margin: '16px' } }],
        },
      },
    })
    app.engine.select('t')
    const styleTab = [...mount.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
      (button) => button.textContent === '樣式',
    )!
    styleTab.click()
    const tablet = mount.querySelector(
      '.sigil-topbar button[data-device="tablet"]',
    ) as HTMLButtonElement
    tablet.click()
    expect(
      mount.querySelector('.sigil-responsive-style-context')?.getAttribute('data-style-device'),
    ).toBe('tablet')

    const reset = mount.querySelector('button[data-style-reset="margin"]') as HTMLButtonElement
    const input = reset.parentElement?.querySelector('input') as HTMLInputElement
    input.value = '8px'
    input.dispatchEvent(new Event('input'))
    expect(app.engine.getTree().children?.[0]?.style?.margin).toBe('16px')
    expect(app.engine.getTree().children?.[0]?.responsiveStyles?.tablet?.margin).toBe('8px')
    app.destroy()
  })

  it('空畫布顯示引導，插入後隱藏', () => {
    const mount = document.createElement('div')
    const app = createApp({ mount, doc: emptyDoc() })
    const guide = mount.querySelector('.sigil-empty-canvas') as HTMLElement
    expect(guide).toBeTruthy()
    expect(guide.hidden).toBe(false)
    expect(guide.textContent).toMatch(/拖|Drag/i)

    app.engine.insert('r', { id: 't1', type: 'text', content: 'hello' })
    expect(guide.hidden).toBe(true)

    app.engine.remove('t1')
    expect(guide.hidden).toBe(false)
    app.destroy()
  })

  it('編輯後 dirty，存檔後清除並呼叫 store.save', async () => {
    const saved: SigilDoc[] = []
    const store: ProjectStore = {
      load: () => null,
      save: (doc) => {
        saved.push(doc)
      },
    }
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'a' }] },
      },
      store,
    })
    expect(app.isDirty()).toBe(false)
    const saveBtn = mount.querySelector('button[data-command-id="save"]') as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    expect(saveBtn.disabled).toBe(true)

    app.engine.update('t', { content: 'b' })
    expect(app.isDirty()).toBe(true)
    expect(saveBtn.disabled).toBe(false)

    saveBtn.click()
    await vi.waitFor(() => expect(app.isDirty()).toBe(false))
    expect(saved.length).toBe(1)
    expect(saved[0]?.root.children?.[0]).toMatchObject({ content: 'b' })
    expect(saveBtn.disabled).toBe(true)
    app.destroy()
  })

  it('匯出開啟對話框並顯示 HTML', () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'hi' }] },
      },
    })
    const exportBtn = mount.querySelector('button[data-command-id="export"]') as HTMLButtonElement
    exportBtn.focus()
    exportBtn.click()
    const dialog = document.querySelector('.sigil-dialog-backdrop') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h3')?.id)
    const ta = dialog.querySelector('textarea') as HTMLTextAreaElement
    expect(ta?.value).toContain('hi')
    expect(document.activeElement).toBe(ta)

    const closeBtns = [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
      /關閉|Close/.test(button.textContent ?? ''),
    )
    closeBtns[0]?.focus()
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement).toBe(closeBtns.at(-1))

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(document.querySelector('.sigil-dialog-backdrop')).toBeNull()
    expect(document.activeElement).toBe(exportBtn)
    app.destroy()
    mount.remove()
  })

  it('未選取時 Inspector 顯示引導', () => {
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'x' }] },
      },
    })
    const empty = mount.querySelector('.sigil-inspector .sigil-empty')
    expect(empty?.textContent).toMatch(/選取|畫布/)
    app.destroy()
  })

  it('runCommand 與 hooks onSelect', async () => {
    const onSelect = vi.fn()
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'x' }] },
      },
      hooks: { onSelect },
      commands: [defineCommand({ id: 'ping', run: () => {} })],
    })
    app.engine.select('t')
    expect(onSelect).toHaveBeenCalledWith('t', expect.objectContaining({ engine: app.engine }))
    app.engine.remove('t')
    expect(await app.runCommand('undo')).toBe(true)
    expect(app.engine.getTree().children).toHaveLength(1)
    expect(await app.runCommand('ping')).toBe(true)
    app.destroy()
  })

  it('Topbar 綁定 undo／save／export 與自訂 toolbar 命令', async () => {
    const ping = vi.fn()
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'x' }] },
      },
      commands: [
        defineCommand({
          id: 'ping',
          label: 'Ping',
          toolbar: true,
          toolbarGroup: 'main',
          run: () => {
            ping()
          },
        }),
      ],
    })
    const topbar = mount.querySelector('.sigil-topbar')!
    expect(topbar.querySelector('[data-command-id="undo"]')).toBeTruthy()
    expect(topbar.querySelector('[data-command-id="redo"]')).toBeTruthy()
    expect(topbar.querySelector('[data-command-id="save"]')).toBeTruthy()
    expect(topbar.querySelector('[data-command-id="export"]')).toBeTruthy()
    expect(topbar.querySelector('[data-command-id="ping"]')).toBeTruthy()
    expect(topbar.querySelector('[data-toolbar-group="main"]')).toBeTruthy()

    const undoBtn = topbar.querySelector('[data-command-id="undo"]') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
    app.engine.remove('t')
    expect(undoBtn.disabled).toBe(false)
    undoBtn.click()
    await vi.waitFor(() => expect(app.engine.getTree().children).toHaveLength(1))

    const pingBtn = topbar.querySelector('[data-command-id="ping"]') as HTMLButtonElement
    pingBtn.click()
    expect(ping).toHaveBeenCalledOnce()
    app.destroy()
  })

  it('圖層右鍵選單套用暗色主題並執行上移', () => {
    const onSelect = vi.fn()
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      theme: 'dark',
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
      hooks: { onSelect },
    })
    const row = mount.querySelector('.sigil-layer-row[data-layer-id="b"]') as HTMLElement

    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    )

    const menu = document.querySelector('.sigil-context-menu') as HTMLElement
    expect(menu.classList.contains('sigil-theme-dark')).toBe(true)
    expect(menu.getAttribute('aria-label')).toBe('節點操作')
    expect(menu.querySelectorAll('.sigil-context-menu-sep')).toHaveLength(2)
    expect(onSelect).toHaveBeenCalledOnce()
    const moveUp = menu.querySelector('[data-menu-item-id="move-up"]') as HTMLButtonElement
    moveUp.click()
    expect(app.engine.getTree().children?.map((node) => node.id)).toEqual(['b', 'a'])
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    app.destroy()
  })

  it('theme 初始值套 class，切換鈕循環三態（auto→light→dark→auto）', () => {
    localStorage.clear()
    const mount = document.createElement('div')
    const app = createApp({
      mount,
      doc: emptyDoc(),
      theme: 'dark',
    })
    const root = mount.querySelector('.sigil-app') as HTMLElement
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)

    // 主題按鈕：靠 title 找
    const themeBtn = [...mount.querySelectorAll<HTMLButtonElement>('.sigil-topbar button')].find(
      (b) => b.title === '主題' || b.title === 'Theme',
    )!
    expect(themeBtn).toBeTruthy()

    // dark → auto：系統非暗（happy-dom 預設）→ 移除 class
    themeBtn.click()
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
    // auto → light：移除 class（仍亮）
    themeBtn.click()
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
    // light → dark：加回 class
    themeBtn.click()
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)
    app.destroy()
  })

  it('theme 記 localStorage', () => {
    localStorage.clear()
    const mount = document.createElement('div')
    const app = createApp({ mount, doc: emptyDoc(), theme: 'dark' })
    const themeBtn = [...mount.querySelectorAll<HTMLButtonElement>('.sigil-topbar button')].find(
      (b) => b.title === '主題' || b.title === 'Theme',
    )!
    // dark → auto，應寫入 localStorage
    themeBtn.click()
    expect(localStorage.getItem('sigil-theme')).toBe('auto')
    app.destroy()
  })

  it('依容器寬度切換 compact 抽屜，互斥開啟並可 Escape 關閉及還原焦點', () => {
    let resizeCallback: ResizeObserverCallback | undefined
    const disconnectObserver = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback
        }
        observe() {}
        disconnect = disconnectObserver
      },
    )

    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const app = createApp({ mount, doc: emptyDoc() })
    const root = mount.querySelector('.sigil-app') as HTMLElement
    const blocks = mount.querySelector('[data-compact-panel="blocks"]') as HTMLElement
    const settings = mount.querySelector('[data-compact-panel="settings"]') as HTMLElement
    const blocksToggle = mount.querySelector('[data-panel-toggle="blocks"]') as HTMLButtonElement
    const settingsToggle = mount.querySelector(
      '[data-panel-toggle="settings"]',
    ) as HTMLButtonElement
    const backdrop = mount.querySelector('.sigil-panel-backdrop') as HTMLElement

    resizeCallback?.(
      [{ target: root, contentRect: { width: 720 } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    )
    expect(root.dataset.layout).toBe('compact')
    expect(blocks.getAttribute('aria-hidden')).toBe('true')
    expect(settings.getAttribute('aria-hidden')).toBe('true')

    blocksToggle.click()
    expect(blocks.dataset.open).toBe('true')
    expect(blocksToggle.getAttribute('aria-expanded')).toBe('true')
    expect(settings.dataset.open).toBe('false')
    expect(backdrop.hidden).toBe(false)

    settingsToggle.click()
    expect(blocks.dataset.open).toBe('false')
    expect(settings.dataset.open).toBe('true')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(settings.dataset.open).toBe('false')
    expect(settingsToggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(settingsToggle)
    expect(backdrop.hidden).toBe(true)

    blocksToggle.click()
    backdrop.click()
    expect(blocks.dataset.open).toBe('false')
    expect(document.activeElement).toBe(blocksToggle)

    resizeCallback?.(
      [{ target: root, contentRect: { width: 1100 } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    )
    expect(root.dataset.layout).toBe('desktop')
    expect(blocks.getAttribute('aria-hidden')).toBe('false')
    expect(settings.getAttribute('aria-hidden')).toBe('false')

    app.destroy()
    mount.remove()
    expect(disconnectObserver).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
