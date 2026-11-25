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

describe('媒體來源', () => {
  it('在圖片說明組字時按 Esc 可保留草稿，組字結束才關閉視窗', () => {
    const onClose = vi.fn()
    mountPicker({ onInsertUrl: vi.fn(), onPick: vi.fn(), onClose })
    const alt = currentDialog().querySelector<HTMLInputElement>('[data-image-alt]')!
    alt.value = '紙藝工作坊'
    alt.focus()
    alt.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(alt)
    expect(alt.value).toBe('紙藝工作坊')
    alt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  const pageImage = { ...item, uses: 3, searchTerms: ['標題', '頁尾'] }
  function tab(source: 'library' | 'page' | 'url') {
    return currentDialog().querySelector<HTMLButtonElement>(
      `button[data-media-source="${source}"]`,
    )!
  }
  function search(query: string) {
    const input = currentDialog().querySelector<HTMLInputElement>('input[type=search]')!
    input.value = query
    input.dispatchEvent(new Event('input'))
    return input
  }

  function pressKey(element: HTMLElement, key: string) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }

  it('在三個來源間使用鍵盤巡覽，獨立保留網址草稿、搜尋及上傳結果', async () => {
    const uploaded = deferred<AssetItem>()
    const i18n = createI18n({ zh: {}, en: { 'media.image_url': 'Image URL' } })
    const onClose = vi.fn()
    const onPick = vi.fn()
    const onInsertUrl = vi.fn()
    mountPicker({
      assets: {
        list: () => [item, { id: 'b', name: 'Portrait', url: '/portrait.png' }],
        upload: () => uploaded.promise,
      },
      pageImages: () => [pageImage],
      i18n,
      onPick,
      onClose,
      onInsertUrl,
    })
    const dialog = currentDialog()
    await vi.waitFor(() => expect(dialog.querySelectorAll('.sigil-media-card')).toHaveLength(2))
    const query = search('Portrait')
    pickFile(dialog, new File(['1'], 'new.png'))
    const library = tab('library')
    const page = tab('page')
    const url = tab('url')
    expect(Array.from(dialog.querySelectorAll('[role=tab]'), (tab) => tab.textContent)).toEqual([
      '素材庫',
      '本頁圖片',
      '圖片網址',
    ])
    library.focus()
    pressKey(library, 'ArrowLeft')
    expect(document.activeElement).toBe(url)
    expect(dialog.querySelector('[role=tabpanel]')?.getAttribute('aria-labelledby')).toBe(url.id)
    expect(
      dialog.querySelector(
        'input[type=search],.sigil-media-status,.sigil-media-upload,.sigil-media-grid',
      ),
    ).toBeNull()
    const source = dialog.querySelector<HTMLInputElement>('[data-image-url]')!
    source.value = '/new.png'
    source.dispatchEvent(new Event('input', { bubbles: true }))
    const alt = dialog.querySelector<HTMLInputElement>('[data-image-alt]')!
    alt.value = '人物'
    alt.dispatchEvent(new Event('input', { bubbles: true }))
    uploaded.resolve({ id: 'uploaded', name: 'Uploaded', url: '/uploaded.png' })
    await Promise.resolve()
    expect(url.getAttribute('aria-selected')).toBe('true')
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onInsertUrl).not.toHaveBeenCalled()
    i18n.setLocale('en')
    expect(url.textContent).toBe('Image URL')
    dialog.querySelector<HTMLButtonElement>('.sigil-image-url-preview')!.click()
    const pending = dialog.querySelector<HTMLImageElement>('.sigil-image-url-photo img')!
    pressKey(url, 'ArrowRight')
    expect(document.activeElement).toBe(library)
    expect(pending.isConnected).toBe(false)
    pending.dispatchEvent(new Event('load'))
    expect(query.value).toBe('Portrait')
    search('Uploaded')
    expect(dialog.querySelector('.sigil-media-name')?.textContent).toBe('Uploaded')
    pressKey(library, 'ArrowRight')
    expect(document.activeElement).toBe(page)
    search('頁尾')
    pressKey(page, 'End')
    expect(document.activeElement).toBe(url)
    expect(dialog.querySelector<HTMLInputElement>('[data-image-url]')?.value).toBe('/new.png')
    expect(dialog.querySelector<HTMLInputElement>('[data-image-alt]')?.value).toBe('人物')
    expect(dialog.querySelector<HTMLButtonElement>('.sigil-image-url-insert')?.disabled).toBe(true)
    pressKey(url, 'ArrowLeft')
    expect(document.activeElement).toBe(page)
    expect(query.value).toBe('頁尾')
  })

  it('只有本頁與網址來源時預設顯示本頁，網址可鍵盤往返', () => {
    mountPicker({
      pageImages: () => [pageImage],
      onInsertUrl: vi.fn(),
      onPick: vi.fn(),
      onClose: vi.fn(),
    })
    const dialog = currentDialog()
    const page = tab('page')
    const url = tab('url')
    expect(tab('library')).toBeNull()
    expect(page.getAttribute('aria-selected')).toBe('true')
    expect(dialog.querySelector('[data-image-url]')).toBeNull()
    pressKey(page, 'End')
    expect(dialog.querySelector('[data-image-url]')).toBeTruthy()
    expect(url.getAttribute('aria-selected')).toBe('true')
    expect(page.tabIndex).toBe(-1)
    pressKey(url, 'Home')
    expect(document.activeElement).toBe(page)
    expect(dialog.querySelector('.sigil-media-card')).toBeTruthy()
  })

  it('無素材庫且首次讀取本頁為空時聚焦網址分頁，仍可返回空的本頁', () => {
    const pageImages = vi.fn(() => [])
    mountPicker({ pageImages, onInsertUrl: vi.fn(), onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    const url = tab('url')
    expect(url.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(url)
    expect(dialog.querySelector('[data-image-url]')).toBeTruthy()
    pressKey(url, 'ArrowLeft')
    expect(tab('page').getAttribute('aria-selected')).toBe('true')
    expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('本頁尚無圖片')
    expect(pageImages).toHaveBeenCalledOnce()
  })

  it('首次讀取本頁失敗時保留重試，重試為空時仍留在本頁', () => {
    const pageImages = vi
      .fn<NonNullable<MediaPickerOptions['pageImages']>>()
      .mockImplementationOnce(() => {
        throw new Error('unavailable')
      })
      .mockReturnValue([])
    mountPicker({ pageImages, onInsertUrl: vi.fn(), onPick: vi.fn(), onClose: vi.fn() })
    const dialog = currentDialog()
    const page = tab('page')
    expect(page.getAttribute('aria-selected')).toBe('true')
    expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('媒體載入失敗')
    dialog.querySelector<HTMLButtonElement>('.sigil-media-retry')!.click()
    expect(pageImages).toHaveBeenCalledTimes(2)
    expect(page.getAttribute('aria-selected')).toBe('true')
    expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('本頁尚無圖片')
  })

  it('有素材庫時保留預設分頁，首次手動進入空的本頁也會留在本頁', () => {
    const pageImages = vi.fn(() => [])
    mountPicker({
      assets: { list: () => [] },
      pageImages,
      onInsertUrl: vi.fn(),
      onPick: vi.fn(),
      onClose: vi.fn(),
    })
    expect(tab('library').getAttribute('aria-selected')).toBe('true')
    expect(pageImages).not.toHaveBeenCalled()
    const page = tab('page')
    page.click()
    expect(page.getAttribute('aria-selected')).toBe('true')
    expect(currentDialog().querySelector('.sigil-media-status')?.textContent).toBe('本頁尚無圖片')
  })

  it('只提供網址時直接開啟表單，依宿主檢核插入後關閉並還原焦點', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    cleanups.push(() => trigger.remove())
    trigger.focus()
    const onInsertUrl = vi.fn()
    const onClose = vi.fn()
    const onPick = vi.fn()
    const acceptsImageAttribute = vi.fn(
      (name: string, value: string) => name === 'src' || value !== '不可儲存',
    )
    mountPicker({ onInsertUrl, onPick, onClose, acceptsImageAttribute })
    const dialog = currentDialog()
    expect(dialog.querySelector('h3')?.textContent).toBe('圖片網址')
    expect(dialog.querySelector('[role=tablist],input[type=search],.sigil-media-status')).toBeNull()
    const form = dialog.querySelector<HTMLFormElement>('.sigil-image-url-form')!
    expect(form.hidden).toBe(false)
    const source = form.querySelector<HTMLInputElement>('[data-image-url]')!
    const alt = form.querySelector<HTMLInputElement>('[data-image-alt]')!
    source.value = '/photos/cover.webp'
    source.dispatchEvent(new Event('input'))
    form.querySelector<HTMLButtonElement>('.sigil-image-url-preview')!.click()
    const image = form.querySelector('img')!
    Object.defineProperty(image, 'naturalWidth', { value: 100 })
    image.dispatchEvent(new Event('load'))
    alt.value = '不可儲存'
    form.requestSubmit()
    expect(alt.getAttribute('aria-invalid')).toBe('true')
    expect(dialog.isConnected).toBe(true)
    expect(onInsertUrl).not.toHaveBeenCalled()
    alt.value = '封面照片'
    alt.dispatchEvent(new Event('input'))
    form.requestSubmit()
    expect(acceptsImageAttribute).toHaveBeenCalledWith('src', '/photos/cover.webp')
    expect(acceptsImageAttribute).toHaveBeenCalledWith('alt', '封面照片')
    expect(onInsertUrl).toHaveBeenCalledExactlyOnceWith('/photos/cover.webp', '封面照片')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onPick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
    form.requestSubmit()
    expect(onInsertUrl).toHaveBeenCalledTimes(1)
  })

  it('鍵盤切換分頁只讀取一次本頁圖片，保留搜尋及已展開的圖片', async () => {
    const gate = deferred<AssetItem[]>()
    const list = vi.fn(() => gate.promise)
    const pageImages = vi.fn(() =>
      Array.from({ length: 84 }, (_, i) => ({
        id: String(i),
        name: '照片 ' + i,
        url: '/photos/' + i,
        uses: 2,
        searchTerms: i === 83 ? ['Gallery', '相機'] : ['Album'],
      })),
    )
    const i18n = createI18n({
      zh: {},
      en: { 'media.page_uses': 'Uses on this page: {count}', 'media.more': 'Show more images' },
    })
    const onPick = vi.fn()
    mountPicker({
      assets: { list },
      pageImages,
      currentUrl: '/photos/83',
      i18n,
      onPick,
      onClose: vi.fn(),
    })
    const dialog = currentDialog()
    const library = tab('library')
    const page = tab('page')
    const panel = dialog.querySelector('[role=tabpanel]')!
    const grid = dialog.querySelector<HTMLElement>('.sigil-media-grid')!
    const more = dialog.querySelector<HTMLButtonElement>('.sigil-media-more')!
    expect(list).toHaveBeenCalledOnce()
    expect(tab('url')).toBeNull()
    expect(pageImages).not.toHaveBeenCalled()
    expect(library.getAttribute('aria-selected')).toBe('true')
    expect(page.tabIndex).toBe(-1)
    library.focus()
    library.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(pageImages).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(page)
    expect(page.tabIndex).toBe(0)
    expect(panel.getAttribute('aria-labelledby')).toBe(page.id)
    expect(page.getAttribute('aria-controls')).toBe(panel.id)
    expect(grid.childElementCount).toBe(36)
    const first = grid.firstElementChild
    more.click()
    expect(grid.childElementCount).toBe(72)
    expect(grid.firstElementChild).toBe(first)
    expect(document.activeElement).toBe(grid.children[36])
    i18n.setLocale('en')
    expect(more.textContent).toBe('Show more images')
    expect(grid.querySelector('.sigil-media-uses')?.textContent).toBe('Uses on this page: 2')
    expect(document.activeElement).toBe(grid.children[36])
    library.click()
    expect(grid.childElementCount).toBe(0)
    gate.resolve([item, { id: '2', name: 'Portrait', url: '/portrait.png' }])
    await vi.waitFor(() => expect(grid.childElementCount).toBe(2))
    search('Portrait')
    expect(grid.childElementCount).toBe(1)
    page.click()
    expect(grid.childElementCount).toBe(72)
    expect(pageImages).toHaveBeenCalledOnce()
    const input = search(' 相機  ＧＡＬＬＥＲＹ ')
    expect(grid.childElementCount).toBe(1)
    expect(more.hidden).toBe(true)
    library.click()
    expect(input.value).toBe('Portrait')
    page.click()
    expect(input.value).toBe(' 相機  ＧＡＬＬＥＲＹ ')
    const card = grid.querySelector<HTMLButtonElement>('[aria-current=true]')!
    expect(document.getElementById(card.getAttribute('aria-labelledby')!)?.textContent).toBe(
      '照片 83',
    )
    expect(document.getElementById(card.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Uses on this page: 2',
    )
    card.click()
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: '83', url: '/photos/83' }))
  })

  it('只提供本頁圖片時直接載入，讀取失敗後可重試、搜尋與選取', () => {
    const pageImages = vi
      .fn<NonNullable<MediaPickerOptions['pageImages']>>()
      .mockImplementationOnce(() => {
        throw new Error('host error')
      })
      .mockReturnValueOnce([pageImage])
    const onPick = vi.fn()
    mountPicker({ pageImages, onPick, onClose: vi.fn() })
    const dialog = currentDialog()
    expect(dialog.querySelector('[role=tablist]')).toBeNull()
    expect(dialog.querySelector('.sigil-media-upload')).toBeNull()
    expect(dialog.querySelector('.sigil-media-status')?.textContent).toBe('媒體載入失敗')
    dialog.querySelector<HTMLButtonElement>('.sigil-media-retry')!.click()
    expect(pageImages).toHaveBeenCalledTimes(2)
    const input = search('其它')
    expect(input.hidden).toBe(false)
    expect(input.getAttribute('aria-label')).toBe('搜尋本頁圖片')
    expect(dialog.querySelector('.sigil-media-card')).toBeNull()
    search('頁尾 image')
    expect(dialog.querySelector('.sigil-media-uses')?.textContent).toBe('本頁使用 3 次')
    dialog.querySelector<HTMLButtonElement>('.sigil-media-card')!.click()
    expect(onPick).toHaveBeenCalledWith(pageImage)
  })

  it('素材庫的延遲錯誤不會覆蓋本頁空狀態，重試後可載入素材', async () => {
    const gate = deferred<AssetItem[]>()
    const list = vi
      .fn<AssetStore['list']>()
      .mockReturnValueOnce(gate.promise)
      .mockReturnValue([item])
    mountPicker({ assets: { list }, pageImages: () => [], onClose: vi.fn(), onPick: vi.fn() })
    const dialog = currentDialog()
    const status = dialog.querySelector<HTMLElement>('.sigil-media-status')!
    const retry = dialog.querySelector<HTMLButtonElement>('.sigil-media-retry')!
    tab('page').click()
    expect(status.textContent).toBe('本頁尚無圖片')
    gate.reject(new Error('offline'))
    await Promise.resolve()
    expect(status.textContent).toBe('本頁尚無圖片')
    expect(retry.hidden).toBe(true)
    tab('library').click()
    expect(retry.hidden).toBe(false)
    expect(status.textContent).toBe('媒體載入失敗')
    retry.click()
    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('離開素材庫後，上傳成功留在本頁且稍後收到的清單保留上傳項目', async () => {
    const gate = deferred<AssetItem[]>()
    const upload = deferred<AssetItem>()
    const onPick = vi.fn()
    const onClose = vi.fn()
    mountPicker({
      assets: { list: () => gate.promise, upload: () => upload.promise },
      pageImages: () => [pageImage],
      onPick,
      onClose,
    })
    const dialog = currentDialog()
    const grid = dialog.querySelector<HTMLElement>('.sigil-media-grid')!
    pickFile(dialog, new File(['image'], 'upload.png'))
    tab('page').click()
    upload.resolve({ id: 'uploaded', name: 'Uploaded', url: '/uploaded.png' })
    await Promise.resolve()
    gate.resolve([item])
    await Promise.resolve()
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(grid.querySelector('.sigil-media-name')?.textContent).toBe('Image')
    expect(grid.querySelector('.sigil-media-uses')).toBeTruthy()
    tab('library').click()
    expect(
      Array.from(grid.querySelectorAll('.sigil-media-name'), (label) => label.textContent),
    ).toEqual(['Uploaded', 'Image'])
    grid.querySelector<HTMLButtonElement>('button')!.click()
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'uploaded' }))
  })
})

