import type { Engine, ComponentNode } from '@cluion/sigil-core'
import { findNode, findParent } from '@cluion/sigil-core'

export interface DropTarget {
  parentId: string
  index: number
  hitId: string
}

/**
 * node 是否為 id 自身或其後代
 */
function contains(node: ComponentNode, id: string): boolean {
  if (node.id === id) return true
  return (node.children ?? []).some((c) => contains(c, id))
}

function elRectTop(el: HTMLElement): number {
  return el.getBoundingClientRect().top
}

/**
 * 建立 drop 高亮器（每次拖拽獨立,追蹤上一個高亮元素）
 */
function makeHighlighter(iframe: HTMLIFrameElement): {
  highlight: (hitId: string | null) => void
} {
  let highlighted: Element | null = null
  return {
    highlight(hitId) {
      const doc = iframe.contentDocument
      if (!doc) return
      if (highlighted) highlighted.classList.remove('sigil-drop-target')
      highlighted = null
      if (hitId) {
        const el = doc.querySelector(`[data-sigil-id="${hitId}"]`)
        if (el) {
          el.classList.add('sigil-drop-target')
          highlighted = el
        }
      }
    },
  }
}

/**
 * 計算 iframe 內的 drop 目標（parent + index + 命中 id）
 *
 * 游標在命中元素上半 → 插前面；下半 → 插後面；命中 root → append
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
  const raw = doc.elementFromPoint(x, y)
  const el = raw?.closest('[data-sigil-id]') as HTMLElement | null
  if (!el) return null
  const id = el.getAttribute('data-sigil-id')
  if (!id) return null

  if (id === root.id) {
    return { parentId: root.id, index: root.children?.length ?? 0, hitId: id }
  }
  const parent = findParent(root, id)
  if (!parent) return null
  const siblings = parent.children ?? []
  const idx = siblings.findIndex((c) => c.id === id)
  if (idx < 0) return null
  const after = y > elRectTop(el) + el.offsetHeight / 2
  return { parentId: parent.id, index: after ? idx + 1 : idx, hitId: id }
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
 * 啟動拖入 — 從面板拖新節點進 canvas
 */
export function startInsertDrag(opts: {
  engine: Engine
  iframe: HTMLIFrameElement
  node: ComponentNode
  pointerId: number
}): { cancel: () => void } {
  const { engine, iframe, node, pointerId } = opts
  iframe.style.pointerEvents = 'none'
  const { highlight } = makeHighlighter(iframe)
  let target: DropTarget | null = null

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    target = computeDrop(iframe, engine.getTree(), e.clientX, e.clientY)
    highlight(target?.hitId ?? null)
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    cleanup()
    if (target) engine.insert(target.parentId, node, target.index)
  }
  function cleanup(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    iframe.style.pointerEvents = ''
    highlight(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}

/**
 * 啟動移動 — 拖 canvas 內現有節點排序／換層
 *
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
  const { highlight } = makeHighlighter(iframe)
  let started = false
  let target: DropTarget | null = null

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    if (!started) {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) <= 4) return
      started = true
      iframe.style.pointerEvents = 'none'
    }
    target = computeDropForMove(iframe, engine.getTree(), id, e.clientX, e.clientY)
    highlight(target?.hitId ?? null)
  }
  function onUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    cleanup()
    if (started && target) engine.move(id, target.parentId, target.index)
  }
  function cleanup(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    iframe.style.pointerEvents = ''
    highlight(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return { cancel: cleanup }
}
