import type { ComponentNode } from '../model/types.js'
import type { TypeRegistry } from '../model/registry.js'
import { createTypeRegistry } from '../model/registry.js'
import type { Patch } from '../engine/types.js'
import type { ShortcodeResolver, ShortcodeInstance } from './shortcode-resolver.js'

export interface RendererOptions {
  registry?: TypeRegistry
  shortcodeResolver?: ShortcodeResolver
}

export interface Renderer {
  mount(root: ComponentNode, container: Element): void
  applyPatch(patch: Patch): void
  reconcile(tree: ComponentNode): void
  destroy(): void
}

/**
 * 建立 Renderer
 *
 * patch 為快速路徑（command 即時更新，保留 DOM 狀態）；
 * reconcile 為全量重建（undo／redo／load）；
 * shortcode 節點交由注入的 shortcodeResolver 產出 instance，
 * 後續 props 變動只 setProps 觸發細粒度更新，host 元素不重建
 */
export function createRenderer(opts: RendererOptions = {}): Renderer {
  const registry = opts.registry ?? createTypeRegistry()
  const shortcodeResolver = opts.shortcodeResolver
  const map = new Map<string, HTMLElement>()
  const shortcodeInstances = new Map<string, ShortcodeInstance>()
  let rootEl: HTMLElement | null = null

  /**
   * 把節點遞迴渲染成 DOM，順便填入 id→Element map
   */
  function renderNode(node: ComponentNode): HTMLElement {
    const tag = node.tagName ?? registry.get(node.type)?.tagName ?? 'div'
    const el = document.createElement(tag)
    map.set(node.id, el)
    el.setAttribute('data-sigil-id', node.id)
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) el.setAttribute(k, v)
    }
    if (node.className) el.className = node.className
    if (node.style) {
      for (const [k, v] of Object.entries(node.style)) el.style.setProperty(k, v)
    }
    if (node.content !== undefined) el.textContent = node.content
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
        // 無 <slot> → 忽略 children(不 append 末尾)
      } else {
        for (const c of node.children) el.append(renderNode(c))
      }
    }
    return el
  }

  return {
    mount(root, container) {
      map.clear()
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
          map.delete(patch.id)
          shortcodeInstances.get(patch.id)?.destroy()
          shortcodeInstances.delete(patch.id)
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
          if (patch.style) {
            for (const [k, v] of Object.entries(patch.style)) el.style.setProperty(k, v)
          }
          if (patch.content !== undefined) el.textContent = patch.content
          if (patch.className !== undefined) el.className = patch.className
          break
        }
        case 'replace': {
          const old = map.get(patch.id)
          shortcodeInstances.get(patch.id)?.destroy()
          shortcodeInstances.delete(patch.id)
          const el = renderNode(patch.node)
          old?.replaceWith(el)
          break
        }
      }
    },
    // 全量重建；shortcode instance 全數回收後由 renderNode 重新 resolve
    reconcile(tree) {
      const container = rootEl?.parentElement
      for (const inst of shortcodeInstances.values()) inst.destroy()
      shortcodeInstances.clear()
      map.clear()
      rootEl = renderNode(tree)
      if (container) container.replaceChildren(rootEl)
    },
    destroy() {
      for (const inst of shortcodeInstances.values()) inst.destroy()
      shortcodeInstances.clear()
      map.clear()
      rootEl = null
    },
  }
}
