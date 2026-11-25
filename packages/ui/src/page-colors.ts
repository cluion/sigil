import {
  getEffectiveStyle,
  getStyleSource,
  type ComponentNode,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'

const PALETTE_SIZE = 12
const deferredColorFunction =
  /^(?:var|env|attr|rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|contrast-color|light-dark|device-cmyk|alpha)\(/i
const contextualTokens = new Set(
  [
    'var env attr currentcolor light-dark inherit initial unset revert revert-layer',
    'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext',
    'field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext',
    'activeborder activecaption appworkspace background buttonhighlight buttonshadow captiontext inactiveborder',
    'inactivecaption inactivecaptiontext infobackground infotext menu menutext scrollbar threeddarkshadow',
    'threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext',
  ]
    .join(' ')
    .split(' '),
)

let probe: CSSStyleDeclaration | undefined
let context: CanvasRenderingContext2D | null | undefined

function parser(): CSSStyleDeclaration {
  return (probe ??= document.createElement('span').style)
}

function colorContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    context = canvas.getContext('2d', { willReadFrequently: true })
  }
  return context
}

export function isAuthoredColor(value: string): boolean {
  const color = value.replace(/\/\*[\s\S]*?\*\//g, ' ').trim()
  if (!color || color.toLowerCase() === 'none' || /[;{}]|\/\*/.test(color)) return false
  // 混用變數時瀏覽器會延後驗證整個值，例如「no-repeat var(--brand)」。
  if (/\b(?:var|env|attr)\(/i.test(color) && !deferredColorFunction.test(color)) return false
  // 瀏覽器會自動補齊尚在輸入中的 CSS 函式。
  let depth = 0
  for (let i = 0; i < color.length; i++) {
    if (color[i] === '(') depth++
    else if (color[i] === ')') {
      depth--
      if (depth < 0 || (depth === 0 && i !== color.length - 1)) return false
    }
  }
  if (depth !== 0) return false
  const style = parser()
  style.color = ''
  style.color = color
  return style.color !== ''
}

function dependsOnContext(value: string): boolean {
  return (
    value.includes('\\') ||
    !!value
      .toLowerCase()
      .match(/[a-z-]+/g)
      ?.some((word) => contextualTokens.has(word))
  )
}

function backgroundProperty(style: Style): string | undefined {
  let last: string | undefined
  for (const property of Object.keys(style)) {
    if (property === 'background' || property === 'background-color') last = property
  }
  return last
}

function readShorthand(value: string): string | undefined {
  if (isAuthoredColor(value)) return value
  const style = parser()
  style.background = ''
  style.background = value
  const color = style.backgroundColor
  if (!color || color === 'initial' || color === 'none') return undefined
  if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    // 簡寫還能再接一個顏色，表示透明是瀏覽器補的預設值。
    style.background = ''
    style.background = value + ' red'
    if (style.background) return undefined
  }
  return color
}

export function getPageBackgroundInfo(
  node: ComponentNode,
  device: ResponsiveDevice,
): { value?: string; source: ResponsiveDevice | null } {
  const style = getEffectiveStyle(node, device)
  const property = backgroundProperty(style)
  if (!property) return { source: null }
  const value = style[property]!.trim()
  return {
    source: getStyleSource(node, device, property),
    value: property === 'background' ? readShorthand(value) : value,
  }
}

function expandHex(value: string): string | undefined {
  if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return undefined
  const hex = value.slice(1).toLowerCase()
  const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex
  return '#' + (full.length === 8 && full.endsWith('ff') ? full.slice(0, 6) : full)
}

function canvasColor(value: string): string | undefined {
  const ctx = colorContext()
  if (!ctx) return undefined
  ctx.fillStyle = '#010203'
  ctx.fillStyle = value
  if (ctx.fillStyle !== '#010203') return ctx.fillStyle
  // canvas 遇到尚未支援的 CSS 顏色時會保留原值。
  ctx.fillStyle = '#040506'
  ctx.fillStyle = value
  return ctx.fillStyle === '#040506' ? undefined : ctx.fillStyle
}

export function reusableColorKey(value: string): string | undefined {
  const color = value.trim()
  const hex = expandHex(color)
  if (hex?.length === 7) return hex
  if (dependsOnContext(color) || !isAuthoredColor(color)) return undefined
  // 廣色域使用 CSS 自己的序列化，避免 canvas 降到 sRGB 後將不同色合併。
  if (/^(?:lab|lch|oklab|oklch|color|color-mix)\(/i.test(color)) return parser().color
  return canvasColor(color) ?? hex ?? color.toLowerCase()
}

function rgbHex(channels: ArrayLike<number>): string {
  return '#' + Array.from(channels, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function nativeColorHex(value: string): string | undefined {
  const color = value.trim()
  const hex = expandHex(color)
  if (hex) return hex.slice(0, 7)
  if (dependsOnContext(color) || !isAuthoredColor(color)) return undefined
  const normalized = canvasColor(color)
  if (!normalized) return undefined
  if (normalized.startsWith('#')) return normalized.slice(0, 7)
  const channels = /^rgba?\((\d+),\s*(\d+),\s*(\d+)[,)]/.exec(normalized)
  if (channels) return rgbHex(channels.slice(1, 4).map(Number))
  const ctx = colorContext()!
  // 原生色盤只接收 RGB，取樣前移除透明度以保留原色。
  if (!canvasColor(`rgb(from ${color} r g b / 1)`)) ctx.fillStyle = normalized
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  return rgbHex(ctx.getImageData(0, 0, 1, 1).data.subarray(0, 3))
}

/** 依頁面順序收集目前裝置可複用的文字色與背景底色。 */
export function collectPageColors(
  root: ComponentNode,
  device: ResponsiveDevice,
  acceptsColorValue?: (value: string) => boolean,
): string[] {
  const colors: string[] = []
  const keys = new Set<string>()
  const checked = new Set<string>()
  const shorthands = new Map<string, string | undefined>()
  function add(raw: string | undefined): void {
    const value = raw?.trim()
    if (!value || checked.has(value) || colors.length >= PALETTE_SIZE) return
    checked.add(value)
    const key = reusableColorKey(value)
    if (!key || keys.has(key) || acceptsColorValue?.(value) === false) return
    keys.add(key)
    colors.push(value)
  }

  const stack = [root]
  while (stack.length && colors.length < PALETTE_SIZE) {
    const node = stack.pop()!
    const style = getEffectiveStyle(node, device)
    add(style.color)
    const property = backgroundProperty(style)
    if (property === 'background') {
      const shorthand = style[property]!.trim()
      if (!shorthands.has(shorthand)) shorthands.set(shorthand, readShorthand(shorthand))
      add(shorthands.get(shorthand))
    } else if (property) add(style[property])
    if (node.children && colors.length < PALETTE_SIZE) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!)
    }
  }
  return colors
}
