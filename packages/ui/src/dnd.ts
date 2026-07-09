import type { Engine, ComponentNode } from '@cluion/sigil-core'
import { findNode, findParent } from '@cluion/sigil-core'

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

/**
 * node 是否為 id 自身或其後代
 */
function contains(node: ComponentNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some((c) => contains(c, id))
}

/**
 * 判斷節點是否為容器（可接子元件）
 */
function isContainer(node: ComponentNode, rootId: string): boolean {
  return node.id === rootId || node.type === 'section' || node.type === 'column'
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
 * 命中容器（section／column／root）且游標在「中間區」（15~85%）→ 進入容器（append child）
 * 命中容器的最外邊緣,或命中葉節點 → 在該層排序（sibling）
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
  const el = doc.elementFromPoint(x, y)?.closest('[data-sigil-id]') as HTMLElement | null
  if (!el) return null
  const id = el.getAttribute('data-sigil-id')
  if (!id) return null
  const node = findNode(root, id)
  if (!node) return null
  const r = el.getBoundingClientRect()
  const relX = r.width > 0 ? (x - r.left) / r.width : 0.5
  const relY = r.height > 0 ? (y - r.top) / r.height : 0.5
  const onEdge = relX < 0.05 || relX > 0.95 || relY < 0.05 || relY > 0.95

  // 容器且非邊緣 → 進入（append）
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

  // 葉節點 或 容器邊緣 → sibling（在命中節點的父層內排序）
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
  const source = findNode(root, sourceId)
  if (source && contains(source, t.parentId)) return null
  return t
}

/**
 * 建立 drop 指示 — child 模式畫容器框,sibling 模式畫插入線
 */
function makeIndicator(iframe: HTMLIFrameElement): {
  show: (t: DropTarget | null) => void
  clear: () => void
} {
  let line: HTMLElement | null = null
  function ensure(doc: Document): HTMLElement {
    if (!line) {
      line = doc.createElement('div')
      line.style.cssText =
        'position:fixed;z-index:9999;pointer-events:none;display:none'
      doc.body.appendChild(line)
    }
    return line
  }
  return {
    show(t) {
      const doc = iframe.contentDocument
      if (!doc) return
      if (!t) {
        if (line) line.style.display = 'none'
        return
      }
      const el = doc.querySelector(`[data-sigil-id="${t.hitId}"]`) as HTMLElement | null
      if (!el) return
      const l = ensure(doc)
      const r = el.getBoundingClientRect()
      l.style.display = 'block'
      if (t.mode === 'child') {
        l.style.border = '2px solid #3b82f6'
        l.style.background = 'rgba(59,130,246,0.10)'
        l.style.boxSizing = 'border-box'
        l.style.width = `${r.width}px`
        l.style.height = `${r.height}px`
        l.style.left = `${r.left}px`
        l.style.top = `${r.top}px`
      } else {
        l.style.border = 'none'
        l.style.background = '#3b82f6'
        l.style.boxSizing = 'content-box'
        if (t.orient === 'v') {
          l.style.width = `${r.width}px`
          l.style.height = '2px'
          l.style.left = `${r.left}px`
          l.style.top = `${t.side === 'before' ? r.top : r.bottom}px`
        } else {
          l.style.height = `${r.height}px`
          l.style.width = '2px'
          l.style.top = `${r.top}px`
          l.style.left = `${t.side === 'before' ? r.left : r.right}px`
        }
      }
    },
    clear() {
      if (line) line.style.display = 'none'
    },
  }
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
  let target: DropTarget | null = null

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    target = computeDrop(iframe, engine.getTree(), e.clientX, e.clientY)
    indicator.show(target)
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
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}

/**
 * 啟動移動 — 拖 canvas 內現有節點排序／換層
 *
 * pointer 由 overlay（主文檔）接收,window 監聽有效；
 * 移動超過門檻才開始(未移動則視為點擊,交由 click 處理選取)
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
  let started = false
  let target: DropTarget | null = null

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    if (!started) {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) <= 4) return
      started = true
    }
    target = computeDropForMove(iframe, engine.getTree(), id, e.clientX, e.clientY)
    indicator.show(target)
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
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}
