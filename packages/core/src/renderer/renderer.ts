import type { ComponentNode, ResponsiveDevice, ResponsiveStyles, Style } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import { htmlAttributeName, updateAttributes } from '../model/tree.js'
import { getEffectiveStyle, mergeResponsiveStyles, mergeStyle } from '../model/responsive-style.js'
import type { HtmlPolicy } from '../policy/html-policy.js'
import type { Patch } from '../engine/types.js'
import type { ShortcodeResolver, ShortcodeInstance } from './shortcode-resolver.js'
import type { RichTextResolver } from './rich-text-resolver.js'

export interface RendererOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
  richTextResolver?: RichTextResolver
  htmlPolicy?: HtmlPolicy
  device?: ResponsiveDevice
}

export interface Renderer {
  mount(root: ComponentNode, container: Element): void
  applyPatch(patch: Patch): void
  reconcile(tree: ComponentNode): void
  setDevice(device: ResponsiveDevice): void
  destroy(): void
}

interface PresentationState {
  style?: Style
  responsiveStyles?: ResponsiveStyles
  hidden?: boolean
  locked?: boolean
}

/**
 * 建立 Renderer
 *
 * patch 增量更新
 * reconcile 全量重建
 * shortcodeResolver 管理 shortcode instance
 * 後續 props 變動只 setProps 觸發細粒度更新，host 元素不重建
 */
