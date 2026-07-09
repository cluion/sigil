import type { Engine, EngineEvent } from '@cluion/sigil-core'
import { createRenderer } from '@cluion/sigil-core'
import { startMoveDrag } from './dnd.js'

export interface CanvasHandle {
  iframe: HTMLIFrameElement
  destroy: () => void
}

/**
 * 建立 canvas — 把 engine 樹渲染到 same-origin iframe
 *
 * 監聽 patch／tree 即時更新；點選反查 data-sigil-id 觸發 select；
 * pointerdown 啟動拖動排序；注入 drop 高亮樣式
 */
export function createCanvas(engine: Engine, container: HTMLElement): CanvasHandle {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'border:1px solid #ccc;width:100%;height:420px;background:#fff'
  container.appendChild(iframe)

  const renderer = createRenderer()

  function onClick(e: Event): void {
    const el = (e.target as Element | null)?.closest('[data-sigil-id]')
    if (el) engine.select(el.getAttribute('data-sigil-id') ?? '')
  }

  function onPointerDown(e: PointerEvent): void {
    const el = (e.target as Element | null)?.closest('[data-sigil-id]') as HTMLElement | null
    if (!el) return
    const id = el.getAttribute('data-sigil-id')
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

  function injectStyle(doc: Document): void {
    const style = doc.createElement('style')
    style.textContent =
      'body{margin:8px;font-family:system-ui}[data-sigil-id]{cursor:default}' +
      '.sigil-drop-target{outline:2px solid #3b82f6;outline-offset:-2px}'
    doc.head.appendChild(style)
  }

  iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  iframe.addEventListener('load', () => {
    const d = iframe.contentDocument
    if (!d) return
    injectStyle(d)
    renderer.mount(engine.getTree(), d.body)
    d.addEventListener('click', onClick)
    d.addEventListener('pointerdown', onPointerDown)
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
      unsub()
      renderer.destroy()
      iframe.remove()
    },
  }
}
