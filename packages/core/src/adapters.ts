import type { ComponentNode, SigilDoc } from './model/types.js'

/**
 * ProjectStore — 頁面文件存取
 */
export interface ProjectStore {
  load(): SigilDoc | null | Promise<SigilDoc | null>
  save(doc: SigilDoc): void | Promise<void>
}

/**
 * 媒體資產
 */
export interface AssetItem {
  id: string
  url: string
  name?: string
  mimeType?: string
  thumbUrl?: string
}

/**
 * AssetStore — 媒體列表／上傳
 *
 * UI 以 list 選圖 upload 由宿主選配
 */
export interface AssetStore {
  list(): AssetItem[] | Promise<AssetItem[]>
  upload?(file: File): AssetItem | Promise<AssetItem>
}

/**
 * 範本定義 — 預存的節點子樹，插入時 cloneWithNewIds
 */
export interface TemplateDef {
  /** 範本自身 id（與內部節點 id 無關） */
  id: string
  label: string
  /** 面板分類，預設「範本」 */
  category?: string
  icon?: string
  /** 預存子樹 */
  node: ComponentNode
}

/**
 * TemplateStore — 範本存取 adapter
 *
 * 對齊 ProjectStore／AssetStore 模式，宿主可換 HTTP／Laravel
 */
export interface TemplateStore {
  list(): TemplateDef[] | Promise<TemplateDef[]>
  save(template: TemplateDef): void | Promise<void>
}
