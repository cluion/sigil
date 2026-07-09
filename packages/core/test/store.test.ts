import { describe, it, expect } from 'vitest'
import { createStore, effect } from '../src/index.js'

describe('createStore', () => {
  it('get/set', () => {
    const store = createStore()
    store.set('a', 1)
    expect(store.get<number>('a')).toBe(1)
  })

  it('未設 get undefined', () => {
    const store = createStore()
    expect(store.get('a')).toBeUndefined()
  })

  it('響應式:get 在 effect 內,set 觸發重跑', () => {
    const store = createStore()
    let runs = 0
    let val: number | undefined
    effect(() => {
      runs++
      val = store.get<number>('n')
    })
    expect(runs).toBe(1)
    expect(val).toBeUndefined()
    store.set('n', 5)
    expect(runs).toBe(2)
    expect(val).toBe(5)
  })
})
