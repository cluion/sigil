/**
 * ComponentNode — 頁面樹的節點
 *
 * 不可變 JSON 結構，所有操作產新節點，未變子樹共享
 */
export interface ComponentNode {
  id: string
  type: string
  tagName?: string
  attributes?: Record<string, string>
  style?: Record<string, string>
  className?: string
  content?: string
  children?: ComponentNode[]
  shortcode?: ShortcodeRef
  /** 圖層顯示名稱（重命名） */
  name?: string
  /** 鎖定：不可刪除／移動／改內容（可解鎖） */
  locked?: boolean
  /** 隱藏：編輯畫布半透；匯出 HTML 時 display:none */
  hidden?: boolean
}

/**
 * ShortcodeRef — type 為 shortcode 時必填
 */
export interface ShortcodeRef {
  name: string
  props: Record<string, unknown>
}

/**
 * StyleSheet — doc 級樣式表（class、偽類、媒體查詢），機位先留
 */
export interface StyleSheet {
  id: string
  rules: string
}

/**
 * SigilDoc — 序列化格式，version 走 migration 串
 */
export interface SigilDoc {
  version: 1
  root: ComponentNode
  stylesheets?: StyleSheet[]
  meta?: SigilDocMeta
}

export interface SigilDocMeta {
  title?: string
  device?: 'desktop' | 'tablet' | 'mobile'
  updatedAt?: string
}

export type Attrs = Record<string, string>
export type Style = Record<string, string>
