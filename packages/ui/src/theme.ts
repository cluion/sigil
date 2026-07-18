/** 主題選擇：light 強制亮、dark 強制暗、auto 追蹤系統 prefers-color-scheme */
export type ThemeChoice = 'light' | 'dark' | 'auto'

const DARK_CLASS = 'sigil-theme-dark'
const MQ_DARK = '(prefers-color-scheme: dark)'

/**
 * 偵測目前系統是否為暗色偏好
 *
 * matchMedia 不存在（SSR／舊環境）時退為 false
 */
function systemPrefersDark(): boolean {
  if (typeof matchMedia === 'undefined') return false
  return matchMedia(MQ_DARK).matches
}

/**
 * 套用主題到 root 元素
 *
 * - light／dark：直接切換 `.sigil-theme-dark` class
 * - auto：依系統 prefers-color-scheme 決定，並監聽變化即時切換
 *
 * 回傳 cleanup，拆除 matchMedia listener
 */
export function applyTheme(root: HTMLElement, choice: ThemeChoice): () => void {
  const mq = typeof matchMedia === 'undefined' ? null : matchMedia(MQ_DARK)

  function sync(): void {
    const dark = choice === 'dark' || (choice === 'auto' && (mq?.matches ?? false))
    root.classList.toggle(DARK_CLASS, dark)
  }

  sync()
  if (choice === 'auto' && mq) {
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }
  return () => {}
}

/**
 * 依選擇回傳有效主題（實際亮／暗）
 *
 * auto 時讀系統偏好；SSR／無 matchMedia 時 auto 視為 light
 */
export function effectiveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'dark') return 'dark'
  if (choice === 'auto') return systemPrefersDark() ? 'dark' : 'light'
  return 'light'
}

/** 三態循環順序：auto → light → dark → auto */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === 'auto') return 'light'
  if (choice === 'light') return 'dark'
  return 'auto'
}
