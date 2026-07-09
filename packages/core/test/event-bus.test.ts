import { describe, it, expect, vi } from 'vitest'
import { createEventBus } from '../src/index.js'

describe('createEventBus', () => {
  it('emit/on 收發', () => {
    const bus = createEventBus()
    const h = vi.fn()
    bus.on('e', h)
    bus.emit('e', 42)
    expect(h).toHaveBeenCalledWith(42)
  })

  it('dispose 移除 handler', () => {
    const bus = createEventBus()
    const h = vi.fn()
    const off = bus.on('e', h)
    off()
    bus.emit('e')
    expect(h).not.toHaveBeenCalled()
  })

  it('同 name 多 handler 全通知', () => {
    const bus = createEventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('e', h1)
    bus.on('e', h2)
    bus.emit('e')
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('同步順序(註冊序)', () => {
    const bus = createEventBus()
    const order: number[] = []
    bus.on('e', () => order.push(1))
    bus.on('e', () => order.push(2))
    bus.emit('e')
    expect(order).toEqual([1, 2])
  })

  it('emit 時 handler 內 off(快照安全)', () => {
    const bus = createEventBus()
    const order: number[] = []
    const off = bus.on('e', () => {
      order.push(1)
      off()
    })
    bus.on('e', () => order.push(2))
    bus.emit('e')
    expect(order).toEqual([1, 2])
  })

  it('不同 name 不干擾', () => {
    const bus = createEventBus()
    const h = vi.fn()
    bus.on('a', h)
    bus.emit('b')
    expect(h).not.toHaveBeenCalled()
  })
})
