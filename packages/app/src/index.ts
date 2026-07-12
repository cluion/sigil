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
    void api.toJSON()
    dirty = false
    refreshChrome()
  })
  saveBtn.classList.add('sigil-btn--primary')
  const exportBtn = btn(i18n.t('app.export'), () => {
    exportOut.value = api.toHTML()
    statusMsg.textContent = `HTML ${exportOut.value.length} chars`
  })
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
  const exportOut = document.createElement('textarea')
  exportOut.className = 'sigil-export-out'
  exportOut.readOnly = true
  exportOut.placeholder = 'Export HTML…'
  exportOut.hidden = true
  exportBtn.addEventListener('click', () => {
    exportOut.hidden = false
  })
  canvasWrap.append(canvasBox, exportOut)

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
    const id = engine.getSelection()
    if (!id) statusSel.textContent = i18n.t('status.none')
    else {
      const n = findNode(engine.getTree(), id)
      statusSel.textContent = n ? `${n.type} · ${n.id}` : id
    }
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'tree' || ev.type === 'patch') dirty = true
    if (ev.type === 'history' || ev.type === 'selection' || ev.type === 'tree' || ev.type === 'patch') {
      refreshChrome()
    }
  })
  refreshChrome()

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
      void api.toJSON()
      dirty = false
      refreshChrome()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  const api: SigilApp = {
    engine,
    toJSON() {
      const doc = engine.toJSON()
      void store.save(doc)
      dirty = false
      refreshChrome()
      return doc
    },
    toHTML(htmlMode?: HtmlMode) {
      return toHTML(engine.toJSON(), { shortcodeResolver, mode: htmlMode })
    },
    destroy() {
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

export const SIGIL_APP_VERSION = '0.2.0' as const
