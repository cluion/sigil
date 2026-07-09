import { describe, it, expect } from 'vitest'
import { createEngine, type Engine, type PropSchema } from '@cluion/sigil-core'
import { createPropsPanel } from '../src/props.js'

function panel(schema: PropSchema[] | undefined, props: Record<string, unknown> = {}) {
  const engine = createEngine({
    doc: { version: 1 as const, root: { id: 'n', type: 'shortcode', shortcode: { name: 'sc', props } } },
  }) as Engine
  engine.select('n')
  const box = document.createElement('div')
  createPropsPanel(engine, box, {
    getShortcodeSchema: schema ? () => schema : undefined,
  })
  return { engine, box }
}

describe('createPropsPanel — shortcode props', () => {
  it('有 schema → 生成型別控制項(number)', () => {
    const { box } = panel([{ name: 'step', type: 'number', label: '步進' }], { step: 2 })
    const input = box.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('2')
  })

  it('無 schema → fallback 通用 key/value', () => {
    const { box } = panel(undefined, { foo: 'bar' })
    const inputs = box.querySelectorAll('input')
    const input = inputs[inputs.length - 1] as HTMLInputElement // 最後一個 = shortcode props 區(class 欄在前)
    expect(input.value).toBe('bar')
  })

  it('非 shortcode 節點 → 無 shortcode props 區', () => {
    const engine = createEngine({
      doc: { version: 1 as const, root: { id: 'n', type: 'section', children: [] } },
    }) as Engine
    engine.select('n')
    const box = document.createElement('div')
    createPropsPanel(engine, box)
    expect(box.textContent).not.toContain('shortcode props')
  })
})
