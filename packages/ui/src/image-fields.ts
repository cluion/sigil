import {
  createId,
  findNode,
  type AssetStore,
  type ComponentNode,
  type Engine,
  type I18n,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { supportsImageFraming } from './image-framing.js'
import { attribute, attributeKey } from './link-destination.js'
import { openMediaPicker } from './media-picker.js'
import { collectPageImages } from './page-images.js'

type ReplaceImage = (id: string, trigger: HTMLElement) => (() => void) | undefined

export function createImageReplacement(
  engine: Engine,
  opts?: { assets?: AssetStore; i18n?: I18n; richText?: Pick<RichTextResolver, 'supports'> },
) {
  let close: (() => void) | undefined
  let destroyed = false
  function open(id: string, trigger: HTMLElement, legacyAttributes = false) {
    function target() {
      if (destroyed || engine.getSelection() !== id) return
      const node = findNode(engine.getTree(), id)
      if (!node || node.locked || opts?.richText?.supports(node)) return
      if (
        supportsImageFraming(node) ||
        (legacyAttributes && !!opts?.assets && node.type === 'image')
      )
        return node
    }
    const node = target()
    if (!node) return
    if (close) return close
    trigger.focus({ preventScroll: true })
    const unsubscribe = engine.subscribe((event) => {
      if (event.type === 'tree' || event.type === 'selection' || !target()) close?.()
    })
    close = openMediaPicker({
      assets: opts?.assets,
      pageImages: () => collectPageImages(engine.getTree(), opts?.richText),
      i18n: opts?.i18n,
      currentUrl: attribute(node, 'src'),
      onPick(item) {
        const current = target()
        if (current && attribute(current, 'src') !== item.url)
          engine.update(id, { attributes: { [attributeKey(current, 'src')]: item.url } })
      },
      onClose() {
        unsubscribe()
        close = undefined
      },
    })
    return close
  }
  return {
    replaceImage: (id: string, trigger: HTMLElement) => open(id, trigger),
    replaceImageAttributes: (id: string, trigger: HTMLElement) => open(id, trigger, true),
    destroy() {
      destroyed = true
      close?.()
    },
  }
}

export function createImageFields(
  engine: Engine,
  node: ComponentNode,
  replaceImage: ReplaceImage | undefined,
  i18n?: I18n,
) {
  const events = new AbortController()
  const { signal } = events
  let closePicker: (() => void) | undefined
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'
  const label = document.createElement('label')
  label.className = 'sigil-field-label'
  const preview = document.createElement('img')
  preview.className = 'sigil-img-preview'
  preview.alt = ''
  const input = document.createElement('input')
  input.id = `sigil-image-url-${createId()}`
  label.htmlFor = input.id
  input.className = 'sigil-input'
  const sourceNote = document.createElement('span')
  sourceNote.id = input.id + '-source'
  sourceNote.className = 'sigil-muted'
  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  const pickBtn = document.createElement('button')
  pickBtn.type = 'button'
  pickBtn.className = 'sigil-btn'
  pickBtn.setAttribute('aria-haspopup', 'dialog')
  row.append(input)
  if (replaceImage) row.append(pickBtn)
  wrap.append(label, preview, sourceNote, row)

  const altField = document.createElement('div')
  altField.className = 'sigil-field'
  const altCaption = document.createElement('label')
  altCaption.className = 'sigil-field-label'
  const alt = document.createElement('input')
  alt.className = 'sigil-input'
  alt.id = `sigil-image-alt-${createId()}`
  altCaption.htmlFor = alt.id
  altField.append(altCaption, alt)

  function syncSource(src: string): void {
    const embedded = /^\s*data:/i.test(src)
    const value = embedded ? '' : src
    if (input.value !== value) input.value = value
    input.placeholder = embedded
      ? uiText(i18n, 'inspector.replace_image_url', '貼上圖片網址以更換')
      : 'https://…'
    sourceNote.hidden = !embedded
    if (embedded) {
      const format = /^\s*data:image\/([a-z0-9-]{1,32})(?:\+xml)?[;,]/i.exec(src)?.[1]
      const caption = uiText(i18n, 'inspector.embedded_image', '已嵌入圖片')
      sourceNote.textContent = format ? caption + ' · ' + format.toUpperCase() : caption
      input.setAttribute('aria-describedby', sourceNote.id)
    } else {
      sourceNote.textContent = ''
      input.removeAttribute('aria-describedby')
    }
    if ((preview.getAttribute('src') ?? '') !== src) {
      if (src) preview.src = src
      else preview.removeAttribute('src')
    }
    preview.style.display = src ? '' : 'none'
  }

  function sync(current: ComponentNode): void {
    syncSource(attribute(current, 'src') ?? '')
    const value = attribute(current, 'alt') ?? ''
    if (alt.value !== value) alt.value = value
    pickBtn.disabled = input.disabled = alt.disabled = !!current.locked
  }
  function refreshLocale(): void {
    label.textContent = uiText(i18n, 'inspector.image', '圖片')
    altCaption.textContent = uiText(i18n, 'inspector.image_alt', '替代文字')
    pickBtn.textContent = uiText(i18n, 'form.pick_image', '選圖')
    sync(findNode(engine.getTree(), node.id) ?? node)
  }
  function edit(key: 'src' | 'alt', value: string): void {
    const current = findNode(engine.getTree(), node.id)
    if (current && !current.locked && attribute(current, key) !== value)
      engine.update(node.id, { attributes: { [attributeKey(current, key)]: value } })
  }

  refreshLocale()
  input.addEventListener('input', () => edit('src', input.value), { signal })
  alt.addEventListener('input', () => edit('alt', alt.value), { signal })
  pickBtn.addEventListener(
    'click',
    () => {
      closePicker = replaceImage?.(node.id, pickBtn)
    },
    { signal },
  )
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch' || event.patch.type !== 'update' || event.patch.id !== node.id)
      return
    if (event.patch.attrs || event.patch.removeAttributes || event.patch.locked !== undefined) {
      const current = findNode(engine.getTree(), node.id)
      if (current) sync(current)
    }
  })
  return {
    elements: [wrap, altField],
    refreshLocale,
    destroy() {
      events.abort()
      unsubscribe()
      closePicker?.()
    },
  }
}
