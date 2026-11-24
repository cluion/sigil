import {
  createEngine,
  createDefaultPolicy,
  escapeHtml,
  toHTML,
  createEventBus,
  createStore,
  findNode,
  createId,
  createI18n,
  createCommandRegistry,
  createDefaultEditingCommands,
  defineCommand,
  createProjectPersistence,
  RESPONSIVE_BREAKPOINT_WIDTHS,
  runOnSelect,
  runAfterLoad,
  runBeforeDestroy,
  type Engine,
  type SigilDoc,
  type SanitizeFn,
  type HtmlMode,
  type ComponentNode,
  type Locale,
  type MessageCatalog,
  type MessageOverrides,
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
  createTemplateLibraryController,
  openMediaPicker,
  applyTheme,
  nextTheme,
  openContextMenu,
  type BlocksInput,
  type CanvasDevice,
  type CanvasMode,
  type ThemeChoice,
  type MenuItem,
  type TemplateLibraryController,
  type RichTextAdapter,
} from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import {
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'
import { blockImage, templateToBlockDef } from '@cluion/sigil-blocks'
import exportPageTemplate from './export-page.html?raw'
import { ensureTokens } from './tokens.js'

const i18nMessages = {
  zh: {
    'canvas.title': '編輯畫布',
    'canvas.edit': '編輯',
    'canvas.preview': '預覽',
    'canvas.empty_container': '拖入元件',
    'app.brand': 'Sigil',
    'app.blocks': '區塊',
    'app.layers': '圖層',
    'app.panels': '面板',
    'app.panel_settings': '圖層／設定',
    'app.tools': '更多工具',
    'app.more': '更多',
    'app.edit_selection': '編輯所選元件',
    'app.component_settings': '元件設定',
    'app.structure': '頁面結構',
    'app.current_page': '目前頁面',
    'app.untitled_page': '未命名頁面',
    'app.add_blocks': '新增區塊',
    'app.page_styles': '頁面樣式',
    'app.assets': '素材庫',
    'app.insert_image': '插入圖片至頁尾',
    'app.insert_unavailable': '目前無法在頁尾插入圖片。',
    'app.close_panel': '關閉面板',
    'app.save': '存檔',
    'app.export': '匯出',
    'app.help': '快捷鍵',
    'app.help_delete': 'Delete / Backspace — 刪除',
    'app.help_undo': 'Ctrl/Cmd+Z — 復原',
    'app.help_redo': 'Ctrl/Cmd+Shift+Z / Y — 重做',
    'app.help_copy_paste': 'Ctrl/Cmd+C / V — 複製貼上',
    'app.help_save': 'Ctrl/Cmd+S — 存檔',
    'app.undo': '復原',
    'app.redo': '重做',
    'app.dirty': '未儲存',
    'app.saved': '已儲存',
    'app.saved_msg': '已寫入 ProjectStore',
    'app.saving': '儲存中…',
    'app.saved_pending': '先前修改已儲存；仍有未儲存變更',
    'app.save_fail': '存檔失敗',
    'app.export_title': '匯出 HTML',
    'app.export_hint': '下載可直接開啟的網頁檔，或複製 HTML 片段嵌入其他頁面。',
    'app.export_source': 'HTML 片段',
    'app.export_preparing': '正在準備下載檔…',
    'app.download_original': '依原網址下載',
    'app.download_original_started': '已開始下載使用原網址的 HTML。',
    'app.export_fail': '下載失敗，請再試一次，或複製下方的 HTML 片段。',
    'app.copy_manual': '請複製已選取的 HTML 片段。',
    'app.copy': '複製',
    'app.paste': '貼上',
    'app.move_up': '上移',
    'app.move_down': '下移',
    'app.delete': '刪除',
    'app.context_menu': '節點操作',
    'app.copied': '已複製',
    'app.download': '下載 .html',
    'app.close': '關閉',
    'app.empty_title': '這是一張空白頁面',
    'app.empty_body': '點選區塊加入頁面，或將區塊拖到畫布上的指定位置。',
    'app.empty_tip': '快捷鍵 Ctrl/Cmd+S 存檔 · 匯出可下載 HTML',
    'app.save_as_template': '存為範本',
    'app.template_name': '範本名稱',
    'app.theme': '主題',
    'app.theme_auto': '自動',
    'app.theme_light': '亮色',
    'app.theme_dark': '暗色',
    'app.characters': '字元',
    'blocks.search_placeholder': '搜尋區塊…',
    'blocks.search_label': '搜尋區塊',
    'blocks.insert': '插入',
    'blocks.default_category': '一般',
    'blocks.empty': '無符合區塊',
    'blocks.actions': '範本操作',
    'blocks.rename': '重新命名',
    'blocks.rename_prompt': '範本名稱',
    'blocks.remove': '刪除',
    'blocks.remove_confirm_before': '確定刪除範本「',
    'blocks.remove_confirm_after': '」？',
    'blocks.pending': '處理中',
    'blocks.templates_loading': '正在載入範本…',
    'blocks.template_saving': '正在儲存範本…',
    'blocks.template_removing': '正在刪除範本…',
    'blocks.templates_load_failed': '範本載入失敗',
    'blocks.template_save_failed': '範本儲存失敗',
    'blocks.template_remove_failed': '範本刪除失敗',
    'blocks.retry': '重試',
    'layers.title': '圖層',
    'layers.expand': '展開子圖層',
    'layers.collapse': '收合子圖層',
    'canvas.component_actions': '元件操作',
    'canvas.select_parent': '選取父層',
    'canvas.duplicate': '複製元件',
    'canvas.replace_image': '更換圖片',
    'canvas.delete': '刪除元件',
    'canvas.command_failed': '操作失敗，請再試一次。',
    'layers.show': '顯示',
    'layers.hide': '隱藏',
    'layers.lock': '鎖定',
    'layers.unlock': '解鎖',
    'layers.rename_prompt': '圖層名稱',
    'media.title': '媒體庫',
    'media.search': '搜尋圖片名稱',
    'media.current': '使用中',
    'media.empty_search': '沒有符合的圖片，請試試其他名稱。',
    'media.close': '關閉',
    'media.upload': '上傳圖片',
    'media.empty': '尚無媒體',
    'media.loading': '正在載入媒體…',
    'media.load_failed': '媒體載入失敗',
    'media.retry': '重試',
    'media.uploading': '正在上傳…',
    'media.upload_failed': '圖片上傳失敗',
    'media.retry_upload': '重試上傳',
    'props.title': '屬性',
    'props.empty': '未選取節點',
    'props.content': '內容',
    'props.node_id_open': '（',
    'props.node_id_close': '）',
    'style.title': '樣式',
    'style.property.margin': '外距',
    'style.property.padding': '內距',
    'style.spacing.compact': '緊湊',
    'style.spacing.standard': '標準',
    'style.spacing.spacious': '寬鬆',
    'style.property.width': '寬度',
    'style.property.height': '高度',
    'style.property.display': '顯示方式',
    'style.property.font-size': '字級',
    'style.property.font-weight': '字重',
    'style.property.text-align': '文字對齊',
    'style.property.color': '文字顏色',
    'style.property.background-color': '背景顏色',
    'style.property.border': '邊框',
    'style.property.border-radius': '圓角',
    'style.property.box-shadow': '陰影',
    'inspector.tab_content': '內容',
    'inspector.tab_style': '樣式',
    'inspector.tab_advanced': '進階',
    'inspector.empty': '尚未選取元件',
    'inspector.empty_hint': '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。',
    'inspector.no_content': '此節點無可編輯內容欄位，可切到樣式分頁',
    'inspector.image': '圖片',
    'inspector.embedded_image': '已嵌入圖片',
    'inspector.replace_image_url': '貼上圖片網址以更換',
    'link.section': '連到頁內區段',
    'link.address': '連結網址',
    'link.apply': '套用',
    'link.choose': '選擇區段…',
    'link.invalid': '請輸入有效的網址或選擇頁內區段。',
    'inspector.image_alt': '替代文字',
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
    'device.desktop': '桌面',
    'device.group': '畫布裝置',
    'device.tablet': '平板',
    'device.mobile': '手機',
    'style.inherit_desktop': '未覆寫時沿用桌面樣式',
    'style.inherit_tablet_desktop': '未覆寫時沿用平板或桌面樣式',
    'style.override': '覆寫',
    'style.inherit': '繼承',
    'style.unset': '未設定',
    'style.unset_short': '未設',
    'style.use_inheritance': '使用繼承',
    'style.clear': '清除',
    'style.clear_desktop': '清除桌面樣式',
    'rich_text.summary': '富文字摘要',
    'rich_text.empty': '空白富文字',
    'rich_text.canvas_hint': '請在畫布編輯富文字',
    'status.none': '未選取',
  },
  en: {
    'canvas.title': 'Canvas',
    'canvas.edit': 'Edit',
    'canvas.preview': 'Preview',
    'canvas.empty_container': 'Drop components here',
    'app.brand': 'Sigil',
    'app.blocks': 'Blocks',
    'app.layers': 'Layers',
    'app.panels': 'Panels',
    'app.panel_settings': 'Layers / Settings',
    'app.tools': 'More tools',
    'app.more': 'More',
    'app.edit_selection': 'Edit selection',
    'app.component_settings': 'Component settings',
    'app.structure': 'Page structure',
    'app.current_page': 'Current page',
    'app.untitled_page': 'Untitled page',
    'app.add_blocks': 'Add blocks',
    'app.page_styles': 'Page styles',
    'app.assets': 'Assets',
    'app.insert_image': 'Insert image at end of page',
    'app.insert_unavailable': 'An image cannot be inserted at the end of this page.',
    'app.close_panel': 'Close panel',
    'app.save': 'Save',
    'app.export': 'Export',
    'app.help': 'Keys',
    'app.help_delete': 'Delete / Backspace — Delete',
    'app.help_undo': 'Ctrl/Cmd+Z — Undo',
    'app.help_redo': 'Ctrl/Cmd+Shift+Z / Y — Redo',
    'app.help_copy_paste': 'Ctrl/Cmd+C / V — Copy / Paste',
    'app.help_save': 'Ctrl/Cmd+S — Save',
    'app.undo': 'Undo',
    'app.redo': 'Redo',
    'app.dirty': 'Unsaved',
    'app.saved': 'Saved',
    'app.saved_msg': 'Saved to ProjectStore',
    'app.saving': 'Saving…',
    'app.saved_pending': 'Earlier changes saved; newer changes are unsaved',
    'app.save_fail': 'Save failed',
    'app.export_title': 'Export HTML',
    'app.export_hint':
      'Download a page you can open in your browser, or copy HTML to embed elsewhere.',
    'app.export_source': 'HTML fragment',
    'app.export_preparing': 'Preparing download…',
    'app.download_original': 'Download with original URLs',
    'app.download_original_started': 'Started downloading HTML with the original URLs.',
    'app.export_fail': 'Download failed. Try again or copy the HTML fragment below.',
    'app.copy_manual': 'Copy the selected HTML fragment.',
    'app.copy': 'Copy',
    'app.paste': 'Paste',
    'app.move_up': 'Move Up',
    'app.move_down': 'Move Down',
    'app.delete': 'Delete',
    'app.context_menu': 'Node actions',
    'app.copied': 'Copied',
    'app.download': 'Download .html',
    'app.close': 'Close',
    'app.empty_title': 'This page is empty',
    'app.empty_body': 'Choose a block to add it, or drag it to a position on the canvas.',
    'app.empty_tip': 'Ctrl/Cmd+S to save · Export downloads HTML',
    'app.save_as_template': 'Save as Template',
    'app.template_name': 'Template name',
    'app.theme': 'Theme',
    'app.theme_auto': 'Auto',
    'app.theme_light': 'Light',
    'app.theme_dark': 'Dark',
    'app.characters': 'characters',
    'blocks.search_placeholder': 'Search blocks…',
    'blocks.search_label': 'Search blocks',
    'blocks.insert': 'Insert',
    'blocks.default_category': 'General',
    'blocks.empty': 'No matching blocks',
    'blocks.actions': 'Template actions',
    'blocks.rename': 'Rename',
    'blocks.rename_prompt': 'Template name',
    'blocks.remove': 'Delete',
    'blocks.remove_confirm_before': 'Delete template “',
    'blocks.remove_confirm_after': '”?',
    'blocks.pending': 'Working on',
    'blocks.templates_loading': 'Loading templates…',
    'blocks.template_saving': 'Saving template…',
    'blocks.template_removing': 'Deleting template…',
    'blocks.templates_load_failed': 'Failed to load templates',
    'blocks.template_save_failed': 'Failed to save template',
    'blocks.template_remove_failed': 'Failed to delete template',
    'blocks.retry': 'Retry',
    'layers.title': 'Layers',
    'layers.expand': 'Expand children',
    'layers.collapse': 'Collapse children',
    'canvas.component_actions': 'Component actions',
    'canvas.select_parent': 'Select parent',
    'canvas.duplicate': 'Duplicate component',
    'canvas.replace_image': 'Replace image',
    'canvas.delete': 'Delete component',
    'canvas.command_failed': 'Action failed. Please try again.',
    'layers.show': 'Show',
    'layers.hide': 'Hide',
    'layers.lock': 'Lock',
    'layers.unlock': 'Unlock',
    'layers.rename_prompt': 'Layer name',
    'media.title': 'Media library',
    'media.search': 'Search images by name',
    'media.current': 'In use',
    'media.empty_search': 'No matching images. Try another name.',
    'media.close': 'Close',
    'media.upload': 'Upload image',
    'media.empty': 'No media yet',
    'media.loading': 'Loading media…',
    'media.load_failed': 'Failed to load media',
    'media.retry': 'Retry',
    'media.uploading': 'Uploading…',
    'media.upload_failed': 'Image upload failed',
    'media.retry_upload': 'Retry upload',
    'props.title': 'Properties',
    'props.empty': 'No node selected',
    'props.content': 'Content',
    'props.node_id_open': ' (',
    'props.node_id_close': ')',
    'style.title': 'Styles',
    'style.property.margin': 'Margin',
    'style.property.padding': 'Padding',
    'style.spacing.compact': 'Compact',
    'style.spacing.standard': 'Standard',
    'style.spacing.spacious': 'Spacious',
    'style.property.width': 'Width',
    'style.property.height': 'Height',
    'style.property.display': 'Display',
    'style.property.font-size': 'Font size',
    'style.property.font-weight': 'Font weight',
    'style.property.text-align': 'Text alignment',
    'style.property.color': 'Text color',
    'style.property.background-color': 'Background color',
    'style.property.border': 'Border',
    'style.property.border-radius': 'Corner radius',
    'style.property.box-shadow': 'Shadow',
    'inspector.tab_content': 'Content',
    'inspector.tab_style': 'Style',
    'inspector.tab_advanced': 'Advanced',
    'inspector.empty': 'No component selected',
    'inspector.empty_hint':
      'Select a block on the canvas to edit its content, styles, and advanced properties.',
    'inspector.no_content': 'This node has no editable content fields. Use the Style tab instead.',
    'inspector.image': 'Image',
    'inspector.embedded_image': 'Embedded image',
    'inspector.replace_image_url': 'Paste an image URL to replace it',
    'link.section': 'Link to section',
    'link.address': 'Link address',
    'link.apply': 'Apply',
    'link.choose': 'Choose a section…',
    'link.invalid': 'Enter a valid address or choose a section on this page.',
    'inspector.image_alt': 'Alternative text',
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
    'device.desktop': 'Desktop',
    'device.group': 'Canvas device',
    'device.tablet': 'Tablet',
    'device.mobile': 'Mobile',
    'style.inherit_desktop': 'Inherits Desktop when not overridden',
    'style.inherit_tablet_desktop': 'Inherits Tablet, then Desktop, when not overridden',
    'style.override': 'Override',
    'style.inherit': 'Inherited',
    'style.unset': 'Not set',
    'style.unset_short': 'Not set',
    'style.use_inheritance': 'Use inherited',
    'style.clear': 'Clear',
    'style.clear_desktop': 'Clear Desktop styles',
    'rich_text.summary': 'Rich text summary',
    'rich_text.empty': 'Empty rich text',
    'rich_text.canvas_hint': 'Edit rich text on the canvas',
    'status.none': 'Nothing selected',
  },
} satisfies MessageCatalog

export interface AppOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  store?: ProjectStore
  /** 依匯出快照指定下載頁面的標題；未提供時使用文件標題。 */
  getExportTitle?: (doc: SigilDoc) => string | undefined
  /** Prepare a copy of the dialog snapshot for the downloaded HTML. Closing the dialog aborts the signal. */
  prepareDownload?: (doc: SigilDoc, signal: AbortSignal) => SigilDoc | Promise<SigilDoc>
  /** 建立由宿主管理的頁面導覽，顯示於桌面的文件結構面板。 */
  renderPageNavigation?: () => HTMLElement
  /** 媒體庫 */
  assets?: AssetStore
  /** Record 工廠或 defineBlock 列表 */
  blocks?: BlocksInput
  /** 範本庫 adapter，傳入後啟用「另存為範本」命令 */
  templates?: TemplateStore
  shortcodes?: ShortcodeDefinition[]
  trustedTypesPolicyName?: string
  sanitize?: SanitizeFn
  /** 可選富文字 editor adapter，必須搭配 sanitize */
  richText?: RichTextAdapter
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
  /** 初始介面語系；預設 zh */
  locale?: Locale
  /** 依語系淺層覆寫內建產品字串 */
  messages?: MessageOverrides
  /** 主題：light／dark／auto；未傳時讀 localStorage，預設 auto */
  theme?: ThemeChoice
  /** 額外命令可覆寫同 id 預設 */
  commands?: CommandDefinition[]
  /** 生命週期 hooks */
  hooks?: EditorHooks
}

