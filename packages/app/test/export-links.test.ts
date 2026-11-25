import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SigilDoc } from '@cluion/sigil-core'
import { createApp, type AppOptions } from '../src/index.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})

function fixture(width = 1200, prepareDownload?: AppOptions['prepareDownload']) {
  const doc: SigilDoc = {
    version: 1,
    root: {
      id: 'page',
      type: 'section',
      children: [
        { id: 'cta', type: 'button', tagName: 'a', content: '報名', attributes: { href: '#old' } },
      ],
    },
  }
  const mount = document.createElement('div')
  vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect)
  document.body.append(mount)
  const app = createApp({ mount, doc, prepareDownload })
  cleanups.push(() => {
    app.destroy()
    mount.remove()
  })
  const exportBtn = mount.querySelector<HTMLButtonElement>('[data-command-id="export"]')!
  function open() {
    exportBtn.click()
    const dialog = document.querySelector<HTMLElement>('.sigil-dialog-backdrop')!
    const details = dialog.querySelector<HTMLDetailsElement>('details.sigil-page-links')!
    expect(details.open).toBe(false)
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    const row = details.querySelector<HTMLButtonElement>('button[data-page-link-id="cta"]')!
    return { dialog, row }
  }
  return { app, mount, open }
}

describe('匯出頁面連結', () => {
  it('以同一份快照顯示 HTML 與連結，從預覽回到手機設定後編輯即時網址', () => {
    const { app, mount, open } = fixture(390)
    const preview = [...mount.querySelectorAll<HTMLButtonElement>('.sigil-topbar button')].find(
      (button) => button.textContent === '預覽',
    )!
    preview.click()
    const { dialog, row } = open()
    app.engine.update('cta', { attributes: { href: '#new' } })
    expect(dialog.querySelector('textarea')!.value).toContain('href="#old"')
    expect(row.textContent).toContain('#old')
    const before = app.toJSON()
    row.click()
    expect(dialog.isConnected).toBe(false)
    expect(preview.getAttribute('aria-pressed')).toBe('false')
    const drawer = mount.querySelector<HTMLElement>('[data-compact-panel="settings"]')!
    expect(drawer.dataset.open).toBe('true')
    expect(drawer.dataset.view).toBe('inspector')
    expect(app.engine.getSelection()).toBe('cta')
    const input = drawer.querySelector<HTMLInputElement>('.sigil-link-address input')!
    expect(input.value).toBe('#new')
    expect(document.activeElement).toBe(input)
    expect(app.toJSON()).toEqual(before)
    app.engine.undo()
    expect(app.isDirty()).toBe(false)
    expect(app.engine.canUndo()).toBe(false)
    app.engine.select('page')
    row.click()
    expect(app.engine.getSelection()).toBe('page')
  })

  it('來源已移除時保留匯出快照，復原後可查看已鎖定的連結', () => {
    const { app, mount, open } = fixture()
    const { dialog, row } = open()
    app.engine.remove('cta')
    row.click()
    expect(dialog.isConnected).toBe(true)
    expect(app.engine.getSelection()).toBeNull()
    const notice = [...dialog.querySelectorAll('[role="status"]')].find((el) =>
      el.textContent?.includes('重新開啟'),
    )
    expect(notice).toBeDefined()
    app.setLocale('en')
    expect(notice?.textContent).toContain('Reopen')
    app.engine.undo()
    app.engine.update('cta', { locked: true })
    dialog.querySelector<HTMLButtonElement>('button[data-page-link-id="cta"]')!.click()
    expect(dialog.isConnected).toBe(false)
    expect(app.engine.getSelection()).toBe('cta')
    const content = mount.querySelector<HTMLElement>('.sigil-inspector [aria-selected="true"]')!
    expect(content.textContent).toBe('Content')
    expect(document.activeElement).toBe(content)
    expect(mount.querySelector<HTMLInputElement>('.sigil-link-address input')!.disabled).toBe(true)
  })

  it('跳回來源會中止正在準備的下載，忽略稍後傳回的檔案', async () => {
    let resolve!: (doc: SigilDoc) => void
    const gate = new Promise<SigilDoc>((done) => (resolve = done))
    const prepare = vi.fn<NonNullable<AppOptions['prepareDownload']>>(() => gate)
    const urls = vi.spyOn(URL, 'createObjectURL')
    const { app, open } = fixture(1200, prepare)
    const { dialog, row } = open()
    expect(document.activeElement?.textContent).toBe('下載 .html')
    dialog.querySelector<HTMLButtonElement>('.sigil-btn--primary')!.click()
    const [doc, signal] = prepare.mock.calls[0]!
    row.click()
    expect(signal.aborted).toBe(true)
    resolve(doc)
    await gate
    expect(urls).not.toHaveBeenCalled()
    expect(app.isDirty()).toBe(false)
    expect(app.engine.canUndo()).toBe(false)
  })
})
