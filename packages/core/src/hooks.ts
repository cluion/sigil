import type { SigilDoc } from './model/types.js'
import type { Engine } from './engine/types.js'

/**
 * 殼層與宿主生命週期 hooks
 *
 * hooks 皆可選且隔離錯誤
 */
export interface EditorHooks {
  onSelect?: (id: string | null, ctx: { engine: Engine }) => void
  /**
   * 存檔前可覆寫 doc
   * 拋錯時中止 save
   */
  beforeSave?: (
    doc: SigilDoc,
    ctx: { engine: Engine },
  ) => void | SigilDoc | Promise<void | SigilDoc>
  afterSave?: (doc: SigilDoc, ctx: { engine: Engine }) => void | Promise<void>
  /** 初始 doc 掛載後 */
  afterLoad?: (doc: SigilDoc, ctx: { engine: Engine }) => void | Promise<void>
  beforeDestroy?: (ctx: { engine: Engine }) => void
}

export async function runBeforeSave(
  hooks: EditorHooks | undefined,
  doc: SigilDoc,
  engine: Engine,
): Promise<SigilDoc> {
  if (!hooks?.beforeSave) return doc
  const next = await hooks.beforeSave(doc, { engine })
  return next ?? doc
}

export async function runAfterSave(
  hooks: EditorHooks | undefined,
  doc: SigilDoc,
  engine: Engine,
): Promise<void> {
  if (!hooks?.afterSave) return
  await hooks.afterSave(doc, { engine })
}

export function runOnSelect(
  hooks: EditorHooks | undefined,
  id: string | null,
  engine: Engine,
): void {
  if (!hooks?.onSelect) return
  try {
    hooks.onSelect(id, { engine })
  } catch {
    /* isolate host errors */
  }
}

export function runAfterLoad(
  hooks: EditorHooks | undefined,
  doc: SigilDoc,
  engine: Engine,
): void {
  if (!hooks?.afterLoad) return
  try {
    void Promise.resolve(hooks.afterLoad(doc, { engine })).catch(() => {})
  } catch {
    /* isolate */
  }
}

export function runBeforeDestroy(hooks: EditorHooks | undefined, engine: Engine): void {
  if (!hooks?.beforeDestroy) return
  try {
    hooks.beforeDestroy({ engine })
  } catch {
    /* isolate */
  }
}
