import type { ComponentNode, ResponsiveDevice, ResponsiveStyles, Style } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import { getEffectiveStyle, mergeResponsiveStyles, mergeStyle } from '../model/responsive-style.js'
import type { Patch } from '../engine/types.js'
import type { ShortcodeResolver, ShortcodeInstance } from './shortcode-resolver.js'

export interface RendererOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
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
  const map = new Map<string, HTMLElement>()
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
      presentation.delete(childId)
      appliedStyleKeys.delete(childId)
      shortcodeInstances.get(childId)?.destroy()
      shortcodeInstances.delete(childId)
    }
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

  /**
   * 把節點遞迴渲染成 DOM，順便填入 id→Element map
   */
  function renderNode(node: ComponentNode): HTMLElement {
    const tag = node.tagName ?? registry.get(node.type)?.tagName ?? 'div'
    const el = document.createElement(tag)
    map.set(node.id, el)
    presentation.set(node.id, {
      style: node.style,
      responsiveStyles: node.responsiveStyles,
      hidden: node.hidden,
      locked: node.locked,
    })
    el.setAttribute('data-sigil-id', node.id)
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) el.setAttribute(k, v)
    }
    if (node.className) el.className = node.className
    if (node.content !== undefined) el.textContent = node.content
    applyPresentation(node.id)
    if (node.shortcode) {
      el.setAttribute('data-shortcode', node.shortcode.name)
      if (shortcodeResolver) {
        const inst = shortcodeResolver.resolve(node, el, 'edit')
        if (inst) shortcodeInstances.set(node.id, inst)
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
          parent?.insertBefore(el, before ?? null)
          break
        }
        case 'remove': {
          const el = map.get(patch.id)
          el?.remove()
          forgetElement(patch.id, el)
          break
        }
        case 'move': {
          const el = map.get(patch.id)
          const parent = map.get(patch.newParentId)
          const before = patch.beforeId ? map.get(patch.beforeId) : null
          if (el && parent) parent.insertBefore(el, before ?? null)
          break
        }
        case 'update': {
          const el = map.get(patch.id)
          if (!el) break
          if (patch.shortcode) {
            shortcodeInstances.get(patch.id)?.setProps(patch.shortcode.props)
          }
          if (patch.attrs) {
            for (const [k, v] of Object.entries(patch.attrs)) el.setAttribute(k, v)
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
            patch.style !== undefined ||
            patch.responsiveStyles !== undefined ||
            patch.hidden !== undefined ||
            patch.locked !== undefined
          ) {
            applyPresentation(patch.id)
          }
          if (patch.content !== undefined) el.textContent = patch.content
          if (patch.className !== undefined) el.className = patch.className
          break
        }
        case 'replace': {
          const old = map.get(patch.id)
          forgetElement(patch.id, old)
          const el = renderNode(patch.node)
          old?.replaceWith(el)
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
      presentation.clear()
      appliedStyleKeys.clear()
      rootEl = null
    },
  }
}
