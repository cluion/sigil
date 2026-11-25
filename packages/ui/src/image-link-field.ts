import {
  createId,
  renameHtmlAnchor,
  type ComponentNode,
  type Engine,
  type I18n,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { readImageLink, removeImageLink, setImageLink } from './image-link.js'
import { attribute, destination, pageTargets, sectionHref } from './link-destination.js'
import { resolveLinkFragment } from './link-fragment.js'

export function createImageLinkField(
  engine: Engine,
  image: ComponentNode,
  i18n?: I18n,
  richText?: Pick<RichTextResolver, 'supports'>,
) {
  const options = { richText }
  const events = new AbortController()
  const { signal } = events
  const el = document.createElement('div')
  el.className = 'sigil-image-link-field sigil-link-fields'
  const address = document.createElement('input')
  address.type = 'text'
  address.inputMode = 'url'
  address.autocapitalize = 'none'
  address.enterKeyHint = 'go'
  address.spellcheck = false
  address.dataset.imageLinkAddress = ''
  const section = document.createElement('select')
  section.dataset.imageLinkSection = ''
  function field(control: HTMLInputElement | HTMLSelectElement) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field'
    const label = document.createElement('label')
    label.className = 'sigil-field-label'
    control.id = 'sigil-image-link-' + createId()
    control.className = 'sigil-input'
    label.htmlFor = control.id
    wrap.append(label)
    el.append(wrap)
    return { wrap, label }
  }
  const url = field(address)
  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  const apply = document.createElement('button')
  apply.type = 'button'
  apply.className = 'sigil-btn'
  apply.dataset.imageLinkApply = ''
  row.append(address, apply)
  const shared = document.createElement('p')
  shared.className = 'sigil-muted sigil-link-status'
  shared.id = address.id + '-shared'
  const error = document.createElement('p')
  error.id = address.id + '-error'
  error.className = 'sigil-muted sigil-link-error'
  error.setAttribute('role', 'status')
  url.wrap.append(row, shared, error)
  const sections = field(section)
  sections.wrap.append(section)
  const tabLabel = document.createElement('label')
  tabLabel.className = 'sigil-link-new-tab'
  const newTab = document.createElement('input')
  newTab.type = 'checkbox'
  newTab.dataset.imageLinkNewTab = ''
  const tabCaption = document.createElement('span')
  tabLabel.append(newTab, tabCaption)
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'sigil-btn sigil-btn--ghost sigil-image-link-remove'
  remove.dataset.imageLinkRemove = ''
  el.append(tabLabel, remove)

  let href = ''
  let linkId: string | undefined
  let available: ReturnType<typeof pageTargets> | undefined
  let invalid = false
  const t = (key: string, fallback: string) => uiText(i18n, key, fallback)
  function current() {
    if (signal.aborted || engine.getSelection() !== image.id) return null
    return readImageLink(engine.getTree(), image.id, options)
  }
  function showError(show: boolean) {
    invalid = show
    error.hidden = !show
    error.textContent = show ? t('link.invalid', '請輸入有效的網址或選擇頁內區段。') : ''
    if (show) address.setAttribute('aria-invalid', 'true')
    else address.removeAttribute('aria-invalid')
  }
  function refreshApply() {
    const draft = address.value.trim()
    apply.disabled = address.disabled || !draft || draft === href
    newTab.disabled = tabLabel.hidden || address.disabled || draft !== href
  }
  function refreshTargets() {
    available = pageTargets(engine.getTree(), image.id)
    const entries = document.createDocumentFragment()
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = t('link.choose', '選擇區段…')
    entries.append(placeholder)
    for (const target of available.targets) {
      const anchor = attribute(target, 'id')
      if (target.id === linkId || (anchor && !sectionHref(anchor, available.hasTarget))) continue
      const option = document.createElement('option')
      option.value = target.id
      option.textContent = target.name?.trim() || target.content?.trim() || anchor || target.id
      entries.append(option)
    }
    section.replaceChildren(entries)
    sections.wrap.hidden = section.options.length <= 1
  }
  function sync(targetsChanged = false, discardDraft = false) {
    if (signal.aborted) return
    const state = current()
    el.hidden = !state
    address.disabled = section.disabled = !state?.canEdit
    remove.hidden = remove.disabled = !state?.canRemove
    shared.hidden = !state?.shared
    const link = state?.link ?? undefined
    const nextHref = attribute(link, 'href') ?? ''
    tabLabel.hidden = !/^(?:https?:\/\/|\/)/i.test(nextHref) || !destination('url', nextHref)
    newTab.checked = attribute(link, 'target')?.toLowerCase() === '_blank'
    address.setAttribute('aria-describedby', shared.hidden ? error.id : shared.id + ' ' + error.id)
    if (!state) {
      refreshApply()
      return
    }
    const nextId = state.link?.id
    const linkChanged = nextId !== linkId
    if (discardDraft || !state.canEdit || linkChanged || nextHref !== href) {
      href = nextHref
      linkId = nextId
      address.value = href
      showError(false)
    }
    if (!available || targetsChanged || linkChanged) refreshTargets()
    const anchor = resolveLinkFragment(href, available!.hasTarget)
    const target = anchor && available!.targets.find((node) => attribute(node, 'id') === anchor)
    section.value = target ? target.id : ''
    refreshApply()
  }
  function refreshLocale() {
    url.label.textContent = t('image.link', '圖片連結')
    apply.textContent = t('link.apply', '套用')
    sections.label.textContent = t('link.section', '連到頁內區段')
    tabCaption.textContent = t('link.new_tab', '在新分頁開啟')
    remove.textContent = t('image.remove_link', '移除圖片連結')
    shared.textContent = t('image.shared_link', '變更這個網址也會套用至同一連結內的其他內容。')
    showError(invalid)
    sync(true)
  }
  function submit() {
    if (!current()?.canEdit || !address.value.trim()) return
    const normalized = destination('url', address.value)
    if (!normalized || !setImageLink(engine, image.id, normalized, undefined, options)) {
      showError(true)
      address.focus()
      return
    }
    sync(false, true)
  }
  address.addEventListener(
    'input',
    () => {
      showError(false)
      refreshApply()
    },
    { signal },
  )
  address.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Enter') {
        event.preventDefault()
        submit()
      } else if (event.key === 'Escape' && (invalid || address.value !== href)) {
        event.preventDefault()
        event.stopPropagation()
        sync(false, true)
      }
    },
    { signal },
  )
  apply.addEventListener('click', submit, { signal })
  newTab.addEventListener(
    'change',
    () => {
      if (newTab.disabled || !current()?.canEdit) return
      setImageLink(engine, image.id, href, newTab.checked, options)
      sync()
    },
    { signal },
  )
  remove.addEventListener(
    'click',
    () => {
      if (current()?.canRemove && removeImageLink(engine, image.id, options)) {
        sync(true, true)
        if (el.isConnected) address.focus()
      }
    },
    { signal },
  )
  section.addEventListener(
    'change',
    () => {
      const currentState = current()
      const target = available?.targets.find((node) => node.id === section.value)
      if (!currentState?.canEdit || !available || !target || target.id === linkId) return
      const existing = attribute(target, 'id')
      let anchor = existing
      if (!anchor) {
        do {
          anchor = 'section-' + createId()
        } while (available.hasTarget(anchor))
      }
      const next = sectionHref(anchor, available.hasTarget)
      if (next) {
        engine.batch(() => {
          if (!existing && !renameHtmlAnchor(engine, target.id, anchor).ok) return
          setImageLink(engine, image.id, next, undefined, options)
        })
      }
      sync(false, true)
    },
    { signal },
  )
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'history') return
    if (event.type !== 'patch' || event.patch.type !== 'update') {
      sync(true, event.type === 'tree' || event.type === 'selection')
      return
    }
    const patch = event.patch
    const attrs = [...Object.keys(patch.attrs ?? {}), ...(patch.removeAttributes ?? [])]
    const targetsChanged =
      attrs.some((key) => ['id', 'name', 'hidden'].includes(key.toLowerCase())) ||
      patch.name !== undefined ||
      patch.hidden !== undefined ||
      patch.locked !== undefined ||
      patch.tagName !== undefined ||
      patch.shortcode !== undefined ||
      (patch.content !== undefined &&
        !!available?.targets.some((node) => node.id === patch.id && !node.name?.trim()))
    sync(targetsChanged)
  })
  refreshLocale()
  return {
    el,
    refreshLocale,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
