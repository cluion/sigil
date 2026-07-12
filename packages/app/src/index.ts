import {
  createEngine,
  createDefaultPolicy,
  toHTML,
  createEventBus,
  createStore,
  findNode,
  findParent,
  cloneWithNewIds,
  createI18n,
  type Engine,
  type SigilDoc,
  type SanitizeFn,
  type HtmlMode,
  type ComponentNode,
  type Locale,
  type ProjectStore,
  type AssetStore,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createBlocksPanel,
  createLayersPanel,
  createInspector,
  type BlocksInput,
  type CanvasDevice,
  type CanvasMode,
} from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import {
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'
import { ensureTokens } from './tokens.js'

const i18nMessages = {
  zh: {
    'canvas.title': '編輯畫布',
    'canvas.edit': '編輯',
    'canvas.preview': '預覽',
    'app.brand': 'Sigil',
    'app.blocks': '區塊',
    'app.layers': '圖層',
    'app.save': '存檔',
    'app.export': '匯出',
    'app.help': '快捷鍵',
    'app.undo': '復原',
    'app.redo': '重做',
    'app.dirty': '未儲存',
    'app.saved': '已儲存',
    'app.saved_msg': '已寫入 ProjectStore',
    'app.save_fail': '存檔失敗',
    'app.export_title': '匯出 HTML',
    'app.export_hint': '複製或下載正式輸出 HTML（CSP-safe）。',
    'app.copy': '複製',
    'app.copied': '已複製',
    'app.download': '下載 .html',
    'app.close': '關閉',
    'app.empty_title': '從左側拖入區塊開始',
    'app.empty_body': '拖放「區塊」到畫布，或點區塊加入。選取後可在右側改內容與樣式。',
    'app.empty_tip': '快捷鍵 Ctrl/Cmd+S 存檔 · 匯出可下載 HTML',
    'status.none': '未選取',
  },
  en: {
    'canvas.title': 'Canvas',
    'canvas.edit': 'Edit',
    'canvas.preview': 'Preview',
    'app.brand': 'Sigil',
    'app.blocks': 'Blocks',
    'app.layers': 'Layers',
    'app.save': 'Save',
    'app.export': 'Export',
    'app.help': 'Keys',
    'app.undo': 'Undo',
    'app.redo': 'Redo',
    'app.dirty': 'Unsaved',
    'app.saved': 'Saved',
    'app.saved_msg': 'Saved to ProjectStore',
    'app.save_fail': 'Save failed',
    'app.export_title': 'Export HTML',
    'app.export_hint': 'Copy or download CSP-safe HTML output.',
    'app.copy': 'Copy',
    'app.copied': 'Copied',
    'app.download': 'Download .html',
    'app.close': 'Close',
    'app.empty_title': 'Drag a block from the left',
    'app.empty_body': 'Drop blocks onto the canvas. Select one to edit content and styles on the right.',
    'app.empty_tip': 'Ctrl/Cmd+S to save · Export downloads HTML',
    'status.none': 'Nothing selected',
  },
}

export interface AppOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  store?: ProjectStore
  /** 媒體庫；有則 Inspector 圖片可「選圖」 */
  assets?: AssetStore
  /** Record 工廠或 defineBlock 列表 */
  blocks?: BlocksInput
  shortcodes?: ShortcodeDefinition[]
  trustedTypesPolicyName?: string
  sanitize?: SanitizeFn
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
  locale?: Locale
}

export interface SigilApp {
  engine: Engine
  toJSON(): SigilDoc
  toHTML(mode?: HtmlMode): string
  /** 是否有未存檔變更 */
  isDirty(): boolean
  destroy(): void
}

/**
 * 開箱即用產品殼 — Design tokens + Topbar + 三欄 + Inspector 分頁
 */
