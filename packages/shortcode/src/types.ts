import type { PropSchema, Store } from '@cluion/sigil-core'

export type CleanupFn = () => void

/**
 * shortcode 定義 — 由 defineShortcode 產出、註冊到 registry
 *
 * template 為 HTML 結構（字串或 <template>），bind 為命令式綁定（mount 跑一次）；
 * props 為預設值，實際值由節點 shortcode.props 覆寫
 */
export interface ShortcodeDefinition<P = Record<string, unknown>> {
  name: string
  label?: string
  category?: string
  icon?: string
  props?: P
  template: string | HTMLTemplateElement
  bind?: (el: HTMLElement, ctx: BindContext<P>) => void | CleanupFn
  render?: (props: P, ctx: RenderContext) => string
  schema?: PropSchema[]
}

/**
 * render 執行環境(static 輸出)
 *
 * escape 為 escapeHtml,供作者 escape 動態 props 後再進 HTML 字串;
 * 作者對靜態結構自行負責(同 template 信任模型)
 */
export interface RenderContext {
  escape: (input: string) => string
}

/**
 * bind 執行環境（resolver 注入）
 *
 * - props：signal-backed getter（在 effect 內讀取才建立依賴，不可在 effect 外解構）
 * - effect：註冊細粒度副作用；回傳 cleanup，destroy 時一併回收
 * - abort：instance destroy 時 abort
 * - emit / on：跨 shortcode 事件（共享 EventBus）
 * - fetchJSON：非同步資料；可傳 AbortSignal 避 race
 * - store：共享鍵值狀態（signal-backed；跨 shortcode 響應式）
 * - 巢狀內容：template 使用原生 `<slot>`，子 ComponentNode 由 renderer 填入
 */
export interface BindContext<P = Record<string, unknown>> {
  props: P
  effect: (fn: () => void | CleanupFn) => CleanupFn
  mode: 'edit' | 'live'
  abort: AbortSignal
  emit: (name: string, data?: unknown) => void
  on: (name: string, handler: (data?: unknown) => void) => () => void
  fetchJSON: (url: string, signal?: AbortSignal) => Promise<unknown>
  store: Store
}