export function createRenderer(opts: RendererOptions = {}): Renderer {
  const registry = opts.registry ?? createTypeRegistry()
  const shortcodeResolver = opts.shortcodeResolver
  const richTextResolver = opts.richTextResolver
  const htmlPolicy = opts.htmlPolicy
  const map = new Map<string, HTMLElement>()
  const nodes = new Map<string, ComponentNode>()
  const richTextMarkup = new Map<string, string>()
  const contentEnds = new WeakMap<HTMLElement, Comment>()
  const shortcodeHosts = new WeakSet<HTMLElement>()
  const shortcodeInstances = new Map<string, ShortcodeInstance>()
  const presentation = new Map<string, PresentationState>()
  const appliedStyleKeys = new Map<string, Set<string>>()
  let device: ResponsiveDevice = opts.device ?? 'desktop'
  let rootEl: HTMLElement | null = null

  function forgetElement(id: string, el: HTMLElement | undefined): void {
    const ids = el
      ? [
          id,
          ...Array.from(el.querySelectorAll<HTMLElement>('[data-sigil-id]'))
            .map((child) => child.dataset.sigilId)
            .filter((childId): childId is string => Boolean(childId)),
        ]
      : [id]
    for (const childId of ids) {
      map.delete(childId)
      nodes.delete(childId)
      richTextMarkup.delete(childId)
      presentation.delete(childId)
      appliedStyleKeys.delete(childId)
      shortcodeInstances.get(childId)?.destroy()
      shortcodeInstances.delete(childId)
    }
  }

  function resolveRichText(node: ComponentNode): string | null {
    if (!richTextResolver?.supports(node)) return null
    return richTextResolver.read(node)
  }

  function setRichText(el: HTMLElement, markup: string): void {
    if (htmlPolicy) htmlPolicy.setSanitized(el, markup)
    else el.textContent = markup
  }

  // Keep the authored prefix separate from child components and shortcode-owned DOM.
  function markContentEnd(el: HTMLElement): void {
    const existing = contentEnds.get(el)
    if (existing?.parentNode === el || shortcodeHosts.has(el)) return
    const end = el.ownerDocument.createComment('')
    el.append(end)
    contentEnds.set(el, end)
  }

  function clearEmptyContentEnd(el: HTMLElement | null): void {
    if (!el || shortcodeHosts.has(el)) return
    const end = contentEnds.get(el)
    if (end?.parentNode !== el || end.nextSibling) return
    end.remove()
    contentEnds.delete(el)
  }

  function replaceOwnContent(el: HTMLElement, node: ComponentNode, markup: string | null): void {
    const end = contentEnds.get(el)
    if (end?.parentNode !== el) {
      // A shortcode that replaces its host contents owns the entire surface.
      if (shortcodeHosts.has(el)) return
      if (markup === null) el.textContent = node.content ?? ''
      else setRichText(el, markup)
      return
    }
    const first = el.firstChild
    if (
      (markup === null || !htmlPolicy) &&
      first?.nodeType === el.TEXT_NODE &&
      first.nextSibling === end
    ) {
      const text = first as Text
      const next = markup ?? node.content ?? ''
      if (text.data !== next) text.data = next
      return
    }
    const next = el.ownerDocument.createDocumentFragment()
    if (markup !== null && htmlPolicy) {
      // Parse in the original element's context (e.g. table), without detaching its children.
      const context = el.cloneNode(false) as HTMLElement
      setRichText(context, markup)
      while (context.firstChild) next.append(context.firstChild)
    } else {
      const text = markup ?? node.content
      if (text) next.append(text)
    }
    while (el.firstChild && el.firstChild !== end) el.firstChild.remove()
    end.before(next)
  }

  function applyInitialContent(node: ComponentNode, el: HTMLElement): void {
    const markup = resolveRichText(node)
    if (markup !== null) {
      richTextMarkup.set(node.id, markup)
      setRichText(el, markup)
    } else if (node.content !== undefined) {
      el.textContent = node.content
    }
  }

  function updateTrackedNode(
    node: ComponentNode,
    patch: Extract<Patch, { type: 'update' }>,
  ): ComponentNode {
    const next: ComponentNode = { ...node }
    if (patch.tagName !== undefined) next.tagName = patch.tagName
    updateAttributes(next, patch.attrs, patch.removeAttributes)
    if (patch.style !== undefined) {
      const merged = mergeStyle(node.style, patch.style)
      if (Object.keys(merged).length) next.style = merged
      else delete next.style
    }
    if (patch.responsiveStyles !== undefined) {
      const merged = mergeResponsiveStyles(node.responsiveStyles, patch.responsiveStyles)
      if (Object.keys(merged).length) next.responsiveStyles = merged
      else delete next.responsiveStyles
    }
    if (patch.content !== undefined) next.content = patch.content
    if (patch.className !== undefined) next.className = patch.className
    if (patch.shortcode !== undefined) next.shortcode = patch.shortcode
    if (patch.name !== undefined) next.name = patch.name
    if (patch.locked !== undefined) next.locked = patch.locked
    if (patch.hidden !== undefined) next.hidden = patch.hidden
    return next
  }

  function applyUpdatedContent(
    node: ComponentNode,
    el: HTMLElement,
    contentChanged: boolean,
  ): void {
    const previousMarkup = richTextMarkup.get(node.id)
    const wasRichText = richTextMarkup.has(node.id)
    const nextMarkup = resolveRichText(node)

    if (nextMarkup !== null) {
      if (!wasRichText || previousMarkup !== nextMarkup) replaceOwnContent(el, node, nextMarkup)
      richTextMarkup.set(node.id, nextMarkup)
      return
    }

    if (wasRichText || contentChanged) replaceOwnContent(el, node, null)
    richTextMarkup.delete(node.id)
  }

  function applyPresentation(id: string): void {
    const el = map.get(id)
    const state = presentation.get(id)
    if (!el || !state) return

    for (const property of appliedStyleKeys.get(id) ?? []) {
      el.style.removeProperty(property)
    }
    const effective = getEffectiveStyle(state, device)
    const nextKeys = new Set<string>()
    for (const [property, value] of Object.entries(effective)) {
      el.style.setProperty(property, value)
      nextKeys.add(property)
    }
    appliedStyleKeys.set(id, nextKeys)

    if (state.hidden) {
      el.setAttribute('data-sigil-hidden', '1')
      el.style.opacity = '0.4'
    } else {
      el.removeAttribute('data-sigil-hidden')
      if (!nextKeys.has('opacity')) el.style.removeProperty('opacity')
    }
    if (state.locked) el.setAttribute('data-sigil-locked', '1')
    else el.removeAttribute('data-sigil-locked')
  }

  function createNodeElement(node: ComponentNode, ownerDocument: Document): HTMLElement {
    const tag = node.tagName ?? registry.get(node.type)?.tagName ?? 'div'
    const el = ownerDocument.createElement(tag)
    el.setAttribute('data-sigil-id', node.id)
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) el.setAttribute(k, v)
    }
    if (node.className) el.className = node.className
    if (node.shortcode) el.setAttribute('data-shortcode', node.shortcode.name)
    return el
  }

  /**
   * 把節點遞迴渲染成 DOM，順便填入 id→Element map
   */
  function renderNode(node: ComponentNode): HTMLElement {
    const el = createNodeElement(node, document)
    map.set(node.id, el)
    nodes.set(node.id, node)
    presentation.set(node.id, {
      style: node.style,
      responsiveStyles: node.responsiveStyles,
      hidden: node.hidden,
      locked: node.locked,
    })
    applyInitialContent(node, el)
    applyPresentation(node.id)
    if (node.children?.length || (node.shortcode && shortcodeResolver)) markContentEnd(el)
    if (node.shortcode && shortcodeResolver) {
      const inst = shortcodeResolver.resolve(node, el, 'edit')
      if (inst) {
        shortcodeInstances.set(node.id, inst)
        shortcodeHosts.add(el)
      }
    }
    if (node.children?.length) {
      if (node.shortcode) {
        const slot = el.querySelector('slot')
        if (slot) slot.replaceWith(...node.children.map((c) => renderNode(c)))
        // 無 slot 時忽略 children
      } else {
        for (const c of node.children) el.append(renderNode(c))
      }
    }
    return el
  }

  return {
    mount(root, container) {
      map.clear()
      nodes.clear()
      richTextMarkup.clear()
      presentation.clear()
      appliedStyleKeys.clear()
      rootEl = renderNode(root)
      container.replaceChildren(rootEl)
    },
    applyPatch(patch) {
      switch (patch.type) {
        case 'insert': {
          const el = renderNode(patch.node)
          const parent = map.get(patch.parentId)
          const before = patch.beforeId ? map.get(patch.beforeId) : null
          if (parent) {
            markContentEnd(parent)
            parent.insertBefore(el, before ?? null)
          }
          break
        }
        case 'remove': {
          const el = map.get(patch.id)
          const parent = el?.parentElement ?? null
          el?.remove()
          clearEmptyContentEnd(parent)
          forgetElement(patch.id, el)
          break
        }
        case 'move': {
          const el = map.get(patch.id)
          const parent = map.get(patch.newParentId)
          const before = patch.beforeId ? map.get(patch.beforeId) : null
          if (el && parent) {
            const previousParent = el.parentElement
            markContentEnd(parent)
            parent.insertBefore(el, before ?? null)
            if (previousParent !== parent) clearEmptyContentEnd(previousParent)
          }
          break
        }
        case 'update': {
          let el = map.get(patch.id)
          const currentNode = nodes.get(patch.id)
          if (!el || !currentNode) break
          let restorePresentation = false
          if (patch.tagName !== undefined && patch.tagName.toLowerCase() !== el.localName) {
            const replacement = createNodeElement(
              { ...currentNode, tagName: patch.tagName },
              el.ownerDocument,
            )
            while (el.firstChild) replacement.appendChild(el.firstChild)
            const end = contentEnds.get(el)
            if (end) contentEnds.set(replacement, end)
            if (shortcodeHosts.has(el)) shortcodeHosts.add(replacement)
            el.replaceWith(replacement)
            if (rootEl === el) rootEl = replacement
            map.set(patch.id, replacement)
            el = replacement
            restorePresentation = true
          }
          const nextNode = updateTrackedNode(currentNode, patch)
          nodes.set(patch.id, nextNode)
          if (patch.shortcode) {
            shortcodeInstances.get(patch.id)?.setProps(patch.shortcode.props)
          }
          if (patch.attrs) {
            for (const [k, v] of Object.entries(patch.attrs)) el.setAttribute(k, v)
          }
          if (patch.removeAttributes?.length) {
            const authored = new Set([
              ...Object.keys(currentNode.attributes ?? {}).map(htmlAttributeName),
              ...Object.keys(patch.attrs ?? {}).map(htmlAttributeName),
            ])
            for (const key of patch.removeAttributes.map(htmlAttributeName)) {
              if (!authored.has(key)) continue
              el.removeAttribute(key)
              if (key === 'data-sigil-id') el.setAttribute('data-sigil-id', patch.id)
              if (key === 'data-shortcode' && nextNode.shortcode)
                el.setAttribute('data-shortcode', nextNode.shortcode.name)
              if (key === 'class' && nextNode.className) el.className = nextNode.className
              if (['style', 'data-sigil-hidden', 'data-sigil-locked'].includes(key))
                restorePresentation = true
            }
          }
          const state = presentation.get(patch.id)
          if (state && patch.style !== undefined) {
            const merged = mergeStyle(state.style, patch.style)
            state.style = Object.keys(merged).length ? merged : undefined
          }
          if (state && patch.responsiveStyles !== undefined) {
            const merged = mergeResponsiveStyles(state.responsiveStyles, patch.responsiveStyles)
            state.responsiveStyles = Object.keys(merged).length ? merged : undefined
          }
          if (state && patch.hidden !== undefined) state.hidden = patch.hidden
          if (state && patch.locked !== undefined) state.locked = patch.locked
          if (
            restorePresentation ||
            patch.style !== undefined ||
            patch.responsiveStyles !== undefined ||
            patch.hidden !== undefined ||
            patch.locked !== undefined
          ) {
            applyPresentation(patch.id)
          }
          applyUpdatedContent(nextNode, el, patch.content !== undefined)
          if (patch.className !== undefined) el.className = patch.className
          break
        }
        case 'replace': {
          const old = map.get(patch.id)
          forgetElement(patch.id, old)
          const el = renderNode(patch.node)
          old?.replaceWith(el)
          if (old === rootEl) rootEl = el
          break
        }
      }
    },
    // 回收 shortcode instance 後全量重建
    reconcile(tree) {
      const container = rootEl?.parentElement
      for (const inst of shortcodeInstances.values()) inst.destroy()
      shortcodeInstances.clear()
      map.clear()
      nodes.clear()
      richTextMarkup.clear()
      presentation.clear()
      appliedStyleKeys.clear()
      rootEl = renderNode(tree)
      if (container) container.replaceChildren(rootEl)
    },
    setDevice(next) {
      if (device === next) return
      device = next
      for (const id of presentation.keys()) applyPresentation(id)
    },
    destroy() {
      for (const inst of shortcodeInstances.values()) inst.destroy()
      shortcodeInstances.clear()
      map.clear()
      nodes.clear()
      richTextMarkup.clear()
      presentation.clear()
      appliedStyleKeys.clear()
      rootEl = null
    },
  }
}
