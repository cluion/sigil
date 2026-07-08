let counter = 0

/**
 * 零依賴 id 產生器
 *
 * c- + base36 時間 + 計數器 + 亂數，跨實例唯一
 */
export function createId(): string {
  const t = Date.now().toString(36)
  const c = (counter++).toString(36)
  const r = Math.random().toString(36).slice(2, 6)
  return `c-${t}-${c}-${r}`
}

/** id 產生器型別，供注入測試 */
export type IdFactory = () => string