export function createApp(opts: AppOptions): SigilApp {
  ensureTokens()
  const mountEl =
    typeof opts.mount === 'string'
      ? document.querySelector<HTMLElement>(opts.mount)
      : opts.mount
  if (!mountEl) throw new Error('createApp：mount 目標不存在')

  const engine = createEngine({ doc: opts.doc })
  const store = opts.store ?? new JsonProjectStore()
  const policy = createDefaultPolicy({
    trustedTypesPolicyName: opts.trustedTypesPolicyName,
    sanitize: opts.sanitize,
  })
  const shortcodeRegistry = createShortcodeRegistry(opts.shortcodes)
  const defaultFetch =
    typeof fetch !== 'undefined'
      ? (url: string, signal?: AbortSignal) => fetch(url, { signal }).then((r) => r.json())
      : undefined
  const fetchJSON = opts.fetchJSON ?? defaultFetch
  const bus = createEventBus()
  const locale = opts.locale ?? 'zh'
  const i18n = createI18n(i18nMessages, locale)
  const sharedStore = createStore()
  const shortcodeResolver = createShortcodeResolver({
    registry: shortcodeRegistry,
    policy,
    bus,
    fetchJSON,
    store: sharedStore,
  })

  let dirty = false
  let device: CanvasDevice = 'desktop'
  let mode: CanvasMode = 'edit'
  let helpOpen = false
  let clipboard: ComponentNode | null = null
  let closeExportDialog: (() => void) | null = null

  mountEl.replaceChildren()
  const root = document.createElement('div')
  root.className = 'sigil-app'
  mountEl.appendChild(root)

  // —— Topbar ——
  const topbar = document.createElement('header')
  topbar.className = 'sigil-topbar'

  const brand = document.createElement('div')
  brand.className = 'sigil-topbar-brand'
  brand.textContent = i18n.t('app.brand')

  const hist = document.createElement('div')
  hist.className = 'sigil-topbar-group'
  const undoBtn = btn(i18n.t('app.undo'), () => engine.undo())
  const redoBtn = btn(i18n.t('app.redo'), () => engine.redo())
  hist.append(undoBtn, redoBtn)

  const sep1 = el('div', 'sigil-topbar-sep')

  const devices = document.createElement('div')
  devices.className = 'sigil-topbar-group'
  const deviceBtns: Record<CanvasDevice, HTMLButtonElement> = {
    desktop: btn('Desktop', () => setDevice('desktop'), true),
    tablet: btn('Tablet', () => setDevice('tablet'), true),
    mobile: btn('Mobile', () => setDevice('mobile'), true),
  }
  devices.append(deviceBtns.desktop, deviceBtns.tablet, deviceBtns.mobile)

  const sep2 = el('div', 'sigil-topbar-sep')

  const modes = document.createElement('div')
  modes.className = 'sigil-topbar-group'
  const editBtn = btn(i18n.t('canvas.edit'), () => setMode('edit'), true)
  const previewBtn = btn(i18n.t('canvas.preview'), () => setMode('preview'), true)
  modes.append(editBtn, previewBtn)

  const spacer = el('div', 'sigil-topbar-spacer')

  const actions = document.createElement('div')
  actions.className = 'sigil-topbar-group'
  const saveBtn = btn(i18n.t('app.save'), () => {
    void doSave()
  })
  saveBtn.classList.add('sigil-btn--primary')
  const exportBtn = btn(i18n.t('app.export'), () => openExportDialog())
  const helpBtn = btn(i18n.t('app.help'), () => {
    helpOpen = !helpOpen
    helpPanel.hidden = !helpOpen
  })
  actions.append(saveBtn, exportBtn, helpBtn)

  topbar.append(brand, hist, sep1, devices, sep2, modes, spacer, actions)

  // —— Body ——
  const body = el('div', 'sigil-body')

  const sidebar = el('aside', 'sigil-sidebar')
  const blocksTitle = document.createElement('h3')
  blocksTitle.className = 'sigil-sidebar-title'
  blocksTitle.textContent = i18n.t('app.blocks')
  const blocksBox = document.createElement('div')
  sidebar.append(blocksTitle, blocksBox)

  const canvasWrap = el('div', 'sigil-canvas-wrap')
  const canvasBox = el('div', 'sigil-canvas-host')

  const emptyGuide = el('div', 'sigil-empty-canvas')
  emptyGuide.setAttribute('aria-hidden', 'true')
  const emptyTitle = document.createElement('p')
  emptyTitle.className = 'sigil-empty-canvas-title'
  emptyTitle.textContent = i18n.t('app.empty_title')
  const emptyBody = document.createElement('p')
  emptyBody.className = 'sigil-empty-canvas-body'
  emptyBody.textContent = i18n.t('app.empty_body')
  const emptyTip = document.createElement('p')
  emptyTip.className = 'sigil-empty-canvas-tip'
  emptyTip.textContent = i18n.t('app.empty_tip')
  emptyGuide.append(emptyTitle, emptyBody, emptyTip)
  canvasBox.appendChild(emptyGuide)

  canvasWrap.append(canvasBox)

  const helpPanel = el('div', 'sigil-help-panel')
  helpPanel.hidden = true
  const helpTitle = document.createElement('h4')
  helpTitle.textContent = i18n.t('app.help')
  const helpList = document.createElement('ul')
  for (const line of [
    'Delete / Backspace — 刪除',
    'Ctrl/Cmd+Z — 復原',
    'Ctrl/Cmd+Shift+Z / Y — 重做',
    'Ctrl/Cmd+C / V — 複製貼上',
    'Ctrl/Cmd+S — 存檔',
  ]) {
    const li = document.createElement('li')
    li.textContent = line
    helpList.appendChild(li)
  }
  helpPanel.append(helpTitle, helpList)
  canvasWrap.appendChild(helpPanel)

  const right = el('aside', 'sigil-inspector-wrap')
  const layersTitle = document.createElement('h3')
  layersTitle.className = 'sigil-sidebar-title'
  layersTitle.style.padding = '12px 12px 0'
  layersTitle.textContent = i18n.t('app.layers')
  const layersBox = el('div', 'sigil-layers-box')
  const inspectorBox = document.createElement('div')
  right.append(layersTitle, layersBox, inspectorBox)

  body.append(sidebar, canvasWrap, right)

  // —— Status ——
  const status = el('footer', 'sigil-status')
  const statusSel = document.createElement('span')
  const statusDirty = document.createElement('span')
  const statusMsg = document.createElement('span')
  status.append(statusSel, statusDirty, statusMsg)

  root.append(topbar, body, status)

  const canvas = createCanvas(engine, canvasBox, {
    rendererOptions: { shortcodeResolver },
    i18n,
    chrome: false,
  })
  // empty guide 在 canvas iframe 之上；不攔截 pointer，讓 DnD／點選仍可作用
  emptyGuide.style.pointerEvents = 'none'
  const inspector = createInspector(engine, inspectorBox, {
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
    assets: opts.assets,
  })
  const layers = createLayersPanel(engine, layersBox)
  const blocksPanel = opts.blocks
    ? createBlocksPanel(engine, blocksBox, canvas.iframe, opts.blocks)
    : null

  function setDevice(next: CanvasDevice): void {
    device = next
    canvas.setDevice(next)
    refreshChrome()
  }
  function setMode(next: CanvasMode): void {
    mode = next
    canvas.setMode(next)
    refreshChrome()
  }

  function isCanvasEmpty(): boolean {
    const tree = engine.getTree()
    return !tree.children || tree.children.length === 0
  }

  function refreshEmptyGuide(): void {
    const empty = isCanvasEmpty()
    emptyGuide.hidden = !empty
    emptyGuide.setAttribute('aria-hidden', String(!empty))
  }

  function refreshChrome(): void {
    undoBtn.disabled = !engine.canUndo()
    redoBtn.disabled = !engine.canRedo()
    for (const [k, b] of Object.entries(deviceBtns) as [CanvasDevice, HTMLButtonElement][]) {
      b.classList.toggle('sigil-btn--active', k === device)
      b.setAttribute('aria-pressed', String(k === device))
    }
    editBtn.classList.toggle('sigil-btn--active', mode === 'edit')
    previewBtn.classList.toggle('sigil-btn--active', mode === 'preview')
    editBtn.setAttribute('aria-pressed', String(mode === 'edit'))
    previewBtn.setAttribute('aria-pressed', String(mode === 'preview'))
    statusDirty.textContent = dirty ? i18n.t('app.dirty') : i18n.t('app.saved')
    statusDirty.className = dirty ? 'sigil-status-dirty' : 'sigil-muted'
    saveBtn.disabled = !dirty
    const id = engine.getSelection()
    if (!id) statusSel.textContent = i18n.t('status.none')
    else {
      const n = findNode(engine.getTree(), id)
      statusSel.textContent = n ? `${n.type} · ${n.id}` : id
    }
    refreshEmptyGuide()
  }

  async function doSave(): Promise<SigilDoc> {
    const doc = engine.toJSON()
    try {
      await Promise.resolve(store.save(doc))
      dirty = false
      statusMsg.textContent = i18n.t('app.saved_msg')
      refreshChrome()
      return doc
    } catch {
      statusMsg.textContent = i18n.t('app.save_fail')
      refreshChrome()
      return doc
    }
  }

  function openExportDialog(): void {
    closeExportDialog?.()
    const html = toHTML(engine.toJSON(), { shortcodeResolver })

    const backdrop = document.createElement('div')
    backdrop.className = 'sigil-dialog-backdrop'
    backdrop.setAttribute('role', 'dialog')
    backdrop.setAttribute('aria-modal', 'true')
    backdrop.setAttribute('aria-label', i18n.t('app.export_title'))

    const panel = document.createElement('div')
    panel.className = 'sigil-dialog-panel sigil-dialog-panel--wide'

    const head = document.createElement('div')
    head.className = 'sigil-dialog-head'
    const title = document.createElement('h3')
    title.textContent = i18n.t('app.export_title')
    const closeBtn = btn(i18n.t('app.close'), () => close(), true)
    head.append(title, closeBtn)

    const hint = document.createElement('p')
    hint.className = 'sigil-muted'
    hint.textContent = i18n.t('app.export_hint')

    const ta = document.createElement('textarea')
    ta.className = 'sigil-export-out'
    ta.readOnly = true
    ta.value = html
    ta.rows = 14

    const actionsRow = document.createElement('div')
    actionsRow.className = 'sigil-dialog-actions'
    const copyBtn = btn(i18n.t('app.copy'), () => {
      void copyText(html).then((ok) => {
        statusMsg.textContent = ok
          ? i18n.t('app.copied')
          : `HTML ${html.length} chars`
        if (ok) copyBtn.textContent = i18n.t('app.copied')
      })
    })
    copyBtn.classList.add('sigil-btn--primary')
    const dlBtn = btn(i18n.t('app.download'), () => downloadText(html, 'sigil-page.html'))
    actionsRow.append(copyBtn, dlBtn, btn(i18n.t('app.close'), () => close()))

    panel.append(head, hint, ta, actionsRow)
    backdrop.appendChild(panel)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close()
    })
    document.body.appendChild(backdrop)
    ta.focus()
    ta.select()

    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onEsc)

    function close(): void {
      document.removeEventListener('keydown', onEsc)
      backdrop.remove()
      closeExportDialog = null
    }
    closeExportDialog = close

    statusMsg.textContent = `HTML ${html.length} chars`
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'tree' || ev.type === 'patch') dirty = true
    if (ev.type === 'history' || ev.type === 'selection' || ev.type === 'tree' || ev.type === 'patch') {
      refreshChrome()
    }
  })
  refreshChrome()

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!dirty) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  function onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const id = engine.getSelection()
    if ((e.key === 'Delete' || e.key === 'Backspace') && id && id !== engine.getTree().id) {
      e.preventDefault()
      engine.remove(id)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      engine.undo()
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
    ) {
      e.preventDefault()
      engine.redo()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && id) {
      const node = findNode(engine.getTree(), id)
      if (node) {
        e.preventDefault()
        clipboard = node
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard) {
      e.preventDefault()
      const parent = id ? findParent(engine.getTree(), id) : null
      const pid = parent ? parent.id : engine.getTree().id
      engine.insert(pid, cloneWithNewIds(clipboard))
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void doSave()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  const api: SigilApp = {
    engine,
    toJSON() {
      const doc = engine.toJSON()
      void store.save(doc)
      dirty = false
      statusMsg.textContent = i18n.t('app.saved_msg')
      refreshChrome()
      return doc
    },
    toHTML(htmlMode?: HtmlMode) {
      return toHTML(engine.toJSON(), { shortcodeResolver, mode: htmlMode })
    },
    isDirty() {
      return dirty
    },
    destroy() {
      closeExportDialog?.()
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('keydown', onKeyDown)
      unsub()
      blocksPanel?.destroy()
      layers.destroy()
      inspector.destroy()
      canvas.destroy()
      engine.destroy()
      root.remove()
    },
  }
  return api
}

function el(tag: string, className: string): HTMLElement {
  const n = document.createElement(tag)
  n.className = className
  return n
}

function btn(label: string, onClick: () => void, ghost = false): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = ghost ? 'sigil-btn sigil-btn--ghost' : 'sigil-btn'
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px;top:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const SIGIL_APP_VERSION = '0.3.0' as const
