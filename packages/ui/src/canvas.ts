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
import { subscribeLocale, uiText } from './i18n.js'
import { createSelectionToolbar, type CanvasSelectionCommands } from './selection-toolbar.js'
import type { RichTextAdapter, RichTextSession } from './rich-text.js'

export type CanvasMode = 'edit' | 'preview'
export type CanvasDevice = ResponsiveDevice

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>'

export interface CanvasHandle {
  iframe: HTMLIFrameElement
  setMode: (mode: CanvasMode) => void
  setDevice: (device: CanvasDevice) => void
  getDevice: () => CanvasDevice
  subscribeDevice: (listener: (device: CanvasDevice) => void) => () => void
  /** 進入 inline 文字編輯；非可編輯型別無反應 */
  startEditing: (id: string) => void
  /** 存檔時若仍在組字或無法讀出草稿，保留編輯並拋出錯誤。 */
  commitEditing: (options?: { forSave?: boolean }) => void
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
  richText?: RichTextAdapter
  i18n?: I18n
  /** false 時隱藏內建裝置／編輯切換，改由產品殼 Topbar 控制 */
  chrome?: boolean
  /** 宿主提供的命令與上下文，同時套用命令的啟用條件。 */
  selectionCommands?: CanvasSelectionCommands
  /** Open a replacement UI for a native image. Its optional close callback also runs on preview or teardown. */
  onReplaceImage?: (id: string, trigger: HTMLElement) => void | (() => void)
  /** 右鍵選單命中節點與游標座標 */
  onContextMenu?: (id: string | null, x: number, y: number) => void
  /** 富文字 session 生命週期錯誤 */
  onEditingError?: (error: unknown) => void
  /** 尚未提交的文字開始改變，或回到原值。 */
  onEditingDirtyChange?: (dirty: boolean) => void
}

interface PlainEditingState {
  kind: 'plain'
  id: string
  element: HTMLElement
  initialValue: string
  cancelledByKey: boolean
}

type EditEnd = 'commit' | 'cancel' | 'discard'

interface RichEditingState {
  kind: 'rich'
  id: string
  element: HTMLElement
  initialValue: string
  document: Document
  session: RichTextSession | null
  starting: boolean
  pendingEnd: EditEnd | null
}

