import { createId, type AssetItem, type AssetStore, type I18n } from '@cluion/sigil-core'
import { subscribeLocale, uiText } from './i18n.js'

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
    (element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'),
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
  assets: AssetStore
  i18n?: I18n
  /** 目前已選 url，可高亮 */
  currentUrl?: string
  onPick: (item: AssetItem) => void
  onClose: () => void
}

/**
 * 簡易媒體選擇浮層：列表 + 可選上傳
 */
export function openMediaPicker(opts: MediaPickerOptions): () => void {
  const previousFocus = document.activeElement
  let closed = false
  const lifetime = new AbortController()
  lifetime.signal.addEventListener('abort', close)
  let listState: 'idle' | 'loading' | 'ready' | 'empty' | 'error' = 'idle'
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

  const grid = document.createElement('div')
  grid.className = 'sigil-media-grid'

  const search = document.createElement('input')
  search.className = 'sigil-input sigil-media-search'
  search.type = 'search'
  search.hidden = true
  const cards: { button: HTMLButtonElement; name: string }[] = []
  let currentBadge: HTMLElement | undefined
  let noMatches = false
  search.addEventListener('input', filterItems)

  const listStatus = document.createElement('p')
  listStatus.className = 'sigil-media-status sigil-muted'
  listStatus.setAttribute('role', 'status')
  const listRetry = document.createElement('button')
  listRetry.type = 'button'
  listRetry.className = 'sigil-btn sigil-media-retry'
  listRetry.hidden = true
  listRetry.addEventListener('click', () => {
    void loadItems()
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
  if (opts.assets.upload) {
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = opts.assets.uploadAccept ?? 'image/*'
    fileInput.hidden = true
    uploadBtn = document.createElement('button')
    uploadBtn.type = 'button'
    uploadBtn.className = 'sigil-btn sigil-media-upload'
    uploadBtn.addEventListener('click', () => {
      if (!closed && uploadState !== 'loading') fileInput?.click()
    })
    fileInput.addEventListener('change', () => {
      if (closed || uploadState === 'loading') return
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

  panel.append(head, tools, listStatus, listRetry, feedback, grid)
  backdrop.appendChild(panel)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  document.body.appendChild(backdrop)
  closeBtn.focus()

  function onKeyDown(event: KeyboardEvent): void {
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
    const focused = document.activeElement
    if (
      (focused === listRetry && listState !== 'error') ||
      (uploadBtn && focused === uploadBtn && uploadState === 'loading') ||
      (uploadRetry && focused === uploadRetry && !failedUpload)
    ) {
      // Keep focus inside the dialog before its current control becomes unavailable.
      closeBtn.focus()
    }
    title.textContent = uiText(opts.i18n, 'media.title', '媒體庫')
    closeBtn.textContent = uiText(opts.i18n, 'media.close', '關閉')
    search.placeholder = uiText(opts.i18n, 'media.search', '搜尋圖片名稱')
    search.setAttribute('aria-label', search.placeholder)
    tools.hidden = search.hidden && !uploadBtn
    feedback.hidden = uploadState === 'idle'
    if (currentBadge) currentBadge.textContent = uiText(opts.i18n, 'media.current', '使用中')
    listStatus.hidden = listState === 'ready' && !noMatches
    if (listState === 'error')
      listStatus.textContent = uiText(opts.i18n, 'media.load_failed', '媒體載入失敗')
    else if (listState === 'empty')
      listStatus.textContent = uiText(opts.i18n, 'media.empty', '尚無媒體')
    else if (noMatches)
      listStatus.textContent = uiText(
        opts.i18n,
        'media.empty_search',
        '沒有符合的圖片，請試試其他名稱。',
      )
    else if (listState === 'ready') listStatus.textContent = ''
    else listStatus.textContent = uiText(opts.i18n, 'media.loading', '正在載入媒體…')
    listRetry.hidden = listState !== 'error'
    listRetry.textContent = uiText(opts.i18n, 'media.retry', '重試')
    grid.setAttribute('aria-busy', String(listState === 'loading'))
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

  function filterItems(): void {
    const query = search.value.trim().toLowerCase()
    let matches = 0
    for (const { button, name } of cards) {
      button.hidden = !name.includes(query)
      if (!button.hidden) matches++
    }
    noMatches = cards.length > 0 && !matches
    refreshText()
  }

  function pick(item: AssetItem): void {
    if (closed) return
    try {
      opts.onPick(item)
    } finally {
      close()
    }
  }

  async function uploadFile(file: File): Promise<void> {
    if (closed || uploadState === 'loading' || !opts.assets.upload) return
    failedUpload = null
    uploadError = undefined
    uploadState = 'loading'
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
    // A host pick callback cannot turn a completed upload into a retryable upload error.
    try {
      pick(item)
    } catch {
      // The dialog is already closed; keep the event's async path handled.
    }
  }

  async function loadItems(): Promise<void> {
    if (closed || listState === 'loading') return
    listState = 'loading'
    refreshText()
    let items: AssetItem[]
    try {
      items = await opts.assets.list()
    } catch {
      if (closed) return
      listState = 'error'
      refreshText()
      return
    }
    if (closed) return
    grid.replaceChildren()
    cards.length = 0
    currentBadge = undefined
    listState = items.length ? 'ready' : 'empty'
    for (const item of items) {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'sigil-media-card'
      const img = document.createElement('img')
      img.src = item.thumbUrl ?? item.url
      img.alt = ''
      img.loading = 'lazy'
      const label = document.createElement('span')
      label.className = 'sigil-media-name'
      label.textContent = item.name ?? item.id
      card.append(img, label)
      if (item.url === opts.currentUrl && !currentBadge) {
        card.classList.add('sigil-media-card--active')
        card.setAttribute('aria-current', 'true')
        currentBadge = document.createElement('span')
        currentBadge.className = 'sigil-media-current'
        currentBadge.setAttribute('aria-hidden', 'true')
        card.append(currentBadge)
      }
      card.addEventListener('click', () => pick(item))
      cards.push({ button: card, name: label.textContent.toLowerCase() })
      grid.appendChild(card)
    }
    search.hidden = cards.length < 2
    filterItems()
  }

  const unsubLocale = subscribeLocale(opts.i18n, refreshText)
  void loadItems()

  function close(): void {
    if (closed) return
    closed = true
    lifetime.signal.removeEventListener('abort', close)
    failedUpload = null
    unsubLocale()
    document.removeEventListener('keydown', onKeyDown)
    backdrop.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    opts.onClose()
  }

  // Controls may retain the handle after the dialog closes and releases its asset cards.
  return lifetime.abort.bind(lifetime)
}
