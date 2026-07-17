import type { Engine, ComponentNode, Patch } from '@cluion/sigil-core'
import { findNode, findParent } from '@cluion/sigil-core'
import { computeGuides, computeGaps, type AlignLine, type GapHint, type Rect } from './alignment.js'

export type Side = 'before' | 'after'
export type Orient = 'h' | 'v'
export type DropMode = 'sibling' | 'child'

export interface DropTarget {
  parentId: string
  index: number
  hitId: string
  side: Side
  orient: Orient
  mode: DropMode
}

const EDGE_SCROLL_PX = 48
const EDGE_SCROLL_STEP = 14
const ACCENT = '#4f46e5'
const ACCENT_SOFT = 'rgba(79, 70, 229, 0.14)'
const DANGER = '#dc2626'
const DANGER_SOFT = 'rgba(220, 38, 38, 0.12)'
// 對齊參考線：青綠色，與 drop indicator 的紫色區隔
const GUIDE = '#14b8a6'
const GUIDE_LABEL_BG = '#0f766e'

function escapeId(id: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
}

/**
 * node 是否為 id 自身或其後代
 */
export function contains(node: ComponentNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some((c) => contains(c, id))
}

/**
 * 檢查移動目標是否落在來源子樹
 */
export function isMoveIntoSelf(root: ComponentNode, sourceId: string, parentId: string): boolean {
  const source = findNode(root, sourceId)
  return !!(source && contains(source, parentId))
}

/**
 * 判斷節點是否為容器
 */
function isContainer(node: ComponentNode, rootId: string): boolean {
  return (
    node.id === rootId ||
    node.type === 'section' ||
    node.type === 'column' ||
    node.type === 'shortcode'
  )
}

/**
 * 反查 iframe 內命中元素的節點 id
 *
 * canvas 的 iframe 為 pointer-events:none,pointer 由主文檔 overlay 接收,
 * 再用 elementFromPoint 反查 iframe 內元素
 */
export function hitTest(
  iframe: HTMLIFrameElement,
  clientX: number,
  clientY: number,
): string | null {
  const doc = iframe.contentDocument
  if (!doc) return null
  const rect = iframe.getBoundingClientRect()
  const el = doc
    .elementFromPoint(clientX - rect.left, clientY - rect.top)
    ?.closest('[data-sigil-id]') as HTMLElement | null
  return el?.getAttribute('data-sigil-id') ?? null
}

/**
 * 計算 drop 目標
 *
 * 命中容器中間區時進入容器
 * 命中邊緣或葉節點時同層排序
 *
 * 也就是「拖到容器上 → 預設進去」,只有刻意貼最邊邊才是排序該容器
 */
export function computeDrop(
  iframe: HTMLIFrameElement,
  root: ComponentNode,
  clientX: number,
  clientY: number,
): DropTarget | null {
  const doc = iframe.contentDocument
  if (!doc) return null
  const rect = iframe.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  // 完全離開 iframe 矩形 → 無目標
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  const el = doc.elementFromPoint(x, y)?.closest('[data-sigil-id]') as HTMLElement | null
  if (!el) return null
  const id = el.getAttribute('data-sigil-id')
  if (!id) return null
  const node = findNode(root, id)
  if (!node) return null
  const r = el.getBoundingClientRect()
  // getBoundingClientRect 在 iframe 內相對於 iframe viewport
  const relX = r.width > 0 ? (x - r.left) / r.width : 0.5
  const relY = r.height > 0 ? (y - r.top) / r.height : 0.5
  const onEdge = relX < 0.05 || relX > 0.95 || relY < 0.05 || relY > 0.95

  // 容器非邊緣時進入
  if (isContainer(node, root.id) && !onEdge) {
    return {
      parentId: id,
      index: node.children?.length ?? 0,
      hitId: id,
      side: 'after',
      orient: 'v',
      mode: 'child',
    }
  }

  // root 無 parent,邊緣也只能 append
  if (id === root.id) {
    return {
      parentId: root.id,
      index: root.children?.length ?? 0,
      hitId: id,
      side: 'after',
      orient: 'v',
      mode: 'child',
    }
  }

  // 葉節點或容器邊緣時同層排序
  const orient: Orient = Math.abs(relX - 0.5) > Math.abs(relY - 0.5) ? 'h' : 'v'
  const before = orient === 'h' ? relX < 0.5 : relY < 0.5
  const parent = findParent(root, id)
  if (!parent) return null
  const idx = (parent.children ?? []).findIndex((c) => c.id === id)
  if (idx < 0) return null
  return {
    parentId: parent.id,
    index: before ? idx : idx + 1,
    hitId: id,
    side: before ? 'before' : 'after',
    orient,
    mode: 'sibling',
  }
}

