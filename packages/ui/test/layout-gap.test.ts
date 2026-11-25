import { describe, expect, it } from 'vitest'
import { createEngine, toHTML, type ComponentNode } from '@cluion/sigil-core'
import {
  isLayoutGapValue,
  ownLayoutGap,
  readLayoutGap,
  setLayoutGap,
  setUniformGap,
} from '../src/layout-gap.js'

const base = { id: 'cards', type: 'section' }
const engineWith = (attrs: Partial<ComponentNode>) =>
  createEngine({ doc: { version: 1, root: { ...base, ...attrs } } })

describe('layout gaps', () => {
  it('reads each axis in declaration and breakpoint order, including aliases and calculations', () => {
    const node = {
      ...base,
      style: { 'ROW-GAP': '4px', 'grid-gap': 'calc(2% + 3px) clamp(4px, 7vw, 12px)' },
      responsiveStyles: {
        tablet: { 'grid-row-gap': 'normal' },
        mobile: { GAP: '1rem 2rem', 'column-Gap': 'var(--between-columns)' },
      },
    }
    expect(readLayoutGap(node, 'desktop', 'row')).toEqual({
      value: 'calc(2% + 3px)',
      source: 'desktop',
    })
    expect(readLayoutGap(node, 'tablet', 'row')).toEqual({ value: 'normal', source: 'tablet' })
    expect(readLayoutGap(node, 'tablet', 'column')).toEqual({
      value: 'clamp(4px, 7vw, 12px)',
      source: 'desktop',
    })
    expect(readLayoutGap(node, 'mobile', 'row')).toEqual({ value: '1rem', source: 'mobile' })
    expect(readLayoutGap(node, 'mobile', 'column')).toEqual({
      value: 'var(--between-columns)',
      source: 'mobile',
    })
    expect(ownLayoutGap(node, 'tablet', 'column')).toBeUndefined()
    expect(ownLayoutGap(node, 'desktop')).toBe(node.style['grid-gap'])
  })

  it('keeps pending substitutions unresolved in shorthands and preserves neighboring explicit overrides', () => {
    const node = {
      ...base,
      style: { gap: '8px' },
      responsiveStyles: {
        tablet: { gap: 'var(--pair, 3px 10px)', 'row-gap': '12px' },
        mobile: { gap: 'calc(var(--inset) + 4px) normal' },
      },
    }
    expect(readLayoutGap(node, 'tablet', 'row')).toEqual({ value: '12px', source: 'tablet' })
    expect(readLayoutGap(node, 'tablet', 'column')).toEqual({ value: '', source: 'tablet' })
    expect(readLayoutGap(node, 'mobile', 'row').value).toBe('calc(var(--inset) + 4px)')
    expect(readLayoutGap(node, 'mobile', 'column').value).toBe('normal')
    expect(
      readLayoutGap({ ...base, style: { gap: '4px', all: 'initial' } }, 'mobile', 'column'),
    ).toEqual({ value: 'initial', source: 'desktop' })
    expect(
      readLayoutGap({ ...base, style: { gap: '4px', 'row-gap': 'auto' } }, 'desktop', 'row').value,
    ).toBe('4px')
    expect(readLayoutGap(base, 'desktop', 'row')).toEqual({ value: '', source: null })
  })

  it('moves shadowed longhands after the shorthand in one undo entry; reset reveals the original gap', () => {
    const original = { 'GRID-COLUMN-GAP': '4px', color: 'navy', gap: '16px 20px' }
    const engine = engineWith({ style: { gap: '12px' }, responsiveStyles: { tablet: original } })
    setLayoutGap(engine, 'cards', 'tablet', 'column', '4px')
    expect(Object.keys(engine.getTree().responsiveStyles!.tablet!)).toEqual([
      'color',
      'gap',
      'GRID-COLUMN-GAP',
    ])
    expect(toHTML(engine.toJSON())).toContain('color:navy;gap:16px 20px;GRID-COLUMN-GAP:4px')
    expect(readLayoutGap(engine.getTree(), 'mobile', 'row')).toEqual({
      value: '16px',
      source: 'tablet',
    })
    expect(readLayoutGap(engine.getTree(), 'mobile', 'column').value).toBe('4px')
    setLayoutGap(engine, 'cards', 'tablet', 'column', '4px')
    engine.undo()
    expect(Object.entries(engine.getTree().responsiveStyles!.tablet!)).toEqual(
      Object.entries(original),
    )
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    setLayoutGap(engine, 'cards', 'tablet', 'column', '')
    expect(readLayoutGap(engine.getTree(), 'mobile', 'column')).toEqual({
      value: '20px',
      source: 'tablet',
    })
  })

  it('makes a uniform gap win over existing longhands and reveals those longhands on reset', () => {
    const original = { gap: '5px', 'grid-gap': '6px', 'row-gap': '7px', 'column-gap': '8px' }
    const engine = engineWith({ style: { gap: '10px' }, responsiveStyles: { mobile: original } })
    setUniformGap(engine, 'cards', 'mobile', '6px')
    expect(
      ['row', 'column'].map(
        (axis) => readLayoutGap(engine.getTree(), 'mobile', axis as 'row' | 'column').value,
      ),
    ).toEqual(['6px', '6px'])
    engine.undo()
    expect(Object.entries(engine.getTree().responsiveStyles!.mobile!)).toEqual(
      Object.entries(original),
    )
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    setUniformGap(engine, 'cards', 'mobile', '')
    expect(engine.getTree().responsiveStyles!.mobile!).toEqual({
      'row-gap': '7px',
      'column-gap': '8px',
    })
    expect(engine.getTree().style).toEqual({ gap: '10px' })
  })

  it('creates an independent mobile override; invalid, repeated or locked edits do not create history', () => {
    const engine = engineWith({
      style: { gap: '4px' },
      responsiveStyles: { tablet: { 'row-gap': '6px' } },
    })
    for (const value of [
      'auto',
      '2',
      '-3px',
      '2px 4px',
      'inherit 1px',
      'clamp(4px, 2vw, 10px',
      '4px;display:grid',
    ]) {
      expect(isLayoutGapValue('row', value)).toBe(false)
      setLayoutGap(engine, 'cards', 'mobile', 'row', value)
    }
    setLayoutGap(engine, 'missing', 'mobile', 'row', '10px')
    setLayoutGap(engine, 'cards', 'mobile', 'row', '')
    expect(engine.canUndo()).toBe(false)
    setLayoutGap(engine, 'cards', 'mobile', 'row', '12%')
    expect(engine.getTree().responsiveStyles!.mobile).toEqual({ 'row-gap': '12%' })
    expect(readLayoutGap(engine.getTree(), 'mobile', 'column')).toEqual({
      value: '4px',
      source: 'desktop',
    })
    setLayoutGap(engine, 'cards', 'mobile', 'row', '')
    expect(readLayoutGap(engine.getTree(), 'mobile', 'row')).toEqual({
      value: '6px',
      source: 'tablet',
    })
    const locked = engineWith({ locked: true })
    setUniformGap(locked, 'cards', 'desktop', '8px')
    setLayoutGap(locked, 'cards', 'desktop', 'row', '2px')
    expect(locked.canUndo()).toBe(false)
  })
})
