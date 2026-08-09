import type { I18n } from '@cluion/sigil-core'

/** UI 套件的向後相容翻譯：未注入或缺少 key 時沿用既有中文。 */
export function uiText(i18n: I18n | undefined, key: string, fallback: string): string {
  const translated = i18n?.t(key)
  return !translated || translated === key ? fallback : translated
}
