import type {
  Engine,
  EngineEvent,
  RendererOptions,
  I18n,
  ResponsiveDevice,
} from '@cluion/sigil-core'
import { createRenderer, findNode } from '@cluion/sigil-core'
// findNode 用於鎖定檢查
import { hitTest, startMoveDrag, affectsShortcodeSlot } from './dnd.js'

export type CanvasMode = 'edit' | 'preview'
export type CanvasDevice = ResponsiveDevice

export interface CanvasHandle {
  iframe: HTMLIFrameElement
  setMode: (mode: CanvasMode) => void
  setDevice: (device: CanvasDevice) => void
  getDevice: () => CanvasDevice
  subscribeDevice: (listener: (device: CanvasDevice) => void) => () => void
  /** 進入 inline 文字編輯（text／button 節點）；非可編輯型別無反應 */
  startEditing: (id: string) => void
  /** 結束編輯並寫回 engine */
  commitEditing: () => void
  /** 結束編輯不寫回 */
  cancelEditing: () => void
  /** 目前是否正在編輯，與其 id */
  getEditingId: () => string | null
  destroy: () => void
}

/**
 * 建立 canvas — 把 engine 樹渲染到 same-origin iframe
 *
 * overlay 接收 pointer 並回查 iframe 節點
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
  // 畫布為真實頁面預覽，永遠白底深字，不受編輯器主題影響
  iframe.style.cssText =
    'border:1px solid var(--sigil-color-border, #ccc);width:100%;height:100%;min-height:420px;background:#fff;pointer-events:none;display:block;border-radius:var(--sigil-radius-sm, 6px)'
  iframe.title = i18n?.t('canvas.title') ?? '編輯畫布'
  container.appendChild(iframe)

  // overlay 接收 pointer
  const overlay = document.createElement('div')
  overlay.className = 'sigil-canvas-overlay'
  overlay.style.cssText = 'position:absolute;inset:0;cursor:default'
  container.appendChild(overlay)

  // 預覽時開放 iframe 互動
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'sigil-btn sigil-btn--ghost sigil-canvas-mode-btn'
  toggle.textContent = '✏ 編輯'
  toggle.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10'
  if (showChrome) container.appendChild(toggle)

  let mode: CanvasMode = 'edit'
  let device: CanvasDevice = 'desktop'
  let hoverId: string | null = null
  // —— inline 文字編輯狀態 ——
  let editingId: string | null = null
  let editingEl: HTMLElement | null = null
  let editingCommitted = false
  const deviceListeners = new Set<(device: CanvasDevice) => void>()
  /** iframe 類型標籤 */
  let typeBadge: HTMLElement | null = null

  function setMode(next: CanvasMode): void {
    if (editingId) endEditing(true)
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

  const renderer = createRenderer({ ...opts?.rendererOptions, device })

  // 裝置寬度與響應式樣式切換
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
    btn.dataset.device = d
    btn.addEventListener('click', () => setDevice(d))
    deviceBar.appendChild(btn)
    deviceBtns.push(btn)
  }
  if (showChrome) container.appendChild(deviceBar)

  function setDevice(next: CanvasDevice): void {
    if (editingId) endEditing(true)
    device = next
    iframe.style.width = deviceWidths[next]
    iframe.style.margin = next === 'desktop' ? '' : '0 auto'
    renderer.setDevice(next)
    for (const btn of deviceBtns) {
      btn.style.fontWeight = btn.textContent === next ? 'bold' : 'normal'
      btn.setAttribute('aria-pressed', String(btn.textContent === next))
    }
    for (const listener of deviceListeners) listener(next)
    // 寬度變化後重錨標籤
    requestAnimationFrame(() => paintTypeBadge())
  }
  setDevice('desktop')

  function onOverlayClick(e: MouseEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    // 點空白時取消選取
    if (!id) {
      engine.select(null)
      return
    }
    engine.select(id)
  }

  function onOverlayPointerDown(e: PointerEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    if (!id || id === engine.getTree().id) return
    const node = findNode(engine.getTree(), id)
    if (node?.locked) return
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
    // 更新命中游標
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

  // —— 雙擊 inline 編輯文字（text／button 節點）——
  function setEditing(id: string | null): void {
    if (editingId) endEditing(true)
    if (!id) return
    const doc = iframe.contentDocument
    if (!doc || mode !== 'edit') return
    const node = findNode(engine.getTree(), id)
    if (!node || (node.type !== 'text' && node.type !== 'button')) return
    const el = doc.querySelector(`[data-sigil-id="${escapeCssId(id)}"]`) as HTMLElement | null
    if (!el) return

    engine.select(id)
    editingId = id
    editingEl = el
    editingCommitted = false

    // 讓 iframe 能接收 pointer 以操作 caret
    iframe.style.pointerEvents = 'auto'
    overlay.style.display = 'none'

    el.setAttribute('contenteditable', 'true')
    el.focus()
    selectAll(el, doc)

    el.addEventListener('blur', onEditingBlur)
    el.addEventListener('keydown', onEditingKeydown)
  }

  function endEditing(commit: boolean): void {
    if (!editingId || !editingEl) return
    const el = editingEl
    const id = editingId
    if (commit) {
      const next = el.textContent ?? ''
      // 先拆 listener 再寫回，避免 blur 重入
      el.removeEventListener('blur', onEditingBlur)
      el.removeEventListener('keydown', onEditingKeydown)
      engine.update(id, { content: next })
      // 重觸發 selection 讓 Inspector 同步 content（Inspector 不訂閱 patch）
      engine.select(id)
    } else {
      el.removeEventListener('blur', onEditingBlur)
      el.removeEventListener('keydown', onEditingKeydown)
    }
    el.removeAttribute('contenteditable')
    // 復原 edit 模式的 pointer-events
    iframe.style.pointerEvents = 'none'
    overlay.style.display = ''
    editingId = null
    editingEl = null
    editingCommitted = false
    paintSelection()
  }

  function onEditingBlur(): void {
    // blur 預設提交（Enter 也走此路；Esc 先設 flag 再 blur）
    endEditing(!editingCommitted)
  }

  function onEditingKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      // 提交：blur handler 會寫回
      ;(e.target as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      editingCommitted = true // 標記取消，blur 不寫回
      ;(e.target as HTMLElement).blur()
    }
  }

  function selectAll(el: HTMLElement, doc: Document): void {
    const win = iframe.contentWindow
    if (!win) return
    try {
      const sel = win.getSelection()
      if (!sel) return
      const range = doc.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      /* happy-dom／舊環境不支援，忽略 */
    }
  }

  function onOverlayDblClick(e: MouseEvent): void {
    const id = hitTest(iframe, e.clientX, e.clientY)
    if (!id) return
    setEditing(id)
  }

  overlay.addEventListener('click', onOverlayClick)
  overlay.addEventListener('dblclick', onOverlayDblClick)
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
      'body{margin:12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;line-height:1.5;scrollbar-gutter:stable}',
      /* 精緻捲動條，避免緊貼內容 */
      'body::-webkit-scrollbar{width:10px;height:10px}',
      'body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px;border:2px solid transparent;background-clip:content-box}',
      'body::-webkit-scrollbar-thumb:hover{background:#94a3b8;background-clip:content-box}',
      'body::-webkit-scrollbar-track{margin:4px}',
      /* 容器提示 */
      'section[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #e2e8f0;outline-offset:-1px;border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      'div[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #d1fae5;outline-offset:-1px;background:rgba(167,243,208,0.08);border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      'section[data-sigil-id]>*,div[data-sigil-id]>*{margin:4px;vertical-align:middle}',
      'img[data-sigil-id]{display:inline-block;vertical-align:middle;max-width:100%;border-radius:4px}',
      'section[data-sigil-id]:empty,div[data-sigil-id]:empty{min-height:64px;display:flex;align-items:center;justify-content:center}',
      'section[data-sigil-id]:empty::before,div[data-sigil-id]:empty::before{content:"拖入元件";color:#94a3b8;font-size:12px;pointer-events:none}',
      /* hover：非選取時的輕描邊 */
      '[data-sigil-id][data-sigil-hover="1"]{outline:1.5px solid #818cf8!important;outline-offset:2px;box-shadow:0 0 0 3px rgba(99,102,241,0.12)}',
      /* 選取焦點 */
      '[data-sigil-id][data-sigil-selected="1"]{outline:2px solid #4f46e5!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,0.18)!important;position:relative;z-index:1}',
      /* 編輯狀態 */
      '[data-sigil-id][data-sigil-locked="1"]{outline:1px dashed #94a3b8!important;outline-offset:1px}',
      '[data-sigil-id][data-sigil-hidden="1"]{opacity:0.4!important}',
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
    // 圖層重命名優先
    if (node.name?.trim()) return node.name.trim()
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
    // 掛在 html 避免全量重建移除
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

    // iframe 元素與 fixed 標籤共用視口座標
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

    // 下一幀重錨動態節點
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
    startEditing(id) {
      setEditing(id)
    },
    commitEditing() {
      endEditing(true)
    },
    cancelEditing() {
      endEditing(false)
    },
    getEditingId() {
      return editingId
    },
    getDevice() {
      return device
    },
    subscribeDevice(listener) {
      deviceListeners.add(listener)
      listener(device)
      return () => {
        deviceListeners.delete(listener)
      }
    },
    destroy() {
      if (editingId) endEditing(false)
      overlay.removeEventListener('click', onOverlayClick)
      overlay.removeEventListener('dblclick', onOverlayDblClick)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.removeEventListener('pointermove', onOverlayPointerMove)
      overlay.removeEventListener('pointerleave', onOverlayPointerLeave)
      overlay.removeEventListener('wheel', onOverlayWheel)
      unsub()
      deviceListeners.clear()
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
