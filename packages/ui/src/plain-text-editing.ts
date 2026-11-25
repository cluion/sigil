import type { ComponentNode } from '@cluion/sigil-core'
import { attribute } from './link-destination.js'

/** Give the canvas leaf single-line editing semantics and restore its authored attributes on exit. */
function setPlainEditingAttributes(element: HTMLElement, node: ComponentNode, label: string) {
  function temporary(key: string, value: string, set: (value: string) => void) {
    const original = element.getAttribute(key)
    set(value)
    return (latest: ComponentNode | undefined) => {
      const current = attribute(latest, key)
      const restored = current === attribute(node, key) ? original : current
      if (restored == null) element.removeAttribute(key)
      else set(restored)
    }
  }
  const restore = [
    temporary('contenteditable', 'true', (v) => element.setAttribute('contenteditable', v)),
    temporary('role', 'textbox', (v) => element.setAttribute('role', v)),
    temporary('aria-multiline', 'false', (v) => element.setAttribute('aria-multiline', v)),
    temporary('enterkeyhint', 'done', (v) => element.setAttribute('enterkeyhint', v)),
  ]
  if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby'))
    restore.push(temporary('aria-label', label, (v) => element.setAttribute('aria-label', v)))
  return (latest: ComponentNode | undefined) => {
    for (const finish of restore) finish(latest)
  }
}

// Native buttons consume Space and cannot host a text caret consistently across browsers.
export function createPlainEditingSurface(
  original: HTMLElement,
  node: ComponentNode,
  label: string,
) {
  if (original.localName !== 'button') {
    return { element: original, restore: setPlainEditingAttributes(original, node, label) }
  }
  const surface = original.ownerDocument.createElement('span')
  surface.className = original.className
  surface.dataset.sigilId = node.id
  if (original.dataset.sigilSelected) surface.dataset.sigilSelected = original.dataset.sigilSelected
  surface.textContent = original.textContent
  surface.id = original.id
  surface.lang = original.lang
  if (original.dir) surface.dir = original.dir
  const computed = original.ownerDocument.defaultView?.getComputedStyle(original)
  if (computed) {
    for (const property of [
      'display',
      'box-sizing',
      'vertical-align',
      'margin',
      'padding',
      'border',
      'border-radius',
      'background',
      'color',
      'box-shadow',
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'line-height',
      'letter-spacing',
      'text-align',
      'white-space',
      'align-items',
      'align-content',
      'justify-content',
    ]) {
      surface.style.setProperty(property, computed.getPropertyValue(property))
    }
  }
  for (const property of Array.from(original.style)) {
    surface.style.setProperty(
      property,
      original.style.getPropertyValue(property),
      original.style.getPropertyPriority(property),
    )
  }
  if (computed && /^(block|inline|inline-block|flow-root)$/.test(computed.display)) {
    // A native button vertically centers its label inside the available content box.
    if (computed.display === 'inline') surface.style.display = 'inline-block'
    if (!computed.alignContent || computed.alignContent === 'normal')
      surface.style.alignContent = 'center'
  }
  const labelledBy = original.getAttribute('aria-labelledby')
  if (labelledBy) surface.setAttribute('aria-labelledby', labelledBy)
  setPlainEditingAttributes(surface, node, original.getAttribute('aria-label') || label)
  original.replaceWith(surface)
  return {
    element: surface,
    restore() {
      surface.replaceWith(original)
    },
  }
}