/**
 * 計算移動的 drop 目標,排除拖到來源自身或其子樹
 */
export function computeDropForMove(
  iframe: HTMLIFrameElement,
  root: ComponentNode,
  sourceId: string,
  clientX: number,
  clientY: number,
): DropTarget | null {
  const t = computeDrop(iframe, root, clientX, clientY)
  if (!t) return null
  if (isMoveIntoSelf(root, sourceId, t.parentId)) return null
  return t
}

export type IndicatorKind = 'valid' | 'invalid' | 'none'

export interface IndicatorShowOpts {
  target: DropTarget | null
  /** 拖動中且在畫布上、但目標非法或無法放置 */
  invalid?: boolean
  /** 無效時可標示命中節點 */
  hitId?: string | null
}

/**
 * 拖動時靠近 iframe 邊緣自動捲動內容
 */
export function autoScrollNearEdge(
  iframe: HTMLIFrameElement,
  clientX: number,
  clientY: number,
): void {
  const win = iframe.contentWindow
  if (!win) return
  const rect = iframe.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

  let dx = 0
  let dy = 0
  if (y < EDGE_SCROLL_PX) dy = -EDGE_SCROLL_STEP
  else if (y > rect.height - EDGE_SCROLL_PX) dy = EDGE_SCROLL_STEP
  if (x < EDGE_SCROLL_PX) dx = -EDGE_SCROLL_STEP
  else if (x > rect.width - EDGE_SCROLL_PX) dx = EDGE_SCROLL_STEP
  if (dx || dy) win.scrollBy(dx, dy)
}

/**
 * 建立 drop 指示
 */
