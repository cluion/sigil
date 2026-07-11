import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { migrate } from '@cluion/sigil-core'

/**
 * JsonProjectStore — 記憶體保存 + JSON 匯入匯出
 *
 * 實作 core `ProjectStore`；exportJSON / importJSON 為 JSON adapter 專屬能力。
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
