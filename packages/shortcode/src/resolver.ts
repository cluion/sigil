import { state, effect } from '@cluion/sigil-core'
import type { HtmlPolicy, ShortcodeResolver } from '@cluion/sigil-core'
import type { ShortcodeDefinition, BindContext, CleanupFn } from './types.js'
import type { ShortcodeRegistry } from './registry.js'

type Signal<T> = { get(): T; set(v: T): void }

export interface CreateResolverOptions {
  registry: ShortcodeRegistry
  policy: HtmlPolicy
}

/**
 * 建立 shortcode resolver — 實作 core 的 ShortcodeResolver 契約
 *
 * template 首次以 policy.setTemplate 解析進快取（受控 sink），之後 cloneNode；
 * 每個 prop 對應一個 signal，ctx.props 為 getter（effect 內讀取自動建立依賴）；
 * bind 只在 resolve 跑一次；setProps 只 signal.set 觸發細粒度 effect 重跑，host 元素不重建
 */
export function createShortcodeResolver(opts: CreateResolverOptions): ShortcodeResolver {
  const templateCache = new Map<string, HTMLTemplateElement>()

  function getTemplate(def: ShortcodeDefinition): HTMLTemplateElement {
    const cached = templateCache.get(def.name)
    if (cached) return cached
    const tpl =
      typeof def.template === 'string' ? document.createElement('template') : def.template
    if (typeof def.template === 'string') opts.policy.setTemplate(tpl, def.template)
    templateCache.set(def.name, tpl)
    return tpl
  }

  return {
    resolve(node, host, resolveMode) {
      const ref = node.shortcode
      if (!ref) return null
      const def = opts.registry.get(ref.name)
      if (!def) return null

      // clone template 進 host
      const tpl = getTemplate(def)
      host.append(tpl.content.cloneNode(true))

      // props 合併預設值並 signal 化
      const merged = { ...(def.props ?? {}), ...ref.props }
      const signals = new Map<string, Signal<unknown>>()
      const ctxProps: Record<string, unknown> = {}
      for (const k of Object.keys(merged)) {
        const s: Signal<unknown> = state<unknown>(merged[k])
        signals.set(k, s)
        Object.defineProperty(ctxProps, k, {
          get: () => s.get(),
          enumerable: true,
        })
      }

      const ac = new AbortController()
      const disposers: CleanupFn[] = []

      const ctx: BindContext = {
        props: ctxProps,
        effect: (fn) => {
          const dispose = effect(fn)
          disposers.push(dispose)
          return dispose
        },
        mode: resolveMode,
        abort: ac.signal,
      }

      const cleanup = def.bind?.(host, ctx)

      return {
        el: host,
        setProps(newProps) {
          for (const [k, v] of Object.entries(newProps)) {
            signals.get(k)?.set(v)
          }
        },
        destroy() {
          ac.abort()
          for (const d of disposers) d()
          if (typeof cleanup === 'function') cleanup()
        },
      }
    },
    renderStatic(node) {
      const ref = node.shortcode
      if (!ref) return null
      const def = opts.registry.get(ref.name)
      if (!def) return null
      const props = { ...(def.props ?? {}), ...ref.props } as Record<string, unknown>
      if (def.render) return def.render(props)
      if (typeof def.template === 'string') return def.template
      return def.template.innerHTML
    },
  }
}
