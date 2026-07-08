import type { SigilDoc } from '@cluion/sigil-core'
import { migrate } from '@cluion/sigil-core'

/**
 * JsonProjectStore — 記憶體保存 + JSON 匯入匯出
 */
export class JsonProjectStore {
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
    return migrate(JSON.parse(json))
  }
}