describe('openMediaPicker', () => {
  it('依名稱搜尋並保留目前圖片，清除搜尋後能選取其他圖片', async () => {
    const onPick = vi.fn()
    mountPicker({
      assets: { list: () => [item, { id: '2', name: 'Spring Print', url: '/print.webp' }] },
      currentUrl: item.url,
      onPick,
      onClose: vi.fn(),
    })
    const dialog = currentDialog()
    const search = dialog.querySelector<HTMLInputElement>('input[type=search]')!
    const status = dialog.querySelector<HTMLElement>('.sigil-media-status')!
    await vi.waitFor(() => expect(search.hidden).toBe(false))
    const current = dialog.querySelector<HTMLButtonElement>('[aria-current=true]')!
    expect(current.textContent).toContain('使用中')
    expect(current.querySelector('img')?.alt).toBe('')
    search.value = ' winter '
    search.dispatchEvent(new Event('input'))
    expect(status.textContent).toContain('沒有符合的圖片')
    expect(dialog.querySelector('.sigil-media-card')).toBeNull()
    search.value = ' PRINT '
    search.dispatchEvent(new Event('input'))
    expect(dialog.querySelectorAll('.sigil-media-card:not([hidden])')).toHaveLength(1)
    expect(status.hidden).toBe(true)
    search.value = ''
    search.dispatchEvent(new Event('input'))
    expect(dialog.querySelector('[aria-current=true]')?.textContent).toContain('使用中')
    dialog.querySelector<HTMLButtonElement>('.sigil-media-card:last-child')!.click()
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ url: '/print.webp' }))
  })

  it('宿主可指定檔案類型與換檔提示，挑選其他檔案後可繼續', async () => {
    const onPick = vi.fn()
    const upload = vi
      .fn<NonNullable<AssetStore['upload']>>()
      .mockRejectedValueOnce(new RangeError('internal-limit'))
      .mockResolvedValueOnce(item)
    mountPicker({
      assets: {
        list: () => [],
        uploadAccept: 'image/png',
        describeUploadError: (error) =>
          error instanceof RangeError
            ? { message: '請改選較小的 PNG。', retryable: false }
            : undefined,
        upload,
      },
      onPick,
      onClose: vi.fn(),
    })
    const dialog = currentDialog()
    const input = pickFile(dialog, new File(['large'], 'large.png'))
    expect(input.accept).toBe('image/png')
    await vi.waitFor(() => expect(dialog.textContent).toContain('請改選較小的 PNG。'))
    expect(dialog.textContent).not.toContain('internal-limit')
    expect(dialog.querySelector<HTMLButtonElement>('.sigil-media-upload-retry')?.hidden).toBe(true)
    expect(onPick).not.toHaveBeenCalled()
    pickFile(dialog, new File(['small'], 'small.png'))
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledExactlyOnceWith(item))
  })

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
