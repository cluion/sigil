import { describe, expect, it } from 'vitest'
import {
  createClearStylePatch,
  createStylePatch,
  getEffectiveStyle,
  getStyleSource,
  mergeResponsiveStyles,
  updateNode,
  type ComponentNode,
} from '../src/index.js'

const node: ComponentNode = {
  id: 'n',
  type: 'section',
  style: { color: 'red', padding: '16px' },
  responsiveStyles: {
    tablet: { color: 'blue', padding: '12px' },
    mobile: { padding: '8px' },
  },
}

describe('responsive style model', () => {
  it('desktop → tablet → mobile 逐層繼承與覆寫', () => {
    expect(getEffectiveStyle(node, 'desktop')).toEqual({ color: 'red', padding: '16px' })
    expect(getEffectiveStyle(node, 'tablet')).toEqual({ color: 'blue', padding: '12px' })
    expect(getEffectiveStyle(node, 'mobile')).toEqual({ color: 'blue', padding: '8px' })
    expect(getStyleSource(node, 'mobile', 'color')).toBe('tablet')
    expect(getStyleSource(node, 'mobile', 'padding')).toBe('mobile')
  })

  it('建立各裝置的 engine patch', () => {
    expect(createStylePatch('desktop', 'margin', '4px')).toEqual({
      style: { margin: '4px' },
    })
    expect(createStylePatch('tablet', 'margin', '2px')).toEqual({
      responsiveStyles: { tablet: { margin: '2px' } },
    })
    expect(createClearStylePatch('mobile')).toEqual({
      responsiveStyles: { mobile: {} },
    })
  })

  it('空字串移除 property，空 breakpoint 清除該層', () => {
    const withoutTabletColor = updateNode(node, 'n', {
      responsiveStyles: { tablet: { color: '' } },
    })
    expect(withoutTabletColor.responsiveStyles?.tablet).toEqual({ padding: '12px' })
    expect(getEffectiveStyle(withoutTabletColor, 'mobile').color).toBe('red')

    const withoutMobile = updateNode(withoutTabletColor, 'n', {
      responsiveStyles: { mobile: {} },
    })
    expect(withoutMobile.responsiveStyles?.mobile).toBeUndefined()
  })

  it('清除所有 responsive 覆寫', () => {
    expect(mergeResponsiveStyles(node.responsiveStyles, {})).toEqual({})
    const next = updateNode(node, 'n', { responsiveStyles: {} })
    expect(next.responsiveStyles).toBeUndefined()
  })
})
