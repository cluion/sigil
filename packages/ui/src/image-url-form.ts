import { createId, type I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'

interface ImageUrlFormOptions {
  i18n?: I18n
  acceptsImageAttribute?: (name: 'src' | 'alt', value: string) => boolean
  onInsert: (url: string, alt: string) => void
}

type PreviewState = 'idle' | 'invalid' | 'rejected' | 'loading' | 'failed' | 'ready'

function isImageAddress(value: string): boolean {
  if (!value || /[\s\\]/u.test(value) || /[\p{Cc}]/u.test(value)) return false
  if (value.startsWith('/')) return !value.startsWith('//')
  if (!/^https?:\/\/[^/?#]/i.test(value)) return false
  try {
    const parsed = new URL(value)
    return !!parsed.hostname && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

export function createImageUrlForm(opts: ImageUrlFormOptions) {
  const events = new AbortController()
  const { signal } = events
  const t = (key: string, fallback: string) => uiText(opts.i18n, 'media.' + key, fallback)
  const el = document.createElement('form')
  el.className = 'sigil-image-url-form'
  el.noValidate = true
  el.hidden = true

  function field() {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field'
    const label = document.createElement('label')
    label.className = 'sigil-field-label'
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.id = 'sigil-image-field-' + createId()
    label.htmlFor = input.id
    wrap.append(label, input)
    return { wrap, label, input }
  }
  const address = field()
  address.input.dataset.imageUrl = ''
  address.input.inputMode = 'url'
  address.input.autocapitalize = 'none'
  address.input.autocomplete = 'off'
  address.input.spellcheck = false
  address.input.placeholder = 'https://…'
  const previewButton = document.createElement('button')
  previewButton.type = 'button'
  previewButton.className = 'sigil-btn sigil-image-url-preview'
  const row = document.createElement('div')
  row.className = 'sigil-image-url-row'
  row.append(address.input, previewButton)
  address.wrap.append(row)

  const figure = document.createElement('div')
  figure.className = 'sigil-image-url-photo'
  figure.hidden = true
  const status = document.createElement('p')
  status.className = 'sigil-image-url-status sigil-muted'
  status.id = address.input.id + '-status'
  status.setAttribute('role', 'status')
  address.input.setAttribute('aria-describedby', status.id)

  const alt = field()
  alt.input.dataset.imageAlt = ''
  const hint = document.createElement('span')
  hint.className = 'sigil-muted'
  hint.id = alt.input.id + '-hint'
  const altError = document.createElement('p')
  altError.id = alt.input.id + '-error'
  altError.className = 'sigil-image-url-error'
  altError.setAttribute('role', 'status')
  alt.input.setAttribute('aria-describedby', hint.id + ' ' + altError.id)
  alt.wrap.append(hint, altError)

  const insert = document.createElement('button')
  insert.type = 'submit'
  insert.className = 'sigil-btn sigil-btn--primary sigil-image-url-insert'
  el.append(address.wrap, figure, status, alt.wrap, insert)

  let state: PreviewState = 'idle'
  let image: HTMLImageElement | undefined
  let previewUrl = ''
  let altInvalid = false
  function refreshLocale(): void {
    address.label.textContent = t('image_url', '圖片網址')
    previewButton.textContent = t('preview_image', '預覽圖片')
    alt.label.textContent = uiText(opts.i18n, 'inspector.image_alt', '替代文字')
    hint.textContent = t('alt_hint', '裝飾用圖片可留白。')
    insert.textContent = t('insert_image', '插入圖片')
    let message = ''
    if (state === 'invalid')
      message = t('invalid_url', '請輸入 HTTP(S) 圖片網址或以 / 開頭的站內路徑。')
    if (state === 'rejected')
      message = t('rejected_url', '此網站無法儲存這個圖片網址，請更換網址。')
    if (state === 'loading') message = t('loading_image', '正在載入圖片…')
    if (state === 'failed')
      message = t('failed_image', '圖片無法載入。請確認網址可直接開啟圖片，再試一次。')
    if (state === 'ready' && image)
      message =
        t('image_loaded', '圖片已載入') + ' · ' + image.naturalWidth + ' × ' + image.naturalHeight
    status.textContent = message
    const invalid = state === 'invalid' || state === 'rejected' || state === 'failed'
    status.toggleAttribute('data-error', invalid)
    address.input.setAttribute('aria-invalid', String(invalid))
    alt.input.setAttribute('aria-invalid', String(altInvalid))
    altError.textContent = altInvalid
      ? t('invalid_alt', '這段替代文字無法儲存，請縮短或修改內容。')
      : ''
    previewButton.setAttribute('aria-disabled', String(state === 'loading'))
    insert.disabled = state !== 'ready'
  }

  function resetPreview(): void {
    if (image) {
      image.onload = image.onerror = null
      image.removeAttribute('src')
      figure.replaceChildren()
      image = undefined
    }
    figure.hidden = true
    previewUrl = ''
    state = 'idle'
  }
  function validSource(url: string): boolean {
    let issue: PreviewState
    if (!isImageAddress(url)) issue = 'invalid'
    else if (opts.acceptsImageAttribute?.('src', url) === false) issue = 'rejected'
    else return true
    resetPreview()
    state = issue
    refreshLocale()
    address.input.focus()
    return false
  }
  function preview(): void {
    const url = address.input.value.trim()
    if (el.hidden || signal.aborted || (state === 'loading' && url === previewUrl)) return
    resetPreview()
    if (!validSource(url)) return
    state = 'loading'
    previewUrl = url
    const next = document.createElement('img')
    image = next
    next.alt = ''
    function finish(loaded: boolean): void {
      if (image !== next || el.hidden || signal.aborted) return
      next.onload = next.onerror = null
      if (loaded && next.naturalWidth > 0) {
        state = 'ready'
        figure.hidden = false
      } else {
        resetPreview()
        state = 'failed'
      }
      refreshLocale()
    }
    next.onload = () => finish(true)
    next.onerror = () => finish(false)
    figure.append(next)
    refreshLocale()
    next.src = url
  }
  address.input.addEventListener(
    'input',
    () => {
      resetPreview()
      refreshLocale()
    },
    { signal },
  )
  address.input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault()
        preview()
      }
    },
    { signal },
  )
  alt.input.addEventListener(
    'input',
    () => {
      if (altInvalid) {
        altInvalid = opts.acceptsImageAttribute?.('alt', alt.input.value) === false
        refreshLocale()
      }
    },
    { signal },
  )
  previewButton.addEventListener('click', preview, { signal })
  el.addEventListener(
    'submit',
    (event) => {
      event.preventDefault()
      if (
        el.hidden ||
        signal.aborted ||
        state !== 'ready' ||
        address.input.value.trim() !== previewUrl
      )
        return
      if (!validSource(previewUrl)) return
      altInvalid = opts.acceptsImageAttribute?.('alt', alt.input.value) === false
      if (altInvalid) {
        refreshLocale()
        alt.input.focus()
      } else opts.onInsert(previewUrl, alt.input.value)
    },
    { signal },
  )
  refreshLocale()
  return {
    el,
    refreshLocale,
    setActive(active: boolean) {
      el.hidden = !active
      if (!active && state === 'loading') {
        resetPreview()
        refreshLocale()
      }
    },
    destroy() {
      events.abort()
      resetPreview()
    },
  }
}
