import type { Engine, EngineEvent } from '@cluion/sigil-core'
import { createRenderer } from '@cluion/sigil-core'
import { hitTest, startMoveDrag } from './dnd.js'

export interface CanvasHandle {
  iframe: HTMLIFrameElement
  destroy: () => void
}

/**
 * 建立 canvas — 把 engine 樹渲染到 same-origin iframe
 *
 * iframe 設 pointer-events:none,由主文檔透明 overlay 接收所有 pointer,
 * 再用 elementFromPoint 反查命中節點（pointer 不跨 iframe,避免事件斷在邊界）
 */
export function createCanvas(engine: Engine, container: HTMLElement): CanvasHandle {
  container.style.position = 'relative'
  const iframe = document.createElement('iframe')
  iframe.style.cssText =
    'border:1px solid #ccc;width:100%;height:420px;background:#fff;pointer-events:none'
  container.appendChild(iframe)

  // 主文檔 overlay 蓋 iframe,接收所有 pointer
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:absolute;inset:0;cursor:default'
  container.appendChild(overlay)

  const renderer = createRenderer()

  function onOverlayClick(e: MouseEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    if (id) engine.select(id)
  }

  function onOverlayPointerDown(e: PointerEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    if (!id || id === engine.getTree().id) return
    startMoveDrag({
      engine,
      iframe,
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    })
  }

  // iframe 為 pointer-events:none,滾輪落在 overlay,轉發給 iframe 捲動內容
  function onOverlayWheel(e: WheelEvent): void {
    const win = iframe.contentWindow
    if (!win) return
    win.scrollBy(e.deltaX, e.deltaY)
    e.preventDefault()
  }

  overlay.addEventListener('click', onOverlayClick)
  overlay.addEventListener('pointerdown', onOverlayPointerDown)
  overlay.addEventListener('wheel', onOverlayWheel, { passive: false })

  function injectStyle(doc: Document): void {
    const style = doc.createElement('style')
    style.textContent =
      'body{margin:8px;font-family:system-ui}' +
      'section[data-sigil-id]{padding:6px;min-height:24px;outline:1px dashed #cbd5e1;outline-offset:-1px}' +
      'div[data-sigil-id]{padding:6px;min-height:24px;outline:1px dashed #86efac;outline-offset:-1px;background:rgba(134,239,172,0.06)}' +
      'section[data-sigil-id]>*,div[data-sigil-id]>*{margin:3px;vertical-align:middle}' +
      // 圖片明確為 inline-block,與按鈕一致,確保可水平並排
      'img[data-sigil-id]{display:inline-block;vertical-align:middle}' +
      // 空容器放大命中區並顯示提示（限定 section/column,避免誤套到 void 的 img）
      'section[data-sigil-id]:empty,div[data-sigil-id]:empty{min-height:56px;display:flex;align-items:center;justify-content:center}' +
      'section[data-sigil-id]:empty::before,div[data-sigil-id]:empty::before{content:"拖入元件";color:#94a3b8;font-size:12px;pointer-events:none}'
    doc.head.appendChild(style)
  }

  iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  iframe.addEventListener('load', () => {
    const d = iframe.contentDocument
    if (!d) return
    injectStyle(d)
    renderer.mount(engine.getTree(), d.body)
  })

  const unsub = engine.subscribe((ev: EngineEvent) => {
    const d = iframe.contentDocument
    if (!d) return
    if (ev.type === 'patch') renderer.applyPatch(ev.patch)
    else if (ev.type === 'tree') renderer.reconcile(ev.tree)
  })

  return {
    iframe,
    destroy() {
      overlay.removeEventListener('click', onOverlayClick)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.removeEventListener('wheel', onOverlayWheel)
      unsub()
      renderer.destroy()
      iframe.remove()
      overlay.remove()
    },
  }
}
