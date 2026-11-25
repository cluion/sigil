import { createId, type AssetItem, type AssetStore, type I18n } from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'
import { createImageUrlForm } from './image-url-form.js'
import { createMediaResults, indexAsset } from './media-results.js'
import type { PageImage } from './page-images.js'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'),
  )
}

function trapFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return
  const focusable = focusableElements(root)
  if (!focusable.length) {
    event.preventDefault()
    root.focus()
    return
  }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export interface MediaPickerOptions {
  assets?: AssetStore
  /** 首次瀏覽本頁圖片時取得可重用的圖片與使用次數。 */
  pageImages?: () => readonly PageImage[]
  /** 提供此回呼以顯示可預覽的圖片網址表單。 */
  onInsertUrl?: (url: string, alt: string) => void
  acceptsImageAttribute?: (name: 'src' | 'alt', value: string) => boolean
  i18n?: I18n
  /** 目前已選 url，可高亮 */
  currentUrl?: string
  onPick: (item: AssetItem) => void
  onClose: () => void
}

type ListSource = 'library' | 'page'
type Source = ListSource | 'url'
const SOURCE_LABELS = {
  library: ['media.library', '素材庫'],
  page: ['media.page_images', '本頁圖片'],
  url: ['media.image_url', '圖片網址'],
} as const
interface SourceState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: ReturnType<typeof indexAsset>[]
  query: string
  rendered: number
  scrollTop: number
}

function emptySource(): SourceState {
  return { status: 'idle', items: [], query: '', rendered: 0, scrollTop: 0 }
}