function makeIndicator(iframe: HTMLIFrameElement): {
  show: (opts: IndicatorShowOpts) => void
  clear: () => void
} {
  let line: HTMLElement | null = null
  function ensure(doc: Document): HTMLElement {
    if (!line) {
      line = doc.createElement('div')
      line.setAttribute('data-sigil-drop-indicator', '1')
      line.style.cssText =
        'position:fixed;z-index:9999;pointer-events:none;display:none;transition:none;border-radius:4px'
      doc.body.appendChild(line)
    }
    return line
  }

  function paintValid(doc: Document, t: DropTarget): void {
    const el = doc.querySelector(`[data-sigil-id="${escapeId(t.hitId)}"]`) as HTMLElement | null
    if (!el) return
    const l = ensure(doc)
    const r = el.getBoundingClientRect()
    l.style.display = 'block'
    l.style.outline = 'none'
    l.style.boxShadow = `0 0 0 1px ${ACCENT}`
    if (t.mode === 'child') {
      l.style.border = `2px solid ${ACCENT}`
      l.style.background = ACCENT_SOFT
      l.style.boxSizing = 'border-box'
      l.style.width = `${r.width}px`
      l.style.height = `${r.height}px`
      l.style.left = `${r.left}px`
      l.style.top = `${r.top}px`
    } else {
      l.style.border = 'none'
      l.style.background = ACCENT
      l.style.boxSizing = 'content-box'
      l.style.boxShadow = `0 0 0 1px ${ACCENT}, 0 0 8px ${ACCENT_SOFT}`
      if (t.orient === 'v') {
        l.style.width = `${r.width}px`
        l.style.height = '3px'
        l.style.left = `${r.left}px`
        l.style.top = `${(t.side === 'before' ? r.top : r.bottom) - 1}px`
      } else {
        l.style.height = `${r.height}px`
        l.style.width = '3px'
        l.style.top = `${r.top}px`
        l.style.left = `${(t.side === 'before' ? r.left : r.right) - 1}px`
      }
    }
  }

  function paintInvalid(doc: Document, hitId: string | null | undefined): void {
    if (!hitId) {
      if (line) line.style.display = 'none'
      return
    }
    const el = doc.querySelector(`[data-sigil-id="${escapeId(hitId)}"]`) as HTMLElement | null
    if (!el) {
      if (line) line.style.display = 'none'
      return
    }
    const l = ensure(doc)
    const r = el.getBoundingClientRect()
    l.style.display = 'block'
    l.style.border = `2px dashed ${DANGER}`
    l.style.background = DANGER_SOFT
    l.style.boxShadow = 'none'
    l.style.boxSizing = 'border-box'
    l.style.width = `${r.width}px`
    l.style.height = `${r.height}px`
    l.style.left = `${r.left}px`
    l.style.top = `${r.top}px`
  }

  return {
    show(opts) {
      const doc = iframe.contentDocument
      if (!doc) return
      if (opts.target) {
        paintValid(doc, opts.target)
        return
      }
      if (opts.invalid) {
        paintInvalid(doc, opts.hitId)
        return
      }
      if (line) line.style.display = 'none'
    },
    clear() {
      if (line) line.style.display = 'none'
    },
  }
}

function setDragCursor(cursor: string | null): void {
  if (typeof document === 'undefined') return
  document.body.style.cursor = cursor ?? ''
}

export interface GuideShowOpts {
  lines: AlignLine[]
  gaps: GapHint[]
}

/**
 * 建立對齊參考線與間距提示
 *
 * DOM 掛 documentElement 避開 mount 清空 body（比照 type badge）
 * z-index 9998 低於 indicator 9999 與 badge 10000
 */
function makeGuides(iframe: HTMLIFrameElement): {
  show: (opts: GuideShowOpts) => void
  clear: () => void
} {
  let layer: HTMLElement | null = null
  const lineEls: HTMLElement[] = []
  const labelEls: HTMLElement[] = []

  function ensureLayer(doc: Document): HTMLElement {
    if (!layer || !layer.isConnected) {
      layer = doc.createElement('div')
      layer.setAttribute('data-sigil-guides', '1')
      layer.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none'
      doc.documentElement.appendChild(layer)
    }
    // clear() 會把 display 設 none，show 時必須復原
    layer.style.display = 'block'
    return layer
  }

  return {
    show(opts) {
      const doc = iframe.contentDocument
      if (!doc) return
      const root = ensureLayer(doc)
      // 對齊線
      while (lineEls.length < opts.lines.length) {
        const el = doc.createElement('div')
        el.style.cssText = `position:absolute;background:${GUIDE};pointer-events:none`
        root.appendChild(el)
        lineEls.push(el)
      }
      for (let i = opts.lines.length; i < lineEls.length; i++) lineEls[i]!.style.display = 'none'
      opts.lines.forEach((line, i) => {
        const el = lineEls[i]!
        el.style.display = 'block'
        if (line.axis === 'x') {
          el.style.width = '1px'
          el.style.height = `${line.end - line.start}px`
          el.style.left = `${line.pos}px`
          el.style.top = `${line.start}px`
        } else {
          el.style.height = '1px'
          el.style.width = `${line.end - line.start}px`
          el.style.top = `${line.pos}px`
          el.style.left = `${line.start}px`
        }
      })
      // 間距標籤
      while (labelEls.length < opts.gaps.length) {
        const el = doc.createElement('div')
        el.style.cssText = `position:absolute;padding:1px 5px;font-size:10px;font-weight:600;line-height:1.4;color:#fff;background:${GUIDE_LABEL_BG};border-radius:3px;pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap`
        root.appendChild(el)
        labelEls.push(el)
      }
      for (let i = opts.gaps.length; i < labelEls.length; i++) labelEls[i]!.style.display = 'none'
      opts.gaps.forEach((gap, i) => {
        const el = labelEls[i]!
        el.style.display = 'block'
        el.textContent = gap.label
        el.style.left = `${gap.midX}px`
        el.style.top = `${gap.midY}px`
      })
    },
    clear() {
      if (layer) layer.style.display = 'none'
    },
  }
}

