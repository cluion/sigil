import type { SigilDoc } from './types.js'

export const SCHEMA_VERSION = 1

// 每步只升一版；未來新增版號時填入
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

/**
 * 把任意版本 doc 遷移到最新版
 *
 * 版號過新則丟錯，不靜默誤解
 */
export function migrate(doc: unknown): SigilDoc {
  const d = doc as { version?: number }
  if (typeof d.version !== 'number') {
    throw new Error('SigilDoc 缺 version 欄位')
  }
  if (d.version > SCHEMA_VERSION) {
    throw new Error(`不支援的 schema version ${d.version}（最大 ${SCHEMA_VERSION}）`)
  }
  let cur: Record<string, unknown> = d as Record<string, unknown>
  while ((cur.version as number) < SCHEMA_VERSION) {
    const step = migrations[cur.version as number]
    if (!step) throw new Error(`缺少從 version ${String(cur.version)} 的 migration`)
    cur = step(cur)
  }
  return cur as unknown as SigilDoc
}
