import { describe, it, expect } from 'vitest'
import { createI18n } from '../src/index.js'

const messages = {
  zh: { hello: '你好', bye: '再見' },
  en: { hello: 'Hello' },
}

describe('createI18n', () => {
  it('t 預設 zh', () => {
    const i18n = createI18n(messages)
    expect(i18n.t('hello')).toBe('你好')
  })

  it('setLocale en', () => {
    const i18n = createI18n(messages)
    i18n.setLocale('en')
    expect(i18n.t('hello')).toBe('Hello')
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
