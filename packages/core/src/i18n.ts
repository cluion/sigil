export type Locale = 'zh' | 'en'

export type MessageCatalog = Record<Locale, Record<string, string>>

export type MessageOverrides = Partial<Record<Locale, Record<string, string>>>

export interface I18n {
  t: (key: string) => string
  setLocale: (locale: Locale) => void
}

export interface ReactiveI18n extends I18n {
  getLocale: () => Locale
  subscribe: (listener: (locale: Locale) => void) => () => void
}

/**
 * 建立 i18n — t 找 locale → fallback zh → fallback key
 */
export function createI18n(messages: MessageCatalog, initial: Locale = 'zh'): ReactiveI18n {
  let locale = initial
  const listeners = new Set<(locale: Locale) => void>()

  return {
    t(key) {
      return messages[locale]?.[key] ?? messages.zh?.[key] ?? key
    },
    getLocale() {
      return locale
    },
    setLocale(next) {
      if (next === locale) return
      locale = next
      for (const listener of [...listeners]) listener(locale)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
