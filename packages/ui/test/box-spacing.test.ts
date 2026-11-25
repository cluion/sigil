import { describe, expect, it } from 'vitest'
import { createEngine, type ComponentNode } from '@cluion/sigil-core'
import {
  boxSides,
  isBoxShorthandValue,
  isBoxSideValue,
  readBoxSpacing,
  setBoxShorthand,
  setBoxSide,
} from '../src/box-spacing.js'

const base = { id: 'card', type: 'section' }
function engineWith(props: Partial<ComponentNode>) {
  return createEngine({ doc: { version: 1, root: { ...base, ...props } } })
}

describe('box spacing', () => {
  it('依裝置與同層宣告順序讀取簡寫與單邊，保留 CSS 百分比、自動外距與計算式', () => {
    const node = {
      ...base,
      style: { margin: '1em auto 3% -4px' },
      responsiveStyles: {
        tablet: { 'margin-bottom': '20px' },
        mobile: { 'margin-left': '3rem', margin: 'calc(10% + 6px) auto' },
      },
    }
    const tablet = readBoxSpacing(node, 'tablet', 'margin')
    expect(boxSides.map((side) => [tablet[side].value, tablet[side].source])).toEqual([
      ['1em', 'desktop'],
      ['auto', 'desktop'],
      ['20px', 'tablet'],
      ['-4px', 'desktop'],
    ])
    expect(tablet.bottom.hasOverride).toBe(true)
    expect(tablet.left.hasOverride).toBe(false)
    const mobile = readBoxSpacing(node, 'mobile', 'margin')
    expect(boxSides.map((side) => mobile[side].value)).toEqual([
      'calc(10% + 6px)',
      'auto',
      'calc(10% + 6px)',
      'auto',
    ])
    expect(mobile.left.declaration).toBe('margin')
    const padding = readBoxSpacing(node, 'mobile', 'padding')
    expect(padding.top.source).toBeNull()
  })

  it('只儲存手機修改的一邊，平板其餘邊可繼續變更，移除單邊後恢復繼承', () => {
    const engine = engineWith({
      style: { padding: '8px' },
      responsiveStyles: { tablet: { padding: '12px 16px' } },
    })
    setBoxSide(engine, 'card', 'mobile', 'padding', 'bottom', '24px')
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'padding-bottom': '24px' })
    setBoxShorthand(engine, 'card', 'tablet', 'padding', '10px 20px 30px')
    const mobile = readBoxSpacing(engine.getTree(), 'mobile', 'padding')
    expect(boxSides.map((side) => mobile[side].value)).toEqual(['10px', '20px', '24px', '20px'])
    setBoxSide(engine, 'card', 'mobile', 'padding', 'bottom', '')
    expect(readBoxSpacing(engine.getTree(), 'mobile', 'padding').bottom).toMatchObject({
      value: '30px',
      source: 'tablet',
      hasOverride: false,
    })
    engine.undo()
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ 'padding-bottom': '24px' })
  })

  it('重新使用被簡寫蓋過的單邊只增加一筆復原，清除它會露出同裝置簡寫', () => {
    const original = { 'padding-left': '3px', color: 'navy', padding: '9px 18px' }
    const engine = engineWith({ responsiveStyles: { mobile: original } })
    const events: string[] = []
    engine.subscribe((event) => events.push(event.type))
    setBoxSide(engine, 'card', 'mobile', 'padding', 'left', '3px')
    expect(events).toEqual(['patch', 'patch', 'history'])
    expect(Object.keys(engine.getTree().responsiveStyles!.mobile!)).toEqual([
      'color',
      'padding',
      'padding-left',
    ])
    const changed = readBoxSpacing(engine.getTree(), 'mobile', 'padding')
    expect(changed.left.value).toBe('3px')
    expect(changed.right.value).toBe('18px')
    setBoxSide(engine, 'card', 'mobile', 'padding', 'left', '3px')
    engine.undo()
    expect(Object.entries(engine.getTree().responsiveStyles!.mobile!)).toEqual(
      Object.entries(original),
    )
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    events.length = 0
    setBoxSide(engine, 'card', 'mobile', 'padding', 'left', '')
    expect(events).toEqual(['history', 'patch'])
    expect(readBoxSpacing(engine.getTree(), 'mobile', 'padding').left).toMatchObject({
      value: '18px',
      source: 'mobile',
      declaration: 'padding',
      hasOverride: false,
    })
  })

  it('套用整組四邊的數值在同層優先，保留原先個別設定供清除簡寫後使用', () => {
    const original = {
      padding: '10px',
      color: 'blue',
      'padding-left': '7%',
      'padding-block-start': '3em',
    }
    const engine = engineWith({ style: original })
    setBoxShorthand(engine, 'card', 'desktop', 'padding', '10px')
    expect(Object.keys(engine.getTree().style!).at(-1)).toBe('padding')
    let view = readBoxSpacing(engine.getTree(), 'desktop', 'padding')
    expect(boxSides.map((side) => view[side].value)).toEqual(['10px', '10px', '10px', '10px'])
    engine.undo()
    expect(Object.entries(engine.getTree().style!)).toEqual(Object.entries(original))
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    setBoxShorthand(engine, 'card', 'desktop', 'padding', '')
    expect(engine.getTree().style).toEqual({
      color: 'blue',
      'padding-left': '7%',
      'padding-block-start': '3em',
    })
    view = readBoxSpacing(engine.getTree(), 'desktop', 'padding')
    expect(view.left.unresolved).toBe(true)
  })

  it('動態簡寫及邏輯邊保留原字串並標記未知值，仍可獨立覆寫', () => {
    const engine = engineWith({
      style: { margin: 'var(--card-space)' },
      responsiveStyles: { tablet: { 'margin-inline': 'auto' } },
    })
    const desktop = readBoxSpacing(engine.getTree(), 'desktop', 'margin')
    expect(desktop.top).toMatchObject({
      value: '',
      unresolved: true,
      source: 'desktop',
      declaration: 'margin',
    })
    expect(readBoxSpacing(engine.getTree(), 'mobile', 'margin').right).toMatchObject({
      value: '',
      unresolved: true,
      source: 'tablet',
      declaration: 'margin-inline',
    })
    setBoxSide(engine, 'card', 'mobile', 'margin', 'left', 'var(--edge)')
    expect(readBoxSpacing(engine.getTree(), 'mobile', 'margin').left).toMatchObject({
      value: 'var(--edge)',
      unresolved: false,
    })
    expect(engine.getTree().style!.margin).toBe('var(--card-space)')
    expect(engine.getTree().responsiveStyles!.tablet).toEqual({ 'margin-inline': 'auto' })
    setBoxShorthand(engine, 'card', 'desktop', 'margin', 'inherit')
    expect(readBoxSpacing(engine.getTree(), 'desktop', 'margin').bottom.value).toBe('inherit')
  })

  it('只接受完整合法的單邊／簡寫值，拒絕負內距、鎖定元件和重複寫入', () => {
    expect(isBoxSideValue('margin', '-8px')).toBe(true)
    expect(isBoxSideValue('margin', 'auto')).toBe(true)
    expect(isBoxSideValue('padding', 'auto')).toBe(false)
    expect(isBoxSideValue('padding', '10px 20px')).toBe(false)
    expect(isBoxShorthandValue('padding', '8px -4%')).toBe(false)
    expect(isBoxSideValue('padding', 'calc(25% + 2px')).toBe(false)
    expect(isBoxSideValue('margin', '4px; color: red')).toBe(false)
    const engine = engineWith({ style: { padding: '12px' } })
    setBoxSide(engine, 'card', 'desktop', 'padding', 'top', '-10px')
    setBoxShorthand(engine, 'card', 'desktop', 'padding', '12px')
    expect(engine.canUndo()).toBe(false)
    const locked = engineWith({ locked: true })
    setBoxSide(locked, 'card', 'mobile', 'margin', 'left', '2px')
    expect(locked.canUndo()).toBe(false)
  })
})
