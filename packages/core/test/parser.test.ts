import { describe, it, expect } from 'vitest'
import { stringify } from '../src/index.js'
import type { ComponentNode } from '../src/index.js'

const sc = (name: string, props: Record<string, unknown> = {}): ComponentNode =>
  ({ id: 'x', type: 'shortcode', shortcode: { name, props } })

describe('stringify', () => {
  it('基本 shortcode(number 值)', () => {
    expect(stringify(sc('counter', { step: 1 }))).toBe('[counter step="1"/]')
  })

  it('boolean 值', () => {
    expect(stringify(sc('box', { on: true }))).toBe('[box on="true"/]')
  })

  it('多 props', () => {
    expect(stringify(sc('a', { x: '1', y: '2' }))).toBe('[a x="1" y="2"/]')
  })

  it('無 props', () => {
    expect(stringify(sc('spacer'))).toBe('[spacer/]')
  })

  it('escape 引號(值含 ")', () => {
    expect(stringify(sc('a', { k: 'a"b' }))).toBe(`[a k="a\\"b"/]`)
  })

  it('escape 反斜線(\\ → \\\\)', () => {
    expect(stringify(sc('a', { k: 'a\\b' }))).toBe('[a k="a\\\\b"/]')
  })

  it('非 shortcode 節點拋錯', () => {
    expect(() => stringify({ id: 'x', type: 'section' } as ComponentNode)).toThrow()
  })
})
