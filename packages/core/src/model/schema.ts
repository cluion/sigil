/** shortcode prop 的控制項型別(屬性表單用) */
export type PropType = 'text' | 'number' | 'boolean' | 'select' | 'color' | 'media'

/** select 型別的選項 */
export interface SelectOption {
  value: string
  label?: string
}

/** 單一 prop 的屬性表單描述 */
export interface PropSchema {
  name: string
  type: PropType
  label?: string
  /** 僅 select 用;靜態選項 */
  options?: SelectOption[]
}
