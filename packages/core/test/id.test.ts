import { describe, it, expect } from 'vitest'
import { createId } from '../src/index.js'

describe('createId', () => {
  it('產生 c- 前綴且唯一', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) ids.add(createId())
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id.startsWith('c-')).toBe(true)
  })
})
