import {
  createId,
  findNode,
  renameHtmlAnchor,
  type ComponentNode,
  type Engine,
  type I18n,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { resolveLinkFragment } from './link-fragment.js'
import {
  addressFor,
  attribute,
  attributeKey,
  destination,
  linkKind,
  pageTargets,
  sectionHref,
  type LinkKind,
} from './link-destination.js'

export function isNativeLink(node: ComponentNode): boolean {
  return node.tagName?.toLowerCase() === 'a' && !node.shortcode
}

export function createLinkFields(
  engine: Engine,
  link: ComponentNode,
  i18n?: I18n,
  revealSelection?: () => void,
) {
  const events = new AbortController()
  const { signal } = events
  const t = (key: string, fallback: string) => uiText(i18n, 'link.' + key, fallback)
  const el = document.createElement('div')
  el.className = 'sigil-link-fields'
  const kind = document.createElement('select')
  kind.dataset.linkKind = ''
  const section = document.createElement('select')
  const address = document.createElement('input')
  address.type = 'text'
  address.spellcheck = false
  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  function button(className: string) {
    const control = document.createElement('button')
    control.type = 'button'
    control.className = className
    return control
  }
  const apply = button('sigil-btn sigil-link-apply')
  const reveal = button('sigil-btn sigil-btn--ghost sigil-link-reveal')
  row.append(address, apply)

  function field(
    name: string,
    control: HTMLInputElement | HTMLSelectElement,
    content: HTMLElement,
  ) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field sigil-link-' + name
    const label = document.createElement('label')
    label.className = 'sigil-field-label'
    control.id = 'sigil-link-' + createId()
    control.className = 'sigil-input'
    label.htmlFor = control.id
    wrap.append(label, content)
    el.append(wrap)
    return { wrap, label }
  }
  function status(name: string) {
    const message = document.createElement('p')
    message.className = 'sigil-muted sigil-link-' + name
    message.setAttribute('role', 'status')
    message.id = 'sigil-link-' + createId()
    return message
  }
  function option(value: string, text: string) {
    const item = document.createElement('option')
    item.value = value
    item.textContent = text
    return item
  }

  const kindField = field('kind', kind, kind)
  const sections = field('section', section, section)
  const notice = status('status')
  section.setAttribute('aria-describedby', notice.id)
  sections.wrap.append(reveal, notice)
  const url = field('address', address, row)
  const error = status('error')
  address.setAttribute('aria-describedby', error.id)
  const tabLabel = document.createElement('label')
  tabLabel.className = 'sigil-link-new-tab'
  const newTab = document.createElement('input')
  newTab.type = 'checkbox'
  const tabText = document.createElement('span')
  tabLabel.append(newTab, tabText)
  el.append(error, tabLabel)

  let href = attribute(link, 'href') ?? ''
  let mode = linkKind(href)
  let available = pageTargets(engine.getTree(), link.id)
  const drafts = new Map<LinkKind, string>()
  address.value = addressFor(mode, href)
  function currentLink(): ComponentNode | undefined {
    if (signal.aborted || engine.getSelection() !== link.id) return
    const current = findNode(engine.getTree(), link.id)
    if (current && isNativeLink(current)) return current
  }

  function resetError(): void {
    error.hidden = true
    error.textContent = ''
    address.removeAttribute('aria-invalid')
  }
  function errorMessage(): string {
    if (mode === 'email') return t('invalid_email', '請輸入有效的電子郵件地址。')
    if (mode === 'tel') return t('invalid_phone', '請輸入有效的電話號碼。')
    return t('invalid', '請輸入有效的網址或選擇頁內區段。')
  }
  function refreshApply(): void {
    apply.disabled = address.disabled || address.value.trim() === addressFor(mode, href)
    reveal.disabled = !apply.disabled
  }
  function sync(): void {
    const current = currentLink()
    kind.disabled = section.disabled = address.disabled = !current || !!current.locked
    tabLabel.hidden = mode !== 'url'
    newTab.disabled = tabLabel.hidden || address.disabled
    newTab.checked = attribute(current, 'target')?.toLowerCase() === '_blank'
    kind.value = mode
    address.inputMode = mode
    sections.wrap.hidden = mode !== 'url'
    if (mode === 'email') url.label.textContent = t('email_address', '電子郵件地址')
    else if (mode === 'tel') url.label.textContent = t('phone_number', '電話號碼')
    else url.label.textContent = t('address', '連結網址')
    const fragment = resolveLinkFragment(href, available.hasTarget)
    const target = fragment && available.targets.find((node) => attribute(node, 'id') === fragment)
    section.value = target ? target.id : ''
    reveal.hidden = !target
    let message = ''
    if (fragment && !target) {
      const count = available.counts.get(fragment) ?? 0
      if (count > 1) message = t('duplicate_section', '這個錨點有多個區段使用，請重新選擇。')
      else if (available.hasTarget(fragment))
        message = t('unavailable_section', '這個目標無法在畫布定位。')
      else if (fragment.toLowerCase() !== 'top')
        message = t('missing_section', '找不到這個頁內區段，請重新選擇。')
    }
    notice.textContent = message
    notice.hidden = !message
    if (!error.hidden) error.textContent = errorMessage()
    refreshApply()
  }
  function refreshTargets(): void {
    const fragment = document.createDocumentFragment()
    fragment.append(option('', t('choose', '選擇區段…')))
    for (const target of available.targets) {
      const anchor = attribute(target, 'id')
      const item = option(
        target.id,
        target.name?.trim() || target.content?.trim() || anchor || target.id,
      )
      if (anchor) item.disabled = !sectionHref(anchor, available.hasTarget)
      fragment.append(item)
    }
    section.replaceChildren(fragment)
  }
  function refreshLocale(): void {
    kindField.label.textContent = t('kind', '連結類型')
    kind.replaceChildren(
      option('url', t('web', '網址或頁內區段')),
      option('email', t('email', '電子郵件')),
      option('tel', t('phone', '電話')),
    )
    sections.label.textContent = t('section', '連到頁內區段')
    reveal.textContent = t('reveal', '在畫布定位區段')
    apply.textContent = t('apply', '套用')
    tabText.textContent = t('new_tab', '在新分頁開啟')
    refreshTargets()
    sync()
  }
  function showSaved(saved: string): void {
    href = saved
    mode = linkKind(saved)
    drafts.clear()
    address.value = addressFor(mode, saved)
    resetError()
    sync()
  }
  kind.addEventListener(
    'change',
    () => {
      if (kind.disabled || !currentLink() || !['url', 'email', 'tel'].includes(kind.value)) return
      drafts.set(mode, address.value)
      mode = kind.value as LinkKind
      address.value = drafts.get(mode) ?? addressFor(mode, href)
      resetError()
      sync()
    },
    { signal },
  )
  function saveAddress(): void {
    const current = currentLink()
    if (address.disabled || !current || current.locked) return
    const next = destination(mode, address.value)
    if (next === undefined) {
      error.textContent = errorMessage()
      error.hidden = false
      address.setAttribute('aria-invalid', 'true')
      address.focus()
      return
    }
    if (next === href) {
      showSaved(href)
      return
    }
    const attributes: Record<string, string> = { [attributeKey(current, 'href')]: next }
    if (linkKind(next) !== 'url' && attribute(current, 'target')?.toLowerCase() === '_blank') {
      attributes[attributeKey(current, 'target')] = '_self'
    }
    engine.update(link.id, { attributes })
  }
  address.addEventListener(
    'input',
    () => {
      resetError()
      refreshApply()
    },
    { signal },
  )
  address.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault()
        saveAddress()
      }
    },
    { signal },
  )
  apply.addEventListener('click', saveAddress, { signal })
  section.addEventListener(
    'change',
    () => {
      const target = available.targets.find((node) => node.id === section.value)
      const current = currentLink()
      if (mode !== 'url' || section.disabled || !current || !target) {
        sync()
        return
      }
      const existing = attribute(target, 'id')
      let anchor = existing
      if (!anchor) {
        do {
          anchor = 'section-' + createId()
        } while (available.hasTarget(anchor))
      }
      const next = sectionHref(anchor, available.hasTarget)
      if (!next) {
        sync()
        return
      }
      if (existing && next === href) {
        showSaved(href)
        return
      }
      engine.batch(() => {
        if (!existing && !renameHtmlAnchor(engine, target.id, anchor).ok) {
          sync()
          return
        }
        if (next === href) showSaved(href)
        else engine.update(link.id, { attributes: { [attributeKey(current, 'href')]: next } })
      })
    },
    { signal },
  )
  reveal.addEventListener(
    'click',
    () => {
      if (mode !== 'url' || reveal.hidden || reveal.disabled || !section.value || !currentLink())
        return
      engine.select(section.value)
      revealSelection?.()
    },
    { signal },
  )
  newTab.addEventListener(
    'change',
    () => {
      const current = currentLink()
      if (newTab.disabled || !current || current.locked) return
      const target = newTab.checked ? '_blank' : '_self'
      const targetKey = attributeKey(current, 'target')
      const relKey = attributeKey(current, 'rel')
      const attributes: Record<string, string> = { [targetKey]: target }
      if (newTab.checked) {
        const rel = current.attributes?.[relKey] ?? ''
        const tokens = rel
          .split(/[\t\n\f\r ]+/)
          .filter((token) => token && token.toLowerCase() !== 'opener')
        if (!tokens.some((token) => token.toLowerCase() === 'noopener')) tokens.push('noopener')
        if (tokens.join(' ') !== rel) attributes[relKey] = tokens.join(' ')
      }
      if (current.attributes?.[targetKey] !== target || attributes[relKey] !== undefined)
        engine.update(link.id, { attributes })
    },
    { signal },
  )
  resetError()
  refreshLocale()
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch') return
    const patch = event.patch
    const changed =
      patch.type === 'update'
        ? [...Object.keys(patch.attrs ?? {}), ...(patch.removeAttributes ?? [])].map((key) =>
            key.toLowerCase(),
          )
        : []
    if (
      patch.type !== 'update' ||
      changed.includes('id') ||
      changed.includes('name') ||
      changed.includes('hidden') ||
      patch.name !== undefined ||
      (patch.content !== undefined &&
        patch.id !== link.id &&
        available.targets.some((node) => node.id === patch.id && !node.name?.trim())) ||
      patch.hidden !== undefined ||
      patch.locked !== undefined ||
      patch.shortcode !== undefined
    ) {
      available = pageTargets(engine.getTree(), link.id)
      refreshTargets()
      sync()
    }
    if (patch.type === 'update' && patch.id === link.id) {
      if (changed.includes('href')) showSaved(attribute(currentLink(), 'href') ?? '')
      else if (changed.includes('target') || changed.includes('rel')) sync()
    }
  })
  return {
    el,
    refreshLocale,
    destroy() {
      events.abort()
      unsubscribe()
    },
  }
}
