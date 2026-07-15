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
  /** Desktop 基礎樣式 舊文件相容 */
  style?: Record<string, string>
  /** Tablet 與 mobile 差異覆寫 */
  responsiveStyles?: ResponsiveStyles
  className?: string
  content?: string
  children?: ComponentNode[]
  shortcode?: ShortcodeRef
  /** 圖層名稱 */
  name?: string
  /** 鎖定節點操作 */
  locked?: boolean
  /** 隱藏畫布與輸出 */
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
 * Doc 級樣式表
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
  device?: ResponsiveDevice
  updatedAt?: string
}

export type Attrs = Record<string, string>
export type Style = Record<string, string>
export type ResponsiveDevice = 'desktop' | 'tablet' | 'mobile'
export type ResponsiveBreakpoint = Exclude<ResponsiveDevice, 'desktop'>
export type ResponsiveStyles = Partial<Record<ResponsiveBreakpoint, Style>>
