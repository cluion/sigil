import { createId, findNode, type ComponentNode, type Engine, type I18n } from '@cluion/sigil-core'
import { uiText } from './i18n.js'

function validDestination(value: string): boolean {
  if (!value || /[\s\p{Cc}\\<>"']/u.test(value) || /%(?:0[\da-f]|1[\da-f]|7f|5c)/i.test(value))
    return false
  if (value.startsWith('#') || (value.startsWith('/') && !value.startsWith('//'))) return true
  if (/^mailto:[^\s@?#]+@[^\s@?#]+\.[^\s@?#]+$/i.test(value)) return true
  if (/^tel:\+?\d[\d().-]{0,31}$/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

function fragmentId(href: string, counts: Map<string, number>): string {
  if (!href.startsWith('#')) return ''
  const literal = new URL('about:blank' + href).hash.slice(1).split(':~:')[0]!
  if (counts.has(literal)) return literal
  try {
    return decodeURIComponent(literal)
  } catch {
    return literal
  }
}

function sectionHref(anchor: string, counts: Map<string, number>): string | undefined {
  try {
    const encoded = '#' + encodeURIComponent(anchor)
    if (fragmentId(encoded, counts) === anchor) return encoded
    const literal = '#' + anchor
    if (validDestination(literal) && fragmentId(literal, counts) === anchor) return literal
  } catch {
    // Unpaired UTF-16 surrogates have no exact URL representation.
  }
}

function pageTargets(root: ComponentNode, linkId: string) {
  const counts = new Map<string, number>()
  const targets: ComponentNode[] = []
  function visit(node: ComponentNode, visible: boolean): void {
    const anchor = node.attributes?.id
    if (anchor) counts.set(anchor, (counts.get(anchor) ?? 0) + 1)
    const shown = visible && !node.hidden
    if (
      shown &&
      node.id !== linkId &&
      !node.shortcode &&
      (anchor || (node.type === 'section' && node.name?.trim() && !node.locked))
    ) {
      targets.push(node)
    }
    for (const child of node.children ?? []) visit(child, shown)
  }
  visit(root, true)
  return {
    counts,
    targets: targets.filter((node) => !node.attributes?.id || counts.get(node.attributes.id) === 1),
  }
}

export function createLinkFields(engine: Engine, link: ComponentNode, i18n?: I18n) {
  const el = document.createElement('div')
  el.className = 'sigil-link-fields'
  const select = document.createElement('select')
  const address = document.createElement('input')
  const apply = document.createElement('button')
  const error = document.createElement('p')
  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  apply.type = 'button'
  apply.className = 'sigil-btn'
  address.type = 'text'
  address.inputMode = 'url'
  address.spellcheck = false
  error.className = 'sigil-muted'
  error.setAttribute('role', 'status')
  error.id = 'sigil-link-error-' + createId()
  address.setAttribute('aria-describedby', error.id)
  row.append(address, apply)

  function field(control: HTMLInputElement | HTMLSelectElement, content: HTMLElement) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field'
    const label = document.createElement('label')
    label.className = 'sigil-field-label'
    control.id = 'sigil-link-' + createId()
    control.className = 'sigil-input'
    label.htmlFor = control.id
    wrap.append(label, content)
    el.append(wrap)
    return label
  }
  const selectLabel = field(select, select)
  const urlLabel = field(address, row)
  el.append(error)
  let href = link.attributes?.href ?? ''
  address.value = href
  let available = pageTargets(engine.getTree(), link.id)
  select.disabled = address.disabled = Boolean(link.locked)

  function sync(): void {
    const fragment = fragmentId(href, available.counts)
    const current =
      fragment && available.targets.find((target) => target.attributes?.id === fragment)
    select.value = current ? current.id : ''
    apply.disabled = address.disabled || address.value.trim() === href
  }
  function resetError(): void {
    error.textContent = ''
    error.hidden = true
    address.removeAttribute('aria-invalid')
  }
  function refreshLocale(): void {
    selectLabel.textContent = uiText(i18n, 'link.section', '連到頁內區段')
    urlLabel.textContent = uiText(i18n, 'link.address', '連結網址')
    apply.textContent = uiText(i18n, 'link.apply', '套用')
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = uiText(i18n, 'link.choose', '選擇區段…')
    select.replaceChildren(placeholder)
    for (const target of available.targets) {
      const option = document.createElement('option')
      option.value = target.id
      if (target.attributes?.id)
        option.disabled = !sectionHref(target.attributes.id, available.counts)
      option.textContent =
        target.name?.trim() || target.content?.trim() || target.attributes?.id || target.id
      select.append(option)
    }
    if (!error.hidden)
      error.textContent = uiText(i18n, 'link.invalid', '請輸入有效的網址或選擇頁內區段。')
    sync()
  }
  function saveAddress(): void {
    const next = address.value.trim()
    if (address.disabled || next === href) return
    if (!validDestination(next)) {
      error.textContent = uiText(i18n, 'link.invalid', '請輸入有效的網址或選擇頁內區段。')
      error.hidden = false
      address.setAttribute('aria-invalid', 'true')
      address.focus()
      return
    }
    engine.update(link.id, { attributes: { href: next } })
  }
  address.addEventListener('input', () => {
    resetError()
    sync()
  })
  address.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      saveAddress()
    }
  })
  apply.addEventListener('click', saveAddress)
  select.addEventListener('change', () => {
    const target = available.targets.find((node) => node.id === select.value)
    if (select.disabled || !target) {
      sync()
      return
    }
    let anchor = target.attributes?.id
    if (!anchor) {
      do {
        anchor = 'section-' + createId()
      } while (available.counts.has(anchor))
    }
    const next = sectionHref(anchor, available.counts)
    if (!next) {
      sync()
      return
    }
    if (href === next) {
      address.value = href
      resetError()
      sync()
      return
    }
    engine.batch(() => {
      if (!target.attributes?.id) engine.update(target.id, { attributes: { id: anchor } })
      engine.update(link.id, { attributes: { href: next } })
    })
  })
  resetError()
  refreshLocale()
  const destroy = engine.subscribe((event) => {
    if (event.type !== 'patch') return
    const patch = event.patch
    if (
      patch.type !== 'update' ||
      patch.attrs?.id !== undefined ||
      patch.name !== undefined ||
      patch.hidden !== undefined ||
      patch.locked !== undefined
    ) {
      available = pageTargets(engine.getTree(), link.id)
      select.disabled = address.disabled = Boolean(findNode(engine.getTree(), link.id)?.locked)
      refreshLocale()
    }
    if (patch.type === 'update' && patch.id === link.id && patch.attrs?.href !== undefined) {
      href = address.value = patch.attrs.href
      resetError()
      sync()
    }
  })
  return { el, refreshLocale, destroy }
}
