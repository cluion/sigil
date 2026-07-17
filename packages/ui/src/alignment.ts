import type { Side, Orient } from './dnd.js'

/**
 * 矩形（iframe 內 viewport 座標）
 */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function right(r: Rect): number {
  return r.left + r.width
}
function bottom(r: Rect): number {
  return r.top + r.height
}
function centerX(r: Rect): number {
  return r.left + r.width / 2
}
function centerY(r: Rect): number {
  return r.top + r.height / 2
}

/**
 * 一條對齊參考線
 *
 * - axis `'x'`：垂直線，pos 為 x 座標，start／end 為 y 範圍
 * - axis `'y'`：水平線，pos 為 y 座標，start／end 為 x 範圍
 */
export interface AlignLine {
  axis: 'x' | 'y'
  start: number
  end: number
  pos: number
}

/**
 * 縫隙間距提示
 *
 * - `axis 'y'`：水平排列元素間的垂直縫隙（gap 是 y 距離）
 * - `axis 'x'`：垂直排列元素間的水平縫隙（gap 是 x 距離）
 * - `midX`／`midY`：標籤放置座標（iframe 內）
 */
export interface GapHint {
  axis: 'x' | 'y'
  midX: number
  midY: number
  size: number
  label: string
}

export const ALIGN_THRESHOLD = 3

/**
 * 比對 source 與候選 rect，容差內吻合產生對齊線
 *
 * - 垂直對齊線（axis `'x'`）：left／centerX／right 任一吻合
 * - 水平對齊線（axis `'y'`）：top／centerY／bottom 任一吻合
 * - 線範圍涵蓋 source 與 candidate 的並集
 */
export function computeGuides(
  source: Rect,
  candidates: Rect[],
  threshold: number = ALIGN_THRESHOLD,
): AlignLine[] {
  const lines: AlignLine[] = []
  const sx = [source.left, centerX(source), right(source)]
  const sy = [source.top, centerY(source), bottom(source)]

  for (const c of candidates) {
    // 垂直對齊線：比對 x 邊
    const cx = [c.left, centerX(c), right(c)]
    for (const s of sx) {
      for (const t of cx) {
        if (Math.abs(s - t) <= threshold) {
          lines.push({
            axis: 'x',
            pos: t,
            start: Math.min(source.top, c.top),
            end: Math.max(bottom(source), bottom(c)),
          })
        }
      }
    }
    // 水平對齊線：比對 y 邊
    const cy = [c.top, centerY(c), bottom(c)]
    for (const s of sy) {
      for (const t of cy) {
        if (Math.abs(s - t) <= threshold) {
          lines.push({
            axis: 'y',
            pos: t,
            start: Math.min(source.left, c.left),
            end: Math.max(right(source), right(c)),
          })
        }
      }
    }
  }
  return lines
}

/**
 * 依 drop side／orient 與前後鄰居算縫隙距離
 *
 * - orient `'v'`（兄弟垂直排列）：drop 落點與鄰居的垂直縫隙（y 距離）
 * - orient `'h'`（兄弟水平排列）：drop 落點與鄰居的水平縫隙（x 距離）
 * - `side` 決定與 prev（before）或 next（after）鄰居的縫隙
 * - 標籤放在縫隙中點，垂直中線對齊元素（v）或水平中線對齊元素（h）
 */
export function computeGaps(
  hitRect: Rect,
  side: Side,
  orient: Orient,
  neighbors: { prev?: Rect; next?: Rect },
): GapHint[] {
  const hints: GapHint[] = []

  if (orient === 'v') {
    // 垂直排列：縫隙是 y 方向，標籤 y = 縫隙中點，x = 元素水平中線
    const neighbor = side === 'before' ? neighbors.prev : neighbors.next
    if (neighbor) {
      const anchorY = side === 'before' ? hitRect.top : bottom(hitRect)
      const edgeY = side === 'before' ? bottom(neighbor) : neighbor.top
      const size = Math.abs(anchorY - edgeY)
      if (size > 0) {
        hints.push({
          axis: 'y',
          midY: (anchorY + edgeY) / 2,
          midX: (Math.max(hitRect.left, neighbor.left) + Math.min(right(hitRect), right(neighbor))) / 2,
          size,
          label: pxLabel(size),
        })
      }
    }
  } else {
    // 水平排列：縫隙是 x 方向，標籤 x = 縫隙中點，y = 元素垂直中線
    const neighbor = side === 'before' ? neighbors.prev : neighbors.next
    if (neighbor) {
      const anchorX = side === 'before' ? hitRect.left : right(hitRect)
      const edgeX = side === 'before' ? right(neighbor) : neighbor.left
      const size = Math.abs(anchorX - edgeX)
      if (size > 0) {
        hints.push({
          axis: 'x',
          midX: (anchorX + edgeX) / 2,
          midY: (Math.max(hitRect.top, neighbor.top) + Math.min(bottom(hitRect), bottom(neighbor))) / 2,
          size,
          label: pxLabel(size),
        })
      }
    }
  }
  return hints
}

function pxLabel(size: number): string {
  return `${Math.round(size)}px`
}
