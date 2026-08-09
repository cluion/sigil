import {
  createEngine,
  createDefaultPolicy,
  toHTML,
  createEventBus,
  createStore,
  findNode,
  createId,
  createI18n,
  createCommandRegistry,
  createDefaultEditingCommands,
  defineCommand,
  runBeforeSave,
  runAfterSave,
  runOnSelect,
  runAfterLoad,
  runBeforeDestroy,
  type Engine,
  type SigilDoc,
  type SanitizeFn,
  type HtmlMode,
  type ComponentNode,
  type Locale,
  type ProjectStore,
  type AssetStore,
  type TemplateStore,
  type CommandDefinition,
  type CommandContext,
  type EditorHooks,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createBlocksPanel,
  createLayersPanel,
  createInspector,
  applyTheme,
  nextTheme,
  openContextMenu,
  type BlocksInput,
  type CanvasDevice,
  type CanvasMode,
  type ThemeChoice,
  type MenuItem,
} from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import {
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'
import { templateToBlockDef } from '@cluion/sigil-blocks'
import { ensureTokens } from './tokens.js'

const i18nMessages = {
  zh: {
    'canvas.title': '編輯畫布',
    'canvas.edit': '編輯',
    'canvas.preview': '預覽',
    'app.brand': 'Sigil',
    'app.blocks': '區塊',
    'app.layers': '圖層',
    'app.panels': '面板',
    'app.panel_settings': '圖層／設定',
    'app.close_panel': '關閉面板',
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
    'app.paste': '貼上',
    'app.move_up': '上移',
    'app.move_down': '下移',
    'app.delete': '刪除',
    'app.context_menu': '節點操作',
    'app.copied': '已複製',
    'app.download': '下載 .html',
    'app.close': '關閉',
    'app.empty_title': '從左側拖入區塊開始',
    'app.empty_body':
      '拖放「區塊」到畫布，或聚焦區塊後按 Enter／Space 加入。選取後可在右側改內容與樣式。',
    'app.empty_tip': '快捷鍵 Ctrl/Cmd+S 存檔 · 匯出可下載 HTML',
    'app.save_as_template': '存為範本',
    'app.template_name': '範本名稱',
    'app.theme': '主題',
    'app.theme_auto': '自動',
    'app.theme_light': '亮色',
    'app.theme_dark': '暗色',
    'blocks.search_placeholder': '搜尋區塊…',
    'blocks.search_label': '搜尋區塊',
    'blocks.insert': '插入',
    'blocks.default_category': '一般',
    'blocks.empty': '無符合區塊',
    'layers.title': '圖層',
    'layers.show': '顯示',
    'layers.hide': '隱藏',
    'layers.lock': '鎖定',
    'layers.unlock': '解鎖',
    'layers.rename_prompt': '圖層名稱',
    'media.title': '媒體庫',
    'media.close': '關閉',
    'media.upload': '上傳圖片',
    'media.empty': '尚無媒體',
    'props.title': '屬性',
    'props.empty': '未選取節點',
    'props.content': '內容',
    'props.node_id_open': '（',
    'props.node_id_close': '）',
    'style.title': '樣式',
    'inspector.tab_content': '內容',
    'inspector.tab_style': '樣式',
    'inspector.tab_advanced': '進階',
    'inspector.empty': '尚未選取元件',
    'inspector.empty_hint': '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。',
    'inspector.no_content': '此節點無可編輯內容欄位，可切到樣式分頁',
    'inspector.image': '圖片',
    'inspector.layout': '版面',
    'inspector.typography': '文字',
    'inspector.appearance': '外觀',
    'inspector.delete_component': '刪除元件',
    'form.add': '新增',
    'form.delete': '刪除',
    'form.pick_image': '選圖',
    'form.load_unavailable': '無法載入',
    'form.loading': '載入中…',
    'form.load_failed': '載入失敗',
    'form.label_separator': '：',
    'style.base': '基礎樣式',
    'style.inherit_desktop': '未覆寫時繼承 Desktop',
    'style.inherit_tablet_desktop': '未覆寫時繼承 Tablet，再繼承 Desktop',
    'style.override': '覆寫',
    'style.inherit': '繼承',
    'style.unset': '未設定',
    'style.unset_short': '未設',
    'style.use_inheritance': '使用繼承',
    'style.clear': '清除',
    'style.clear_desktop': '清除 Desktop 樣式',
    'status.none': '未選取',
  },
  en: {
    'canvas.title': 'Canvas',
    'canvas.edit': 'Edit',
    'canvas.preview': 'Preview',
    'app.brand': 'Sigil',
    'app.blocks': 'Blocks',
    'app.layers': 'Layers',
    'app.panels': 'Panels',
    'app.panel_settings': 'Layers / Settings',
    'app.close_panel': 'Close panel',
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
    'app.paste': 'Paste',
    'app.move_up': 'Move Up',
    'app.move_down': 'Move Down',
    'app.delete': 'Delete',
    'app.context_menu': 'Node actions',
    'app.copied': 'Copied',
    'app.download': 'Download .html',
    'app.close': 'Close',
    'app.empty_title': 'Drag a block from the left',
    'app.empty_body':
      'Drop blocks onto the canvas, or focus one and press Enter or Space. Select it to edit content and styles on the right.',
    'app.empty_tip': 'Ctrl/Cmd+S to save · Export downloads HTML',
    'app.save_as_template': 'Save as Template',
    'app.template_name': 'Template name',
    'app.theme': 'Theme',
    'app.theme_auto': 'Auto',
    'app.theme_light': 'Light',
    'app.theme_dark': 'Dark',
    'blocks.search_placeholder': 'Search blocks…',
    'blocks.search_label': 'Search blocks',
    'blocks.insert': 'Insert',
    'blocks.default_category': 'General',
    'blocks.empty': 'No matching blocks',
    'layers.title': 'Layers',
    'layers.show': 'Show',
    'layers.hide': 'Hide',
    'layers.lock': 'Lock',
    'layers.unlock': 'Unlock',
    'layers.rename_prompt': 'Layer name',
    'media.title': 'Media library',
    'media.close': 'Close',
    'media.upload': 'Upload image',
    'media.empty': 'No media yet',
    'props.title': 'Properties',
    'props.empty': 'No node selected',
    'props.content': 'Content',
    'props.node_id_open': ' (',
    'props.node_id_close': ')',
    'style.title': 'Styles',
    'inspector.tab_content': 'Content',
    'inspector.tab_style': 'Style',
    'inspector.tab_advanced': 'Advanced',
    'inspector.empty': 'No component selected',
    'inspector.empty_hint':
      'Select a block on the canvas to edit its content, styles, and advanced properties.',
    'inspector.no_content': 'This node has no editable content fields. Use the Style tab instead.',
    'inspector.image': 'Image',
    'inspector.layout': 'Layout',
    'inspector.typography': 'Typography',
    'inspector.appearance': 'Appearance',
    'inspector.delete_component': 'Delete component',
    'form.add': 'Add',
    'form.delete': 'Delete',
    'form.pick_image': 'Choose image',
    'form.load_unavailable': 'Unavailable',
    'form.loading': 'Loading…',
    'form.load_failed': 'Failed to load',
    'form.label_separator': ': ',
    'style.base': 'Base styles',
    'style.inherit_desktop': 'Inherits Desktop when not overridden',
    'style.inherit_tablet_desktop': 'Inherits Tablet, then Desktop, when not overridden',
    'style.override': 'Override',
    'style.inherit': 'Inherited',
    'style.unset': 'Not set',
    'style.unset_short': 'Not set',
    'style.use_inheritance': 'Use inherited',
    'style.clear': 'Clear',
    'style.clear_desktop': 'Clear Desktop styles',
    'status.none': 'Nothing selected',
  },
}

export interface AppOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  store?: ProjectStore
  /** 媒體庫 */
  assets?: AssetStore
  /** Record 工廠或 defineBlock 列表 */
  blocks?: BlocksInput
  /** 範本庫 adapter，傳入後啟用「另存為範本」命令 */
  templates?: TemplateStore
  shortcodes?: ShortcodeDefinition[]
  trustedTypesPolicyName?: string
  sanitize?: SanitizeFn
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
  locale?: Locale
  /** 主題：light／dark／auto；未傳時讀 localStorage，預設 auto */
  theme?: ThemeChoice
  /** 額外命令可覆寫同 id 預設 */
  commands?: CommandDefinition[]
  /** 生命週期 hooks */
  hooks?: EditorHooks
}