type EditingState = PlainEditingState | RichEditingState

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
  iframe.title = uiText(i18n, 'canvas.title', '編輯畫布')
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
  toggle.textContent = uiText(i18n, 'canvas.edit', '✏ 編輯')
  toggle.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10'
  if (showChrome) container.appendChild(toggle)

  let mode: CanvasMode = 'edit'
  let device: CanvasDevice = 'desktop'
  let hoverId: string | null = null
  // —— inline 文字編輯狀態 ——
  let editing: EditingState | null = null
  let editingDirty = false
  let composing = false
  let editingObserver: MutationObserver | null = null
  const deviceListeners = new Set<(device: CanvasDevice) => void>()
  const selectionToolbar = createSelectionToolbar(
    container,
    iframe,
    engine,
    i18n,
    opts?.selectionCommands,
    opts?.onReplaceImage,
  )
  let injectedStyle: HTMLStyleElement | null = null

  function setMode(next: CanvasMode): void {
    if (editing) endEditing('commit')
    mode = next
    if (injectedStyle && iframe.contentDocument) injectStyle(iframe.contentDocument)
    iframe.style.pointerEvents = next === 'preview' ? 'auto' : 'none'
    overlay.style.display = next === 'preview' ? 'none' : ''
    toggle.textContent = uiText(
      i18n,
      next === 'preview' ? 'canvas.preview' : 'canvas.edit',
      next === 'preview' ? '👁 預覽' : '✏ 編輯',
    )
    toggle.setAttribute('aria-pressed', String(next === 'preview'))
    if (next === 'preview') {
      hoverId = null
      paintHover()
      selectionToolbar.show(null, null)
      overlay.style.cursor = 'default'
    } else {
      paintSelection()
    }
  }
  toggle.addEventListener('click', () => setMode(mode === 'edit' ? 'preview' : 'edit'))

  const renderer = createRenderer({
    ...opts?.rendererOptions,
    richTextResolver: opts?.richText?.resolver ?? opts?.rendererOptions?.richTextResolver,
    device,
  })

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
    if (editing) endEditing('commit')
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
    selectionToolbar.schedule()
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
    if (e.pointerType === 'touch') return
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
    if (mode !== 'edit' || e.pointerType === 'touch') return
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
    selectionToolbar.schedule()
  }

  // 觸控落在畫布上方的 overlay，需將單指平移送到 iframe 的捲動區。
  let pan: { id: number; x: number; y: number; scrolling: boolean } | null = null

  function onTouchStart(event: TouchEvent): void {
    pan = null
    if (event.touches.length !== 1) return
    const touch = event.touches[0]!
    const bounds = iframe.getBoundingClientRect()
    if (
      touch.clientX < bounds.left ||
      touch.clientX >= bounds.right ||
      touch.clientY < bounds.top ||
      touch.clientY >= bounds.bottom
    )
      return
    pan = { id: touch.identifier, x: touch.clientX, y: touch.clientY, scrolling: false }
  }

  function onTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 1 || mode !== 'edit' || editing) {
      pan = null
      return
    }
    const touch = event.touches[0]
    const win = iframe.contentWindow
    if (!pan || !win || !touch || !event.cancelable || touch.identifier !== pan.id) return
    const dx = pan.x - touch.clientX
    const dy = pan.y - touch.clientY
    if (!pan.scrolling && Math.hypot(dx, dy) < 6) return
    const previousX = win.scrollX
    const previousY = win.scrollY
    win.scrollBy({ left: dx, top: dy, behavior: 'instant' })
    if (!pan.scrolling && win.scrollX === previousX && win.scrollY === previousY) {
      // 畫布已到邊界時，交給宿主頁面捲動。
      pan = null
      return
    }
    event.preventDefault()
    pan.scrolling = true
    pan.x = touch.clientX
    pan.y = touch.clientY
    selectionToolbar.schedule()
  }

  function endTouch(): void {
    pan = null
  }

  // —— 雙擊 inline 編輯文字 ——
  function setEditing(id: string | null): void {
    if (editing) endEditing('commit')
    if (!id) return
    const doc = iframe.contentDocument
    if (!doc || mode !== 'edit') return
    const node = findNode(engine.getTree(), id)
    if (!node || node.locked || container.closest('[inert]')) return
    const el = doc.querySelector(`[data-sigil-id="${escapeCssId(id)}"]`) as HTMLElement | null
    if (!el) return

    if (opts?.richText?.resolver.supports(node)) {
      startRichTextEditing(node, el, doc)
      return
    }
    if (node.type !== 'text' && node.type !== 'button') return

    engine.select(id)
    editing = {
      kind: 'plain',
      id,
      element: el,
      initialValue: el.textContent ?? '',
      cancelledByKey: false,
    }
    selectionToolbar.show(null, null)

    // 讓 iframe 能接收 pointer 以操作 caret
    iframe.style.pointerEvents = 'auto'
    overlay.style.display = 'none'

    el.setAttribute('contenteditable', 'true')
    el.focus()
    selectAll(el, doc)

    el.addEventListener('blur', onEditingBlur)
    watchEditing(editing)
  }

  function setEditingDirty(dirty: boolean): void {
    if (editingDirty === dirty) return
    editingDirty = dirty
    opts?.onEditingDirtyChange?.(dirty)
  }

  function readEditing(state: EditingState): string {
    return state.kind === 'plain' ? (state.element.textContent ?? '') : state.session!.getValue()
  }

  function checkEditingDirty(): void {
    if (!editing || !opts?.onEditingDirtyChange) return
    let dirty: boolean
    try {
      dirty = readEditing(editing) !== editing.initialValue
    } catch {
      // An unreadable adapter value must still be protected as an unsaved draft.
      dirty = true
    }
    setEditingDirty(dirty)
  }

  function onComposition(e: Event): void {
    composing = e.type === 'compositionstart'
    if (!composing) checkEditingDirty()
  }

  function watchEditing(state: EditingState): void {
    const el = state.element
    el.addEventListener('keydown', onEditingKeydown)
    el.addEventListener('compositionstart', onComposition)
    el.addEventListener('compositionend', onComposition)
    el.addEventListener('input', checkEditingDirty)
    if (opts?.onEditingDirtyChange && state.kind === 'rich') {
      // Formatting commands can change the editable DOM without a native input event.
      editingObserver = new MutationObserver(checkEditingDirty)
      editingObserver.observe(el, {
        subtree: true,
        characterData: true,
        childList: true,
        attributes: true,
      })
    }
  }

  function endEditing(action: EditEnd, forSave = false): void {
    const current = editing
    if (!current) return
    if (forSave && (composing || (current.kind === 'rich' && current.starting))) {
      throw new Error('Inline editing is still in progress')
    }
    if (current.kind === 'rich' && current.starting) {
      current.pendingEnd = action
      return
    }

    let next: string | null = null
    if (action === 'commit') {
      try {
        next = readEditing(current)
      } catch (error) {
        if (forSave) {
          setEditingDirty(true)
          throw error
        }
        reportEditingError(error)
      }
    }
    editing = null
    composing = false
    editingObserver?.disconnect()
    editingObserver = null
    current.element.removeEventListener('input', checkEditingDirty)
    current.element.removeEventListener('compositionstart', onComposition)
    current.element.removeEventListener('compositionend', onComposition)
    current.element.removeEventListener('keydown', onEditingKeydown)
    if (current.kind === 'plain') {
      current.element.removeEventListener('blur', onEditingBlur)
      current.element.removeAttribute('contenteditable')
    } else {
      current.document.removeEventListener('keydown', onRichEditingKeydown, true)
      destroyRichTextSession(current.session)
    }

    let element = current.element
    if (action === 'cancel') {
      const tree = engine.getTree()
      const node = findNode(tree, current.id)
      if (node) {
        // Re-render the saved node through the same renderer and HTML policy used for initial display.
        if (node === tree) renderer.reconcile(tree)
        else renderer.applyPatch({ type: 'replace', id: node.id, node })
        element =
          current.element.ownerDocument.querySelector<HTMLElement>(
            `[data-sigil-id="${escapeCssId(node.id)}"]`,
          ) ?? element
      }
    }
    restoreEditingChrome(element, current.kind === 'rich')
    if (next !== null && next !== current.initialValue) {
      const content = next
      engine.batch(() => engine.update(current.id, { content }))
      // 重觸發 selection 讓未訂閱 patch 的面板同步 content
      engine.select(current.id)
    }
    setEditingDirty(false)
    paintSelection()
  }

  function onEditingBlur(): void {
    // blur 預設提交，Escape 先標記取消再 blur
    if (editing?.kind === 'plain') endEditing(editing.cancelledByKey ? 'cancel' : 'commit')
  }

  function onEditingKeydown(e: KeyboardEvent): void {
    if (!editing || composing || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return
    const target = e.target as HTMLElement
    if (
      container.closest('[inert]') ||
      target.closest('[inert], [readonly], [aria-readonly="true"]')
    )
      return
    const commands = opts?.selectionCommands
    if (commands && (e.ctrlKey || e.metaKey)) {
      const ctx = commands.context()
      if (commands.registry.match(e, ctx)?.id === 'save') {
        e.preventDefault()
        void commands.registry.run('save', ctx).catch(reportEditingError)
        return
      }
    }
    if (editing.kind !== 'plain') return
    if (e.key === 'Enter') {
      e.preventDefault()
      // 提交：blur handler 會寫回
      ;(e.target as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (editing?.kind === 'plain') editing.cancelledByKey = true
      ;(e.target as HTMLElement).blur()
    }
  }

  function startRichTextEditing(
    node: NonNullable<ReturnType<typeof findNode>>,
    el: HTMLElement,
    doc: Document,
  ): void {
    const adapter = opts?.richText
    if (!adapter) return
    const state: RichEditingState = {
      kind: 'rich',
      id: node.id,
      element: el,
      initialValue: '',
      document: doc,
      session: null,
      starting: true,
      pendingEnd: null,
    }
    editing = state
    engine.select(node.id)
    iframe.style.pointerEvents = 'auto'
    overlay.style.display = 'none'
    doc.addEventListener('keydown', onRichEditingKeydown, true)

    try {
      state.initialValue = adapter.resolver.read(node)
      state.session = adapter.start({
        node,
        element: el,
        document: doc,
        value: state.initialValue,
        requestCommit: () => requestRichTextEnd(state, 'commit'),
        requestCancel: () => requestRichTextEnd(state, 'cancel'),
      })
      state.starting = false
      if (opts?.onEditingDirtyChange && state.pendingEnd === null) {
        // The adapter may normalize the stored markup when it initializes its editor.
        try {
          state.initialValue = state.session.getValue()
        } catch {
          setEditingDirty(true)
        }
      }
      if (state.pendingEnd !== null) {
        endEditing(state.pendingEnd)
        return
      }
      state.session.focus()
      if (editing === state) watchEditing(state)
    } catch (error) {
      state.starting = false
      if (editing === state) {
        editing = null
        doc.removeEventListener('keydown', onRichEditingKeydown, true)
        destroyRichTextSession(state.session)
        restoreEditingChrome(el, true)
        paintSelection()
        setEditingDirty(false)
      }
      reportEditingError(error)
    }
  }

  function requestRichTextEnd(state: RichEditingState, action: 'commit' | 'cancel'): void {
    if (editing !== state) return
    endEditing(action)
  }

  function onRichEditingKeydown(e: KeyboardEvent): void {
    if (
      e.key !== 'Escape' ||
      composing ||
      e.isComposing ||
      e.keyCode === 229 ||
      editing?.kind !== 'rich'
    )
      return
    e.preventDefault()
    e.stopPropagation()
    endEditing('cancel')
  }

  function destroyRichTextSession(session: RichTextSession | null): void {
    if (!session) return
    try {
      session.destroy()
    } catch (error) {
      reportEditingError(error)
    }
  }

  function restoreEditingChrome(el: HTMLElement, restoreFocus: boolean): void {
    iframe.style.pointerEvents = mode === 'preview' ? 'auto' : 'none'
    overlay.style.display = mode === 'preview' ? 'none' : ''
    if (restoreFocus && el.isConnected) {
      const tabindex = el.getAttribute('tabindex')
      if (tabindex === null) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
  }

  function reportEditingError(error: unknown): void {
    opts?.onEditingError?.(error)
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
    if (mode !== 'edit') return
    const id = hitTest(iframe, e.clientX, e.clientY)
    if (!id) return
    const node = findNode(engine.getTree(), id)
    if (opts?.onReplaceImage && node?.type === 'image' && !node.shortcode) {
      if (node.locked) return
      if (engine.getSelection() !== id) engine.select(id)
      selectionToolbar.replaceImage()
      return
    }
    setEditing(id)
  }

  function onOverlayContextMenu(e: MouseEvent): void {
    if (!opts?.onContextMenu) return
    e.preventDefault()
    const id = hitTest(iframe, e.clientX, e.clientY)
    engine.select(id)
    opts.onContextMenu(id, e.clientX, e.clientY)
  }

  overlay.addEventListener('click', onOverlayClick)
  overlay.addEventListener('dblclick', onOverlayDblClick)
  overlay.addEventListener('contextmenu', onOverlayContextMenu)
  overlay.addEventListener('pointerdown', onOverlayPointerDown)
  overlay.addEventListener('pointermove', onOverlayPointerMove)
  overlay.addEventListener('pointerleave', onOverlayPointerLeave)
  overlay.addEventListener('wheel', onOverlayWheel, { passive: false })
  overlay.addEventListener('touchstart', onTouchStart, { passive: true })
  overlay.addEventListener('touchmove', onTouchMove, { passive: false })
  overlay.addEventListener('touchend', endTouch)
  overlay.addEventListener('touchcancel', endTouch)

  function injectStyle(doc: Document): void {
    if (injectedStyle?.ownerDocument !== doc) {
      injectedStyle?.remove()
      injectedStyle = doc.createElement('style')
      doc.head.appendChild(injectedStyle)
    }
    if (mode === 'preview') {
      injectedStyle.textContent = '[data-sigil-hidden="1"]{display:none!important}'
      return
    }
    const emptyContainerText = JSON.stringify(uiText(i18n, 'canvas.empty_container', '拖入元件'))
    injectedStyle.textContent = [
      'body{margin:12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;line-height:1.5;scrollbar-gutter:stable}',
      /* 精緻捲動條，避免緊貼內容 */
      'body::-webkit-scrollbar{width:10px;height:10px}',
      'body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px;border:2px solid transparent;background-clip:content-box}',
      'body::-webkit-scrollbar-thumb:hover{background:#94a3b8;background-clip:content-box}',
      'body::-webkit-scrollbar-track{margin:4px}',
      /* 容器提示 */
      'section[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #e2e8f0;outline-offset:-1px;border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      'div[data-sigil-id]{padding:8px;min-height:28px;outline:1px dashed #d1fae5;outline-offset:-1px;background:rgba(167,243,208,0.08);border-radius:6px;transition:outline-color .12s,box-shadow .12s}',
      // 文件根框可能跨數千列；實線可避免每次編輯重繪整條虛線路徑。
      'body>:is(section,div)[data-sigil-id]{outline-style:solid}',
      'section[data-sigil-id]>*,div[data-sigil-id]>*{margin:4px;vertical-align:middle}',
      'img[data-sigil-id]{display:inline-block;vertical-align:middle;max-width:100%;border-radius:4px}',
      'section[data-sigil-id]:empty,div[data-sigil-id]:empty{min-height:64px;display:flex;align-items:center;justify-content:center}',
      `section[data-sigil-id]:empty::before,div[data-sigil-id]:empty::before{content:${emptyContainerText};color:#94a3b8;font-size:12px;pointer-events:none}`,
      /* hover：非選取時的輕描邊 */
      '[data-sigil-id][data-sigil-hover="1"]{outline:1.5px solid #818cf8!important;outline-offset:2px;box-shadow:0 0 0 3px rgba(99,102,241,0.12)}',
      /* 選取焦點 */
      '[data-sigil-id][data-sigil-selected="1"]{outline:2px solid #4f46e5!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,0.18)!important;position:relative;z-index:1}',
      /* 編輯狀態 */
      '[data-sigil-id][data-sigil-locked="1"]{outline:1px dashed #94a3b8!important;outline-offset:1px}',
      '[data-sigil-id][data-sigil-hidden="1"]{opacity:0.4!important}',
    ].join('')
  }

  function escapeCssId(id: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
  }

  function queryById(doc: Document, id: string): Element | null {
    return doc.querySelector(`[data-sigil-id="${escapeCssId(id)}"]`)
  }

  function paintSelection(): void {
    const d = iframe.contentDocument
    if (!d) return
    d.querySelectorAll('[data-sigil-selected]').forEach((node) => {
      node.removeAttribute('data-sigil-selected')
    })
    const id = engine.getSelection()
    if (!id) {
      selectionToolbar.show(null, null)
      return
    }
    const el = queryById(d, id)
    if (!el) {
      selectionToolbar.show(null, null)
      return
    }
    el.setAttribute('data-sigil-selected', '1')
    if (mode === 'edit' && !editing) selectionToolbar.show(findNode(engine.getTree(), id), el)
    else selectionToolbar.show(null, null)
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

  let previewDocument: Document | null = null

  function onPreviewClick(event: MouseEvent): void {
    if (
      mode !== 'preview' ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return
    }
    const anchor = (event.target as Element | null)?.closest?.('a')
    if (!anchor || anchor.hasAttribute('download')) return
    const target = anchor.getAttribute('target')
    if (target && target.toLowerCase() !== '_self') return
    const href = anchor.getAttribute('href')
    if (!href?.startsWith('#')) return

    // srcdoc resolves fragment URLs against the host page; keep these jumps in the canvas.
    event.preventDefault()
    const doc = anchor.ownerDocument
    if (href === '#') {
      doc.defaultView?.scrollTo(0, 0)
      return
    }
    let id = href.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      // A malformed escape may still be the literal id of an element.
    }
    const destination =
      doc.getElementById(id) ??
      Array.from(doc.getElementsByName(id)).find((element) => element.localName === 'a')
    destination?.scrollIntoView()
  }

  function onFrameLoad(): void {
    previewDocument?.removeEventListener('click', onPreviewClick)
    const d = iframe.contentDocument
    previewDocument = d
    selectionToolbar.bindFrame(d)
    if (!d) return
    d.addEventListener('click', onPreviewClick)
    injectStyle(d)
    renderer.mount(engine.getTree(), d.body)
    paintSelection()
    paintHover()
  }

  const htmlPolicy = opts?.rendererOptions?.htmlPolicy
  if (htmlPolicy) htmlPolicy.setTemplate(iframe, FRAME_DOCUMENT)
  else iframe.srcdoc = FRAME_DOCUMENT
  iframe.addEventListener('load', onFrameLoad)

  const unsub = engine.subscribe((ev: EngineEvent) => {
    const d = iframe.contentDocument
    if (!d) return
    if (ev.type === 'patch') {
      if (editing && ev.patch.type === 'update' && ev.patch.id === editing.id && ev.patch.locked) {
        endEditing('cancel')
      } else if (
        editing &&
        ((ev.patch.type === 'update' &&
          ev.patch.id === editing.id &&
          ev.patch.content !== undefined) ||
          (ev.patch.type === 'replace' && ev.patch.id === editing.id) ||
          (ev.patch.type === 'remove' && !findNode(engine.getTree(), editing.id)))
      ) {
        endEditing('discard')
      }
      if (affectsShortcodeSlot(ev.patch, engine.getTree())) renderer.reconcile(engine.getTree())
      else renderer.applyPatch(ev.patch)
      paintSelection()
      paintHover()
    } else if (ev.type === 'tree') {
      if (editing) endEditing('discard')
      renderer.reconcile(ev.tree)
      paintSelection()
      paintHover()
    } else if (ev.type === 'selection') {
      paintSelection()
      paintHover()
    }
  })
  const unsubLocale = subscribeLocale(i18n, () => {
    selectionToolbar.translate()
    iframe.title = uiText(i18n, 'canvas.title', '編輯畫布')
    toggle.textContent = uiText(
      i18n,
      mode === 'preview' ? 'canvas.preview' : 'canvas.edit',
      mode === 'preview' ? '👁 預覽' : '✏ 編輯',
    )
    const doc = iframe.contentDocument
    if (doc) injectStyle(doc)
  })

  return {
    iframe,
    setMode,
    setDevice,
    startEditing(id) {
      setEditing(id)
    },
    commitEditing(options) {
      endEditing('commit', options?.forSave)
    },
    cancelEditing() {
      endEditing('cancel')
    },
    getEditingId() {
      return editing?.id ?? null
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
      if (editing) endEditing('discard')
      iframe.removeEventListener('load', onFrameLoad)
      previewDocument?.removeEventListener('click', onPreviewClick)
      previewDocument = null
      overlay.removeEventListener('click', onOverlayClick)
      overlay.removeEventListener('dblclick', onOverlayDblClick)
      overlay.removeEventListener('contextmenu', onOverlayContextMenu)
      overlay.removeEventListener('pointerdown', onOverlayPointerDown)
      overlay.removeEventListener('pointermove', onOverlayPointerMove)
      overlay.removeEventListener('pointerleave', onOverlayPointerLeave)
      overlay.removeEventListener('wheel', onOverlayWheel)
      overlay.removeEventListener('touchstart', onTouchStart)
      overlay.removeEventListener('touchmove', onTouchMove)
      overlay.removeEventListener('touchend', endTouch)
      overlay.removeEventListener('touchcancel', endTouch)
      unsub()
      unsubLocale()
      deviceListeners.clear()
      renderer.destroy()
      injectedStyle?.remove()
      injectedStyle = null
      selectionToolbar.destroy()
      iframe.remove()
      overlay.remove()
      toggle.remove()
      deviceBar.remove()
    },
  }
}
