import { state, effect, escapeHtml, createStore } from '@cluion/sigil-core'
import type { HtmlPolicy, ShortcodeResolver, EventBus, Store } from '@cluion/sigil-core'
import type { ShortcodeDefinition, BindContext, CleanupFn } from './types.js'
import type { ShortcodeRegistry } from './registry.js'

type Signal<T> = { get(): T; set(v: T): void }

export interface CreateResolverOptions {
  registry: ShortcodeRegistry
  policy: HtmlPolicy
  bus?: EventBus
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
  store?: Store
}

/**
 * 建立 shortcode resolver — 實作 core 的 ShortcodeResolver 契約
 *
 * template 經 policy 解析後快取
 * prop 以 signal 驅動 effect
 * resolve 執行 bind setProps 更新 signal
 */
export function createShortcodeResolver(opts: CreateResolverOptions): ShortcodeResolver {
  const templateCache = new Map<string, HTMLTemplateElement>()
  const store = opts.store ?? createStore()

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
        emit: (name, data) => opts.bus?.emit(name, data),
        on: (name, handler) => {
          const dispose = opts.bus?.on(name, handler) ?? (() => {})
          disposers.push(dispose)
          return dispose
        },
        fetchJSON: (url, signal) =>
          (opts.fetchJSON ?? (() => Promise.reject(new Error('fetchJSON 未注入'))))(url, signal),
        store,
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
      if (def.render) return def.render(props, { escape: escapeHtml })
      if (typeof def.template === 'string') return def.template
      return def.template.innerHTML
    },
  }
}
