export type Locale = 'zh' | 'en'

export interface I18n {
  t: (key: string) => string
  setLocale: (locale: Locale) => void
}

/**
 * 建立 i18n — t 找 locale → fallback zh → fallback key
 */
export function createI18n(
  messages: Record<Locale, Record<string, string>>,
  initial: Locale = 'zh',
): I18n {
  let locale = initial
  return {
    t(key) {
      return messages[locale]?.[key] ?? messages.zh?.[key] ?? key
    },
    setLocale(next) {
      locale = next
    },
  }
}
