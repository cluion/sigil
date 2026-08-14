import type { I18n, ReactiveI18n } from '@cluion/sigil-core'

/** UI 套件的向後相容翻譯：未注入或缺少 key 時沿用既有中文。 */
export function uiText(i18n: I18n | undefined, key: string, fallback: string): string {
  const translated = i18n?.t(key)
  return !translated || translated === key ? fallback : translated
}

/** ReactiveI18n 為 additive capability，既有 I18n adapter 維持 mount-time 行為 */
export function subscribeLocale(i18n: I18n | undefined, listener: () => void): () => void {
  const subscribe = (i18n as Partial<ReactiveI18n> | undefined)?.subscribe
  return typeof subscribe === 'function' ? subscribe.call(i18n, listener) : () => {}
}
