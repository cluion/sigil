import { describe, it, expect } from 'vitest'
import { computeGuides, computeGaps, ALIGN_THRESHOLD } from '../src/alignment.js'
import type { Rect } from '../src/alignment.js'

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height }
}

describe('computeGuides', () => {
  it('左邊對齊 → 一條垂直線', () => {
    const source = rect(100, 50, 40, 30)
    const candidate = rect(100, 120, 60, 40)
    const lines = computeGuides(source, [candidate])
    const xs = lines.filter((l) => l.axis === 'x')
    expect(xs.length).toBe(1)
    expect(xs[0]!.pos).toBe(100)
    // 跨兩 rect 的 y 並集
    expect(xs[0]!.start).toBe(50)
    expect(xs[0]!.end).toBe(160)
  })

  it('中線對齊 → 垂直線在共同 centerX', () => {
    // source centerX = 100+40/2 = 120；candidate centerX = 90+60/2 = 120
    const source = rect(100, 50, 40, 30)
    const candidate = rect(90, 120, 60, 40)
    const lines = computeGuides(source, [candidate])
    const xs = lines.filter((l) => l.axis === 'x')
    expect(xs.some((l) => l.pos === 120)).toBe(true)
  })

  it('右邊對齊 → 垂直線', () => {
    const source = rect(60, 50, 80, 30) // right = 140
    const candidate = rect(80, 120, 60, 40) // right = 140
    const lines = computeGuides(source, [candidate])
    expect(lines.some((l) => l.axis === 'x' && l.pos === 140)).toBe(true)
  })

  it('上邊對齊 → 一條水平線', () => {
    const source = rect(50, 100, 40, 30)
    const candidate = rect(120, 100, 60, 40)
    const lines = computeGuides(source, [candidate])
    const ys = lines.filter((l) => l.axis === 'y')
    expect(ys.length).toBe(1)
    expect(ys[0]!.pos).toBe(100)
    expect(ys[0]!.start).toBe(50)
    expect(ys[0]!.end).toBe(180)
  })

  it('超出容差 → 不產生線', () => {
    const source = rect(100, 50, 40, 30)
    const candidate = rect(105, 120, 60, 40) // left 差 5px > 預設 3
    const lines = computeGuides(source, [candidate])
    expect(lines.length).toBe(0)
  })

  it('自訂容差 → 5px 內吻合', () => {
    const source = rect(100, 50, 40, 30)
    const candidate = rect(105, 120, 60, 40)
    const lines = computeGuides(source, [candidate], 5)
    expect(lines.some((l) => l.axis === 'x' && l.pos === 105)).toBe(true)
  })

  it('多 candidate → 各自獨立比對', () => {
    const source = rect(100, 50, 40, 30)
    const a = rect(100, 120, 60, 40) // left 對齊
    const b = rect(200, 50, 40, 30) // top 對齊
    const lines = computeGuides(source, [a, b])
    expect(lines.some((l) => l.axis === 'x' && l.pos === 100)).toBe(true)
    expect(lines.some((l) => l.axis === 'y' && l.pos === 50)).toBe(true)
  })

  it('完全無關的 candidate → 空陣列', () => {
    const source = rect(0, 0, 10, 10)
    const candidate = rect(500, 500, 10, 10)
    expect(computeGuides(source, [candidate]).length).toBe(0)
  })

  it('ALIGN_THRESHOLD 預設為 3', () => {
    expect(ALIGN_THRESHOLD).toBe(3)
  })
})

describe('computeGaps', () => {
  it('v 排列 before → 與前一個鄰居的垂直縫隙', () => {
    const hit = rect(0, 100, 80, 40) // top = 100
    const prev = rect(0, 40, 80, 30) // bottom = 70
    const gaps = computeGaps(hit, 'before', 'v', { prev })
    expect(gaps.length).toBe(1)
    expect(gaps[0]!.size).toBe(30)
    expect(gaps[0]!.label).toBe('30px')
    expect(gaps[0]!.midY).toBe(85) // (100+70)/2
  })

  it('v 排列 after → 與後一個鄰居的垂直縫隙', () => {
    const hit = rect(0, 100, 80, 40) // bottom = 140
    const next = rect(0, 200, 80, 40) // top = 200
    const gaps = computeGaps(hit, 'after', 'v', { next })
    expect(gaps[0]!.size).toBe(60)
    expect(gaps[0]!.label).toBe('60px')
    expect(gaps[0]!.midY).toBe(170)
  })

  it('h 排列 before → 與前一個鄰居的水平縫隙', () => {
    const hit = rect(100, 0, 40, 80) // left = 100
    const prev = rect(40, 0, 30, 80) // right = 70
    const gaps = computeGaps(hit, 'before', 'h', { prev })
    expect(gaps[0]!.size).toBe(30)
    expect(gaps[0]!.axis).toBe('x')
    expect(gaps[0]!.midX).toBe(85)
  })

  it('h 排列 after → 與後一個鄰居的水平縫隙', () => {
    const hit = rect(100, 0, 40, 80) // right = 140
    const next = rect(200, 0, 40, 80) // left = 200
    const gaps = computeGaps(hit, 'after', 'h', { next })
    expect(gaps[0]!.size).toBe(60)
    expect(gaps[0]!.midX).toBe(170)
  })

  it('無對應鄰居 → 空陣列', () => {
    const hit = rect(0, 0, 40, 40)
    expect(computeGaps(hit, 'before', 'v', {}).length).toBe(0)
    expect(computeGaps(hit, 'after', 'h', {}).length).toBe(0)
  })

  it('小數 size → 四捨五入到整數 label', () => {
    const prev = rect(0, 40, 80, 30) // bottom = 70
    const hitFrac = rect(0, 100.4, 80, 40) // top = 100.4 → 縫隙 30.4
    const gaps = computeGaps(hitFrac, 'before', 'v', { prev })
    expect(gaps[0]!.size).toBeCloseTo(30.4)
    expect(gaps[0]!.label).toBe('30px')
  })
})
