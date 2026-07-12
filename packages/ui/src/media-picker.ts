import type { AssetItem, AssetStore } from '@cluion/sigil-core'

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
  const backdrop = document.createElement('div')
  backdrop.className = 'sigil-media-backdrop'
  backdrop.setAttribute('role', 'dialog')
  backdrop.setAttribute('aria-label', '選擇媒體')

  const panel = document.createElement('div')
  panel.className = 'sigil-media-panel'

  const head = document.createElement('div')
  head.className = 'sigil-media-head'
  const title = document.createElement('h3')
  title.textContent = '媒體庫'
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

  void Promise.resolve(opts.assets.list()).then((items) => {
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
    backdrop.remove()
    opts.onClose()
  }

  return close
}
