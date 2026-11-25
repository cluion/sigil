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
  it('尋找快捷鍵只開啟目標編輯器，記住搜尋詞並在預覽停用', async () => {
    const mount = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(mount, second)
    const editor = createEditor({ mount, locale: 'en' })
    const other = createEditor({ mount: second })
    const shortcut = () =>
      new KeyboardEvent('keydown', {
        key: 'f',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    try {
      document.body.dispatchEvent(shortcut())
      expect(document.querySelector('.sigil-page-text-dialog')).toBeNull()
      const button = mount.querySelector<HTMLButtonElement>('[data-command-id="find-replace"]')!
      button.dispatchEvent(shortcut())
      const dialog = mount.querySelector<HTMLDialogElement>('.sigil-page-text-dialog')!
      expect(dialog).toBeTruthy()
      expect(second.querySelector('.sigil-page-text-dialog')).toBeNull()
      const query = dialog.querySelector<HTMLInputElement>('input[type="search"]')!
      query.value = 'Winter'
      query.dispatchEvent(new Event('input', { bubbles: true }))
      dialog.querySelector<HTMLButtonElement>('[data-find-action="cancel"]')!.click()
      expect(document.activeElement).toBe(button)
      expect(await editor.runCommand('find-replace')).toBe(true)
      expect(mount.querySelector<HTMLInputElement>('dialog input[type="search"]')?.value).toBe(
        'Winter',
      )
      mount.querySelector<HTMLButtonElement>('.sigil-canvas-mode-btn')!.click()
      expect(mount.querySelector('.sigil-page-text-dialog')).toBeNull()
      expect(button.disabled).toBe(true)
      expect(await editor.runCommand('find-replace')).toBe(false)
      expect(editor.isDirty()).toBe(false)
    } finally {
      other.destroy()
      editor.destroy()
      mount.remove()
      second.remove()
    }
  })

  it('SDK 可切換標題大綱、依語系導覽，並保護瀏覽中的元件', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [{ id: 'title', type: 'text', tagName: 'h2', content: 'Workshop' }],
        },
      },
    })
    try {
      const switcher = mount.querySelector<HTMLButtonElement>('[data-layer-view="outline"]')!
      switcher.click()
      editor.setLocale('en')
      expect(switcher.textContent).toBe('Heading outline')
      const title = mount.querySelector<HTMLButtonElement>('[data-heading-id="title"]')!
      title.click()
      expect(editor.engine.getSelection()).toBe('title')
      for (const target of [title, switcher]) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      }
      expect(editor.engine.getSelection()).toBe('title')
      expect(title.getAttribute('aria-current')).toBe('true')
      expect(editor.isDirty()).toBe(false)
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('SDK 路徑同步語系、祖先選取及內建畫布預覽模式', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'workshop',
          type: 'section',
          children: [{ id: 'heading', type: 'text', name: 'Workshop title' }],
        },
      },
    })
    try {
      const path = mount.querySelector<HTMLElement>('nav[aria-label="Component path"]')!
      const trail = path.querySelector<HTMLOListElement>('.sigil-path-trail')!
      const toggle = mount.querySelector<HTMLButtonElement>('.sigil-canvas-mode-btn')!
      editor.engine.select('heading')
      expect(trail.querySelector('[aria-current]')?.textContent).toBe('Workshop title')
      toggle.click()
      expect(path.hidden).toBe(true)
      editor.setLocale('zh')
      toggle.click()
      expect(path.hidden).toBe(false)
      expect(path.getAttribute('aria-label')).toBe('元件路徑')
      trail.querySelector<HTMLButtonElement>('button[data-path-id="workshop"]')!.click()
      expect(editor.engine.getSelection()).toBe('workshop')
      expect(editor.isDirty()).toBe(false)
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('SDK 窄版路徑開啟時保護背景文件，放大空間後恢復桌面導覽', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      doc: {
        version: 1,
        root: { id: 'page', type: 'section', children: [{ id: 'title', type: 'text' }] },
      },
    })
    try {
      editor.engine.select('title')
      const layout = mount.firstElementChild as HTMLElement
      const iframe = layout.querySelector('iframe')!
      const panels = layout.firstElementChild as HTMLElement
      const bounds = vi.spyOn(layout, 'getBoundingClientRect')
      bounds.mockReturnValue({ width: 375 } as DOMRect)
      window.dispatchEvent(new Event('resize'))
      expect(panels.style.display).toBe('grid')
      const trigger = mount.querySelector<HTMLButtonElement>('.sigil-selection-path-trigger')!
      expect(trigger.hidden).toBe(false)
      trigger.click()
      const dialog = mount.querySelector<HTMLDialogElement>('.sigil-path-dialog')!
      expect(dialog.open).toBe(true)
      const ancestor = dialog.querySelector<HTMLButtonElement>('button[data-path-id="page"]')!
      ancestor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      )
      expect(editor.engine.getTree().children?.map((node) => node.id)).toEqual(['title'])
      expect(editor.isDirty()).toBe(false)
      bounds.mockReturnValue({ width: 1100 } as DOMRect)
      window.dispatchEvent(new Event('resize'))
      expect(panels.style.display).toBe('flex')
      expect(layout.querySelector('iframe')).toBe(iframe)
      expect(editor.engine.getSelection()).toBe('title')
      expect(dialog.open).toBe(false)
      expect(trigger.hidden).toBe(true)
      expect(mount.querySelector<HTMLElement>('.sigil-path-trail')!.hidden).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
      vi.unstubAllGlobals()
    }
  })

  it('SDK 屬性面板可設定錨點，並用一次復原還原匯出連結', async () => {
    const mount = document.createElement('div')
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'doc',
          type: 'section',
          children: [
            { id: 'contact', type: 'section', attributes: { id: 'details' } },
            { id: 'cta', type: 'text', tagName: 'a', attributes: { href: '#details' } },
          ],
        },
      },
    })
    try {
      editor.engine.select('contact')
      const group = mount.querySelector<HTMLElement>('.sigil-anchor-field')!
      expect(group.getAttribute('role')).toBe('group')
      const input = group.querySelector<HTMLInputElement>('[data-anchor-name]')!
      expect(input.value).toBe('details')
      input.value = 'workshop'
      input.dispatchEvent(new Event('input'))
      expect(editor.isDirty()).toBe(false)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(editor.toHTML()).toContain('href="#workshop"')
      expect(await editor.runCommand('undo')).toBe(true)
      expect(editor.toHTML()).toContain('href="#details"')
      expect(editor.isDirty()).toBe(false)
    } finally {
      editor.destroy()
    }
  })

  it('SDK 可從畫布編輯連結、定位目標，並匯出可使用的電話連結', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'cta',
              type: 'button',
              tagName: 'a',
              content: 'Contact',
              attributes: { href: '#contact' },
            },
            {
              id: 'details',
              type: 'section',
              name: 'Contact details',
              attributes: { id: 'contact' },
            },
          ],
        },
      },
    })
    try {
      const iframe = mount.querySelector('iframe')!
      await vi.waitFor(() => expect(iframe.contentDocument?.querySelector('a')).toBeTruthy())
      editor.engine.select('cta')
      const open = mount.querySelector<HTMLButtonElement>('[aria-label="Edit link"]')!
      open.click()
      const kind = mount.querySelector<HTMLSelectElement>('select[data-link-kind]')!
      expect(document.activeElement).toBe(kind)
      const reveal = mount.querySelector<HTMLButtonElement>('.sigil-link-reveal')!
      reveal.click()
      expect(editor.engine.getSelection()).toBe('details')
      expect(editor.isDirty()).toBe(false)
      expect(open.hidden).toBe(true)
      editor.engine.select('cta')
      editor.setLocale('zh')
      const kinds = mount.querySelector<HTMLSelectElement>('select[data-link-kind]')!
      expect(kinds.querySelector('option[value="tel"]')?.textContent).toBe('電話')
      kinds.value = 'tel'
      kinds.dispatchEvent(new Event('change'))
      const field = mount.querySelector<HTMLInputElement>(
        '.sigil-link-fields input[inputmode="tel"]',
      )!
      field.value = '+886 2 2345-6789'
      field.dispatchEvent(new Event('input'))
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(editor.toHTML()).toContain('href="tel:+886223456789"')
      expect(await editor.runCommand('undo')).toBe(true)
      expect(editor.toHTML()).toContain('href="#contact"')
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('SDK 畫布與圖片屬性可直接重用本頁圖片，更換來源保留目標的替代文字', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const target = { SRC: '/target.png', ALT: 'Original description', title: 'Cover' }
    const source = { src: '/other.png', alt: 'Another image' }
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'target', type: 'image', attributes: target },
            { id: 'other', type: 'image', attributes: source },
          ],
        },
      },
    })
    try {
      await vi.waitFor(() =>
        expect(mount.querySelector('iframe')?.contentDocument?.querySelector('img')).toBeTruthy(),
      )
      editor.engine.select('target')
      const replace = mount.querySelector<HTMLButtonElement>('[aria-label="Replace image"]')!
      const actions = replace.closest('.sigil-canvas-actions')!
      expect(actions.previousElementSibling).toBe(mount.querySelector('iframe')?.parentElement)
      expect(actions.querySelector('[aria-label="Locate on canvas"]')).toBeTruthy()
      replace.click()
      const cards = document.querySelectorAll<HTMLButtonElement>('.sigil-media-card')
      expect(cards).toHaveLength(2)
      expect(cards[0]?.getAttribute('aria-current')).toBe('true')
      cards[1]!.click()
      expect(editor.toJSON().root.children?.map((node) => node.attributes)).toEqual([
        { ...target, SRC: source.src },
        source,
      ])
      expect(document.activeElement).toBe(replace)
      editor.engine.undo()
      expect(editor.engine.canUndo()).toBe(false)
      expect(editor.toJSON().root.children?.[0]?.attributes).toEqual(target)
      const pick = mount.querySelector<HTMLButtonElement>(
        '.sigil-field-row button[aria-haspopup="dialog"]',
      )!
      pick.click()
      const dialog = document.querySelector<HTMLElement>('.sigil-media-backdrop')!
      editor.setLocale('zh')
      expect(document.querySelector('.sigil-media-backdrop')).toBe(dialog)
      dialog.querySelector<HTMLButtonElement>('.sigil-media-card[aria-current="true"]')!.click()
      expect(document.activeElement).toBe(pick)
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('從畫布直接調整手機圖片構圖，保留桌面尺寸與其他元件', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'photo',
              type: 'image',
              attributes: { alt: 'Workshop' },
              style: { height: '200px' },
            },
            { id: 'custom', type: 'image', tagName: 'div' },
          ],
        },
      },
    })
    try {
      const iframe = mount.querySelector('iframe')!
      await vi.waitFor(() => expect(iframe.contentDocument?.querySelector('img')).toBeTruthy())
      editor.engine.select('photo')
      mount.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.click()
      const open = mount.querySelector<HTMLButtonElement>('[aria-label="Adjust image framing"]')!
      open.click()
      const framing = mount.querySelector<HTMLElement>('.sigil-image-framing')!
      expect(document.activeElement).toBe(framing)
      expect(editor.isDirty()).toBe(false)
      const ratio = framing.querySelector<HTMLSelectElement>('[data-framing="ratio"]')!
      ratio.value = '3 / 4'
      ratio.dispatchEvent(new Event('change'))
      expect(editor.toJSON().root.children?.[0]).toMatchObject({
        style: { height: '200px' },
        responsiveStyles: {
          mobile: { 'aspect-ratio': '3 / 4', height: 'auto', 'object-fit': 'cover' },
        },
        attributes: { alt: 'Workshop' },
      })
      editor.engine.select('custom')
      expect(mount.querySelector('.sigil-image-framing')).toBeNull()
      expect(open.hidden).toBe(true)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('從圖片工具列進入連結欄位，切換語系時保留網址草稿與焦點', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [{ id: 'poster', type: 'image', attributes: { alt: '報名海報' } }],
        },
      },
    })
    try {
      const frame = mount.querySelector('iframe')!
      await vi.waitFor(() => expect(frame.contentDocument?.querySelector('img')).toBeTruthy())
      editor.engine.select('poster')
      const action = mount.querySelector<HTMLButtonElement>('button[aria-label="Image link"]')!
      action.click()
      const field = mount.querySelector<HTMLInputElement>('[data-image-link-address]')!
      expect(document.activeElement).toBe(field)
      field.value = '/register'
      field.dispatchEvent(new Event('input'))
      editor.setLocale('zh')
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('/register')
      expect(action.getAttribute('aria-label')).toBe('圖片連結')
      expect(editor.engine.canUndo()).toBe(false)
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(
        frame.contentDocument?.querySelector('a[href="/register"] img')?.getAttribute('alt'),
      ).toBe('報名海報')
      expect(editor.engine.getSelection()).toBe('poster')
      editor.engine.undo()
      expect(frame.contentDocument?.querySelector('a')).toBeNull()
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('依宿主保存規則限制色值，並在切換語系後保留背景色', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      acceptsColorValue: (value) => value.startsWith('#'),
      doc: {
        version: 1,
        root: { id: 'page', type: 'section', style: { background: '#def' } },
      },
    })
    try {
      editor.engine.select('page')
      const field = () =>
        mount.querySelector<HTMLElement>('[data-color-property="background-color"]')!
      const input = field().querySelector<HTMLInputElement>('input[type="text"]')!
      expect(input.labels?.[0]?.textContent).toBe('Background color')
      expect(input.value).toBe('#def')
      input.value = 'salmon'
      input.dispatchEvent(new Event('input'))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(field().textContent).toContain('This editor cannot save this color value')
      expect(editor.isDirty()).toBe(false)
      editor.setLocale('zh')
      expect(field().querySelector('label')?.textContent).toBe('背景顏色')
      expect(field().querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('#def')
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('複製的樣式可在 Props 面板套用、復原，並更新既有欄位', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'source',
              name: 'Promo',
              type: 'text',
              style: { color: '#112233', padding: '8px' },
            },
            { id: 'target', type: 'text', content: 'Register', style: { color: '#404040' } },
          ],
        },
      },
    })
    try {
      editor.engine.select('source')
      const action = (id: string) =>
        mount.querySelector<HTMLButtonElement>(`[data-style-transfer="${id}"]`)!
      expect(action('copy').textContent).toBe('Copy styles')
      action('copy').click()
      expect(editor.isDirty()).toBe(false)
      editor.engine.select('target')
      editor.setLocale('zh')
      expect(mount.querySelector('.sigil-style-transfer-source')?.textContent).toContain('桌面')
      expect(action('apply').textContent).toBe('套用樣式')
      action('apply').focus()
      action('apply').click()
      expect(mount.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe('#112233')
      expect(editor.toJSON().root.children?.[1]).toMatchObject({
        content: 'Register',
        style: { color: '#112233', padding: '8px' },
      })
      expect(document.activeElement).toBe(action('apply'))
      expect(await editor.runCommand('undo')).toBe(true)
      expect(mount.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe('#404040')
      expect(editor.isDirty()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('SDK 畫布捷徑聚焦排版欄，保留宿主限制與切換語系後的選擇', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      acceptsTypographyValue: (property, value) => property !== 'font-weight' || value !== '700',
      doc: {
        version: 1,
        root: { id: 'title', type: 'text', tagName: 'h2', content: 'Workshop' },
      },
    })
    try {
      const iframe = mount.querySelector('iframe')!
      await vi.waitFor(() => expect(iframe.contentDocument?.querySelector('h2')).toBeTruthy())
      editor.engine.select('title')
      mount.querySelector<HTMLButtonElement>('[aria-label="Edit typography"]')!.click()
      const current = () => mount.querySelector<HTMLSelectElement>('[data-typography-preset]')!
      expect(document.activeElement).toBe(current())
      expect(current().querySelector<HTMLOptionElement>('[value="display"]')!.disabled).toBe(true)
      current().value = 'caption'
      current().dispatchEvent(new Event('change', { bubbles: true }))
      expect(editor.toJSON().root).toMatchObject({ tagName: 'h2', style: { 'line-height': '1.4' } })
      editor.setLocale('zh')
      expect(current().selectedOptions[0]?.textContent).toBe('註解')
      editor.engine.undo()
      expect(editor.isDirty()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

  it('inserts a sibling from the canvas and cancels pending placement on preview', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      blocks: { Text: () => ({ id: 'added', type: 'text', content: 'New text' }) },
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            { id: 'title', name: 'Title', type: 'text' },
            { id: 'footer', type: 'text' },
          ],
        },
      },
    })
    try {
      const iframe = mount.querySelector('iframe')!
      await vi.waitFor(() =>
        expect(iframe.contentDocument?.querySelector('[data-sigil-id="title"]')).toBeTruthy(),
      )
      editor.engine.select('title')
      const add = mount.querySelector<HTMLButtonElement>('[aria-label="Add block below"]')!
      add.click()
      expect(mount.querySelector('.sigil-blocks-placement')?.textContent).toContain(
        'Insert after Title',
      )
      mount.querySelector<HTMLElement>('.sigil-block-item')!.click()
      expect(editor.engine.getTree().children?.map((node) => node.id)).toEqual([
        'title',
        'added',
        'footer',
      ])
      expect(editor.engine.getSelection()).toBe('added')
      add.click()
      expect(mount.querySelector('.sigil-blocks-placement')).toBeTruthy()
      mount.querySelector<HTMLButtonElement>('.sigil-canvas-mode-btn')!.click()
      expect(mount.querySelector('.sigil-blocks-placement')).toBeNull()
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

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

  it('SDK 可只在本次面板保留釘選，切換語系仍可找到同一個區塊', () => {
    const mount = document.createElement('div')
    const mountEditor = () =>
      createEditor({
        mount,
        blocks: { Workshop: () => ({ id: 'workshop', type: 'section' }) },
        blockPinStorageKey: false,
        locale: 'en',
      })
    const pin = () => mount.querySelector<HTMLButtonElement>('.sigil-block-pin')!
    const first = mountEditor()
    try {
      expect(pin().getAttribute('aria-label')).toBe('Pin Workshop')
      pin().click()
      first.setLocale('zh')
      expect(pin().getAttribute('aria-pressed')).toBe('true')
      expect(pin().title).toBe('取消釘選 Workshop')
      expect(first.engine.canUndo()).toBe(false)
      expect(first.isDirty()).toBe(false)
    } finally {
      first.destroy()
    }
    const second = mountEditor()
    try {
      expect(pin().getAttribute('aria-pressed')).toBe('false')
    } finally {
      second.destroy()
    }
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

  it('SDK 可用英文面板排版手機格線，切換語系後仍可復原至原始配置', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const section = {
      id: 'cards',
      type: 'section',
      style: { display: 'flex', gap: '1rem' },
      children: [{ id: 'card', type: 'text', content: 'Workshop' }],
    }
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: { version: 1, root: { id: 'page', type: 'section', children: [section] } },
    })
    try {
      editor.engine.select('cards')
      mount.querySelector<HTMLButtonElement>('button[data-device="mobile"]')!.click()
      const preset = () => mount.querySelector<HTMLButtonElement>('[data-grid-columns="2"]')!
      expect(preset().getAttribute('aria-label')).toBe('2 columns')
      preset().click()
      expect(editor.toJSON().root.children?.[0]).toEqual({
        ...section,
        responsiveStyles: {
          mobile: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' },
        },
      })
      editor.setLocale('zh')
      expect(preset().getAttribute('aria-label')).toBe('2 欄')
      expect(preset().getAttribute('aria-pressed')).toBe('true')
      preset().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      )
      expect(editor.engine.getSelection()).toBe('cards')
      expect(editor.toHTML()).toContain('repeat(2, minmax(0, 1fr))')
      editor.engine.undo()
      expect(editor.toJSON().root.children?.[0]).toEqual(section)
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
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
    expect(el.textContent).toContain('未覆寫時沿用平板或桌面樣式')
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
  it('搜尋結果仍在瀏覽時按 Delete 保留原選取，確認結果後鍵盤命令作用於新選取', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      locale: 'en',
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [
            { id: 'first', type: 'text', content: 'First' },
            { id: 'next', type: 'text', content: 'Second' },
          ],
        },
      },
    })
    try {
      editor.engine.select('first')
      const search = mount.querySelector<HTMLInputElement>('input[aria-label="Search layers"]')!
      search.value = 'second'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      const result = mount.querySelector<HTMLButtonElement>('[data-layer-result="next"]')!
      result.focus()
      result.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      expect(editor.engine.getTree().children?.map((child) => child.id)).toEqual(['first', 'next'])
      expect(editor.isDirty()).toBe(false)
      result.click()
      const row = mount.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')!
      expect(row).toBe(document.activeElement)
      expect(row.dataset.layerId).toBe('next')
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      expect(editor.engine.getTree().children?.map((child) => child.id)).toEqual(['first'])
    } finally {
      editor.destroy()
      mount.remove()
    }
  })
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
  it('SDK 可從選取圖層搬移至其他區段，並在一次復原後恢復原位', async () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    const editor = createEditor({
      mount,
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', content: 'A' },
            { id: 'footer', type: 'section', name: '頁尾' },
          ],
        },
      },
    })
    try {
      editor.engine.select('r')
      expect(await editor.runCommand('move-to')).toBe(false)
      const row = mount.querySelector<HTMLElement>('[role="treeitem"][data-layer-id="a"]')!
      row.focus()
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }))
      document.querySelector<HTMLButtonElement>('[data-menu-item-id="move-to"]')!.click()
      const dialog = document.querySelector<HTMLDialogElement>('.sigil-move-dialog')!
      const destination = dialog.querySelector<HTMLSelectElement>('.sigil-move-destination')!
      destination.value = 'footer'
      destination.dispatchEvent(new Event('change'))
      dialog.querySelector<HTMLButtonElement>('.sigil-move-confirm')!.click()
      expect(editor.engine.getTree().children?.map((child) => child.id)).toEqual(['footer'])
      expect(editor.engine.getTree().children?.[0]?.children?.[0]?.content).toBe('A')
      editor.engine.undo()
      expect(editor.engine.getTree().children?.map((child) => child.id)).toEqual(['a', 'footer'])
      expect(editor.engine.canUndo()).toBe(false)
    } finally {
      editor.destroy()
      mount.remove()
    }
  })

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
