import { describe, it, expect, vi } from 'vitest'
import { state, computed, effect, batch, untrack } from '../src/index.js'

describe('signal — state', () => {
  it('get／set 基本值', () => {
    const s = state(1)
    expect(s.get()).toBe(1)
    s.set(2)
    expect(s.get()).toBe(2)
  })

  it('同值 set 不觸發', () => {
    const s = state(1)
    const fn = vi.fn(() => {
      s.get()
    })
    effect(fn)
    fn.mockClear()
    s.set(1)
    expect(fn).not.toHaveBeenCalled()
    s.set(3)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('signal — effect', () => {
  it('首次立即執行並追蹤依賴', () => {
    const s = state(10)
    const fn = vi.fn(() => {
      s.get()
    })
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    s.set(20)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(s.get()).toBe(20)
  })

  it('多個 effect 訂閱同一 state 都重跑', () => {
    const s = state(0)
    const a = vi.fn(() => {
      s.get()
    })
    const b = vi.fn(() => {
      s.get()
    })
    effect(a)
    effect(b)
    a.mockClear()
    b.mockClear()
    s.set(1)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('讀多個 state，任一變都重跑', () => {
    const a = state(1)
    const b = state(2)
    const fn = vi.fn(() => {
      a.get()
      b.get()
    })
    effect(fn)
    fn.mockClear()
    a.set(10)
    expect(fn).toHaveBeenCalledTimes(1)
    b.set(20)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cleanup 在重跑前與 dispose 時都呼叫', () => {
    const s = state(0)
    const clean = vi.fn()
    const fn = vi.fn((): (() => void) => {
      s.get()
      return clean
    })
    const dispose = effect(fn)
    clean.mockClear()
    s.set(1) // 重跑前清舊 cleanup
    expect(clean).toHaveBeenCalledTimes(1)
    clean.mockClear()
    dispose()
    expect(clean).toHaveBeenCalledTimes(1)
  })

  it('dispose 後不再收通知', () => {
    const s = state(0)
    const fn = vi.fn(() => {
      s.get()
    })
    const dispose = effect(fn)
    fn.mockClear()
    dispose()
    s.set(1)
    expect(fn).not.toHaveBeenCalled()
  })

  it('動態切換依賴（條件分支）', () => {
    const flag = state(true)
    const a = state('A')
    const b = state('B')
    let seen = ''
    effect(() => {
      seen = flag.get() ? a.get() : b.get()
    })
    expect(seen).toBe('A')
    b.set('B2')
    expect(seen).toBe('A') // 沒訂閱 b，不重跑
    a.set('A2')
    expect(seen).toBe('A2')
    flag.set(false)
    expect(seen).toBe('B2')
    a.set('A3')
    expect(seen).toBe('B2') // 已改訂閱 b
  })
})

describe('signal — batch', () => {
  it('多 set 合併，訂閱的 effect 只跑一次', () => {
    const a = state(1)
    const b = state(2)
    const fn = vi.fn(() => {
      a.get()
      b.get()
    })
    effect(fn)
    fn.mockClear()
    batch(() => {
      a.set(10)
      b.set(20)
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('signal — untrack', () => {
  it('在 effect 內讀但不建立依賴', () => {
    const tracked = state(1)
    const untracked = state(2)
    const fn = vi.fn(() => {
      tracked.get()
      untrack(() => untracked.get())
    })
    effect(fn)
    fn.mockClear()
    untracked.set(99)
    expect(fn).not.toHaveBeenCalled() // 未追蹤，不重跑
    tracked.set(5)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('signal — computed', () => {
  it('lazy：未讀不計算', () => {
    const src = state(1)
    const fn = vi.fn(() => src.get() * 2)
    const c = computed(fn)
    expect(fn).not.toHaveBeenCalled()
    c.get()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('memo：未變動重讀用快取', () => {
    const src = state(2)
    const fn = vi.fn(() => src.get() * 3)
    const c = computed(fn)
    expect(c.get()).toBe(6)
    expect(c.get()).toBe(6)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('來源變動，訂閱 computed 的 effect 重跑', () => {
    const src = state(2)
    const c = computed(() => src.get() * 10)
    let seen = 0
    effect(() => {
      seen = c.get()
    })
    expect(seen).toBe(20)
    src.set(3)
    expect(seen).toBe(30)
  })
})
