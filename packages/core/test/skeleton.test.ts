import { describe, it, expect } from 'vitest'
import { SIGIL_CORE_VERSION } from '../src/index.js'

describe('sigil-core skeleton', () => {
  it('exposes a version constant', () => {
    expect(SIGIL_CORE_VERSION).toBe('0.0.0')
  })
})
