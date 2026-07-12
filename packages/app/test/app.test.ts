import { describe, it, expect, vi } from 'vitest'
import { createApp, defineCommand } from '../src/index.js'
import { defineShortcode } from '@cluion/sigil-shortcode'
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'

function emptyDoc(): SigilDoc {
  return {
    version: 1,
    root: { id: 'r', type: 'section', children: [] },
  }
}

describe('createApp', () => {
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
    const saveBtn = mount.querySelector(
      'button[data-command-id="save"]',
    ) as HTMLButtonElement
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
    const app = createApp({
      mount,
      doc: {
        version: 1,
        root: { id: 'r', type: 'section', children: [{ id: 't', type: 'text', content: 'hi' }] },
      },
    })
    const exportBtn = mount.querySelector(
      'button[data-command-id="export"]',
    ) as HTMLButtonElement
    exportBtn.click()
    const dialog = document.querySelector('.sigil-dialog-backdrop')
    expect(dialog).toBeTruthy()
    const ta = dialog?.querySelector('textarea') as HTMLTextAreaElement
    expect(ta?.value).toContain('hi')
    const closeBtn = [...(dialog?.querySelectorAll('button') ?? [])].find((b) =>
      /關閉|Close/.test(b.textContent ?? ''),
    )
    closeBtn?.click()
    expect(document.querySelector('.sigil-dialog-backdrop')).toBeNull()
    app.destroy()
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
})


