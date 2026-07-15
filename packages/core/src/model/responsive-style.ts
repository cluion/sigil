import type {
  ComponentNode,
  ResponsiveBreakpoint,
  ResponsiveDevice,
  ResponsiveStyles,
  Style,
} from './types.js'

/** 正式輸出 breakpoint */
export const RESPONSIVE_BREAKPOINT_WIDTHS: Record<ResponsiveBreakpoint, number> = {
  tablet: 768,
  mobile: 480,
}

const BREAKPOINTS: ResponsiveBreakpoint[] = ['tablet', 'mobile']

/**
 * 合併 style patch 空物件清層 空字串刪 property
 */
export function mergeStyle(current: Style | undefined, patch: Style): Style {
  if (Object.keys(patch).length === 0) return {}
  const next: Style = { ...current }
  for (const [property, value] of Object.entries(patch)) {
    if (value === '') delete next[property]
    else next[property] = value
  }
  return next
}

/**
 * 合併 breakpoint patch 空物件清層
 */
export function mergeResponsiveStyles(
  current: ResponsiveStyles | undefined,
  patch: ResponsiveStyles,
): ResponsiveStyles {
  if (Object.keys(patch).length === 0) return {}
  const next: ResponsiveStyles = { ...current }
  for (const breakpoint of BREAKPOINTS) {
    const incoming = patch[breakpoint]
    if (incoming === undefined) continue
    const merged = mergeStyle(current?.[breakpoint], incoming)
    if (Object.keys(merged).length === 0) delete next[breakpoint]
    else next[breakpoint] = merged
  }
  return next
}

/** 依 desktop tablet mobile 累加樣式 */
export function getEffectiveStyle(
  node: Pick<ComponentNode, 'style' | 'responsiveStyles'>,
  device: ResponsiveDevice,
): Style {
  const style: Style = { ...node.style }
  if (device === 'tablet' || device === 'mobile') {
    Object.assign(style, node.responsiveStyles?.tablet)
  }
  if (device === 'mobile') Object.assign(style, node.responsiveStyles?.mobile)
  for (const [property, value] of Object.entries(style)) {
    if (value === '') delete style[property]
  }
  return style
}

/** 取得 property 來源層 */
export function getStyleSource(
  node: Pick<ComponentNode, 'style' | 'responsiveStyles'>,
  device: ResponsiveDevice,
  property: string,
): ResponsiveDevice | null {
  if (device === 'mobile' && node.responsiveStyles?.mobile?.[property]) return 'mobile'
  if ((device === 'tablet' || device === 'mobile') && node.responsiveStyles?.tablet?.[property]) {
    return 'tablet'
  }
  return node.style?.[property] ? 'desktop' : null
}

/** 建立單一 property patch 空字串代表繼承 */
export function createStylePatch(
  device: ResponsiveDevice,
  property: string,
  value: string,
): Pick<ComponentNode, 'style'> | Pick<ComponentNode, 'responsiveStyles'> {
  if (device === 'desktop') return { style: { [property]: value } }
  return { responsiveStyles: { [device]: { [property]: value } } }
}

/** 清除目前裝置樣式層 */
export function createClearStylePatch(
  device: ResponsiveDevice,
): Pick<ComponentNode, 'style'> | Pick<ComponentNode, 'responsiveStyles'> {
  if (device === 'desktop') return { style: {} }
  return { responsiveStyles: { [device]: {} } }
}
