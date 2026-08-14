import { describe, it, expect, vi } from 'vitest'
import { createI18n, type I18n, type Locale, type MessageCatalog } from '../src/index.js'

const messages = {
  zh: { hello: '你好', bye: '再見' },
  en: { hello: 'Hello' },
} satisfies MessageCatalog

describe('createI18n', () => {
  it('既有 I18n adapter 只需實作 t 與 setLocale', () => {
    const legacy: I18n = {
      t: (key) => key,
      setLocale: () => {},
    }

    expect(legacy.t('hello')).toBe('hello')
  })

  it('t 預設 zh', () => {
    const i18n = createI18n(messages)
    expect(i18n.t('hello')).toBe('你好')
  })

  it('setLocale en', () => {
    const i18n = createI18n(messages)
    i18n.setLocale('en')
    expect(i18n.t('hello')).toBe('Hello')
  })

  it('getLocale 回報初始與切換後 locale', () => {
    const i18n = createI18n(messages, 'en')
    expect(i18n.getLocale()).toBe('en')

    i18n.setLocale('zh')
    expect(i18n.getLocale()).toBe('zh')
  })

  it('切換後同步通知 listener，且 listener 讀到新狀態', () => {
    const i18n = createI18n(messages)
    const seen: Array<{ locale: Locale; text: string }> = []
    i18n.subscribe((locale) => {
      seen.push({ locale, text: i18n.t('hello') })
    })

    i18n.setLocale('en')

    expect(seen).toEqual([{ locale: 'en', text: 'Hello' }])
  })

  it('設為目前 locale 時不重複通知', () => {
    const i18n = createI18n(messages)
    const listener = vi.fn()
    i18n.subscribe(listener)

    i18n.setLocale('zh')

    expect(listener).not.toHaveBeenCalled()
  })

  it('unsubscribe 可重複呼叫，解除後不再通知', () => {
    const i18n = createI18n(messages)
    const listener = vi.fn()
    const unsubscribe = i18n.subscribe(listener)

    i18n.setLocale('en')
    unsubscribe()
    unsubscribe()
    i18n.setLocale('zh')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('en')
  })

  it('locale 缺 key → fallback zh', () => {
    const i18n = createI18n(messages)
    i18n.setLocale('en')
    expect(i18n.t('bye')).toBe('再見')
  })

  it('全缺 key → 回 key', () => {
    const i18n = createI18n(messages)
    expect(i18n.t('missing')).toBe('missing')
  })
})