/** 從宿主素材庫、本頁圖片或網址選擇圖片。 */
export function openMediaPicker(opts: MediaPickerOptions): () => void {
  const previousFocus = document.activeElement
  let closed = false
  const lifetime = new AbortController()
  lifetime.signal.addEventListener('abort', close)
  const sources = { library: emptySource(), page: emptySource() }
  const available: Source[] = []
  if (opts.assets) available.push('library')
  if (opts.pageImages) available.push('page')
  if (opts.onInsertUrl) available.push('url')
  let active: Source = available[0] ?? 'page'
  let pickUploadOnFinish = false
  const pendingLibraryItems = new Map<string, AssetItem>()
  let uploadState: 'idle' | 'loading' | 'error' = 'idle'
  let failedUpload: File | null = null
  let uploadError: ReturnType<NonNullable<AssetStore['describeUploadError']>>
  const backdrop = document.createElement('div')
  backdrop.className = 'sigil-media-backdrop'
  backdrop.classList.toggle('sigil-theme-dark', !!previousFocus?.closest('.sigil-theme-dark'))
  backdrop.setAttribute('role', 'dialog')
  backdrop.setAttribute('aria-modal', 'true')
  backdrop.tabIndex = -1

  const panel = document.createElement('div')
  panel.className = 'sigil-media-panel'

  const head = document.createElement('div')
  head.className = 'sigil-media-head'
  const title = document.createElement('h3')
  title.id = `sigil-media-title-${createId()}`
  title.textContent = uiText(opts.i18n, 'media.title', '媒體庫')
  backdrop.setAttribute('aria-labelledby', title.id)
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'sigil-btn sigil-btn--ghost'
  closeBtn.textContent = uiText(opts.i18n, 'media.close', '關閉')
  closeBtn.addEventListener('click', () => close())
  head.append(title, closeBtn)

  const results = createMediaResults(opts.currentUrl, opts.i18n, pick, lifetime.signal)
  const urlForm = opts.onInsertUrl
    ? createImageUrlForm({
        i18n: opts.i18n,
        acceptsImageAttribute: opts.acceptsImageAttribute,
        onInsert(url, alt) {
          if (closed || active !== 'url') return
          try {
            opts.onInsertUrl?.(url, alt)
          } finally {
            close()
          }
        },
      })
    : undefined
  const content = document.createElement('div')
  content.className = 'sigil-media-source-panel'
  content.id = 'sigil-media-panel-' + createId()
  const tabs = document.createElement('div')
  tabs.className = 'sigil-media-sources'
  tabs.setAttribute('role', 'tablist')
  const tabButtons = new Map<Source, HTMLButtonElement>()
  if (available.length > 1) {
    content.setAttribute('role', 'tabpanel')
    for (const source of available) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = content.id + '-' + source
      button.className = 'sigil-btn'
      button.dataset.mediaSource = source
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-controls', content.id)
      button.addEventListener('click', () => selectSource(source), { signal: lifetime.signal })
      tabButtons.set(source, button)
      tabs.append(button)
    }
    tabs.addEventListener(
      'keydown',
      (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        let index = available.indexOf(active)
        if (event.key === 'Home') index = 0
        else if (event.key === 'End') index = available.length - 1
        else if (event.key === 'ArrowRight') index = (index + 1) % available.length
        else if (event.key === 'ArrowLeft')
          index = (index + available.length - 1) % available.length
        else return
        event.preventDefault()
        const source = available[index]!
        selectSource(source)
        tabButtons.get(source)?.focus()
      },
      { signal: lifetime.signal },
    )
  }

  const search = document.createElement('input')
  search.className = 'sigil-input sigil-media-search'
  search.type = 'search'
  search.hidden = true
  search.setAttribute('aria-controls', results.grid.id)
  let noMatches = false
  search.addEventListener(
    'input',
    () => {
      if (active === 'url') return
      const source = sources[active]
      source.query = search.value
      source.rendered = 0
      source.scrollTop = 0
      renderItems(active)
    },
    { signal: lifetime.signal },
  )

  const listStatus = document.createElement('p')
  listStatus.className = 'sigil-media-status sigil-muted'
  listStatus.setAttribute('role', 'status')
  const listRetry = document.createElement('button')
  listRetry.type = 'button'
  listRetry.className = 'sigil-btn sigil-media-retry'
  listRetry.hidden = true
  listRetry.addEventListener('click', () => {
    if (active !== 'url') void loadItems(active)
  })

  const actions = document.createElement('div')
  actions.className = 'sigil-media-actions'
  const tools = document.createElement('div')
  tools.className = 'sigil-media-tools'
  tools.append(search, actions)
  const feedback = document.createElement('div')
  feedback.className = 'sigil-media-feedback'

  let uploadBtn: HTMLButtonElement | null = null
  let fileInput: HTMLInputElement | null = null
  let uploadStatus: HTMLParagraphElement | null = null
  let uploadRetry: HTMLButtonElement | null = null
  if (opts.assets?.upload) {
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = opts.assets.uploadAccept ?? 'image/*'
    fileInput.hidden = true
    uploadBtn = document.createElement('button')
    uploadBtn.type = 'button'
    uploadBtn.className = 'sigil-btn sigil-media-upload'
    uploadBtn.addEventListener('click', () => {
      if (!closed && active === 'library' && uploadState !== 'loading') fileInput?.click()
    })
    fileInput.addEventListener('change', () => {
      if (closed || active !== 'library' || uploadState === 'loading') return
      const file = fileInput?.files?.[0]
      // Let the chooser emit change when the same file is selected again after failure.
      if (fileInput) fileInput.value = ''
      if (file) void uploadFile(file)
    })
    uploadStatus = document.createElement('p')
    uploadStatus.className = 'sigil-media-upload-status sigil-muted'
    uploadStatus.setAttribute('role', 'status')
    uploadRetry = document.createElement('button')
    uploadRetry.type = 'button'
    uploadRetry.className = 'sigil-btn sigil-media-upload-retry'
    uploadRetry.hidden = true
    uploadRetry.addEventListener('click', () => {
      if (failedUpload) void uploadFile(failedUpload)
    })
    actions.append(uploadBtn, fileInput)
    feedback.append(uploadStatus, uploadRetry)
  }

  const listControls = [tools, listStatus, listRetry, feedback, results.grid, results.more]
  panel.append(head)
  if (tabButtons.size) panel.append(tabs)
  panel.append(content)
  backdrop.appendChild(panel)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  document.body.appendChild(backdrop)
  closeBtn.focus()

  function onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    trapFocus(event, backdrop)
  }
  document.addEventListener('keydown', onKeyDown)

  function refreshText(): void {
    if (closed) return
    title.textContent =
      active === 'url' && available.length === 1
        ? uiText(opts.i18n, 'media.image_url', '圖片網址')
        : uiText(opts.i18n, 'media.title', '媒體庫')
    closeBtn.textContent = uiText(opts.i18n, 'media.close', '關閉')
    tabs.setAttribute('aria-label', uiText(opts.i18n, 'media.sources', '圖片來源'))
    for (const [key, button] of tabButtons) {
      const [message, fallback] = SOURCE_LABELS[key]
      button.textContent = uiText(opts.i18n, message, fallback)
      button.setAttribute('aria-selected', String(key === active))
      button.tabIndex = key === active ? 0 : -1
      if (key === active) content.setAttribute('aria-labelledby', button.id)
    }
    if (active === 'url') return
    const source = sources[active]
    const library = active === 'library'
    const focused = document.activeElement
    if (
      (focused === listRetry && source.status !== 'error') ||
      (uploadBtn && focused === uploadBtn && uploadState === 'loading') ||
      (uploadRetry && focused === uploadRetry && !failedUpload)
    ) {
      // Keep focus inside the dialog before its current control becomes unavailable.
      closeBtn.focus()
    }
    search.placeholder = library
      ? uiText(opts.i18n, 'media.search', '搜尋圖片名稱')
      : uiText(opts.i18n, 'media.search_page', '搜尋本頁圖片')
    search.setAttribute('aria-label', search.placeholder)
    search.hidden = source.items.length < (library ? 2 : 1)
    actions.hidden = !library
    tools.hidden = search.hidden && (!library || !uploadBtn)
    feedback.hidden = !library || uploadState === 'idle'
    listStatus.hidden = source.status === 'ready' && source.items.length > 0 && !noMatches
    if (source.status === 'error')
      listStatus.textContent = uiText(opts.i18n, 'media.load_failed', '媒體載入失敗')
    else if (source.status === 'ready' && !source.items.length)
      listStatus.textContent = library
        ? uiText(opts.i18n, 'media.empty', '尚無媒體')
        : uiText(opts.i18n, 'media.empty_page', '本頁尚無圖片')
    else if (noMatches)
      listStatus.textContent = uiText(
        opts.i18n,
        'media.empty_search',
        '沒有符合的圖片，請試試其他名稱。',
      )
    else if (source.status === 'ready') listStatus.textContent = ''
    else listStatus.textContent = uiText(opts.i18n, 'media.loading', '正在載入媒體…')
    listRetry.hidden = source.status !== 'error'
    listRetry.textContent = uiText(opts.i18n, 'media.retry', '重試')
    results.grid.setAttribute('aria-busy', String(source.status === 'loading'))
    if (uploadBtn) {
      uploadBtn.disabled = uploadState === 'loading'
      uploadBtn.textContent =
        uploadState === 'loading'
          ? uiText(opts.i18n, 'media.uploading', '正在上傳…')
          : uiText(opts.i18n, 'media.upload', '上傳圖片')
    }
    if (fileInput) fileInput.disabled = uploadState === 'loading'
    if (uploadStatus) {
      uploadStatus.hidden = uploadState === 'idle'
      uploadStatus.textContent =
        uploadState === 'error'
          ? uploadError?.message || uiText(opts.i18n, 'media.upload_failed', '圖片上傳失敗')
          : uploadState === 'loading'
            ? uiText(opts.i18n, 'media.uploading', '正在上傳…')
            : ''
    }
    if (uploadRetry) {
      uploadRetry.hidden = !failedUpload
      uploadRetry.textContent = uiText(opts.i18n, 'media.retry_upload', '重試上傳')
    }
  }

  function selectSource(next: Source): void {
    if (closed || active === next) return
    if (active !== 'url') {
      sources[active].rendered = results.grid.childElementCount
      sources[active].scrollTop = results.grid.scrollTop
    }
    pickUploadOnFinish = false
    active = next
    tabButtons.get(next)?.focus({ preventScroll: true })
    showSource()
  }

  function showSource(): void {
    urlForm?.setActive(active === 'url')
    if (active === 'url') {
      content.replaceChildren(urlForm!.el)
      refreshText()
      return
    }
    if (tools.parentElement !== content) content.replaceChildren(...listControls)
    search.value = sources[active].query
    renderItems(active)
    if (sources[active].status === 'idle') void loadItems(active)
  }

  function renderItems(key: ListSource): void {
    const source = sources[key]
    const count = results.render(source.items, source.query, source.rendered)
    noMatches = source.items.length > 0 && count === 0
    results.grid.scrollTop = source.scrollTop
    refreshText()
  }

  function pick(item: AssetItem): void {
    if (closed || active === 'url') return
    try {
      opts.onPick(item)
    } finally {
      close()
    }
  }

  async function uploadFile(file: File): Promise<void> {
    if (closed || active !== 'library' || uploadState === 'loading' || !opts.assets?.upload) return
    failedUpload = null
    uploadError = undefined
    uploadState = 'loading'
    pickUploadOnFinish = true
    refreshText()
    let item: AssetItem
    try {
      item = await opts.assets.upload(file)
    } catch (error) {
      if (closed) return
      uploadError = opts.assets.describeUploadError?.(error)
      failedUpload = uploadError?.retryable === false ? null : file
      uploadState = 'error'
      refreshText()
      return
    }
    if (closed) return
    if (!pickUploadOnFinish) {
      uploadState = 'idle'
      const library = sources.library
      if (library.status !== 'ready') pendingLibraryItems.set(item.id, item)
      library.items = [
        indexAsset(item),
        ...library.items.filter((entry) => entry.item.id !== item.id),
      ]
      if (active === 'library') renderItems(active)
      return
    }
    // A host pick callback cannot turn a completed upload into a retryable upload error.
    try {
      pick(item)
    } catch {
      // The dialog is already closed; keep the event's async path handled.
    }
  }

  async function loadItems(key: ListSource): Promise<void> {
    const source = sources[key]
    if (closed || source.status === 'loading') return
    const openUrlIfEmpty = key === 'page' && source.status === 'idle' && !opts.assets && urlForm
    source.status = 'loading'
    if (key === active) refreshText()
    try {
      if (key === 'library') {
        const assets = await opts.assets!.list()
        if (closed) return
        const items = pendingLibraryItems.size
          ? [
              ...Array.from(pendingLibraryItems.values()).reverse(),
              ...assets.filter((asset) => !pendingLibraryItems.has(asset.id)),
            ]
          : assets
        source.items = items.map((item) => indexAsset(item))
        pendingLibraryItems.clear()
      } else {
        source.items = (opts.pageImages?.() ?? []).map((item) => indexAsset(item, item))
      }
      source.status = 'ready'
    } catch {
      if (closed) return
      source.status = 'error'
    }
    if (key !== active) return
    if (openUrlIfEmpty && source.status === 'ready' && !source.items.length) {
      selectSource('url')
    } else {
      renderItems(key)
    }
  }

  function refreshLocale() {
    results.refreshLocale()
    urlForm?.refreshLocale()
    refreshText()
  }
  const unsubLocale = subscribeLocale(opts.i18n, refreshLocale)
  refreshLocale()
  showSource()

  function close(): void {
    if (closed) return
    closed = true
    lifetime.signal.removeEventListener('abort', close)
    lifetime.abort()
    failedUpload = null
    urlForm?.destroy()
    unsubLocale()
    document.removeEventListener('keydown', onKeyDown)
    backdrop.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    opts.onClose()
  }

  // Controls may retain the handle after the dialog closes and releases its asset cards.
  return lifetime.abort.bind(lifetime)
}
