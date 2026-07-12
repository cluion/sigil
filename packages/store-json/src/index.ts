import type { AssetItem, AssetStore, ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { createId, migrate } from '@cluion/sigil-core'

/**
 * JsonProjectStore — 記憶體保存 + JSON 匯入匯出
 */
export class JsonProjectStore implements ProjectStore {
  private doc: SigilDoc | null = null

  load(): SigilDoc | null {
    return this.doc
  }

  save(doc: SigilDoc): void {
    this.doc = doc
  }

  exportJSON(doc: SigilDoc): string {
    return JSON.stringify(doc)
  }

  importJSON(json: string): SigilDoc {
    return migrate(JSON.parse(json) as unknown)
  }
}

/**
 * MemoryAssetStore — 記憶體媒體庫，upload 產生 object URL
 */
export class MemoryAssetStore implements AssetStore {
  private items: AssetItem[]

  constructor(initial: AssetItem[] = []) {
    this.items = [...initial]
  }

  list(): AssetItem[] {
    return [...this.items]
  }

  upload(file: File): AssetItem {
    const url = URL.createObjectURL(file)
    const item: AssetItem = {
      id: createId(),
      url,
      name: file.name,
      mimeType: file.type || undefined,
      thumbUrl: url,
    }
    this.items = [item, ...this.items]
    return item
  }

  /** 測試／demo 用：直接塞入項目 */
  add(item: AssetItem): void {
    this.items = [item, ...this.items]
  }
}
