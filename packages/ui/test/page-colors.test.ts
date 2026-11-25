import { describe, expect, it } from 'vitest'
import { createEngine, type ComponentNode } from '@cluion/sigil-core'
import {
  collectPageColors,
  getPageBackgroundInfo,
  isAuthoredColor,
  nativeColorHex,
} from '../src/page-colors.js'

describe('頁面色票', () => {
  it('依頁面順序合併重複色值，保留首次寫法；裝置只採有效色', () => {
    const root: ComponentNode = {
      id: 'page',
      type: 'section',
      style: { color: '#AbC', background: '#fed' },
      responsiveStyles: { tablet: { color: '#1234' }, mobile: { background: '#FFEECC' } },
      children: [
        {
          id: 'cta',
          type: 'button',
          style: { color: '#aabbccff', 'background-color': 'rgba(9, 8, 7, .5)' },
        },
        {
          id: 'hero',
          type: 'section',
          style: { background: '#1234', 'background-color': '#ffeedd' },
        },
      ],
    }
    const engine = createEngine({ doc: { version: 1, root } })
    const before = engine.toJSON()
    expect(collectPageColors(engine.getTree(), 'desktop')).toEqual([
      '#AbC',
      '#fed',
      'rgba(9, 8, 7, .5)',
    ])
    expect(collectPageColors(engine.getTree(), 'tablet')).toEqual([
      '#1234',
      '#fed',
      '#aabbccff',
      'rgba(9, 8, 7, .5)',
    ])
    expect(collectPageColors(engine.getTree(), 'mobile')).toEqual([
      '#1234',
      '#FFEECC',
      '#aabbccff',
      'rgba(9, 8, 7, .5)',
      '#ffeedd',
    ])
    expect(engine.toJSON()).toEqual(before)
    expect(engine.canUndo()).toBe(false)
    engine.destroy()
  })

  it('背景依同層與跨裝置的宣告順序取得底色及來源', () => {
    const node: ComponentNode = {
      id: 'info',
      type: 'section',
      style: { 'background-color': '#abc', background: '#123' },
      responsiveStyles: {
        tablet: { 'background-color': '#234' },
        mobile: { background: 'linear-gradient(red, blue)' },
      },
    }
    expect(getPageBackgroundInfo(node, 'desktop')).toEqual({ source: 'desktop', value: '#123' })
    expect(getPageBackgroundInfo(node, 'tablet')).toEqual({ source: 'tablet', value: '#234' })
    expect(getPageBackgroundInfo(node, 'mobile')).toEqual({ source: 'mobile', value: undefined })
    expect(collectPageColors(node, 'mobile')).toEqual([])
    delete node.responsiveStyles!.mobile
    expect(getPageBackgroundInfo(node, 'mobile')).toEqual({ source: 'tablet', value: '#234' })
  })

  it('只抽取多層背景指定的底色，排除漸層色點和依元件變動的值', () => {
    const root: ComponentNode = {
      id: 'page',
      type: 'section',
      style: { color: 'var(--brand)', background: 'linear-gradient(red, blue)' },
      children: [
        {
          id: 'photo',
          type: 'section',
          style: { color: 'currentColor', background: 'url(example.png) no-repeat #a0b0c0' },
        },
        {
          id: 'panel',
          type: 'section',
          style: { color: 'inherit', background: 'transparent' },
        },
        { id: 'text', type: 'text', style: { color: 'not-a-color', background: 'none' } },
      ],
    }
    expect(collectPageColors(root, 'desktop')).toEqual(['#a0b0c0', 'transparent'])
  })

  it('先套用宿主限制再計 12 色，集滿就停止遍歷', () => {
    const rows: ComponentNode[] = Array.from({ length: 25 }, (_, index) => ({
      id: String(index),
      type: 'text',
      style: { color: '#' + index.toString(16).padStart(6, '0') },
    }))
    rows.push({
      id: 'end',
      type: 'section',
      get style(): ComponentNode['style'] {
        throw new Error('不該讀取上限之後的節點')
      },
    })
    const colors = collectPageColors(
      { id: 'page', type: 'section', children: rows },
      'desktop',
      (value) => parseInt(value.slice(1), 16) >= 12,
    )
    expect(colors).toEqual(rows.slice(12, 24).map((node) => node.style!.color))
  })

  it('色值輸入辨識完整函式、透明色、短十六進位與變數', () => {
    for (const color of [
      'transparent',
      '#AbC',
      '#abcd',
      '#102030',
      '#abcdef01',
      'var(--brand)',
      'rgba(9, /*)*/ 8, 7, .5)',
      'rgba(0, 0, 0, 0.2)',
      'hsl(120, 100%, 50%)',
    ])
      expect(isAuthoredColor(color), color).toBe(true)
    for (const color of [
      '#12',
      'not-a-color',
      'rgb(1, 2, 3',
      'red; color: blue',
      'var(--brand))',
      'var(--brand) junk',
      'no-repeat var(--brand)',
      'notcolor(var(--brand))',
      'linear-gradient(red, blue)',
      'url(example.png)',
    ])
      expect(isAuthoredColor(color), color).toBe(false)
    expect(nativeColorHex('#AbCd')).toBe('#aabbcc')
    expect(nativeColorHex('#FF220080')).toBe('#ff2200')
    expect(nativeColorHex('var(--brand)')).toBeUndefined()
  })
})
