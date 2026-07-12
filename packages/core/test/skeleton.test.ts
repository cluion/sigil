import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { SIGIL_CORE_VERSION } from '../src/index.js'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version: string }

describe('sigil-core skeleton', () => {
  it('exposes a version constant matching package.json', () => {
    expect(SIGIL_CORE_VERSION).toBe(pkg.version)
    expect(SIGIL_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
