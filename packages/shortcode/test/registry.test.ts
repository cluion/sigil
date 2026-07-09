import { describe, it, expect } from 'vitest'
import { createShortcodeRegistry, defineShortcode } from '../src/index.js'

describe('registry', () => {
  it('從陣列建立並 get', () => {
    const def = defineShortcode({ name: 'a', template: '<b>x</b>' })
    const reg = createShortcodeRegistry([def])
    expect(reg.get('a')?.name).toBe('a')
    expect(reg.get('nope')).toBeNull()
  })

  it('all 列出所有定義', () => {
    const reg = createShortcodeRegistry([
      defineShortcode({ name: 'a', template: '<b></b>' }),
      defineShortcode({ name: 'b', template: '<i></i>' }),
    ])
    expect(reg.all().map((d) => d.name).sort()).toEqual(['a', 'b'])
  })

  it('defineShortcode 傳入 registry 一併註冊', () => {
    const reg = createShortcodeRegistry()
    defineShortcode({ name: 'c', template: '<b></b>' }, reg)
    expect(reg.get('c')?.name).toBe('c')
  })

  it('register 覆寫同名', () => {
    const reg = createShortcodeRegistry([defineShortcode({ name: 'a', template: '<b></b>' })])
    reg.register(defineShortcode({ name: 'a', template: '<i></i>' }))
    expect(reg.get('a')?.template).toBe('<i></i>')
  })
})
