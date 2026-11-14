import { afterEach, describe, it, expect, vi } from 'vitest'
import { openMediaPicker, type MediaPickerOptions } from '../src/media-picker.js'
import { createI18n, type AssetItem, type AssetStore } from '@cluion/sigil-core'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function mountPicker(options: MediaPickerOptions): () => void {
  const close = openMediaPicker(options)
  cleanups.push(close)
  return close
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function currentDialog(): HTMLElement {
  return document.querySelector('.sigil-media-backdrop') as HTMLElement
}

function pickFile(dialog: HTMLElement, file: File): HTMLInputElement {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change'))
  return input
}

const item: AssetItem = { id: 'image', name: 'Image', url: 'https://example.com/image.png' }

describe('openMediaPicker', () => {
  it('點選項目觸發 onPick', async () => {
    const assets: AssetStore = {
      list: () => [{ id: '1', url: 'https://example.com/a.png', name: 'A' }],
    }
    const onPick = vi.fn()
    mountPicker({
      assets,
      onPick,
      onClose: () => {},
    })
    await vi.waitFor(() => {
      expect(document.querySelector('.sigil-media-card')).toBeTruthy()
    })
    ;(document.querySelector('.sigil-media-card') as HTMLButtonElement).click()
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/a.png' }),
    )
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
  })

  it('限制焦點、Escape 關閉並還原觸發按鈕焦點', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    mountPicker({
      assets: {
        list: () => [{ id: '1', url: 'https://example.com/a.png', name: 'A' }],
      },
      onPick: () => {},
      onClose,
    })

    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    const close = dialog.querySelector('.sigil-media-head button') as HTMLButtonElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      dialog.querySelector('h3')?.getAttribute('id'),
    )
    expect(document.activeElement).toBe(close)

    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    const card = dialog.querySelector('.sigil-media-card') as HTMLButtonElement
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement).toBe(card)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onClose).toHaveBeenCalledOnce()
    trigger.remove()
  })

  it('runtime locale 切換更新開啟中的對話框，關閉後停止更新', async () => {
    const i18n = createI18n({
      zh: {},
      en: {
        'media.title': 'Media library',
        'media.close': 'Close',
        'media.upload': 'Upload image',
        'media.empty': 'No media yet',
      },
    })
    const close = mountPicker({
      assets: {
        list: () => [],
        upload: (file) => ({ id: file.name, url: `https://example.com/${file.name}` }),
      },
      i18n,
      onPick: () => {},
      onClose: () => {},
    })

    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    expect(dialog.querySelector('h3')?.textContent).toBe('媒體庫')
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-muted')?.textContent).toBe('尚無媒體'),
    )

    i18n.setLocale('en')

    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
    expect(dialog.querySelector('.sigil-media-head button')?.textContent).toBe('Close')
    expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Upload image')
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-muted')?.textContent).toBe('No media yet'),
    )

    close()
    i18n.setLocale('zh')
    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
  })

  it('列表載入期間顯示進度，成功後才呈現項目', async () => {
    const gate = deferred<AssetItem[]>()
    mountPicker({ assets: { list: () => gate.promise }, onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    const status = dialog.querySelector('.sigil-media-status') as HTMLElement
    expect(status.textContent).toBe('正在載入媒體…')
    expect(status.getAttribute('role')).toBe('status')
    expect(dialog.textContent).not.toContain('尚無媒體')
    expect(dialog.querySelector('.sigil-media-grid')?.getAttribute('aria-busy')).toBe('true')

    gate.resolve([item])
    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    expect(status.hidden).toBe(true)
    expect(dialog.querySelector('.sigil-media-grid')?.getAttribute('aria-busy')).toBe('false')
  })

  it.each(['throw', 'reject'] as const)('列表 %s 可見且可重試，不當成空列表', async (failure) => {
    const error = new Error('list unavailable')
    const list = vi
      .fn<AssetStore['list']>()
      .mockImplementationOnce(() => {
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })
      .mockReturnValueOnce([item])
    mountPicker({ assets: { list }, onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('媒體載入失敗'),
    )
    expect(dialog.textContent).not.toContain('尚無媒體')
    const retry = dialog.querySelector('.sigil-media-retry') as HTMLButtonElement
    expect(retry.hidden).toBe(false)
    expect(retry.textContent).toBe('重試')

    retry.click()
    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    expect(list).toHaveBeenCalledTimes(2)
    expect(retry.hidden).toBe(true)
  })

  it('列表重試未完成時不會重複載入，隱藏重試按鈕前移轉焦點', async () => {
    const gate = deferred<AssetItem[]>()
    const list = vi
      .fn<AssetStore['list']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(gate.promise)
    mountPicker({ assets: { list }, onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    const retry = dialog.querySelector('.sigil-media-retry') as HTMLButtonElement
    await vi.waitFor(() => expect(retry.hidden).toBe(false))
    retry.focus()
    retry.click()
    const close = dialog.querySelector('.sigil-media-head button') as HTMLButtonElement
    expect(document.activeElement).toBe(close)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(close)
    retry.click()
    expect(list).toHaveBeenCalledTimes(2)
    expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('正在載入媒體…')

    gate.resolve([])
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('尚無媒體'),
    )
  })

  it.each(['throw', 'reject'] as const)('上傳 %s 可見且能重試原檔案', async (failure) => {
    const error = new Error('upload unavailable')
    const upload = vi
      .fn<NonNullable<AssetStore['upload']>>()
      .mockImplementationOnce(() => {
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })
      .mockReturnValueOnce(item)
    const onPick = vi.fn()
    const onClose = vi.fn()
    mountPicker({ assets: { list: () => [], upload }, onPick, onClose })
    const dialog = currentDialog()
    const file = new File(['image'], 'image.png', { type: 'image/png' })
    const input = pickFile(dialog, file)
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-media-upload-status')?.textContent).toBe('圖片上傳失敗'),
    )
    expect(input.value).toBe('')
    expect(input.disabled).toBe(false)
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    const retry = dialog.querySelector('.sigil-media-upload-retry') as HTMLButtonElement
    expect(retry.hidden).toBe(false)
    expect(retry.textContent).toBe('重試上傳')

    retry.focus()
    retry.click()
    expect(document.activeElement).toBe(dialog.querySelector('.sigil-media-head button'))
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledExactlyOnceWith(item))
    expect(upload.mock.calls).toEqual([[file], [file]])
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    '關閉後忽略列表的延遲 %s，不更新舊 DOM',
    async (outcome) => {
      const gate = deferred<AssetItem[]>()
      const onPick = vi.fn()
      const onClose = vi.fn()
      const close = mountPicker({ assets: { list: () => gate.promise }, onPick, onClose })
      const dialog = currentDialog()
      close()
      const afterClose = dialog.outerHTML
      if (outcome === 'resolve') gate.resolve([item])
      else gate.reject(new Error('late list error'))
      await gate.promise.catch(() => {})

      expect(dialog.outerHTML).toBe(afterClose)
      expect(dialog.isConnected).toBe(false)
      expect(onPick).not.toHaveBeenCalled()
      close()
      expect(onClose).toHaveBeenCalledOnce()
    },
  )

  it.each(['resolve', 'reject'] as const)(
    '上傳期間防重入且可關閉，延遲 %s 不選圖或更新舊 DOM',
    async (outcome) => {
      const gate = deferred<AssetItem>()
      const upload = vi.fn(() => gate.promise)
      const onPick = vi.fn()
      const onClose = vi.fn()
      const close = mountPicker({ assets: { list: () => [], upload }, onPick, onClose })
      const dialog = currentDialog()
      const uploadButton = dialog.querySelector('.sigil-media-actions button') as HTMLButtonElement
      uploadButton.focus()
      const input = pickFile(dialog, new File(['first'], 'first.png'))
      pickFile(dialog, new File(['second'], 'second.png'))
      expect(upload).toHaveBeenCalledOnce()
      expect(input.disabled).toBe(true)
      expect(uploadButton.disabled).toBe(true)
      expect(uploadButton.textContent).toBe('正在上傳…')
      const closeButton = dialog.querySelector('.sigil-media-head button') as HTMLButtonElement
      expect(closeButton.disabled).toBe(false)
      expect(document.activeElement).toBe(closeButton)
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
      expect(document.activeElement).toBe(closeButton)
      closeButton.click()
      // Let the independent empty-list request settle before observing late upload work.
      await Promise.resolve()
      const afterClose = dialog.outerHTML
      if (outcome === 'resolve') gate.resolve(item)
      else gate.reject(new Error('late upload error'))
      await gate.promise.catch(() => {})

      expect(dialog.outerHTML).toBe(afterClose)
      expect(dialog.isConnected).toBe(false)
      expect(onPick).not.toHaveBeenCalled()
      close()
      expect(onClose).toHaveBeenCalledOnce()
    },
  )

  it('已關閉對話框保留的素材按鈕不再觸發選取', async () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    const close = mountPicker({ assets: { list: () => [item] }, onPick, onClose })
    const dialog = currentDialog()
    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    const card = dialog.querySelector('.sigil-media-card') as HTMLButtonElement
    close()
    card.click()
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('runtime locale 更新列表載入與失敗重試狀態', async () => {
    const gate = deferred<AssetItem[]>()
    const i18n = createI18n({
      zh: {},
      en: {
        'media.loading': 'Loading media…',
        'media.load_failed': 'Failed to load media',
        'media.retry': 'Retry',
      },
    })
    mountPicker({ assets: { list: () => gate.promise }, i18n, onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    const status = dialog.querySelector('.sigil-media-status') as HTMLElement
    i18n.setLocale('en')
    expect(status.textContent).toBe('Loading media…')
    gate.reject(new Error('offline'))
    await vi.waitFor(() => expect(status.textContent).toBe('Failed to load media'))
    expect(dialog.querySelector('.sigil-media-retry')?.textContent).toBe('Retry')
    i18n.setLocale('zh')
    expect(status.textContent).toBe('媒體載入失敗')
    expect(dialog.querySelector('.sigil-media-retry')?.textContent).toBe('重試')
  })

  it('runtime locale 更新上傳進度與失敗重試狀態，關閉後停止更新', async () => {
    const gate = deferred<AssetItem>()
    const i18n = createI18n({
      zh: {},
      en: {
        'media.upload': 'Upload image',
        'media.uploading': 'Uploading…',
        'media.upload_failed': 'Upload failed',
        'media.retry_upload': 'Retry upload',
      },
    })
    const close = mountPicker({
      assets: { list: () => [], upload: () => gate.promise },
      i18n,
      onPick: vi.fn(),
      onClose: vi.fn(),
    })
    const dialog = currentDialog()
    pickFile(dialog, new File(['image'], 'image.png'))
    i18n.setLocale('en')
    expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Uploading…')
    expect(dialog.querySelector('.sigil-media-upload-status')?.textContent).toBe('Uploading…')
    gate.reject(new Error('offline'))
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-media-upload-status')?.textContent).toBe('Upload failed'),
    )
    expect(dialog.querySelector('.sigil-media-upload-retry')?.textContent).toBe('Retry upload')
    expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Upload image')
    i18n.setLocale('zh')
    expect(dialog.querySelector('.sigil-media-upload-status')?.textContent).toBe('圖片上傳失敗')
    expect(dialog.querySelector('.sigil-media-upload-retry')?.textContent).toBe('重試上傳')
    close()
    const afterClose = dialog.outerHTML
    i18n.setLocale('en')
    expect(dialog.outerHTML).toBe(afterClose)
  })
})
