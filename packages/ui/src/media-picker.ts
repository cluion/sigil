import { createId, type AssetItem, type AssetStore } from '@cluion/sigil-core'

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
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
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
  const backdrop = document.createElement('div')
  backdrop.className = 'sigil-media-backdrop'
  backdrop.setAttribute('role', 'dialog')
  backdrop.setAttribute('aria-modal', 'true')
  backdrop.tabIndex = -1

  const panel = document.createElement('div')
  panel.className = 'sigil-media-panel'

  const head = document.createElement('div')
  head.className = 'sigil-media-head'
  const title = document.createElement('h3')
  title.id = `sigil-media-title-${createId()}`
  title.textContent = '媒體庫'
  backdrop.setAttribute('aria-labelledby', title.id)
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'sigil-btn sigil-btn--ghost'
  closeBtn.textContent = '關閉'
  closeBtn.addEventListener('click', () => close())
  head.append(title, closeBtn)

  const grid = document.createElement('div')
  grid.className = 'sigil-media-grid'

  const actions = document.createElement('div')
  actions.className = 'sigil-media-actions'

  if (opts.assets.upload) {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.hidden = true
    const uploadBtn = document.createElement('button')
    uploadBtn.type = 'button'
    uploadBtn.className = 'sigil-btn'
    uploadBtn.textContent = '上傳圖片'
    uploadBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (!file || !opts.assets.upload) return
      void Promise.resolve(opts.assets.upload(file)).then((item) => {
        opts.onPick(item)
        close()
      })
    })
    actions.append(uploadBtn, fileInput)
  }

  panel.append(head, grid, actions)
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

  void Promise.resolve(opts.assets.list()).then((items) => {
    if (closed) return
    grid.replaceChildren()
    if (!items.length) {
      const empty = document.createElement('p')
      empty.className = 'sigil-muted'
      empty.textContent = '尚無媒體'
      grid.appendChild(empty)
      return
    }
    for (const item of items) {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'sigil-media-card'
      if (item.url === opts.currentUrl) card.classList.add('sigil-media-card--active')
      const img = document.createElement('img')
      img.src = item.thumbUrl ?? item.url
      img.alt = item.name ?? item.id
      img.loading = 'lazy'
      const label = document.createElement('span')
      label.textContent = item.name ?? item.id
      card.append(img, label)
      card.addEventListener('click', () => {
        opts.onPick(item)
        close()
      })
      grid.appendChild(card)
    }
  })

  function close(): void {
    if (closed) return
    closed = true
    document.removeEventListener('keydown', onKeyDown)
    backdrop.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    opts.onClose()
  }

  return close
}
