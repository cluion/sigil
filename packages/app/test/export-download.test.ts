import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SigilDoc } from '@cluion/sigil-core'
import { createApp, type AppOptions } from '../src/index.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}

function fixture(prepareDownload?: AppOptions['prepareDownload']) {
  const original = '/media/cover.png'
  const doc: SigilDoc = {
    version: 1,
    meta: { title: 'Workshop' },
    root: { id: 'photo', type: 'image', attributes: { src: original, alt: 'Cover' } },
  }
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const save = vi.fn()
  const app = createApp({ mount, doc, prepareDownload, store: { save, load: () => null } })
  cleanups.push(() => {
    app.destroy()
    mount.remove()
  })
  const urls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  function open() {
    mount.querySelector<HTMLButtonElement>('[data-command-id="export"]')!.click()
    const dialog = document.querySelector<HTMLElement>('.sigil-dialog-backdrop')!
    return {
      primary: dialog.querySelector<HTMLButtonElement>('.sigil-btn--primary')!,
      button: (text: string) =>
        Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === text)!,
      status: dialog.querySelector('[role="status"]')!,
      source: dialog.querySelector('textarea')!,
    }
  }
  async function downloadedHTML() {
    const blob = urls.mock.calls.at(-1)![0] as Blob
    return blob.text()
  }
  return { app, open, original, urls, click, downloadedHTML, save }
}

describe('HTML download preparation', () => {
  it('uses a detached opening snapshot for one download and keeps clipboard, engine and saved data unchanged by the host', async () => {
    const gate = pending<void>()
    const embedded = 'data:image/png;base64,AA=='
    const prepare = vi.fn(async (doc: SigilDoc) => {
      await gate.promise
      expect(doc.root.attributes?.src).toBe('/media/cover.png')
      doc.root.attributes!.src = embedded
      doc.meta!.title = 'Prepared & ready'
      return doc
    })
    const scene = fixture(prepare)
    const before = scene.app.toHTML()
    const dialog = scene.open()
    expect(prepare).not.toHaveBeenCalled()
    expect(dialog.source.value).toBe(before)
    scene.app.engine.update('photo', { attributes: { src: '/media/new.png', alt: 'New' } })
    const saved = await scene.app.save()
    const history = scene.app.engine.canUndo()
    dialog.primary.click()
    dialog.primary.click()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(dialog.primary.getAttribute('aria-disabled')).toBe('true')
    expect(dialog.status.textContent).toBe('正在準備下載檔…')
    scene.app.setLocale('en')
    expect(dialog.status.textContent).toBe('Preparing download…')
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    dialog.button('Copy').click()
    expect(clipboard).toHaveBeenCalledWith(before)
    expect(scene.urls).not.toHaveBeenCalled()
    gate.resolve()
    await vi.waitFor(() => expect(scene.click).toHaveBeenCalledOnce())
    const file = await scene.downloadedHTML()
    expect(file).toContain('<title>Prepared &amp; ready</title>')
    expect(file).toContain(embedded)
    expect(file).not.toContain('/media/new.png')
    expect(dialog.source.value).toBe(before)
    expect(scene.app.toJSON()).toEqual(saved)
    expect(scene.app.toHTML()).toContain('/media/new.png')
    expect(scene.app.isDirty()).toBe(false)
    expect(scene.app.engine.canUndo()).toBe(history)
    expect(scene.save).toHaveBeenCalledOnce()
    scene.app.engine.undo()
    expect(scene.app.toHTML()).toBe(before)
    expect(scene.app.engine.canUndo()).toBe(false)
  })

  it('offers retry and an explicit original-URL download without reusing a partially transformed document', async () => {
    const prepare = vi.fn((doc: SigilDoc) => {
      expect(doc.root.attributes?.src).toBe('/media/cover.png')
      doc.root.attributes!.src = 'data:image/png;base64,AA=='
      if (prepare.mock.calls.length === 1) throw new Error('Internal response detail')
      return doc
    })
    const scene = fixture(prepare)
    const dialog = scene.open()
    const original = dialog.button('依原網址下載')
    expect(original.hidden).toBe(true)
    original.click()
    expect(scene.click).not.toHaveBeenCalled()
    dialog.primary.click()
    await vi.waitFor(() => expect(dialog.status.textContent).toContain('下載失敗'))
    expect(dialog.status.textContent).not.toContain('Internal response detail')
    expect(original.hidden).toBe(false)
    expect(scene.click).not.toHaveBeenCalled()
    original.click()
    expect(await scene.downloadedHTML()).toContain(scene.original)
    expect(dialog.status.textContent).toBe('已開始下載使用原網址的 HTML。')
    expect(prepare).toHaveBeenCalledOnce()
    dialog.primary.click()
    await vi.waitFor(() => expect(scene.click).toHaveBeenCalledTimes(2))
    expect(await scene.downloadedHTML()).toContain('data:image/png')
    expect(original.hidden).toBe(true)
    expect(scene.app.engine.canUndo()).toBe(false)
    expect(scene.app.isDirty()).toBe(false)
  })

  it.each(['close', 'replace', 'destroy'] as const)(
    'aborts on %s and ignores a late host result',
    async (action) => {
      const gate = pending<SigilDoc>()
      const prepare = vi.fn<NonNullable<AppOptions['prepareDownload']>>(() => gate.promise)
      const scene = fixture(prepare)
      const dialog = scene.open()
      dialog.primary.click()
      const [copy, signal] = prepare.mock.calls[0]!
      if (action === 'close')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (action === 'replace') scene.open()
      if (action === 'destroy') scene.app.destroy()
      expect(signal.aborted).toBe(true)
      dialog.primary.click()
      gate.resolve(copy)
      await gate.promise
      expect(scene.urls).not.toHaveBeenCalled()
      expect(scene.click).not.toHaveBeenCalled()
      expect(prepare).toHaveBeenCalledOnce()
    },
  )

  it('downloads the original fragment synchronously for a host without preparation', async () => {
    const scene = fixture()
    const dialog = scene.open()
    expect(dialog.button('依原網址下載')).toBeUndefined()
    dialog.primary.click()
    expect(scene.click).toHaveBeenCalledOnce()
    expect(await scene.downloadedHTML()).toContain(dialog.source.value)
  })

  it('releases the download URL and anchor if the browser rejects the click', async () => {
    const scene = fixture((doc) => doc)
    scene.click.mockImplementationOnce(() => {
      throw new Error('Download blocked')
    })
    const dialog = scene.open()
    dialog.primary.click()
    await vi.waitFor(() => expect(dialog.status.textContent).toContain('下載失敗'))
    expect(document.querySelector('a[download]')).toBe(null)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(dialog.button('依原網址下載').hidden).toBe(true)
    dialog.primary.click()
    await vi.waitFor(() => expect(scene.click).toHaveBeenCalledTimes(2))
  })
})
