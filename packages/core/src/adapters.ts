import type { SigilDoc } from './model/types.js'

/**
 * ProjectStore — 頁面文件存取 adapter 契約
 *
 * core 只定義介面；預設實作見 `@cluion/sigil-store-json`。
 * load / save 可同步或回傳 Promise，方便接後端 HTTP。
 */
export interface ProjectStore {
  load(): SigilDoc | null | Promise<SigilDoc | null>
  save(doc: SigilDoc): void | Promise<void>
}
