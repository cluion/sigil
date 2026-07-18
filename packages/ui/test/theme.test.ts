import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyTheme, effectiveTheme, nextTheme, type ThemeChoice } from '../src/theme.js'

/**
 * 可控 matchMedia mock：能設定 matches 並手動觸發 change
 */
interface FakeMQ {
  matches: boolean
  listeners: Set<(e: { matches: boolean }) => void>
  addEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void
  removeEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void
}

function installMatchMedia(initialMatches = false): FakeMQ & { fire(matches: boolean): void } {
  const mq: FakeMQ = {
    matches: initialMatches,
    listeners: new Set(),
    addEventListener(type, fn) {
      if (type === 'change') this.listeners.add(fn)
    },
    removeEventListener(type, fn) {
      if (type === 'change') this.listeners.delete(fn)
    },
  }
  const stub = vi.fn(() => mq as unknown as MediaQueryList)
  vi.stubGlobal('matchMedia', stub)
  return {
    ...mq,
    fire(matches: boolean) {
      mq.matches = matches
      for (const fn of mq.listeners) fn({ matches })
    },
  }
}

describe('applyTheme', () => {
  let restore: () => void
  beforeEach(() => {
    restore = () => vi.unstubAllGlobals()
  })
  afterEach(() => restore())

  it('light 不套 dark class', () => {
    installMatchMedia(true)
    const root = document.createElement('div')
    applyTheme(root, 'light')
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
  })

  it('dark 套 dark class', () => {
    installMatchMedia(false)
    const root = document.createElement('div')
    applyTheme(root, 'dark')
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)
  })

  it('auto + 系統暗 → 套 dark class', () => {
    installMatchMedia(true)
    const root = document.createElement('div')
    applyTheme(root, 'auto')
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)
  })

  it('auto + 系統亮 → 不套 dark class', () => {
    installMatchMedia(false)
    const root = document.createElement('div')
    applyTheme(root, 'auto')
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
  })

  it('auto 追蹤系統變化即時切換', () => {
    const mq = installMatchMedia(false)
    const root = document.createElement('div')
    applyTheme(root, 'auto')
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
    mq.fire(true)
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)
    mq.fire(false)
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
  })

  it('cleanup 拆除 listener，系統變化不再切換', () => {
    const mq = installMatchMedia(false)
    const root = document.createElement('div')
    const cleanup = applyTheme(root, 'auto')
    cleanup()
    mq.fire(true)
    expect(root.classList.contains('sigil-theme-dark')).toBe(false)
  })

  it('light/dark 不接 matchMedia listener（cleanup 空操作）', () => {
    const mq = installMatchMedia(false)
    const root = document.createElement('div')
    const cleanup = applyTheme(root, 'dark')
    // 系統變化不影響強制 dark
    mq.fire(false)
    expect(root.classList.contains('sigil-theme-dark')).toBe(true)
    cleanup()
  })
})

describe('effectiveTheme', () => {
  beforeEach(() => installMatchMedia(false))

  it('dark → dark', () => {
    expect(effectiveTheme('dark')).toBe('dark')
  })
  it('light → light', () => {
    expect(effectiveTheme('light')).toBe('light')
  })
  it('auto + 系統亮 → light', () => {
    expect(effectiveTheme('auto')).toBe('light')
  })
})

describe('nextTheme', () => {
  it('三態循環 auto → light → dark → auto', () => {
    const order: ThemeChoice[] = ['auto']
    let cur: ThemeChoice = 'auto'
    for (let i = 0; i < 3; i++) {
      cur = nextTheme(cur)
      order.push(cur)
    }
    expect(order).toEqual(['auto', 'light', 'dark', 'auto'])
  })
})
