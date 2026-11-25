import { describe, expect, it } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'
import { createCanvas } from '../src/canvas.js'

describe.each([
  { name: 'Inspector', mount: createInspector, type: 'text' },
  { name: 'Props', mount: createPropsPanel, type: 'button' },
])('$name 內容欄位', ({ mount, type }) => {
  it('即時同步內容與鎖定，輸入不會重建控制項或重設游標', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'title', type, content: 'Title' } },
    })
    const host = document.createElement('div')
    document.body.append(host)
    engine.select('title')
    const panel = mount(engine, host)
    try {
      const input = host.querySelector('input')!
      input.focus()
      engine.update('title', { content: 'Workshop title' })
      expect(input.value).toBe('Workshop title')
      expect(document.activeElement).toBe(input)
      input.value = 'New title'
      input.setSelectionRange(3, 3)
      input.dispatchEvent(new Event('input'))
      expect(engine.getTree().content).toBe('New title')
      expect(input.selectionStart).toBe(3)
      engine.update('title', { locked: true })
      expect(input.disabled).toBe(true)
      input.value = 'Read only'
      input.dispatchEvent(new Event('input'))
      expect(engine.getTree().content).toBe('New title')
      engine.update('title', { locked: false })
      expect(input.disabled).toBe(false)
      expect(input.value).toBe('New title')
      expect(host.querySelector('.sigil-text-content')).toBe(input)
      engine.select(null)
      engine.select('title')
      input.value = 'Detached'
      input.dispatchEvent(new Event('input'))
      expect(engine.getTree().content).toBe('New title')
    } finally {
      panel.destroy()
      engine.destroy()
      host.remove()
    }
  })

  it('輸入法組字時保留候選字，取消時顯示期間收到的更新', () => {
    const engine = createEngine({ doc: { version: 1, root: { id: 'n', type, content: '原稿' } } })
    const host = document.createElement('div')
    engine.select('n')
    const panel = mount(engine, host)
    try {
      const input = host.querySelector<HTMLInputElement>('.sigil-text-content')!
      input.dispatchEvent(new CompositionEvent('compositionstart'))
      input.value = '暫'
      input.dispatchEvent(new Event('input'))
      expect(engine.getTree().content).toBe('原稿')
      expect(engine.canUndo()).toBe(false)
      input.value = '原稿'
      input.dispatchEvent(new CompositionEvent('compositionend'))
      expect(engine.canUndo()).toBe(false)

      input.dispatchEvent(new CompositionEvent('compositionstart'))
      input.value = '暫'
      input.dispatchEvent(new Event('input'))
      engine.update('n', { content: '另一份草稿' })
      expect(input.value).toBe('暫')
      input.value = '春季工作坊'
      input.dispatchEvent(new CompositionEvent('compositionend'))
      expect(engine.getTree().content).toBe('春季工作坊')

      input.dispatchEvent(new CompositionEvent('compositionstart'))
      engine.update('n', { content: '外部更新' })
      input.dispatchEvent(new CompositionEvent('compositionend'))
      expect(input.value).toBe('外部更新')
      expect(engine.getTree().content).toBe('外部更新')
    } finally {
      panel.destroy()
      engine.destroy()
    }
  })

  it('加入、移動及移除子元件時，欄位名稱更新並保留輸入焦點', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [{ id: 'cta', type: 'custom', tagName: 'a', attributes: { href: '#info' } }],
        },
      },
    })
    const host = document.createElement('div')
    document.body.append(host)
    engine.select('cta')
    const panel = mount(engine, host)
    try {
      const input = host.querySelector<HTMLInputElement>('.sigil-text-content')!
      const caption = () => input.labels?.[0]?.textContent
      input.focus()
      expect(caption()).toMatch(/^內容/)
      engine.insert('cta', { id: 'icon', type: 'text', content: '→' })
      expect(caption()).toBe('開頭文字')
      expect(document.activeElement).toBe(input)
      input.value = '查看場次 '
      input.dispatchEvent(new Event('input'))
      expect(engine.getTree().children?.[0]).toMatchObject({
        content: '查看場次 ',
        attributes: { href: '#info' },
        children: [{ id: 'icon', content: '→' }],
      })
      engine.move('icon', 'root')
      expect(caption()).toMatch(/^內容/)
      engine.move('icon', 'cta')
      expect(caption()).toBe('開頭文字')
      engine.remove('icon')
      expect(caption()).toMatch(/^內容/)
      expect(input.value).toBe('查看場次 ')
      expect(document.activeElement).toBe(input)
    } finally {
      panel.destroy()
      engine.destroy()
      host.remove()
    }
  })

  it('宿主替換整段內容後，設定面板跟著目前選取的元件更新', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'p',
          type,
          content: '提醒',
          children: [{ id: 'link', type: 'text', tagName: 'a', content: '舊說明' }],
        },
      },
    })
    const host = document.createElement('div')
    document.body.append(host)
    engine.select('link')
    const panel = mount(engine, host)
    const field = () => host.querySelector<HTMLInputElement>('.sigil-text-content')!
    try {
      expect(field().value).toBe('舊說明')
      engine.update('p', {
        content: '活動公告',
        children: [
          {
            id: 'link',
            type: 'text',
            tagName: 'a',
            content: '新說明',
            children: [{ id: 'arrow', type: 'text', content: '→' }],
          },
        ],
      })
      expect(field().value).toBe('新說明')
      expect(field().labels?.[0]?.textContent).toBe('開頭文字')
      engine.select('p')
      engine.update('p', { content: '單段公告', children: [] })
      expect(field().value).toBe('單段公告')
      expect(field().labels?.[0]?.textContent).toMatch(/^內容/)
    } finally {
      panel.destroy()
      engine.destroy()
      host.remove()
    }
  })

  it('畫布提交到已選取的內容欄位，保留同一個控制項', async () => {
    const engine = createEngine({ doc: { version: 1, root: { id: 'n', type, content: '原稿' } } })
    const host = document.createElement('div')
    const frameHost = document.createElement('div')
    document.body.append(host, frameHost)
    engine.select('n')
    const panel = mount(engine, host)
    const canvas = createCanvas(engine, frameHost)
    try {
      if (!canvas.iframe.contentDocument?.querySelector('[data-sigil-id="n"]'))
        await new Promise<void>((resolve) =>
          canvas.iframe.addEventListener('load', () => resolve(), { once: true }),
        )
      const input = host.querySelector<HTMLInputElement>('.sigil-text-content')!
      canvas.startEditing('n')
      canvas.iframe.contentDocument!.querySelector('[data-sigil-id="n"]')!.textContent = '直接改稿'
      canvas.commitEditing()
      expect(host.querySelector('.sigil-text-content')).toBe(input)
      expect(input.value).toBe('直接改稿')
    } finally {
      canvas.destroy()
      panel.destroy()
      engine.destroy()
      frameHost.remove()
      host.remove()
    }
  })
})
