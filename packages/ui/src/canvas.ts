import type { Engine, EngineEvent, RendererOptions, I18n } from '@cluion/sigil-core'
import { createRenderer } from '@cluion/sigil-core'
import { hitTest, startMoveDrag, affectsShortcodeSlot } from './dnd.js'

export type CanvasMode = 'edit' | 'preview'
export type CanvasDevice = 'desktop' | 'tablet' | 'mobile'

export interface CanvasHandle {
  iframe: HTMLIFrameElement
  setMode: (mode: CanvasMode) => void
  setDevice: (device: CanvasDevice) => void
  destroy: () => void
}

/**
 * 建立 canvas — 把 engine 樹渲染到 same-origin iframe
 *
 * iframe 設 pointer-events:none,由主文檔透明 overlay 接收所有 pointer,
 * 再用 elementFromPoint 反查命中節點（pointer 不跨 iframe,避免事件斷在邊界）
 */
export interface CanvasOptions {
  rendererOptions?: RendererOptions
  i18n?: I18n
  /** false 時隱藏內建裝置／編輯切換，改由產品殼 Topbar 控制 */
  chrome?: boolean
}

export function createCanvas(
  engine: Engine,
  container: HTMLElement,
  opts?: CanvasOptions,
): CanvasHandle {
  const i18n = opts?.i18n
  const showChrome = opts?.chrome !== false
  container.style.position = 'relative'
  container.classList.add('sigil-canvas-host')
  const iframe = document.createElement('iframe')
  iframe.className = 'sigil-canvas-iframe'
  iframe.style.cssText =
    'border:1px solid var(--sigil-color-border, #ccc);width:100%;height:100%;min-height:420px;background:var(--sigil-color-canvas, #fff);pointer-events:none;display:block;border-radius:var(--sigil-radius-sm, 6px)'
  iframe.title = i18n?.t('canvas.title') ?? '編輯畫布'
  container.appendChild(iframe)

  // 主文檔 overlay 蓋 iframe,接收所有 pointer
  const overlay = document.createElement('div')
  overlay.className = 'sigil-canvas-overlay'
  overlay.style.cssText = 'position:absolute;inset:0;cursor:default'
  container.appendChild(overlay)

  // 編輯/預覽切換:預覽時 iframe 可互動(shortcode 按鈕可點)、overlay 隱藏
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'sigil-btn sigil-btn--ghost sigil-canvas-mode-btn'
  toggle.textContent = '✏ 編輯'
  toggle.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10'
  if (showChrome) container.appendChild(toggle)

  let mode: CanvasMode = 'edit'
  function setMode(next: CanvasMode): void {
    mode = next
    iframe.style.pointerEvents = next === 'preview' ? 'auto' : 'none'
    overlay.style.display = next === 'preview' ? 'none' : ''
    toggle.textContent =
      i18n?.t(next === 'preview' ? 'canvas.preview' : 'canvas.edit') ??
      (next === 'preview' ? '👁 預覽' : '✏ 編輯')
    toggle.setAttribute('aria-pressed', String(next === 'preview'))
  }
  toggle.addEventListener('click', () => setMode(mode === 'edit' ? 'preview' : 'edit'))

  // 裝置預覽切換(desktop/tablet/mobile 寬度)
  const deviceWidths: Record<CanvasDevice, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  }
  const deviceBar = document.createElement('div')
  deviceBar.className = 'sigil-canvas-device-bar'
  deviceBar.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;display:flex;gap:4px'
  const deviceBtns: HTMLButtonElement[] = []
  for (const d of Object.keys(deviceWidths) as CanvasDevice[]) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sigil-btn sigil-btn--ghost'
    btn.textContent = d
    btn.addEventListener('click', () => setDevice(d))
    deviceBar.appendChild(btn)
    deviceBtns.push(btn)
  }
  if (showChrome) container.appendChild(deviceBar)

  function setDevice(next: CanvasDevice): void {
    iframe.style.width = deviceWidths[next]
    iframe.style.margin = next === 'desktop' ? '' : '0 auto'
    for (const btn of deviceBtns) {
      btn.style.fontWeight = btn.textContent === next ? 'bold' : 'normal'
      btn.setAttribute('aria-pressed', String(btn.textContent === next))
    }
  }
  setDevice('desktop')

  const renderer = createRenderer(opts?.rendererOptions)

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
      'body{margin:12px;font-family:system-ui,sans-serif;color:#0f172a}' +
      'section[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #cbd5e1;outline-offset:-1px;border-radius:6px}' +
      'div[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #86efac;outline-offset:-1px;background:rgba(134,239,172,0.06);border-radius:6px}' +
      'section[data-sigil-id]>*,div[data-sigil-id]>*{margin:4px;vertical-align:middle}' +
      'img[data-sigil-id]{display:inline-block;vertical-align:middle}' +
      'section[data-sigil-id]:empty,div[data-sigil-id]:empty{min-height:64px;display:flex;align-items:center;justify-content:center}' +
      'section[data-sigil-id]:empty::before,div[data-sigil-id]:empty::before{content:"拖入元件";color:#94a3b8;font-size:12px;pointer-events:none}' +
      '[data-sigil-id][data-sigil-selected="1"]{outline:2px solid #4f46e5!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,0.15)}'
    doc.head.appendChild(style)
  }

  function paintSelection(): void {
    const d = iframe.contentDocument
    if (!d) return
    d.querySelectorAll('[data-sigil-selected]').forEach((el) => el.removeAttribute('data-sigil-selected'))
    const id = engine.getSelection()
    if (!id) return
    const safe =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
    const el = d.querySelector(`[data-sigil-id="${safe}"]`)
    if (el) el.setAttribute('data-sigil-selected', '1')
  }

  iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  iframe.addEventListener('load', () => {
    const d = iframe.contentDocument
    if (!d) return
    injectStyle(d)
    renderer.mount(engine.getTree(), d.body)
    paintSelection()
  })

  const unsub = engine.subscribe((ev: EngineEvent) => {
    const d = iframe.contentDocument
    if (!d) return
    if (ev.type === 'patch') {
      if (affectsShortcodeSlot(ev.patch, engine.getTree())) renderer.reconcile(engine.getTree())
      else renderer.applyPatch(ev.patch)
      paintSelection()
    } else if (ev.type === 'tree') {
      renderer.reconcile(ev.tree)
      paintSelection()
    } else if (ev.type === 'selection') {
      paintSelection()
    }
  })

  return {
    iframe,
    setMode,
    setDevice,
    destroy() {
      overlay.removeEventListener('click', onOverlayClick)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.removeEventListener('wheel', onOverlayWheel)
      unsub()
      renderer.destroy()
      iframe.remove()
      overlay.remove()
      toggle.remove()
      deviceBar.remove()
    },
  }
}