export interface SigilApp {
  engine: Engine
  /** Pure detached snapshot; use save() to write to ProjectStore. */
  toJSON(): SigilDoc
  /** Persist the revision captured at invocation; rejects on failure. */
  save(): Promise<SigilDoc>
  isSaving(): boolean
  toHTML(mode?: HtmlMode): string
  /** 是否有未存檔變更 */
  isDirty(): boolean
  /** 執行已註冊命令 */
  runCommand(id: string): Promise<boolean>
  /** 取得目前介面語系 */
  getLocale(): Locale
  /** 原地切換介面語系，不重建 engine */
  setLocale(locale: Locale): void
  /** 更新工作區所顯示的頁名；省略時使用文件 metadata。 */
  setDocumentTitle(title?: string): void
  destroy(): void
}

export { defineCommand, createDefaultEditingCommands }
export type { CommandDefinition, CommandContext, EditorHooks, RichTextAdapter }

type CompactPanel = 'blocks' | 'settings'

const COMPACT_LAYOUT_BREAKPOINT = 900

/**
 * 開箱即用產品殼 — Design tokens + Topbar + 三欄 + Inspector 分頁
 */
export function createApp(opts: AppOptions): SigilApp {
  if (opts.richText && !opts.sanitize) {
    throw new Error('createApp：richText 必須搭配 sanitize')
  }
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
  const i18n = createI18n(
    {
      zh: { ...i18nMessages.zh, ...opts.messages?.zh },
      en: { ...i18nMessages.en, ...opts.messages?.en },
    },
    opts.locale ?? 'zh',
  )
  const sharedStore = createStore()
  const shortcodeResolver = createShortcodeResolver({
    registry: shortcodeRegistry,
    policy,
    bus,
    fetchJSON,
    store: sharedStore,
  })

  let device: CanvasDevice = 'desktop'
  let initialDeviceResolved = false
  let mode: CanvasMode = 'edit'
  let helpOpen = false
  let compactLayout = false
  let activePanel: CompactPanel | null = null
  let desktopPanel: 'structure' | 'blocks' | null = 'structure'
  let workspaceTitle: string | undefined
  let closeAssetLibrary: (() => void) | null = null
  let panelTrigger: HTMLButtonElement | null = null
  let clipboard: ComponentNode | null = null
  let closeExportDialog: (() => void) | null = null
  let refreshExportDialog: (() => void) | null = null
  let refreshStatusMessage: (() => void) | null = null
  let templateLibrary: TemplateLibraryController | null = null
  let destroyed = false
  const hooks = opts.hooks
  let persistenceReady = false
  let inlineDirty = false
  const persistence = createProjectPersistence({
    engine,
    store,
    hooks,
    onStateChange: () => {
      if (persistenceReady) refreshChrome()
    },
  })

  function setStatusMessage(render: () => string): void {
    refreshStatusMessage = () => {
      statusMsg.textContent = render()
    }
    refreshStatusMessage()
  }

  function reportSaveStatus(render: () => string): void {
    if (destroyed) return
    try {
      setStatusMessage(render)
      refreshChrome()
    } catch {
      // Host UI callbacks cannot change the acknowledged storage outcome.
    }
  }

  function isDirty(): boolean {
    return inlineDirty || persistence.isDirty()
  }

  function commitForSave(): void {
    try {
      canvas.commitEditing({ forSave: true })
    } catch (error) {
      reportSaveStatus(() => i18n.t('app.save_fail'))
      throw error
    }
  }

  async function doSave(): Promise<SigilDoc> {
    commitForSave()
    let doc: SigilDoc
    try {
      doc = await persistence.save()
    } catch (error) {
      reportSaveStatus(() => i18n.t('app.save_fail'))
      throw error
    }
    reportSaveStatus(() => i18n.t(isDirty() ? 'app.saved_pending' : 'app.saved_msg'))
    return doc
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
  // 範本：另存為範本命令
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
          const label = window
            .prompt(i18n.t('app.template_name'), node.name?.trim() || node.type)
            ?.trim()
          if (!label) return
          await templateLibrary?.save({ id: createId(), label, node })
        },
      }),
    )
  }
  for (const c of opts.commands ?? []) {
    commandMap.set(
      c.id,
      c.id === 'save'
        ? {
            ...c,
            run(ctx) {
              commitForSave()
              return c.run(ctx)
            },
          }
        : c,
    )
  }
  const commands = createCommandRegistry([...commandMap.values()])
  /** Topbar 上的命令按鈕，refreshChrome 依 when／dirty 更新 disabled */
  const cmdButtons = new Map<string, HTMLButtonElement>()

  function makeCtx(): CommandContext {
    return {
      engine,
      getDoc: () => engine.toJSON(),
      save: async () => {
        await doSave()
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
      'save-as-template': i18n.t('app.save_as_template'),
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
        void commands.run(cmd.id, makeCtx()).catch(() => {})
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
  const settingsToggle = btn(i18n.t('app.layers'), () => toggleCompactPanel('settings'), true)
  settingsToggle.dataset.panelToggle = 'settings'
  settingsToggle.setAttribute('aria-label', i18n.t('app.panel_settings'))
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

  const devices = document.createElement('div')
  devices.className = 'sigil-topbar-group sigil-topbar-switch'
  devices.setAttribute('role', 'group')
  devices.setAttribute('aria-label', i18n.t('device.group'))
  const deviceBtns: Record<CanvasDevice, HTMLButtonElement> = {
    desktop: btn(i18n.t('device.desktop'), () => setDevice('desktop'), true),
    tablet: btn(i18n.t('device.tablet'), () => setDevice('tablet'), true),
    mobile: btn(i18n.t('device.mobile'), () => setDevice('mobile'), true),
  }
  for (const [key, button] of Object.entries(deviceBtns)) button.dataset.device = key
  devices.append(deviceBtns.desktop, deviceBtns.tablet, deviceBtns.mobile)

  const sep2 = el('div', 'sigil-topbar-sep')

  const modes = document.createElement('div')
  modes.className = 'sigil-topbar-group sigil-topbar-switch'
  const editBtn = btn(i18n.t('canvas.edit'), () => setMode('edit'), true)
  const previewBtn = btn(i18n.t('canvas.preview'), () => setMode('preview'), true)
  modes.append(editBtn, previewBtn)

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

  const desktopStart = el('div', 'sigil-desktop-start')
  const desktopCanvasTools = el('div', 'sigil-desktop-canvas-tools')
  const desktopEnd = el('div', 'sigil-desktop-end')

  const primaryTools = el('div', 'sigil-primary-tools')
  const extraTools = el('div', 'sigil-extra-tools')
  extraTools.id = `sigil-tools-${panelIdSuffix}`
  extraTools.hidden = true
  const moreTools = btn(
    i18n.t('app.more'),
    () => {
      closeCompactPanel(false)
      showExtraTools(extraTools.hidden)
    },
    true,
  )
  moreTools.setAttribute('aria-controls', extraTools.id)
  moreTools.setAttribute('aria-label', i18n.t('app.tools'))
  moreTools.setAttribute('aria-expanded', 'false')
  const saveButton = cmdButtons.get('save')

  // —— Body ——
  const body = el('div', 'sigil-body')

  const rail = document.createElement('nav')
  rail.className = 'sigil-workspace-rail'
  rail.setAttribute('aria-label', i18n.t('app.panels'))
  const structureToggle = btn('', () => toggleDesktopPanel('structure'), true)
  const libraryToggle = btn('', () => toggleDesktopPanel('blocks'), true)
  const assetsToggle = btn('', () => openAssets(), true)
  const pageStylesToggle = btn(
    '',
    () => {
      engine.select(engine.getTree().id)
      const style = inspectorBox.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')
      style?.click()
      style?.focus()
    },
    true,
  )
  const structureLabel = addRailIcon(
    structureToggle,
    'm3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  )
  const libraryLabel = addRailIcon(
    libraryToggle,
    'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7',
  )
  const assetsLabel = addRailIcon(assetsToggle, 'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M15 8h.01')
  const stylesLabel = addRailIcon(
    pageStylesToggle,
    'M4 7h5m4 0h7M4 17h9m4 0h3M9 4h4v6H9zM13 14h4v6h-4z',
  )
  assetsToggle.setAttribute('aria-haspopup', 'dialog')
  assetsToggle.hidden = !opts.assets
  rail.append(structureToggle, libraryToggle, assetsToggle, pageStylesToggle)
  libraryToggle.hidden = !opts.templates && !Object.keys(opts.blocks ?? {}).length

  const sidebar = el('aside', 'sigil-sidebar')
  sidebar.id = blocksDrawerId
  sidebar.dataset.compactPanel = 'blocks'
  sidebar.setAttribute('aria-label', i18n.t('app.blocks'))
  const blocksHead = el('div', 'sigil-panel-head')
  const blockLibrary = el('div', 'sigil-block-library')
  blockLibrary.id = `sigil-library-${panelIdSuffix}`
  libraryToggle.setAttribute('aria-controls', blockLibrary.id)
  const blocksTitle = document.createElement('h3')
  blocksTitle.className = 'sigil-sidebar-title'
  blocksTitle.textContent = i18n.t('app.blocks')
  const blocksClose = btn('×', () => closeCompactPanel(), true)
  blocksClose.classList.add('sigil-panel-close')
  blocksClose.setAttribute('aria-label', i18n.t('app.close_panel'))
  blocksHead.append(blocksTitle, blocksClose)
  const blocksBox = document.createElement('div')
  blockLibrary.append(blocksHead, blocksBox)
  const structure = el('section', 'sigil-document-structure')
  structure.id = `sigil-structure-${panelIdSuffix}`
  structureToggle.setAttribute('aria-controls', structure.id)
  const documentSummary = el('div', 'sigil-document-summary')
  const pageLabel = el('h3', 'sigil-sidebar-title')
  const pageName = el('p', 'sigil-document-name')
  documentSummary.append(pageLabel, pageName)
  if (opts.renderPageNavigation) documentSummary.append(opts.renderPageNavigation())
  const structureHeading = el('h3', 'sigil-sidebar-title sigil-structure-heading')
  structure.append(documentSummary, structureHeading)
  sidebar.append(structure, blockLibrary)

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
  emptyBody.hidden = libraryToggle.hidden
  const emptyAdd = btn(i18n.t('app.add_blocks'), () => {
    if (compactLayout) toggleCompactPanel('blocks', emptyAdd)
    else {
      desktopPanel = 'blocks'
      refreshCompactPanels()
      blocksBox.querySelector('input')?.focus()
    }
  })
  emptyAdd.hidden = libraryToggle.hidden
  emptyAdd.classList.add('sigil-btn--primary')
  const emptyTip = document.createElement('p')
  emptyTip.className = 'sigil-empty-canvas-tip'
  emptyTip.textContent = i18n.t('app.empty_tip')
  emptyGuide.append(emptyTitle, emptyBody, emptyAdd, emptyTip)
  canvasBox.appendChild(emptyGuide)

  canvasWrap.append(canvasBox)

  const helpPanel = el('div', 'sigil-help-panel')
  helpPanel.hidden = true
  const helpTitle = document.createElement('h4')
  helpTitle.textContent = i18n.t('app.help')
  const helpList = document.createElement('ul')
  const helpItems: HTMLLIElement[] = []
  for (const line of [
    i18n.t('app.help_delete'),
    i18n.t('app.help_undo'),
    i18n.t('app.help_redo'),
    i18n.t('app.help_copy_paste'),
    i18n.t('app.help_save'),
  ]) {
    const li = document.createElement('li')
    li.textContent = line
    helpList.appendChild(li)
    helpItems.push(li)
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

  body.append(rail, sidebar, canvasWrap, right, panelBackdrop)

  // —— Status ——
  const status = el('footer', 'sigil-status')
  const statusSel = document.createElement('span')
  const editSelection = btn('', () => toggleCompactPanel('settings', editSelection))
  editSelection.classList.add('sigil-edit-selection')
  editSelection.setAttribute('aria-controls', settingsDrawerId)
  editSelection.hidden = true
  const statusDirty = document.createElement('span')
  const statusMsg = document.createElement('span')
  statusMsg.setAttribute('role', 'status')
  status.append(statusSel, editSelection, statusDirty, statusMsg)

  root.append(topbar, body, status)

  function getPanel(panel: CompactPanel): HTMLElement {
    return panel === 'blocks' ? sidebar : right
  }

  function getPanelToggle(panel: CompactPanel): HTMLButtonElement {
    return panel === 'blocks' ? blocksToggle : settingsToggle
  }

  function showExtraTools(open: boolean): void {
    extraTools.hidden = !open
    moreTools.setAttribute('aria-expanded', String(open))
  }

  function arrangeToolbar(): void {
    showExtraTools(false)
    if (compactLayout) {
      primaryTools.append(compactControls, modes)
      if (saveButton) primaryTools.append(saveButton)
      primaryTools.append(moreTools)
      extraTools.append(brand, hist, devices)
      if (customBar.childNodes.length) extraTools.append(customBar)
      extraTools.append(actions)
      topbar.replaceChildren(primaryTools, extraTools)
    } else {
      if (saveButton) actions.prepend(saveButton)
      desktopStart.append(brand, compactControls, hist)
      desktopCanvasTools.append(devices, sep2, modes)
      if (customBar.childNodes.length) desktopEnd.append(customBar)
      desktopEnd.append(actions)
      topbar.replaceChildren(desktopStart, desktopCanvasTools, desktopEnd)
    }
  }

  function displayPageName(): void {
    const name =
      workspaceTitle || engine.toJSON().meta?.title?.trim() || i18n.t('app.untitled_page')
    pageName.textContent = name
    pageName.title = name
  }

  function refreshWorkspaceText(): void {
    rail.setAttribute('aria-label', i18n.t('app.panels'))
    structureToggle.title = i18n.t('app.structure')
    structureToggle.setAttribute('aria-label', structureToggle.title)
    structureLabel.textContent = i18n.t('app.layers')
    libraryToggle.title = i18n.t('app.add_blocks')
    libraryToggle.setAttribute('aria-label', libraryToggle.title)
    libraryLabel.textContent = i18n.t('app.blocks')
    assetsToggle.title = i18n.t('app.insert_image')
    assetsLabel.textContent = i18n.t('app.assets')
    pageStylesToggle.setAttribute('aria-label', i18n.t('app.page_styles'))
    pageStylesToggle.title = i18n.t('app.page_styles')
    stylesLabel.textContent = i18n.t('inspector.tab_style')
    pageLabel.textContent = i18n.t('app.current_page')
    structureHeading.textContent = i18n.t('app.layers')
    displayPageName()
  }

  function toggleDesktopPanel(panel: 'structure' | 'blocks'): void {
    if (compactLayout) return
    desktopPanel = desktopPanel === panel ? null : panel
    refreshCompactPanels()
    if (desktopPanel === 'blocks') blocksBox.querySelector('input')?.focus()
    if (desktopPanel === 'structure')
      layersBox.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }

  function canInsertAsset(): boolean {
    const root = engine.getTree()
    return mode === 'edit' && !root.locked && (root.type === 'section' || root.type === 'column')
  }

  function openAssets(): void {
    if (
      !opts.assets ||
      compactLayout ||
      closeAssetLibrary ||
      !canInsertAsset() ||
      mountEl.closest('[inert]')
    )
      return
    assetsToggle.focus({ preventScroll: true })
    closeAssetLibrary = openMediaPicker({
      assets: opts.assets,
      i18n: {
        ...i18n,
        t: (key) => i18n.t(key === 'media.title' ? 'app.insert_image' : key),
      },
      onPick(item) {
        if (destroyed) return
        if (!canInsertAsset() || mountEl.closest('[inert]')) {
          setStatusMessage(() => i18n.t('app.insert_unavailable'))
          return
        }
        const image = blockImage(item.url)
        engine.insert(engine.getTree().id, image)
        engine.select(image.id)
      },
      onClose() {
        closeAssetLibrary = null
      },
    })
  }

  function refreshSelection(): void {
    const id = engine.getSelection()
    const node = id ? findNode(engine.getTree(), id) : undefined
    const name = node?.name?.trim()
    statusSel.textContent = node ? `${name || node.type} · ${node.id}` : i18n.t('status.none')
    const canEditHere = compactLayout && mode === 'edit' && !activePanel && !!node
    statusSel.hidden = canEditHere
    editSelection.hidden = !canEditHere
    if (canEditHere) {
      editSelection.textContent = name
        ? `${i18n.t('canvas.edit')} ${name}`
        : i18n.t('app.edit_selection')
    }
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
      toggle.disabled = compactLayout && mode === 'preview'
    }

    panelBackdrop.hidden = !compactLayout || activePanel === null
    canvasWrap.inert = !panelBackdrop.hidden
    rail.hidden = compactLayout
    sidebar.hidden = !compactLayout && desktopPanel === null
    structure.hidden = compactLayout || desktopPanel !== 'structure'
    blockLibrary.hidden = !compactLayout && desktopPanel !== 'blocks'
    structureToggle.setAttribute('aria-expanded', String(!structure.hidden))
    libraryToggle.setAttribute('aria-expanded', String(!blockLibrary.hidden && !compactLayout))
    sidebar.setAttribute(
      'aria-label',
      i18n.t(compactLayout || desktopPanel === 'blocks' ? 'app.blocks' : 'app.structure'),
    )
    if (compactLayout && layersBox.parentElement !== right)
      right.insertBefore(layersBox, inspectorBox)
    if (!compactLayout && layersBox.parentElement !== structure) structure.append(layersBox)
    const directSettings = activePanel === 'settings' && panelTrigger === editSelection
    layersBox.hidden = directSettings
    layersTitle.textContent = i18n.t(
      !compactLayout || directSettings ? 'app.component_settings' : 'app.layers',
    )
    right.setAttribute(
      'aria-label',
      i18n.t(!compactLayout || directSettings ? 'app.component_settings' : 'app.panel_settings'),
    )
    refreshSelection()
  }

  function setCompactLayout(next: boolean): void {
    if (compactLayout === next && root.dataset.layout) return
    const focused = document.activeElement
    const assetDialogWasOpen = !!closeAssetLibrary
    const focusedLayer = layersBox.contains(focused)
    const focusedPanel =
      focusedLayer ||
      right.contains(focused) ||
      focused === structureToggle ||
      focused === pageStylesToggle
        ? 'settings'
        : sidebar.contains(focused) || focused === libraryToggle
          ? 'blocks'
          : null
    if (!next && (focusedLayer || focused === settingsToggle)) desktopPanel = 'structure'
    else if (
      !next &&
      (blocksBox.contains(focused) || focused === blocksClose || focused === blocksToggle)
    )
      desktopPanel = libraryToggle.hidden ? 'structure' : 'blocks'
    if (next) closeAssetLibrary?.()
    compactLayout = next
    activePanel = null
    panelTrigger = null
    arrangeToolbar()
    refreshCompactPanels()
    if (next && focusedPanel) (mode === 'preview' ? editBtn : getPanelToggle(focusedPanel)).focus()
    else if (next && focused && extraTools.contains(focused)) moreTools.focus()
    else if (
      !next &&
      (focused === blocksClose || focused === settingsClose || focused === editSelection)
    ) {
      const panel = focused === blocksClose ? sidebar : right
      panel
        .querySelector<HTMLElement>(
          'input, [role="treeitem"][tabindex="0"], [role="tab"][aria-selected="true"]',
        )
        ?.focus()
    } else if (!next && focused === blocksToggle)
      (libraryToggle.hidden ? structureToggle : libraryToggle).focus()
    else if (!next && focused === settingsToggle) structureToggle.focus()
    else if (!next && focusedLayer && focused instanceof HTMLElement)
      focused.focus({ preventScroll: true })
    else if (next && (focused === assetsToggle || assetDialogWasOpen)) moreTools.focus()
    else if (!next && focused === moreTools) editBtn.focus()
    else if (focused instanceof HTMLElement && topbar.contains(focused)) {
      if (next && (focused === editBtn || focused === previewBtn)) currentModeAction().focus()
      else focused.focus({ preventScroll: true })
    }
  }

  function toggleCompactPanel(panel: CompactPanel, trigger = getPanelToggle(panel)): void {
    if (!compactLayout || mode === 'preview') return
    if (activePanel === panel) {
      closeCompactPanel()
      return
    }
    showExtraTools(false)
    activePanel = panel
    panelTrigger = trigger
    refreshCompactPanels()
    if (trigger === editSelection) {
      const control =
        inspectorBox.querySelector<HTMLElement>('.sigil-img-preview + .sigil-field-row button') ??
        inspectorBox.querySelector<HTMLElement>(
          '[role="tabpanel"] input:not([disabled]), [role="tabpanel"] textarea:not([disabled]), [role="tabpanel"] select:not([disabled])',
        ) ??
        inspectorBox.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ;(control ?? settingsClose).focus()
    } else (panel === 'blocks' ? blocksClose : settingsClose).focus()
  }

  function closeCompactPanel(restoreFocus = true): void {
    if (!compactLayout || !activePanel) return
    const previous = activePanel
    const trigger = panelTrigger
    activePanel = null
    panelTrigger = null
    refreshCompactPanels()
    if (restoreFocus)
      (trigger && !trigger.closest('[hidden], [inert]')
        ? trigger
        : getPanelToggle(previous)
      ).focus()
  }

  function updateLayoutFromWidth(width: number): void {
    if (width <= 0) return
    setCompactLayout(width < COMPACT_LAYOUT_BREAKPOINT)
    if (!initialDeviceResolved) {
      initialDeviceResolved = true
      if (width <= RESPONSIVE_BREAKPOINT_WIDTHS.mobile) setDevice('mobile')
    }
  }

  function measureLayout(): void {
    const width = root.getBoundingClientRect().width || mountEl.getBoundingClientRect().width
    updateLayoutFromWidth(width)
  }

  let layoutObserver: ResizeObserver | null = null
  const onWindowResize = (): void => measureLayout()
  arrangeToolbar()
  refreshWorkspaceText()
  refreshCompactPanels()

  function onCompactPanelKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    const target = e.target instanceof Element ? e.target : document.activeElement
    if (!target || !root.contains(target)) return
    if (!compactLayout) {
      if (desktopPanel === 'blocks' && (sidebar.contains(target) || target === libraryToggle)) {
        e.preventDefault()
        desktopPanel = 'structure'
        refreshCompactPanels()
        libraryToggle.focus()
      }
      return
    }
    if (activePanel) {
      e.preventDefault()
      closeCompactPanel()
    } else if (!extraTools.hidden && (target === moreTools || extraTools.contains(target))) {
      e.preventDefault()
      showExtraTools(false)
      moreTools.focus()
    }
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
            void commands.run(id, makeCtx()).catch(() => {})
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
    selectionCommands: { registry: commands, context: makeCtx },
    onEditingDirtyChange(dirty) {
      inlineDirty = dirty
      if (persistenceReady && !destroyed) refreshChrome()
    },
    onReplaceImage: opts.assets
      ? (id, trigger) => inspector.replaceImage?.(id, trigger)
      : undefined,
    rendererOptions: { shortcodeResolver, htmlPolicy: policy },
    richText: opts.richText,
    i18n,
    chrome: false,
    onContextMenu: (_id, x, y) => openSelectionMenu(x, y),
  })
  const inspector = createInspector(engine, inspectorBox, {
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
    richText: opts.richText?.resolver,
    assets: opts.assets,
    i18n,
    fetchJSON,
  })
  const unsubDevice = canvas.subscribeDevice((next) => inspector.setDevice(next))
  const layers = createLayersPanel(engine, layersBox, {
    i18n,
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
    ? createBlocksPanel(engine, blocksBox, canvas.iframe, mergedBlocks, {
        i18n,
        itemActions: (block) => templateLibrary?.itemActions(block),
      })
    : null

  if (templateStore && blocksPanel) {
    templateLibrary = createTemplateLibraryController({
      store: templateStore,
      blocks: opts.blocks,
      panel: blocksPanel,
      mapTemplate: templateToBlockDef,
      i18n,
    })
    void templateLibrary.reload()
  }

  function setDevice(next: CanvasDevice): void {
    initialDeviceResolved = true
    device = next
    canvasWrap.dataset.device = next
    canvas.setDevice(next)
    refreshChrome()
  }
  function setMode(next: CanvasMode): void {
    mode = next
    if (next === 'preview') closeAssetLibrary?.()
    canvas.setMode(next)
    if (compactLayout) {
      closeCompactPanel(false)
      showExtraTools(false)
      refreshCompactPanels()
    }
    refreshChrome()
    if (compactLayout) currentModeAction().focus()
  }

  function currentModeAction(): HTMLButtonElement {
    return mode === 'edit' ? previewBtn : editBtn
  }

  function isCanvasEmpty(): boolean {
    const tree = engine.getTree()
    return !tree.children || tree.children.length === 0
  }

  function refreshEmptyGuide(): void {
    const empty = isCanvasEmpty()
    emptyGuide.hidden = !empty || mode === 'preview'
    emptyGuide.setAttribute('aria-hidden', String(emptyGuide.hidden))
  }

  function refreshChrome(): void {
    const ctx = makeCtx()
    for (const [id, b] of cmdButtons) {
      const cmd = commands.get(id)
      if (!cmd) continue
      let disabled = cmd.when ? !cmd.when(ctx) : false
      // 無變更時禁用存檔
      if (id === 'save') disabled = disabled || !isDirty() || persistence.isSaving()
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
    const dirty = isDirty()
    assetsToggle.disabled = !canInsertAsset()
    pageStylesToggle.disabled = mode === 'preview' || !!engine.getTree().locked
    statusDirty.textContent = i18n.t(
      persistence.isSaving() ? 'app.saving' : dirty ? 'app.dirty' : 'app.saved',
    )
    statusDirty.className = dirty ? 'sigil-status-dirty' : 'sigil-muted'
    refreshSelection()
    refreshEmptyGuide()
  }

  function refreshLocaleChrome(): void {
    brand.textContent = i18n.t('app.brand')
    refreshWorkspaceText()
    compactControls.setAttribute('aria-label', i18n.t('app.panels'))
    blocksToggle.textContent = i18n.t('app.blocks')
    settingsToggle.textContent = i18n.t('app.layers')
    settingsToggle.setAttribute('aria-label', i18n.t('app.panel_settings'))
    moreTools.textContent = i18n.t('app.more')
    moreTools.setAttribute('aria-label', i18n.t('app.tools'))
    devices.setAttribute('aria-label', i18n.t('device.group'))
    for (const [key, button] of Object.entries(deviceBtns))
      button.textContent = i18n.t(`device.${key}`)
    for (const [id, button] of cmdButtons) {
      const command = commands.get(id)
      if (command) button.textContent = commandLabel(command)
    }
    editBtn.textContent = i18n.t('canvas.edit')
    previewBtn.textContent = i18n.t('canvas.preview')
    themeBtn.textContent = themeLabel(themeChoice)
    themeBtn.title = i18n.t('app.theme')
    themeBtn.setAttribute('aria-label', `${i18n.t('app.theme')}: ${themeLabel(themeChoice)}`)
    helpBtn.textContent = i18n.t('app.help')
    sidebar.setAttribute('aria-label', i18n.t('app.blocks'))
    blocksTitle.textContent = i18n.t('app.blocks')
    blocksClose.setAttribute('aria-label', i18n.t('app.close_panel'))
    emptyTitle.textContent = i18n.t('app.empty_title')
    emptyBody.textContent = i18n.t('app.empty_body')
    emptyAdd.textContent = i18n.t('app.add_blocks')
    emptyTip.textContent = i18n.t('app.empty_tip')
    helpTitle.textContent = i18n.t('app.help')
    const helpLines = [
      i18n.t('app.help_delete'),
      i18n.t('app.help_undo'),
      i18n.t('app.help_redo'),
      i18n.t('app.help_copy_paste'),
      i18n.t('app.help_save'),
    ]
    helpItems.forEach((item, index) => {
      item.textContent = helpLines[index] ?? ''
    })
    refreshCompactPanels()
    settingsClose.setAttribute('aria-label', i18n.t('app.close_panel'))
    refreshChrome()
    refreshStatusMessage?.()
    refreshExportDialog?.()
  }

  function serializeHTML(doc: SigilDoc, mode?: HtmlMode): string {
    return toHTML(doc, {
      shortcodeResolver,
      richTextResolver: opts.richText?.resolver,
      sanitize: opts.sanitize,
      mode,
    })
  }

  function openExportDialog(): void {
    if (destroyed) return
    closeExportDialog?.()
    const doc = structuredClone(engine.toJSON())
    const html = serializeHTML(doc)
    const previousFocus = document.activeElement
    let closed = false
    let pendingDownload: AbortController | null = null

    const backdrop = document.createElement('div')
    backdrop.className = 'sigil-dialog-backdrop'
    backdrop.classList.toggle('sigil-theme-dark', root.classList.contains('sigil-theme-dark'))
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

    let hintKey = 'app.export_hint'
    let allowOriginalDownload = false
    const hint = document.createElement('p')
    hint.className = 'sigil-muted'
    hint.setAttribute('role', 'status')
    hint.textContent = i18n.t(hintKey)

    const source = document.createElement('details')
    const summary = document.createElement('summary')
    summary.id = `sigil-export-source-${createId()}`
    summary.textContent = i18n.t('app.export_source')
    const ta = document.createElement('textarea')
    ta.className = 'sigil-export-out'
    ta.setAttribute('aria-labelledby', summary.id)
    ta.readOnly = true
    ta.value = html
    ta.rows = 14
    source.append(summary, ta)

    const actionsRow = document.createElement('div')
    actionsRow.className = 'sigil-dialog-actions'
    let copied = false
    const copyBtn = btn(i18n.t('app.copy'), () => {
      void copyText(html).then((ok) => {
        if (closed) return
        copied = ok
        if (!ok) {
          hintKey = 'app.copy_manual'
          refreshDownload()
          source.open = true
          ta.focus()
          ta.select()
        }
        setStatusMessage(() =>
          copied ? i18n.t('app.copied') : `HTML ${html.length} ${i18n.t('app.characters')}`,
        )
        copyBtn.textContent = copied ? i18n.t('app.copied') : i18n.t('app.copy')
      })
    })
    const dlBtn = btn(i18n.t('app.download'), () => void download())
    dlBtn.classList.add('sigil-btn--primary')
    const originalBtn = btn(i18n.t('app.download_original'), () => void download(true))
    originalBtn.hidden = true
    function refreshDownload(): void {
      const preparing = !!pendingDownload
      dlBtn.setAttribute('aria-disabled', String(preparing))
      dlBtn.textContent = i18n.t(preparing ? 'app.export_preparing' : 'app.download')
      originalBtn.hidden = !allowOriginalDownload
      originalBtn.setAttribute('aria-disabled', String(preparing))
      originalBtn.textContent = i18n.t('app.download_original')
      hint.textContent = i18n.t(preparing ? 'app.export_preparing' : hintKey)
    }
    async function download(original = false): Promise<void> {
      if (closed || pendingDownload || (original && !allowOriginalDownload)) return
      const controller = new AbortController()
      pendingDownload = controller
      let preparing = false
      try {
        let prepared = doc
        let downloadHTML = html
        if (!original && opts.prepareDownload) {
          preparing = true
          refreshDownload()
          prepared = await opts.prepareDownload(structuredClone(doc), controller.signal)
          if (controller.signal.aborted) return
          downloadHTML = serializeHTML(prepared)
          preparing = false
        }
        const pageTitle =
          opts.getExportTitle?.(structuredClone(prepared)) ||
          prepared.meta?.title ||
          prepared.root.name ||
          i18n.t('app.export_title')
        const page = exportPageTemplate.replace(/{{title}}|<!--sigil-content-->/g, (slot) =>
          slot === '{{title}}' ? escapeHtml(pageTitle) : downloadHTML,
        )
        if (controller.signal.aborted) return
        downloadText(page, 'sigil-page.html')
        allowOriginalDownload = original
        hintKey = original ? 'app.download_original_started' : 'app.export_hint'
      } catch {
        allowOriginalDownload = original || preparing
        hintKey = 'app.export_fail'
      } finally {
        pendingDownload = null
        if (!closed) refreshDownload()
      }
    }
    const actionsCloseBtn = btn(i18n.t('app.close'), () => close())
    actionsRow.append(dlBtn)
    if (opts.prepareDownload) actionsRow.append(originalBtn)
    actionsRow.append(copyBtn, actionsCloseBtn)

    refreshExportDialog = () => {
      title.textContent = i18n.t('app.export_title')
      closeBtn.textContent = i18n.t('app.close')
      refreshDownload()
      summary.textContent = i18n.t('app.export_source')
      copyBtn.textContent = copied ? i18n.t('app.copied') : i18n.t('app.copy')
      actionsCloseBtn.textContent = i18n.t('app.close')
    }

    panel.append(head, hint, source, actionsRow)
    backdrop.appendChild(panel)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close()
    })
    document.body.appendChild(backdrop)
    dlBtn.focus()

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
      refreshExportDialog = null
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
      pendingDownload?.abort()
    }
    closeExportDialog = close

    setStatusMessage(() => `HTML ${html.length} ${i18n.t('app.characters')}`)
  }

  const unsub = engine.subscribe((ev) => {
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
  persistenceReady = true
  if (typeof ResizeObserver !== 'undefined') {
    layoutObserver = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === root)
      if (entry) updateLayoutFromWidth(entry.contentRect.width)
    })
    layoutObserver.observe(root)
  } else {
    window.addEventListener('resize', onWindowResize)
  }
  measureLayout()
  refreshChrome()
  runAfterLoad(hooks, engine.toJSON(), engine)

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!isDirty() && !persistence.isSaving()) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  let composingField: EventTarget | null = null
  function onFieldComposition(e: Event): void {
    composingField = e.type === 'compositionstart' ? e.target : null
  }
  inspectorBox.addEventListener('compositionstart', onFieldComposition)
  inspectorBox.addEventListener('compositionend', onFieldComposition)
  inspectorBox.addEventListener('focusout', onFieldComposition)

  function onKeyDown(e: KeyboardEvent): void {
    // Hosts can suspend editing while replacing or loading the document.
    if (mountEl.closest('[inert]')) return
    const t = e.target as HTMLElement | null
    if (t instanceof Element && t.closest('[role="dialog"], [role="menu"], [inert]')) return
    const field =
      t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable)
    if (
      field &&
      (!inspectorBox.contains(t) ||
        t.matches(':disabled, [readonly], [aria-readonly="true"]') ||
        (!e.ctrlKey && !e.metaKey) ||
        e.defaultPrevented ||
        e.isComposing ||
        e.keyCode === 229 ||
        composingField === t)
    )
      return
    const cmd = commands.match(e, makeCtx())
    if (!cmd || (field && cmd.id !== 'save')) return
    const selectedId = field && engine.getSelection()
    if (selectedId && findNode(engine.getTree(), selectedId)?.locked) return
    e.preventDefault()
    void commands.run(cmd.id, makeCtx()).catch(() => {})
  }
  document.addEventListener('keydown', onKeyDown)

  function setLocale(next: Locale): void {
    if (destroyed || next === i18n.getLocale()) return
    closeMenu?.()
    i18n.setLocale(next)
    refreshLocaleChrome()
  }

  const api: SigilApp = {
    engine,
    toJSON() {
      return structuredClone(engine.toJSON())
    },
    toHTML(htmlMode?: HtmlMode) {
      return serializeHTML(engine.toJSON(), htmlMode)
    },
    save: doSave,
    isDirty,
    isSaving: persistence.isSaving,
    runCommand(id: string) {
      return commands.run(id, makeCtx())
    },
    getLocale() {
      return i18n.getLocale()
    },
    setLocale,
    setDocumentTitle(title) {
      workspaceTitle = title?.trim()
      displayPageName()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      persistence.destroy()
      runBeforeDestroy(hooks, engine)
      closeExportDialog?.()
      closeAssetLibrary?.()
      closeMenu?.()
      cleanupTheme()
      layoutObserver?.disconnect()
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('beforeunload', onBeforeUnload)
      inspectorBox.removeEventListener('compositionstart', onFieldComposition)
      inspectorBox.removeEventListener('compositionend', onFieldComposition)
      inspectorBox.removeEventListener('focusout', onFieldComposition)
      document.removeEventListener('keydown', onCompactPanelKeyDown)
      document.removeEventListener('keydown', onKeyDown)
      unsub()
      unsubDevice()
      templateLibrary?.destroy()
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

function addRailIcon(button: HTMLButtonElement, shape: string): HTMLSpanElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(svg.namespaceURI!, 'path')
  path.setAttribute('d', shape)
  svg.append(path)
  const label = document.createElement('span')
  button.append(svg, label)
  return label
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
  try {
    document.body.appendChild(a)
    a.click()
  } finally {
    a.remove()
    URL.revokeObjectURL(url)
  }
}

export { SIGIL_APP_VERSION } from './version.js'
