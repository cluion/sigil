import type { ComponentNode } from '../model/types.js'

/**
 * shortcode 實例 — resolver 產出，host 已填入 template 並跑過 bind
 *
 * setProps 觸發細粒度更新
 * destroy 回收資源
 */
export interface ShortcodeInstance {
  el: HTMLElement
  setProps(props: Record<string, unknown>): void
  destroy(): void
}

/**
 * shortcode resolver 契約 — core 僅定義介面，實作在 shortcode 套件
 *
 * renderer 先建立 shortcode host
 * resolve 建立 shortcode instance
 * 回傳 instance 供後續 setProps／destroy
 */
export interface ShortcodeResolver {
  resolve(node: ComponentNode, host: HTMLElement, mode: 'edit' | 'live'): ShortcodeInstance | null
  renderStatic?(node: ComponentNode): string | null
}
