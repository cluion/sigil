import type { PropSchema } from '@cluion/sigil-core'

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
 * bind 執行環境
 *
 * props 為 signal-backed getter（在 effect 內讀取才建立依賴，不可在 effect 外解構）；
 * effect 註冊細粒度副作用；abort 在 destroy 時觸發；
 * store／emit／fetchJSON／slots 留待後續階段
 */
export interface BindContext<P = Record<string, unknown>> {
  props: P
  effect: (fn: () => void | CleanupFn) => CleanupFn
  mode: 'edit' | 'live'
  abort: AbortSignal
}