/**
 * 收集 drop 目標的同層 sibling 與父容器 rect（排除 source）
 *
 * 座標皆為 iframe 內 viewport 座標，可直接餵 computeGuides
 */
function collectGuidesCandidates(
  doc: Document,
  root: ComponentNode,
  target: DropTarget,
  sourceId?: string,
): Rect[] {
  const candidates: Rect[] = []
  const parent = findNode(root, target.parentId)
  const addRect = (id: string): void => {
    const el = doc.querySelector(`[data-sigil-id="${escapeId(id)}"]`) as HTMLElement | null
    if (el) {
      const r = el.getBoundingClientRect()
      candidates.push({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
  }
  for (const child of parent?.children ?? []) {
    if (child.id === sourceId) continue
    addRect(child.id)
  }
  // 父容器
  if (target.parentId !== root.id || parent?.children?.length) addRect(target.parentId)
  return candidates
}

function rectOf(doc: Document, id: string): Rect | null {
  const el = doc.querySelector(`[data-sigil-id="${escapeId(id)}"]`) as HTMLElement | null
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * drop 落點的前後鄰居 rect
 *
 * 以命中元素在 parent.children 的位置為準，排除 source
 */
function neighborsOf(
  doc: Document,
  root: ComponentNode,
  target: DropTarget,
  sourceId?: string,
): { prev?: Rect; next?: Rect } {
  const parent = findNode(root, target.parentId)
  const children = parent?.children ?? []
  const idx = children.findIndex((c) => c.id === target.hitId)
  if (idx < 0) return {}
  const visible = children.filter((c) => c.id !== sourceId)
  const vIdx = visible.findIndex((c) => c.id === target.hitId)
  const result: { prev?: Rect; next?: Rect } = {}
  if (vIdx > 0) result.prev = rectOf(doc, visible[vIdx - 1]!.id) ?? undefined
  if (vIdx >= 0 && vIdx < visible.length - 1)
    result.next = rectOf(doc, visible[vIdx + 1]!.id) ?? undefined
  return result
}

/**
 * 啟動拖入 — 從面板拖新節點進 canvas
 */
export function startInsertDrag(opts: {
  engine: Engine
  iframe: HTMLIFrameElement
  node: ComponentNode
  pointerId: number
}): { cancel: () => void } {
  const { engine, iframe, node, pointerId } = opts
  const indicator = makeIndicator(iframe)
  const guides = makeGuides(iframe)
  let target: DropTarget | null = null
  setDragCursor('grabbing')

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    autoScrollNearEdge(iframe, e.clientX, e.clientY)
    const root = engine.getTree()
    target = computeDrop(iframe, root, e.clientX, e.clientY)
    const overCanvas = isOverIframe(iframe, e.clientX, e.clientY)
    const doc = iframe.contentDocument
    if (target) {
      setDragCursor('copy')
      indicator.show({ target })
      // insert 無 source rect → 只顯示縫隙間距（sibling 模式才有縫隙）
      let gaps: GapHint[] = []
      if (doc && target.mode === 'sibling') {
        const hit = rectOf(doc, target.hitId)
        if (hit) gaps = computeGaps(hit, target.side, target.orient, neighborsOf(doc, root, target))
      }
      guides.show({ lines: [], gaps })
    } else if (overCanvas) {
      setDragCursor('not-allowed')
      indicator.show({
        target: null,
        invalid: true,
        hitId: hitTest(iframe, e.clientX, e.clientY),
      })
      guides.clear()
    } else {
      setDragCursor('grabbing')
      indicator.show({ target: null })
      guides.clear()
    }
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    cleanup()
    if (target) engine.insert(target.parentId, node, target.index)
  }
  function cleanup(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    indicator.clear()
    guides.clear()
    setDragCursor(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}

/**
 * 啟動移動 — 拖 canvas 內現有節點排序／換層
 *
 * overlay 接收 pointer 並由 window 追蹤
 * 超過移動門檻才開始拖曳
 */
export function startMoveDrag(opts: {
  engine: Engine
  iframe: HTMLIFrameElement
  id: string
  pointerId: number
  startX: number
  startY: number
}): { cancel: () => void } {
  const { engine, iframe, id, pointerId, startX, startY } = opts
  const indicator = makeIndicator(iframe)
  const guides = makeGuides(iframe)
  let started = false
  let target: DropTarget | null = null

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    if (!started) {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) <= 4) return
      started = true
      setDragCursor('grabbing')
    }
    autoScrollNearEdge(iframe, e.clientX, e.clientY)
    const root = engine.getTree()
    const raw = computeDrop(iframe, root, e.clientX, e.clientY)
    const forbidden = raw ? isMoveIntoSelf(root, id, raw.parentId) : false
    target = raw && !forbidden ? raw : null
    const overCanvas = isOverIframe(iframe, e.clientX, e.clientY)

    if (target) {
      setDragCursor('grabbing')
      indicator.show({ target })
      const doc = iframe.contentDocument
      if (doc) {
        const source = rectOf(doc, id)
        const candidates = collectGuidesCandidates(doc, root, target, id)
        const lines = source ? computeGuides(source, candidates) : []
        let gaps: GapHint[] = []
        if (target.mode === 'sibling') {
          const hit = rectOf(doc, target.hitId)
          if (hit) gaps = computeGaps(hit, target.side, target.orient, neighborsOf(doc, root, target, id))
        }
        guides.show({ lines, gaps })
      } else {
        guides.clear()
      }
    } else if (overCanvas && (forbidden || !!raw || !!hitTest(iframe, e.clientX, e.clientY))) {
      setDragCursor('not-allowed')
      indicator.show({
        target: null,
        invalid: true,
        hitId: raw?.hitId ?? hitTest(iframe, e.clientX, e.clientY),
      })
      guides.clear()
    } else if (overCanvas) {
      setDragCursor('not-allowed')
      indicator.show({ target: null, invalid: true, hitId: id })
      guides.clear()
    } else {
      setDragCursor('grabbing')
      indicator.show({ target: null })
      guides.clear()
    }
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    cleanup()
    if (started && target) engine.move(id, target.parentId, target.index)
  }
  function cleanup(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    indicator.clear()
    guides.clear()
    setDragCursor(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}

function isOverIframe(iframe: HTMLIFrameElement, clientX: number, clientY: number): boolean {
  const r = iframe.getBoundingClientRect()
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
}

/**
 * 判斷 patch 是否影響 shortcode slot
 *
 * children 變動無法以 patch 維護 slot 位置
 * 故全量 reconcile 重填
 */
export function affectsShortcodeSlot(patch: Patch, tree: ComponentNode): boolean {
  if (patch.type === 'insert') return !!findNode(tree, patch.parentId)?.shortcode
  if (patch.type === 'move') {
    return !!findNode(tree, patch.newParentId)?.shortcode || !!findParent(tree, patch.id)?.shortcode
  }
  if (patch.type === 'remove') return !!findParent(tree, patch.id)?.shortcode
  return false
}