export interface SigilApp {
  engine: Engine
  toJSON(): SigilDoc
  toHTML(mode?: HtmlMode): string
  /** 是否有未存檔變更 */
  isDirty(): boolean
  /** 執行已註冊命令 */
  runCommand(id: string): Promise<boolean>
  destroy(): void
}

export { defineCommand, createDefaultEditingCommands }
export type { CommandDefinition, CommandContext, EditorHooks }

type CompactPanel = 'blocks' | 'settings'

const COMPACT_LAYOUT_BREAKPOINT = 900

/**
 * 開箱即用產品殼 — Design tokens + Topbar + 三欄 + Inspector 分頁
 */
export function createApp(opts: AppOptions): SigilApp {
  ensureTokens()
  const mountTarget =
    typeof opts.mount === 'string' ? document.querySelector<HTMLElement>(opts.mount) : opts.mount
  if (!mountTarget) throw new Error('createApp：mount 目標不存在')
  const mountEl = mountTarget

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
  let compactLayout = false
  let activePanel: CompactPanel | null = null
  let clipboard: ComponentNode | null = null
  let closeExportDialog: (() => void) | null = null
  const hooks = opts.hooks

  async function doSave(): Promise<SigilDoc> {
    try {
      let doc = engine.toJSON()
      doc = await runBeforeSave(hooks, doc, engine)
      await Promise.resolve(store.save(doc))
      await runAfterSave(hooks, doc, engine)
      dirty = false
      statusMsg.textContent = i18n.t('app.saved_msg')
      refreshChrome()
      return doc
    } catch {
      statusMsg.textContent = i18n.t('app.save_fail')
      refreshChrome()
      return engine.toJSON()
    }
  }

  const commandMap = new Map<string, CommandDefinition>()
  for (const c of createDefaultEditingCommands()) commandMap.set(c.id, c)
  // 註冊殼層匯出命令
  commandMap.set(
    'export',
    defineCommand({
      id: 'export',
      label: i18n.t('app.export'),
      toolbar: true,
      toolbarGroup: 'end',
      run: () => {
        openExportDialog()
      },
    }),
  )
  // 範本：另存為範本命令（閉包捕獲 templateStore 與 blocksPanel）
  if (opts.templates) {
    commandMap.set(
      'save-as-template',
      defineCommand({
        id: 'save-as-template',
        label: i18n.t('app.save_as_template'),
        toolbar: true,
        toolbarGroup: 'main',
        when: (c) => {
          const id = c.engine.getSelection()
          return !!id && id !== c.engine.getTree().id
        },
        run: async (c) => {
          const id = c.engine.getSelection()
          if (!id) return
          const node = findNode(c.engine.getTree(), id)
          if (!node) return
          const label = window.prompt(i18n.t('app.template_name'), node.name?.trim() || node.type)
          if (!label) return
          await Promise.resolve(opts.templates!.save({ id: createId(), label, node }))
          reloadTemplates()
        },
      }),
    )
  }
  for (const c of opts.commands ?? []) commandMap.set(c.id, c)
  const commands = createCommandRegistry([...commandMap.values()])
  /** Topbar 上的命令按鈕，refreshChrome 依 when／dirty 更新 disabled */
  const cmdButtons = new Map<string, HTMLButtonElement>()

  function makeCtx(): CommandContext {
    return {
      engine,
      getDoc: () => engine.toJSON(),
      save: () => {
        void doSave()
      },
      clipboard: {
        get: () => clipboard,
        set: (n) => {
          clipboard = n
        },
      },
    }
  }

  function commandLabel(cmd: CommandDefinition): string {
    const known: Record<string, string> = {
      undo: i18n.t('app.undo'),
      redo: i18n.t('app.redo'),
      copy: i18n.t('app.copy'),
      paste: i18n.t('app.paste'),
      'move-up': i18n.t('app.move_up'),
      'move-down': i18n.t('app.move_down'),
      delete: i18n.t('app.delete'),
      save: i18n.t('app.save'),
      export: i18n.t('app.export'),
    }
    return known[cmd.id] ?? cmd.label ?? cmd.id
  }

  function shortcutTitle(cmd: CommandDefinition): string | undefined {
    if (!cmd.shortcut) return undefined
    const raw = Array.isArray(cmd.shortcut) ? cmd.shortcut[0]! : cmd.shortcut
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    return raw
      .replace(/mod/gi, isMac ? '⌘' : 'Ctrl')
      .replace(/shift/gi, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, isMac ? '' : '+')
  }

  function mountCommandButton(
    cmd: CommandDefinition,
    group: HTMLElement,
    forcePrimary = false,
  ): HTMLButtonElement {
    const primary = forcePrimary || cmd.toolbar === 'primary'
    const b = btn(
      commandLabel(cmd),
      () => {
        void commands.run(cmd.id, makeCtx())
      },
      !primary,
    )
    if (primary) b.classList.add('sigil-btn--primary')
    b.dataset.commandId = cmd.id
    const tip = shortcutTitle(cmd)
    if (tip) b.title = tip
    group.appendChild(b)
    cmdButtons.set(cmd.id, b)
    return b
  }

  mountEl.replaceChildren()
  const root = document.createElement('div')
  root.className = 'sigil-app'
  mountEl.appendChild(root)

  // —— 主題：opts > localStorage > auto ——
  function readStoredTheme(): ThemeChoice {
    try {
      const v = localStorage.getItem('sigil-theme')
      if (v === 'light' || v === 'dark' || v === 'auto') return v
    } catch {
      /* 隱私模式或 SSR */
    }
    return 'auto'
  }
  let themeChoice: ThemeChoice = opts.theme ?? readStoredTheme()
  let cleanupTheme = applyTheme(root, themeChoice)
  function writeStoredTheme(c: ThemeChoice): void {
    try {
      localStorage.setItem('sigil-theme', c)
    } catch {
      /* ignore */
    }
  }
  function themeLabel(c: ThemeChoice): string {
    return i18n.t(
      c === 'auto' ? 'app.theme_auto' : c === 'light' ? 'app.theme_light' : 'app.theme_dark',
    )
  }

  // —— Topbar 命令分組 ——
  const topbar = document.createElement('header')
  topbar.className = 'sigil-topbar'

  const brand = document.createElement('div')
  brand.className = 'sigil-topbar-brand'
  brand.textContent = i18n.t('app.brand')

  const compactControls = document.createElement('div')
  compactControls.className = 'sigil-topbar-group sigil-compact-controls'
  compactControls.setAttribute('aria-label', i18n.t('app.panels'))
  const panelIdSuffix = createId()
  const blocksDrawerId = `sigil-blocks-drawer-${panelIdSuffix}`
  const settingsDrawerId = `sigil-settings-drawer-${panelIdSuffix}`
  const blocksToggle = btn(i18n.t('app.blocks'), () => toggleCompactPanel('blocks'), true)
  blocksToggle.dataset.panelToggle = 'blocks'
  blocksToggle.setAttribute('aria-controls', blocksDrawerId)
  const settingsToggle = btn(
    i18n.t('app.panel_settings'),
    () => toggleCompactPanel('settings'),
    true,
  )
  settingsToggle.dataset.panelToggle = 'settings'
  settingsToggle.setAttribute('aria-controls', settingsDrawerId)
  compactControls.append(blocksToggle, settingsToggle)

  const hist = document.createElement('div')
  hist.className = 'sigil-topbar-group'
  hist.dataset.toolbarGroup = 'history'
  for (const id of ['undo', 'redo']) {
    const cmd = commands.get(id)
    if (cmd?.toolbar) mountCommandButton(cmd, hist)
  }
  // 宿主把命令放到 history 組
  for (const cmd of commands.list()) {
    if (!cmd.toolbar) continue
    if (cmd.toolbarGroup !== 'history') continue
    if (cmd.id === 'undo' || cmd.id === 'redo') continue
    mountCommandButton(cmd, hist)
  }

  const sep1 = el('div', 'sigil-topbar-sep')

  const devices = document.createElement('div')
  devices.className = 'sigil-topbar-group'
  const deviceBtns: Record<CanvasDevice, HTMLButtonElement> = {
    desktop: btn('Desktop', () => setDevice('desktop'), true),
    tablet: btn('Tablet', () => setDevice('tablet'), true),
    mobile: btn('Mobile', () => setDevice('mobile'), true),
  }
  for (const [key, button] of Object.entries(deviceBtns)) button.dataset.device = key
  devices.append(deviceBtns.desktop, deviceBtns.tablet, deviceBtns.mobile)

  const sep2 = el('div', 'sigil-topbar-sep')

  const modes = document.createElement('div')
  modes.className = 'sigil-topbar-group'
  const editBtn = btn(i18n.t('canvas.edit'), () => setMode('edit'), true)
  const previewBtn = btn(i18n.t('canvas.preview'), () => setMode('preview'), true)
  modes.append(editBtn, previewBtn)

  const spacer = el('div', 'sigil-topbar-spacer')

  // main 自訂命令
  const customBar = document.createElement('div')
  customBar.className = 'sigil-topbar-group'
  customBar.dataset.toolbarGroup = 'main'
  for (const cmd of commands.list()) {
    if (!cmd.toolbar) continue
    const group = cmd.toolbarGroup ?? 'main'
    if (group !== 'main') continue
    if (cmd.id === 'undo' || cmd.id === 'redo' || cmd.id === 'save' || cmd.id === 'export') continue
    mountCommandButton(cmd, customBar)
  }

  const actions = document.createElement('div')
  actions.className = 'sigil-topbar-group'
  actions.dataset.toolbarGroup = 'end'
  // end 組：內建 save／export + 宿主 toolbarGroup end
  const endOrder = ['save', 'export']
  for (const id of endOrder) {
    const cmd = commands.get(id)
    if (cmd?.toolbar) mountCommandButton(cmd, actions, cmd.toolbar === 'primary')
  }
  for (const cmd of commands.list()) {
    if (!cmd.toolbar) continue
    if (cmd.toolbarGroup !== 'end') continue
    if (endOrder.includes(cmd.id)) continue
    mountCommandButton(cmd, actions, cmd.toolbar === 'primary')
  }
  const themeBtn = btn(
    themeLabel(themeChoice),
    () => {
      cleanupTheme()
      themeChoice = nextTheme(themeChoice)
      cleanupTheme = applyTheme(root, themeChoice)
      writeStoredTheme(themeChoice)
      themeBtn.textContent = themeLabel(themeChoice)
      themeBtn.setAttribute('aria-label', `${i18n.t('app.theme')}: ${themeLabel(themeChoice)}`)
      refreshChrome()
    },
    true,
  )
  themeBtn.title = i18n.t('app.theme')
  themeBtn.setAttribute('aria-label', `${i18n.t('app.theme')}: ${themeLabel(themeChoice)}`)
  actions.append(themeBtn)

  const helpBtn = btn(i18n.t('app.help'), () => {
    helpOpen = !helpOpen
    helpPanel.hidden = !helpOpen
  })
  helpBtn.dataset.commandId = 'help'
  actions.append(helpBtn)

  const topbarParts: HTMLElement[] = [
    brand,
    compactControls,
    hist,
    sep1,
    devices,
    sep2,
    modes,
    spacer,
  ]
  if (customBar.childNodes.length) topbarParts.push(customBar)
  topbarParts.push(actions)
  topbar.append(...topbarParts)

  // —— Body ——
  const body = el('div', 'sigil-body')

  const sidebar = el('aside', 'sigil-sidebar')
  sidebar.id = blocksDrawerId
  sidebar.dataset.compactPanel = 'blocks'
  sidebar.setAttribute('aria-label', i18n.t('app.blocks'))
  const blocksHead = el('div', 'sigil-panel-head')
  const blocksTitle = document.createElement('h3')
  blocksTitle.className = 'sigil-sidebar-title'
  blocksTitle.textContent = i18n.t('app.blocks')
  const blocksClose = btn('×', () => closeCompactPanel(), true)
  blocksClose.classList.add('sigil-panel-close')
  blocksClose.setAttribute('aria-label', i18n.t('app.close_panel'))
  blocksHead.append(blocksTitle, blocksClose)
  const blocksBox = document.createElement('div')
  sidebar.append(blocksHead, blocksBox)

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
  right.id = settingsDrawerId
  right.dataset.compactPanel = 'settings'
  right.setAttribute('aria-label', i18n.t('app.panel_settings'))
  const settingsHead = el('div', 'sigil-panel-head sigil-panel-head--settings')
  const layersTitle = document.createElement('h3')
  layersTitle.className = 'sigil-sidebar-title'
  layersTitle.textContent = i18n.t('app.layers')
  const settingsClose = btn('×', () => closeCompactPanel(), true)
  settingsClose.classList.add('sigil-panel-close')
  settingsClose.setAttribute('aria-label', i18n.t('app.close_panel'))
  settingsHead.append(layersTitle, settingsClose)
  const layersBox = el('div', 'sigil-layers-box')
  const inspectorBox = document.createElement('div')
  right.append(settingsHead, layersBox, inspectorBox)

  const panelBackdrop = el('div', 'sigil-panel-backdrop')
  panelBackdrop.hidden = true
  panelBackdrop.setAttribute('aria-hidden', 'true')
  panelBackdrop.addEventListener('click', () => closeCompactPanel())

  body.append(sidebar, canvasWrap, right, panelBackdrop)

  // —— Status ——
  const status = el('footer', 'sigil-status')
  const statusSel = document.createElement('span')
  const statusDirty = document.createElement('span')
  const statusMsg = document.createElement('span')
  status.append(statusSel, statusDirty, statusMsg)

  root.append(topbar, body, status)

  function getPanel(panel: CompactPanel): HTMLElement {
    return panel === 'blocks' ? sidebar : right
  }

  function getPanelToggle(panel: CompactPanel): HTMLButtonElement {
    return panel === 'blocks' ? blocksToggle : settingsToggle
  }

  function refreshCompactPanels(): void {
    root.classList.toggle('sigil-app--compact', compactLayout)
    root.dataset.layout = compactLayout ? 'compact' : 'desktop'

    for (const panel of ['blocks', 'settings'] as const) {
      const drawer = getPanel(panel)
      const toggle = getPanelToggle(panel)
      const open = compactLayout && activePanel === panel
      drawer.dataset.open = String(open)
      drawer.inert = compactLayout && !open
      drawer.setAttribute('aria-hidden', String(compactLayout && !open))
      toggle.setAttribute('aria-expanded', String(open))
      toggle.classList.toggle('sigil-btn--active', open)
    }

    panelBackdrop.hidden = !compactLayout || activePanel === null
  }

  function setCompactLayout(next: boolean): void {
    if (compactLayout === next && root.dataset.layout) return
    compactLayout = next
    if (!next) activePanel = null
    refreshCompactPanels()
  }

  function toggleCompactPanel(panel: CompactPanel): void {
    if (!compactLayout) return
    if (activePanel === panel) {
      closeCompactPanel()
      return
    }
    activePanel = panel
    refreshCompactPanels()
  }

  function closeCompactPanel(restoreFocus = true): void {
    if (!compactLayout || !activePanel) return
    const previous = activePanel
    activePanel = null
    refreshCompactPanels()
    if (restoreFocus) getPanelToggle(previous).focus()
  }

  function updateLayoutFromWidth(width: number): void {
    if (width <= 0) return
    setCompactLayout(width < COMPACT_LAYOUT_BREAKPOINT)
  }

  function measureLayout(): void {
    const width = root.getBoundingClientRect().width || mountEl.getBoundingClientRect().width
    updateLayoutFromWidth(width)
  }

  let layoutObserver: ResizeObserver | null = null
  const onWindowResize = (): void => measureLayout()
  if (typeof ResizeObserver !== 'undefined') {
    layoutObserver = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === root) ?? entries[0]
      updateLayoutFromWidth(entry?.contentRect.width ?? 0)
    })
    layoutObserver.observe(root)
  } else {
    window.addEventListener('resize', onWindowResize)
  }
  refreshCompactPanels()
  measureLayout()

  function onCompactPanelKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !compactLayout || !activePanel) return
    e.preventDefault()
    closeCompactPanel()
  }
  document.addEventListener('keydown', onCompactPanelKeyDown)

  // 依命令狀態組裝右鍵選單
  let closeMenu: (() => void) | null = null
  function openSelectionMenu(x: number, y: number): void {
    closeMenu?.()
    const ctx = makeCtx()
    const groups = [['copy', 'paste'], ['move-up', 'move-down'], ['delete']]
    const items: MenuItem[] = []
    for (const group of groups) {
      const actions: MenuItem[] = []
      for (const id of group) {
        const cmd = commands.get(id)
        if (!cmd) continue
        if (cmd.when && !cmd.when(ctx)) continue
        actions.push({
          id,
          label: commandLabel(cmd),
          run: () => {
            void commands.run(id, makeCtx())
          },
        })
      }
      if (!actions.length) continue
      if (items.length) items.push({ separator: true })
      items.push(...actions)
    }
    if (!items.length) return
    closeMenu = openContextMenu({
      items,
      x,
      y,
      theme: root.classList.contains('sigil-theme-dark') ? 'dark' : 'light',
      ariaLabel: i18n.t('app.context_menu'),
      onClose: () => (closeMenu = null),
    })
  }

  const canvas = createCanvas(engine, canvasBox, {
    rendererOptions: { shortcodeResolver },
    i18n,
    chrome: false,
    onContextMenu: (_id, x, y) => openSelectionMenu(x, y),
  })
  // empty guide 不攔截 pointer
  emptyGuide.style.pointerEvents = 'none'
  const inspector = createInspector(engine, inspectorBox, {
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
    assets: opts.assets,
    i18n,
    fetchJSON,
  })
  const unsubDevice = canvas.subscribeDevice((next) => inspector.setDevice(next))
  const layers = createLayersPanel(engine, layersBox, {
    i18n,
    ariaLabel: i18n.t('app.layers'),
    onContextMenu: (_id, x, y) => {
      openSelectionMenu(x, y)
    },
  })
  // 合併靜態區塊與範本；有任一來源即建立面板
  const templateStore = opts.templates
  const hasTemplates = !!templateStore
  const mergedBlocks: BlocksInput | null = opts.blocks
    ? Array.isArray(opts.blocks)
      ? [...opts.blocks]
      : { ...opts.blocks }
    : hasTemplates
      ? []
      : null

  const blocksPanel = mergedBlocks
    ? createBlocksPanel(engine, blocksBox, canvas.iframe, mergedBlocks, { i18n })
    : null

  /** 重新從 store 載入範本並合併進面板 */
  function reloadTemplates(): void {
    if (!templateStore || !blocksPanel) return
    void Promise.resolve(templateStore.list()).then((templates) => {
      const tplBlocks = templates.map(templateToBlockDef)
      const base = opts.blocks
        ? Array.isArray(opts.blocks)
          ? [...opts.blocks]
          : { ...opts.blocks }
        : []
      const merged = Array.isArray(base) ? [...base, ...tplBlocks] : { ...base }
      blocksPanel.reload(merged)
    })
  }
  if (hasTemplates) reloadTemplates()

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
    const ctx = makeCtx()
    for (const [id, b] of cmdButtons) {
      const cmd = commands.get(id)
      if (!cmd) continue
      let disabled = cmd.when ? !cmd.when(ctx) : false
      // 無變更時禁用存檔
      if (id === 'save') disabled = disabled || !dirty
      b.disabled = disabled
    }
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
      statusSel.textContent = n ? `${n.name?.trim() || n.type} · ${n.id}` : id
    }
    refreshEmptyGuide()
  }

  function openExportDialog(): void {
    closeExportDialog?.()
    const html = toHTML(engine.toJSON(), { shortcodeResolver })
    const previousFocus = document.activeElement
    let closed = false

    const backdrop = document.createElement('div')
    backdrop.className = 'sigil-dialog-backdrop'
    backdrop.setAttribute('role', 'dialog')
    backdrop.setAttribute('aria-modal', 'true')
    backdrop.tabIndex = -1

    const panel = document.createElement('div')
    panel.className = 'sigil-dialog-panel sigil-dialog-panel--wide'

    const head = document.createElement('div')
    head.className = 'sigil-dialog-head'
    const title = document.createElement('h3')
    title.id = `sigil-export-title-${createId()}`
    title.textContent = i18n.t('app.export_title')
    backdrop.setAttribute('aria-labelledby', title.id)
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
        statusMsg.textContent = ok ? i18n.t('app.copied') : `HTML ${html.length} chars`
        if (ok) copyBtn.textContent = i18n.t('app.copied')
      })
    })
    copyBtn.classList.add('sigil-btn--primary')
    const dlBtn = btn(i18n.t('app.download'), () => downloadText(html, 'sigil-page.html'))
    actionsRow.append(
      copyBtn,
      dlBtn,
      btn(i18n.t('app.close'), () => close()),
    )

    panel.append(head, hint, ta, actionsRow)
    backdrop.appendChild(panel)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close()
    })
    document.body.appendChild(backdrop)
    ta.focus()
    ta.select()

    function onDialogKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      trapFocus(e, backdrop)
    }
    document.addEventListener('keydown', onDialogKeyDown)

    function close(): void {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onDialogKeyDown)
      backdrop.remove()
      closeExportDialog = null
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
    closeExportDialog = close

    statusMsg.textContent = `HTML ${html.length} chars`
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'tree' || ev.type === 'patch') dirty = true
    if (ev.type === 'selection') runOnSelect(hooks, ev.id, engine)
    if (
      ev.type === 'history' ||
      ev.type === 'selection' ||
      ev.type === 'tree' ||
      ev.type === 'patch'
    ) {
      refreshChrome()
    }
  })
  refreshChrome()
  runAfterLoad(hooks, engine.toJSON(), engine)

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!dirty) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  function onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const cmd = commands.match(e, makeCtx())
    if (!cmd) return
    e.preventDefault()
    void commands.run(cmd.id, makeCtx())
  }
  document.addEventListener('keydown', onKeyDown)

  const api: SigilApp = {
    engine,
    toJSON() {
      const doc = engine.toJSON()
      void doSave()
      return doc
    },
    toHTML(htmlMode?: HtmlMode) {
      return toHTML(engine.toJSON(), { shortcodeResolver, mode: htmlMode })
    },
    isDirty() {
      return dirty
    },
    runCommand(id: string) {
      return commands.run(id, makeCtx())
    },
    destroy() {
      runBeforeDestroy(hooks, engine)
      closeExportDialog?.()
      closeMenu?.()
      cleanupTheme()
      layoutObserver?.disconnect()
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('keydown', onCompactPanelKeyDown)
      document.removeEventListener('keydown', onKeyDown)
      unsub()
      unsubDevice()
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

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  )
}

function trapFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return
  const focusable = focusableElements(root)
  if (!focusable.length) {
    event.preventDefault()
    root.focus()
    return
  }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
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

export { SIGIL_APP_VERSION } from './version.js'
