import { describe, it, expect } from 'vitest'
import { parse, stringify } from '../src/index.js'
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

describe('parse', () => {
  it('number 依 schema 還原', () => {
    const schema = [{ name: 'step', type: 'number' as const }]
    const nodes = parse('[counter step="1"/]', { getSchema: () => schema })
    expect(nodes[0]!.shortcode!.props.step).toBe(1)
  })

  it('boolean 依 schema 還原', () => {
    const schema = [{ name: 'on', type: 'boolean' as const }]
    const nodes = parse('[box on="true"/]', { getSchema: () => schema })
    expect(nodes[0]!.shortcode!.props.on).toBe(true)
  })

  it('無 schema → 退字串', () => {
    const nodes = parse('[counter step="1"/]')
    expect(nodes[0]!.shortcode!.props.step).toBe('1')
  })

  it('未知 name 仍產節點', () => {
    const nodes = parse('[mystery k="v"/]')
    expect(nodes[0]!.shortcode!.name).toBe('mystery')
  })

  it('多 shortcode', () => {
    expect(parse('[a/][b/]')).toHaveLength(2)
  })

  it('unescape 引號', () => {
    const nodes = parse(`[a k="a\\"b"/]`)
    expect(nodes[0]!.shortcode!.props.k).toBe('a"b')
  })

  it('格式錯誤忽略 → []', () => {
    expect(parse('[broken')).toEqual([])
  })

  it('空字串 → []', () => {
    expect(parse('')).toEqual([])
  })
})

describe('round-trip', () => {
  it('stringify → parse 等價(name + props)', () => {
    const schema = [
      { name: 'step', type: 'number' as const },
      { name: 'on', type: 'boolean' as const },
    ]
    const orig: ComponentNode = {
      id: 'x', type: 'shortcode', shortcode: { name: 'c', props: { step: 5, on: true } },
    }
    const nodes = parse(stringify(orig), { getSchema: () => schema })
    expect(nodes[0]!.shortcode).toEqual({ name: 'c', props: { step: 5, on: true } })
  })
})
