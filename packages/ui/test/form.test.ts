import { describe, it, expect } from 'vitest'
import { createEngine, type PropSchema } from '@cluion/sigil-core'
import { createPropForm } from '../src/form.js'

function setup(schema: PropSchema[], props: Record<string, unknown> = {}) {
  const engine = createEngine({
    doc: { version: 1 as const, root: { id: 'n', type: 'shortcode', shortcode: { name: 'x', props } } },
  })
  const form = createPropForm({ engine, node: engine.getTree(), schema })
  return { engine, form }
}

describe('createPropForm', () => {
  it('text 生成 input[type=text],初始值取自 props', () => {
    const { form } = setup([{ name: 'label', type: 'text' }], { label: 'hi' })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(input.value).toBe('hi')
  })

  it('number 生成 input[type=number],初始值取自 props', () => {
    const { form } = setup([{ name: 'step', type: 'number' }], { step: 3 })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('number')
    expect(input.value).toBe('3')
  })

  it('number 變動 → Number 轉換並寫入 engine', () => {
    const { engine, form } = setup([{ name: 'step', type: 'number' }], { step: 1 })
    const input = form.querySelector('input') as HTMLInputElement
    input.value = '5'
    input.dispatchEvent(new Event('input'))
    expect(engine.getTree().shortcode!.props.step).toBe(5)
  })

  it('boolean 生成 checkbox,變動寫入 boolean', () => {
    const { engine, form } = setup([{ name: 'on', type: 'boolean' }], { on: false })
    const cb = form.querySelector('input') as HTMLInputElement
    expect(cb.type).toBe('checkbox')
    expect(cb.checked).toBe(false)
    cb.checked = true
    cb.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.on).toBe(true)
  })

  it('select 生成 select + options,變動寫入值', () => {
    const { engine, form } = setup(
      [{ name: 'align', type: 'select', options: [{ value: 'l' }, { value: 'r' }] }],
      { align: 'l' },
    )
    const sel = form.querySelector('select') as HTMLSelectElement
    expect(sel.options.length).toBe(2)
    expect(sel.value).toBe('l')
    sel.value = 'r'
    sel.dispatchEvent(new Event('change'))
    expect(engine.getTree().shortcode!.props.align).toBe('r')
  })

  it('color 生成 input[type=color]', () => {
    const { form } = setup([{ name: 'c', type: 'color' }], { c: '#ff0000' })
    const input = form.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('color')
    expect(input.value).toBe('#ff0000')
  })

  it('label 顯示(label 或 name)', () => {
    const { form } = setup([{ name: 'k', type: 'text', label: '自訂' }])
    expect(form.querySelector('label')?.textContent).toContain('自訂')
  })
})
