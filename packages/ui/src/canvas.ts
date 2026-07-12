import type { Engine, EngineEvent, RendererOptions, I18n } from '@cluion/sigil-core'
import { createRenderer, findNode } from '@cluion/sigil-core'
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
  let hoverId: string | null = null
  /** iframe 內的類型標籤（fixed，與選取元素同一座標空間） */
  let typeBadge: HTMLElement | null = null

  function setMode(next: CanvasMode): void {
    mode = next
    iframe.style.pointerEvents = next === 'preview' ? 'auto' : 'none'
    overlay.style.display = next === 'preview' ? 'none' : ''
    toggle.textContent =
      i18n?.t(next === 'preview' ? 'canvas.preview' : 'canvas.edit') ??
      (next === 'preview' ? '👁 預覽' : '✏ 編輯')
    toggle.setAttribute('aria-pressed', String(next === 'preview'))
    if (next === 'preview') {
      hoverId = null
      paintHover()
      hideTypeBadge()
      overlay.style.cursor = 'default'
    } else {
      paintTypeBadge()
    }
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
    // 寬度變化後重錨標籤
    requestAnimationFrame(() => paintTypeBadge())
  }
  setDevice('desktop')

  const renderer = createRenderer(opts?.rendererOptions)

  function onOverlayClick(e: MouseEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    // 點空白（或只命中 body）→ 取消選取
    if (!id) {
      engine.select(null)
      return
    }
    engine.select(id)
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

  function onOverlayPointerMove(e: PointerEvent): void {
    if (mode !== 'edit') return
    const id = hitTest(iframe, e.clientX, e.clientY)
    const next = id && id !== engine.getSelection() ? id : null
    // 游標：可點元件 → pointer；空白 → default
    overlay.style.cursor = id ? 'pointer' : 'default'
    if (next === hoverId) return
    hoverId = next
    paintHover()
  }

  function onOverlayPointerLeave(): void {
    if (hoverId === null) return
    hoverId = null
    paintHover()
    overlay.style.cursor = 'default'
  }

  // iframe 為 pointer-events:none,滾輪落在 overlay,轉發給 iframe 捲動內容
  function onOverlayWheel(e: WheelEvent): void {
    const win = iframe.contentWindow
    if (!win) return
    win.scrollBy(e.deltaX, e.deltaY)
    e.preventDefault()
    // 捲動後重錨類型標籤
    paintTypeBadge()
  }

  overlay.addEventListener('click', onOverlayClick)
  overlay.addEventListener('pointerdown', onOverlayPointerDown)
  overlay.addEventListener('pointermove', onOverlayPointerMove)
  overlay.addEventListener('pointerleave', onOverlayPointerLeave)
  overlay.addEventListener('wheel', onOverlayWheel, { passive: false })

  const BADGE_STYLE = [
    'position:fixed',
    'z-index:10000',
    'pointer-events:none',
    'padding:1px 6px',
    'font-size:10px',
    'font-weight:600',
    'line-height:1.4',
    'letter-spacing:.02em',
    'color:#fff',
    'background:#4f46e5',
    'border-radius:3px',
    'white-space:nowrap',
    'max-width:160px',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'box-shadow:0 1px 2px rgba(15,23,42,.12)',
    'display:none',
  ].join(';')

  function injectStyle(doc: Document): void {
    const style = doc.createElement('style')
    style.textContent = [
      'body{margin:12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;line-height:1.5}',
      /* 容器結構提示（低調） */
      'section[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #e2e8f0;outline-offset:-1px;border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      'div[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #d1fae5;outline-offset:-1px;background:rgba(167,243,208,0.08);border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      'section[data-sigil-id]>*,div[data-sigil-id]>*{margin:4px;vertical-align:middle}',
      'img[data-sigil-id]{display:inline-block;vertical-align:middle;max-width:100%;border-radius:4px}',
      'section[data-sigil-id]:empty,div[data-sigil-id]:empty{min-height:64px;display:flex;align-items:center;justify-content:center}',
      'section[data-sigil-id]:empty::before,div[data-sigil-id]:empty::before{content:"拖入元件";color:#94a3b8;font-size:12px;pointer-events:none}',
      /* hover：非選取時的輕描邊 */
      '[data-sigil-id][data-sigil-hover="1"]{outline:1.5px solid #818cf8!important;outline-offset:2px;box-shadow:0 0 0 3px rgba(99,102,241,0.12)}',
      /* selected：產品級焦點環（標籤為獨立 fixed 元素） */
      '[data-sigil-id][data-sigil-selected="1"]{outline:2px solid #4f46e5!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,0.18)!important;position:relative;z-index:1}',
      /* 類型標籤 */
      '[data-sigil-type-badge]{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
    ].join('')
    doc.head.appendChild(style)
  }

  function escapeCssId(id: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
  }

  function queryById(doc: Document, id: string): Element | null {
    return doc.querySelector(`[data-sigil-id="${escapeCssId(id)}"]`)
  }

  function selectionLabelText(id: string): string {
    const node = findNode(engine.getTree(), id)
    if (!node) return id
    if (node.type === 'shortcode' && node.shortcode?.name) {
      return `shortcode:${node.shortcode.name}`
    }
    return node.type
  }

  function ensureTypeBadge(doc: Document): HTMLElement {
    if (typeBadge && typeBadge.isConnected) return typeBadge
    const b = doc.createElement('div')
    b.setAttribute('data-sigil-type-badge', '1')
    b.setAttribute('aria-hidden', 'true')
    b.style.cssText = BADGE_STYLE
    // 掛在 <html> 上，避免 body.replaceChildren(reconcile) 清掉
    doc.documentElement.appendChild(b)
    typeBadge = b
    return b
  }

  function hideTypeBadge(): void {
    if (typeBadge) typeBadge.style.display = 'none'
  }

  function positionTypeBadge(el: Element, badge: HTMLElement): void {
    badge.style.display = 'block'
    // 先移出可視區量寬高
    badge.style.top = '-9999px'
    badge.style.left = '0'
    const bh = badge.offsetHeight || 16
    const bw = badge.offsetWidth || 40

    // CSSOM：iframe 內元素的 getBoundingClientRect 相對 iframe 視口，
    // 與 iframe 內 position:fixed 同一座標系。不要再加減 iframe 在頁面上的偏移。
    const r = el.getBoundingClientRect()
    const win = iframe.contentWindow
    const vw = win?.innerWidth ?? iframe.clientWidth
    const vh = win?.innerHeight ?? iframe.clientHeight

    // 預設貼在元素上緣外側
    let top = r.top - bh - 2
    let placeBelow = false
    if (top < 2) {
      top = r.bottom + 2
      placeBelow = true
      if (top + bh > vh - 2) {
        top = Math.max(2, Math.min(r.top + 2, vh - bh - 2))
        placeBelow = false
      }
    }

    let left = r.left
    if (left + bw > vw - 2) left = Math.max(2, vw - bw - 2)
    if (left < 2) left = 2

    badge.style.top = `${top}px`
    badge.style.left = `${left}px`
    badge.style.borderRadius = placeBelow ? '0 0 3px 3px' : '3px 3px 0 0'
  }

  /** 類型標籤：iframe 內 fixed，貼齊選取元素 */
  function paintTypeBadge(): void {
    const d = iframe.contentDocument
    const id = engine.getSelection()
    if (!d || !id || mode === 'preview') {
      hideTypeBadge()
      return
    }
    const el = queryById(d, id)
    if (!el) {
      hideTypeBadge()
      return
    }

    const badge = ensureTypeBadge(d)
    badge.textContent = selectionLabelText(id)
    positionTypeBadge(el, badge)

    // 新插入節點 layout 可能尚未穩定（shortcode／圖片），下一幀再錨一次
    requestAnimationFrame(() => {
      if (engine.getSelection() !== id) return
      const still = queryById(d, id)
      if (!still || !typeBadge?.isConnected) return
      positionTypeBadge(still, typeBadge)
    })
  }

  function paintSelection(): void {
    const d = iframe.contentDocument
    if (!d) return
    d.querySelectorAll('[data-sigil-selected]').forEach((node) => {
      node.removeAttribute('data-sigil-selected')
    })
    const id = engine.getSelection()
    if (!id) {
      hideTypeBadge()
      return
    }
    const el = queryById(d, id)
    if (!el) {
      hideTypeBadge()
      return
    }
    el.setAttribute('data-sigil-selected', '1')
    paintTypeBadge()
    // 選取與 hover 互斥
    if (hoverId === id) {
      hoverId = null
      paintHover()
    }
  }

  function paintHover(): void {
    const d = iframe.contentDocument
    if (!d) return
    d.querySelectorAll('[data-sigil-hover]').forEach((el) => el.removeAttribute('data-sigil-hover'))
    if (!hoverId || hoverId === engine.getSelection()) return
    const el = queryById(d, hoverId)
    if (el) el.setAttribute('data-sigil-hover', '1')
  }

  iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>'
  iframe.addEventListener('load', () => {
    const d = iframe.contentDocument
    if (!d) return
    injectStyle(d)
    renderer.mount(engine.getTree(), d.body)
    paintSelection()
    paintHover()
  })

  const unsub = engine.subscribe((ev: EngineEvent) => {
    const d = iframe.contentDocument
    if (!d) return
    if (ev.type === 'patch') {
      if (affectsShortcodeSlot(ev.patch, engine.getTree())) renderer.reconcile(engine.getTree())
      else renderer.applyPatch(ev.patch)
      paintSelection()
      paintHover()
    } else if (ev.type === 'tree') {
      renderer.reconcile(ev.tree)
      paintSelection()
      paintHover()
    } else if (ev.type === 'selection') {
      paintSelection()
      paintHover()
    }
  })

  return {
    iframe,
    setMode,
    setDevice,
    destroy() {
      overlay.removeEventListener('click', onOverlayClick)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.removeEventListener('pointermove', onOverlayPointerMove)
      overlay.removeEventListener('pointerleave', onOverlayPointerLeave)
      overlay.removeEventListener('wheel', onOverlayWheel)
      unsub()
      renderer.destroy()
      typeBadge?.remove()
      typeBadge = null
      iframe.remove()
      overlay.remove()
      toggle.remove()
      deviceBar.remove()
    },
  }
}
