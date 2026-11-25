import { afterEach, describe, expect, it } from 'vitest'
import { createEngine, type ComponentNode, type ResponsiveDevice } from '@cluion/sigil-core'
import { createFlexWrapField, readFlexDirection } from '../src/flex-wrap-field.js'

const cleanups: Array<() => void> = []

function setup(node: ComponentNode, device: ResponsiveDevice = 'desktop') {
  const engine = createEngine({ doc: { version: 1, root: node } })
  engine.select(node.id)
  const field = createFlexWrapField(engine, engine.getTree(), device)
  cleanups.push(field.destroy)
  const select = field.el.querySelector('select')!
  const reset = field.el.querySelector('button')!
  function change(value: string) {
    select.value = value
    select.dispatchEvent(new Event('change'))
  }
  return { engine, field, select, reset, change }
}

afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose()
})

describe('項目換行', () => {
  it('依宣告順序讀取 flex-flow，單步覆寫換行且保留原來的排列方向', () => {
    const style = {
      display: 'inline-flex',
      'FLEX-WRAP': 'nowrap',
      'flex-flow': 'wrap-reverse column',
    }
    const { engine, select, change } = setup({ id: 'group', type: 'section', style })
    expect(select.value).toBe('wrap-reverse')
    change('nowrap')
    expect(Object.keys(engine.getTree().style!)).toEqual(['display', 'flex-flow', 'FLEX-WRAP'])
    expect(select.value).toBe('nowrap')
    expect(readFlexDirection(engine.getTree(), 'desktop').effective).toBe('column')
    engine.undo()
    expect(Object.entries(engine.getTree().style!)).toEqual(Object.entries(style))
    expect(engine.canUndo()).toBe(false)
  })

  it('手機可還原平板設定，較寬裝置與同一簡寫內的方向不變', () => {
    const tablet = { 'flex-flow': 'column-reverse /* imported */ wrap' }
    const { engine, select, reset, change } = setup(
      {
        id: 'group',
        type: 'section',
        style: { display: 'inline flex' },
        responsiveStyles: { tablet },
      },
      'mobile',
    )
    expect(select.value).toBe('wrap')
    expect(select.dataset.styleSource).toBe('tablet')
    expect(reset.disabled).toBe(true)
    change('wrap-reverse')
    expect(engine.getTree().responsiveStyles).toEqual({
      tablet,
      mobile: { 'flex-wrap': 'wrap-reverse' },
    })
    reset.click()
    expect(engine.getTree().responsiveStyles).toEqual({ tablet })
    expect(select.value).toBe('wrap')
    expect(readFlexDirection(engine.getTree(), 'mobile').effective).toBe('column-reverse')
  })

  it('以 CSS 決定的換行保留原表示式，已鎖定或切回格線後不能從舊欄位寫入', () => {
    const style = { display: 'flex', 'flex-flow': 'var(--card-flow)' }
    const { engine, select, field, change } = setup({ id: 'group', type: 'section', style })
    expect(select.selectedOptions[0]?.textContent).toContain('var(--card-flow)')
    engine.update('group', { locked: true })
    expect(select.disabled).toBe(true)
    change('wrap')
    expect(engine.getTree().style).toEqual(style)
    engine.update('group', { locked: false })
    engine.update('group', { style: { display: 'grid' } })
    expect(field.el.hidden).toBe(true)
    change('wrap')
    expect(engine.getTree().style).toEqual({ ...style, display: 'grid' })
  })
})
