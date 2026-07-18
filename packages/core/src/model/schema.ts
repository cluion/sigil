/** shortcode prop 控制項型別 */
export type PropType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'media'
  | 'date'
  | 'repeater'

/** select 型別的選項 */
export interface SelectOption {
  value: string
  label?: string
}

/**
 * 欄位可見條件 — 依另一 prop 的值決定是否顯示
 *
 * - `eq`：嚴格相等
 * - `in`：值落在陣列內
 * - 僅 `prop`：該 prop 為 truthy
 */
export interface PropDependsOn {
  prop: string
  eq?: string | number | boolean
  in?: Array<string | number | boolean>
}

/** optionsFrom 執行環境 — 注入非同步能力與目前 props */
export interface OptionsFromCtx {
  /** 目前該 shortcode 的全部 props（唯讀快照） */
  props: Record<string, unknown>
  /** 非同步資料；建議傳入 signal 避 race */
  fetchJSON: (url: string, signal?: AbortSignal) => Promise<unknown>
  /** 重載或銷毀時 abort；optionsFrom 內應傳給 fetchJSON */
  signal: AbortSignal
}

/** 單一 prop 的屬性表單描述 */
export interface PropSchema {
  name: string
  type: PropType
  label?: string
  /** 僅 select 用;靜態選項 */
  options?: SelectOption[]
  /** 表單分組 */
  group?: string
  /** 可見條件 */
  dependsOn?: PropDependsOn
  /** repeater 子欄位；每筆是一個 group */
  schema?: PropSchema[]
  /**
   * select 動態選項；與 options 互斥，optionsFrom 優先
   *
   * 需配 dependsOn 宣告依賴 prop，依賴變動時自動重載（abort 舊請求）
   */
  optionsFrom?: (ctx: OptionsFromCtx) => Promise<SelectOption[]>
}

/**
 * 依目前 props 判斷欄位是否應顯示
 */
export function isPropVisible(
  schema: PropSchema,
  props: Record<string, unknown>,
): boolean {
  const dep = schema.dependsOn
  if (!dep) return true
  const v = props[dep.prop]
  if (dep.eq !== undefined) return v === dep.eq
  if (dep.in !== undefined) {
    return dep.in.some((x) => x === v)
  }
  return v !== undefined && v !== null && v !== false && v !== ''
}
