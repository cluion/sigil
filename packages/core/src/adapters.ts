import type { SigilDoc } from './model/types.js'

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
