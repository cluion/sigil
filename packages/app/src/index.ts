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
  type HistoryEngine,
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
  collectPageImages,
  createCanvas,
  createBlocksPanel,
  createLayersPanel,
  createSelectionPath,
  createInspector,
  createPageLinksPanel,
  createTemplateLibraryController,
  openMediaPicker,
  openHistoryDialog,
  openPageTextDialog,
  applyTheme,
  nextTheme,
  openContextMenu,
  type BlocksInput,
  type CanvasDevice,
  type CanvasMode,
  type InspectorOptions,
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
import { blockFAQItem, blockImage, templateToBlockDef } from '@cluion/sigil-blocks'
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
    'app.panel_view': '面板檢視',
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
    'history.title': '編輯歷程',
    'page_text.title': '尋找與取代',
    'page_text.short': '尋找',
    'app.help_find_replace': 'Ctrl/Cmd+Shift+F — 尋找與取代',
    'app.dirty': '未儲存',
    'app.saved': '已儲存',
    'app.saved_msg': '已寫入 ProjectStore',
    'app.saving': '儲存中…',
    'app.saved_pending': '先前修改已儲存；仍有未儲存變更',
    'app.save_fail': '存檔失敗',
    'app.export_title': '匯出 HTML',
    'app.export_hint': '下載可直接開啟的網頁檔，或複製 HTML 片段嵌入其他頁面。',
    'app.export_source': 'HTML 片段',
    'app.export_link_missing': '這個連結已移除或無法在畫布中編輯。重新開啟匯出即可查看最新清單。',
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
    'blocks.insert_after_target': '插入於「{name}」下方',
    'blocks.cancel_insert': '取消',
    'blocks.default_category': '一般',
    'blocks.empty': '無符合區塊',
    'blocks.pin': '釘選 {name}',
    'blocks.unpin': '取消釘選 {name}',
    'blocks.pinned_only': '只看已釘選',
    'blocks.results': '{count} 個結果',
    'blocks.no_pins': '尚無已釘選區塊',
    'blocks.pins_session_only': '釘選變更僅保留於目前工作階段。',
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
    'path.title': '元件路徑',
    'path.close': '關閉',
    'path.page': '頁面',
    'layers.search': '搜尋圖層',
    'layers.search_clear': '清除搜尋',
    'layers.search_count': '找到 {count} 個圖層',
    'layers.search_none': '找不到符合的圖層',
    'layers.search_more': '顯示更多結果',
    'layers.views': '結構檢視',
    'layers.all': '所有圖層',
    'layers.outline': '標題大綱',
    'layers.outline_search': '搜尋標題',
    'layers.outline_count': '共 {count} 個標題',
    'layers.outline_empty': '這個頁面還沒有標題',
    'layers.outline_no_matches': '找不到符合的標題',
    'layers.outline_untitled': '未命名標題',
    'layers.outline_more': '顯示更多標題',
    'move.title': '移動元件',
    'move.page': '頁面',
    'move.section': '區段',
    'move.column': '欄',
    'move.source': '目前位置：{path}',
    'move.search': '搜尋目的地',
    'move.destination': '目的地',
    'move.position': '插入位置',
    'move.before_label': '放在這個元件之前',
    'move.more': '顯示更多目的地',
    'move.more_before': '顯示更多元件',
    'move.cancel': '取消',
    'move.confirm': '移動',
    'move.first': '開頭',
    'move.last': '結尾',
    'move.before': '指定元件之前',
    'move.choose': '選擇目的地',
    'move.empty': '找不到符合的目的地',
    'move.choose_before': '選擇同層元件',
    'move.empty_before': '目的地沒有其他元件，請改選開頭或結尾。',
    'move.preview_before': '在「{name}」之前',
    'move.unchanged': '已在這個位置',
    'layers.expand': '展開子圖層',
    'layers.collapse': '收合子圖層',
    'canvas.component_actions': '元件操作',
    'canvas.locate_selection': '在畫布定位',
    'canvas.edit_text': '編輯文字',
    'canvas.edit_leading_text': '編輯開頭文字',
    'canvas.finish_editing': '完成編輯',
    'canvas.cancel_editing': '取消編輯',
    'canvas.editing_text': '正在編輯文字',
    'canvas.text_commit_failed': '未能完成編輯。草稿已保留，請再試一次。',
    'canvas.select_parent': '選取父層',
    'canvas.insert_after': '在下方新增區塊',
    'canvas.duplicate': '複製元件',
    'canvas.replace_image': '更換圖片',
    'canvas.delete': '刪除元件',
    'canvas.command_failed': '操作失敗，請再試一次。',
    'layers.show': '顯示',
    'layers.hide': '隱藏',
    'layers.lock': '鎖定',
    'layers.unlock': '解鎖',
    'layers.rename_prompt': '圖層名稱',
    'layers.rename': '重新命名圖層',
    'media.title': '媒體庫',
    'media.search': '搜尋圖片名稱',
    'media.sources': '圖片來源',
    'media.library': '素材庫',
    'media.page_images': '本頁圖片',
    'media.search_page': '搜尋本頁圖片',
    'media.page_uses': '本頁使用 {count} 次',
    'media.more': '顯示更多圖片',
    'media.empty_page': '本頁尚無圖片',
    'media.image_url': '圖片網址',
    'media.preview_image': '預覽圖片',
    'media.insert_image': '插入圖片',
    'media.alt_hint': '裝飾用圖片可留白。',
    'media.invalid_url': '請輸入 HTTP(S) 圖片網址或以 / 開頭的站內路徑。',
    'media.rejected_url': '此網站無法儲存這個圖片網址，請更換網址。',
    'media.loading_image': '正在載入圖片…',
    'media.failed_image': '圖片無法載入。請確認網址可直接開啟圖片，再試一次。',
    'media.image_loaded': '圖片已載入',
    'media.invalid_alt': '這段替代文字無法儲存，請縮短或修改內容。',
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
    'props.leading_text': '開頭文字',
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
    'spacing.expand.padding': '分別調整內距',
    'spacing.expand.margin': '分別調整外距',
    'spacing.top': '上方{property}',
    'spacing.right': '右方{property}',
    'spacing.bottom': '下方{property}',
    'spacing.left': '左方{property}',
    'spacing.reset': '清除{side}覆寫',
    'spacing.invalid': '請輸入有效的單邊間距',
    'spacing.invalid_shorthand': '請輸入一至四個有效的間距值',
    'spacing.unsupported': '這個間距值無法儲存在此網站',
    'spacing.dynamic': '依 CSS 宣告決定',
    'spacing.from_group': '來自四邊設定',
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
    'image.framing_action': '調整圖片構圖',
    'image.link': '圖片連結',
    'image.remove_link': '移除圖片連結',
    'image.shared_link': '變更這個網址也會套用至同一連結內的其他內容。',
    'framing.title': '圖片構圖',
    'framing.ratio': '裁切比例',
    'framing.fit': '圖片適應方式',
    'framing.original': '原有尺寸',
    'framing.cover': '填滿裁切',
    'framing.contain': '完整顯示',
    'framing.fill': '伸展填滿',
    'framing.custom': '自訂',
    'framing.point': '在原圖設定焦點',
    'framing.x': '水平焦點 (%)',
    'framing.y': '垂直焦點 (%)',
    'framing.unavailable': '無法預覽原圖',
    'framing.reset_focus': '清除焦點設定',
    'framing.inherit_focus': '沿用上層焦點',
    'framing.reset_frame': '清除比例、高度、上下限與適應方式',
    'framing.inherit_frame': '沿用上層比例、高度、上下限與適應方式',
    'framing.custom_position': '自訂焦點',
    'framing.focus_hint': '點選原圖或輸入百分比調整焦點。',
    'inspector.embedded_image': '已嵌入圖片',
    'inspector.replace_image_url': '貼上圖片網址以更換',
    'inspector.component_id': '元件內部 ID',
    'page_links.title': '頁面連結',
    'page_links.scope': '檢查元件連結與頁內目標。外部連結僅列出網址。',
    'page_links.count': '共 {count} 個連結，{issues} 個待處理',
    'page_links.filter': '只看待處理',
    'page_links.inspect': '查看連結 {name}',
    'page_links.more': '顯示更多連結',
    'page_links.empty': '這個頁面沒有元件連結',
    'page_links.clear': '沒有待處理的連結',
    'page_links.untitled': '未命名連結',
    'page_links.unset': '未設定目的地',
    'page_links.missing': '找不到頁內目標',
    'page_links.duplicate': '頁內目標重複',
    'page_links.hidden': '頁內目標已隱藏',
    'page_links.page': '頁內連結',
    'page_links.url': '網址',
    'page_links.email': '電子郵件',
    'page_links.phone': '電話',
    'page_links.unconfirmed': '需在預覽確認目標',
    'page_links.text': '文字片段',
    'anchor.edit': '編輯頁內錨點',
    'anchor.title': '頁內錨點',
    'anchor.name': '錨點名稱',
    'anchor.apply': '套用錨點',
    'anchor.copy': '複製頁內連結',
    'anchor.fragment': '頁內連結',
    'anchor.references': '此頁有 {count} 處參照此錨點。',
    'anchor.duplicate': '這個名稱由多個元件共用。改名會保留既有參照。',
    'anchor.unavailable': '請更換名稱，以取得此元件專用的頁內連結。',
    'anchor.updated': '已更新頁內錨點。',
    'anchor.copied': '已複製頁內連結。',
    'anchor.manual': '請手動複製已選取的頁內連結。',
    'anchor.missing': '找不到目前元件，請重新選取。',
    'anchor.locked': '請先解鎖這個元件。',
    'anchor.invalid': '請輸入有效的錨點名稱，例如 event-info 或 活動資訊。',
    'anchor.conflict': '這個名稱已被使用，請選擇其他名稱。',
    'anchor.referenced': '請先移除或重新指定指向此錨點的參照。',
    'anchor.locked-reference': '請先解鎖包含此錨點參照的元件。',
    'link.section': '連到頁內區段',
    'link.edit': '編輯連結',
    'link.kind': '連結類型',
    'link.web': '網址或頁內區段',
    'link.email': '電子郵件',
    'link.phone': '電話',
    'link.email_address': '電子郵件地址',
    'link.phone_number': '電話號碼',
    'link.invalid_email': '請輸入有效的電子郵件地址。',
    'link.invalid_phone': '請輸入有效的電話號碼。',
    'link.new_tab': '在新分頁開啟',
    'link.reveal': '在畫布定位區段',
    'link.missing_section': '找不到這個頁內區段，請重新選擇。',
    'link.duplicate_section': '這個錨點有多個區段使用，請重新選擇。',
    'link.unavailable_section': '這個目標無法在畫布定位。',
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
    'faq.question': '問題',
    'faq.answer': '答案',
    'faq.add': '新增問答',
    'faq.back': '返回問答清單',
    'faq.new_question': '新的問題',
    'faq.new_answer': '請填寫答案。',
    'grid.title': '格線欄數',
    'layout.wrap_title': '項目換行',
    'layout.nowrap': '不換行',
    'layout.wrap': '自動換行',
    'layout.wrap-reverse': '反向換行',
    'layout.reset_wrap': '還原換行設定',
    'layout.wrap_css': '依 CSS 決定',
    'layout.from_flow': '來自 flex-flow',
    'layout.separate_gaps': '分別調整間距',
    'layout.invalid_gap': '請輸入有效的非負間距',
    'layout.mixed_gaps': '分別設定',
    'layout.clear_uniform_gap': '清除共用間距',
    'style.property.row-gap': '列間距',
    'style.property.column-gap': '欄間距',
    'grid.item_title': '格線項目配置',
    'grid.item_auto': '自動排列',
    'grid.item_full': '橫跨整列',
    'grid.item_inherit': '沿用上層配置',
    'grid.item_restore_area': '還原區域配置',
    'grid.item_custom': '自訂配置（{value}）',
    'grid.one': '1 欄',
    'grid.count': '{count} 欄',
    'grid.custom': '自訂欄寬',
    'grid.inherit': '沿用上層欄寬',
    'grid.invalid': '請輸入有效的 CSS 欄寬。',
    'grid.unsupported': '此網站不支援這種欄寬設定。',
    'typography.edit': '調整文字排版',
    'style.custom_value': '自訂 CSS 值',
    'style.option.font-weight.normal': '一般',
    'style.option.font-weight.600': '半粗體',
    'style.option.font-weight.bold': '粗體',
    'typography.preset': '文字排版預設',
    'typography.custom': '自訂',
    'typography.display': '展示標題',
    'typography.heading': '章節標題',
    'typography.body': '內文',
    'typography.caption': '註解',
    'typography.invalid': '請輸入有效的 CSS 值。',
    'typography.unsupported': '此編輯器無法儲存這個值。',
    'style.property.line-height': '行高',
    'style.property.letter-spacing': '字距',
    'text_format.label': '文字格式',
    'text_format.paragraph': '段落',
    'text_format.inline': '行內文字',
    'text_format.heading': '標題 {level}（H{level}）',
    'color.pick': '選擇顏色',
    'color.palette': '頁面色票',
    'color.empty': '此頁尚無可重用的顏色',
    'color.invalid': '請輸入有效的 CSS 色值',
    'color.unsupported': '此編輯器無法儲存這個色值',
    'style.copy': '複製樣式',
    'style.apply': '套用樣式',
    'style.copied_from': '已複製「{name}」的{device}樣式',
    'style.applied_to': '已套用至「{name}」的{device}樣式',
    'style.already_matches': '樣式已相同',
    'style.no_styles': '目前裝置沒有可複製的樣式',
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
    'app.panel_view': 'Panel view',
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
    'history.title': 'Edit history',
    'page_text.title': 'Find and replace',
    'page_text.short': 'Find',
    'app.help_find_replace': 'Ctrl/Cmd+Shift+F — Find and replace',
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
    'app.export_link_missing':
      'This link is no longer available in the editor. Reopen Export to review the current links.',
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
    'blocks.insert_after_target': 'Insert after {name}',
    'blocks.cancel_insert': 'Cancel',
    'blocks.default_category': 'General',
    'blocks.empty': 'No matching blocks',
    'blocks.pin': 'Pin {name}',
    'blocks.unpin': 'Unpin {name}',
    'blocks.pinned_only': 'Pinned only',
    'blocks.results': 'Results: {count}',
    'blocks.no_pins': 'No pinned blocks yet',
    'blocks.pins_session_only': 'Pin changes will last for this session only.',
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
    'path.title': 'Component path',
    'path.close': 'Close',
    'path.page': 'Page',
    'layers.search': 'Search layers',
    'layers.search_clear': 'Clear search',
    'layers.search_count': 'Matching layers ({count})',
    'layers.search_none': 'No matching layers',
    'layers.search_more': 'Show more results',
    'layers.views': 'Structure views',
    'layers.all': 'All layers',
    'layers.outline': 'Heading outline',
    'layers.outline_search': 'Search headings',
    'layers.outline_count': 'Headings ({count})',
    'layers.outline_empty': 'This page has no headings yet',
    'layers.outline_no_matches': 'No matching headings',
    'layers.outline_untitled': 'Untitled heading',
    'layers.outline_more': 'Show more headings',
    'move.title': 'Move component',
    'move.page': 'Page',
    'move.section': 'Section',
    'move.column': 'Column',
    'move.source': 'Current location: {path}',
    'move.search': 'Search destinations',
    'move.destination': 'Destination',
    'move.position': 'Placement',
    'move.before_label': 'Place before this component',
    'move.more': 'Show more destinations',
    'move.more_before': 'Show more components',
    'move.cancel': 'Cancel',
    'move.confirm': 'Move',
    'move.first': 'Beginning',
    'move.last': 'End',
    'move.before': 'Before a component',
    'move.choose': 'Choose a destination',
    'move.empty': 'No matching destinations',
    'move.choose_before': 'Choose a component at this level',
    'move.empty_before': 'The destination is empty. Choose Beginning or End.',
    'move.preview_before': 'Before “{name}”',
    'move.unchanged': 'Already at this position',
    'layers.expand': 'Expand children',
    'layers.collapse': 'Collapse children',
    'canvas.component_actions': 'Component actions',
    'canvas.locate_selection': 'Locate on canvas',
    'canvas.edit_text': 'Edit text',
    'canvas.edit_leading_text': 'Edit leading text',
    'canvas.finish_editing': 'Done editing',
    'canvas.cancel_editing': 'Cancel editing',
    'canvas.editing_text': 'Editing text',
    'canvas.text_commit_failed': 'Could not finish editing. Your draft is still here. Try again.',
    'canvas.select_parent': 'Select parent',
    'canvas.insert_after': 'Add block below',
    'canvas.duplicate': 'Duplicate component',
    'canvas.replace_image': 'Replace image',
    'canvas.delete': 'Delete component',
    'canvas.command_failed': 'Action failed. Please try again.',
    'layers.show': 'Show',
    'layers.hide': 'Hide',
    'layers.lock': 'Lock',
    'layers.unlock': 'Unlock',
    'layers.rename_prompt': 'Layer name',
    'layers.rename': 'Rename layer',
    'media.title': 'Media library',
    'media.search': 'Search images by name',
    'media.sources': 'Image sources',
    'media.library': 'Asset library',
    'media.page_images': 'Page images',
    'media.search_page': 'Search page images',
    'media.page_uses': 'Uses on this page: {count}',
    'media.more': 'Show more images',
    'media.empty_page': 'This page has no images',
    'media.image_url': 'Image URL',
    'media.preview_image': 'Preview image',
    'media.insert_image': 'Insert image',
    'media.alt_hint': 'Leave blank for a decorative image.',
    'media.invalid_url': 'Enter an HTTP(S) image URL or a site path starting with /.',
    'media.rejected_url': 'This site cannot save that image URL. Use a different address.',
    'media.loading_image': 'Loading image…',
    'media.failed_image':
      'Could not load the image. Check that the address opens an image, then try again.',
    'media.image_loaded': 'Image loaded',
    'media.invalid_alt': 'This site cannot save that alternative text. Shorten or edit it.',
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
    'props.leading_text': 'Leading text',
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
    'spacing.expand.padding': 'Adjust padding by side',
    'spacing.expand.margin': 'Adjust margin by side',
    'spacing.top': 'Top {property}',
    'spacing.right': 'Right {property}',
    'spacing.bottom': 'Bottom {property}',
    'spacing.left': 'Left {property}',
    'spacing.reset': 'Clear {side} override',
    'spacing.invalid': 'Enter a valid value for one side',
    'spacing.invalid_shorthand': 'Enter one to four valid spacing values',
    'spacing.unsupported': 'This site cannot save that spacing value',
    'spacing.dynamic': 'Determined by CSS',
    'spacing.from_group': 'From shorthand',
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
    'image.framing_action': 'Adjust image framing',
    'image.link': 'Image link',
    'image.remove_link': 'Remove image link',
    'image.shared_link': 'Changing this address also affects other content in the same link.',
    'framing.title': 'Image framing',
    'framing.ratio': 'Frame ratio',
    'framing.fit': 'Image fit',
    'framing.original': 'Existing dimensions',
    'framing.cover': 'Cover',
    'framing.contain': 'Contain',
    'framing.fill': 'Stretch',
    'framing.custom': 'Custom',
    'framing.point': 'Set focus on the source image',
    'framing.x': 'Horizontal focus (%)',
    'framing.y': 'Vertical focus (%)',
    'framing.unavailable': 'Original image unavailable',
    'framing.reset_focus': 'Clear focus',
    'framing.inherit_focus': 'Inherit focus',
    'framing.reset_frame': 'Clear ratio, height, limits and fit',
    'framing.inherit_frame': 'Inherit ratio, height, limits and fit',
    'framing.custom_position': 'Custom focus',
    'framing.focus_hint': 'Choose a point on the image or enter percentages.',
    'inspector.embedded_image': 'Embedded image',
    'inspector.replace_image_url': 'Paste an image URL to replace it',
    'inspector.component_id': 'Component ID',
    'page_links.title': 'Page links',
    'page_links.scope':
      'Review component links and page targets. External URLs are listed without verification.',
    'page_links.count': 'Total links: {count} · Needs attention: {issues}',
    'page_links.filter': 'Needs attention only',
    'page_links.inspect': 'Inspect link {name}',
    'page_links.more': 'Show more links',
    'page_links.empty': 'This page has no component links',
    'page_links.clear': 'No links need attention',
    'page_links.untitled': 'Untitled link',
    'page_links.unset': 'No destination',
    'page_links.missing': 'Page target not found',
    'page_links.duplicate': 'Duplicate page target',
    'page_links.hidden': 'Page target is hidden',
    'page_links.page': 'Page link',
    'page_links.url': 'URL',
    'page_links.email': 'Email',
    'page_links.phone': 'Phone',
    'page_links.unconfirmed': 'Confirm target in preview',
    'page_links.text': 'Text fragment',
    'anchor.edit': 'Edit page anchor',
    'anchor.title': 'Page anchor',
    'anchor.name': 'Anchor name',
    'anchor.apply': 'Apply anchor',
    'anchor.copy': 'Copy page link',
    'anchor.fragment': 'Page link',
    'anchor.references': 'References on this page: {count}.',
    'anchor.duplicate':
      'Several components share this name. Renaming this component leaves existing references in place.',
    'anchor.unavailable': 'Choose a different name to get a link to this component.',
    'anchor.updated': 'Page anchor updated.',
    'anchor.copied': 'Page link copied.',
    'anchor.manual': 'Copy the selected page link.',
    'anchor.missing': 'Select the component again.',
    'anchor.locked': 'Unlock this component first.',
    'anchor.invalid': 'Enter a valid anchor name, such as event-info or 活動資訊.',
    'anchor.conflict': 'This name is already in use. Choose another name.',
    'anchor.referenced': 'Remove or redirect references to this anchor first.',
    'anchor.locked-reference': 'Unlock the components that reference this anchor first.',
    'link.section': 'Link to section',
    'link.edit': 'Edit link',
    'link.kind': 'Link type',
    'link.web': 'Web address or page section',
    'link.email': 'Email',
    'link.phone': 'Phone',
    'link.email_address': 'Email address',
    'link.phone_number': 'Phone number',
    'link.invalid_email': 'Enter a valid email address.',
    'link.invalid_phone': 'Enter a valid phone number.',
    'link.new_tab': 'Open in a new tab',
    'link.reveal': 'Show section on canvas',
    'link.missing_section': 'Section not found. Choose another section on this page.',
    'link.duplicate_section': 'Multiple sections use this anchor. Choose another section.',
    'link.unavailable_section': 'This target cannot be shown on the canvas.',
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
    'faq.question': 'Question',
    'faq.answer': 'Answer',
    'faq.add': 'Add question',
    'faq.back': 'Back to questions',
    'faq.new_question': 'New question',
    'faq.new_answer': 'Enter an answer.',
    'grid.title': 'Grid columns',
    'layout.wrap_title': 'Item wrapping',
    'layout.nowrap': 'No wrap',
    'layout.wrap': 'Wrap',
    'layout.wrap-reverse': 'Wrap in reverse',
    'layout.reset_wrap': 'Reset wrapping',
    'layout.wrap_css': 'From CSS',
    'layout.from_flow': 'From flex-flow',
    'layout.separate_gaps': 'Adjust gaps separately',
    'layout.invalid_gap': 'Enter a valid, non-negative gap',
    'layout.mixed_gaps': 'Separate values',
    'layout.clear_uniform_gap': 'Clear shared gap',
    'style.property.row-gap': 'Row gap',
    'style.property.column-gap': 'Column gap',
    'grid.item_title': 'Grid item placement',
    'grid.item_auto': 'Auto placement',
    'grid.item_full': 'Full row',
    'grid.item_inherit': 'Inherit placement',
    'grid.item_restore_area': 'Restore area placement',
    'grid.item_custom': 'Custom placement ({value})',
    'grid.one': '1 column',
    'grid.count': '{count} columns',
    'grid.custom': 'Custom column tracks',
    'grid.inherit': 'Inherit column tracks',
    'grid.invalid': 'Enter a valid CSS grid track list.',
    'grid.unsupported': 'This site does not support these column tracks.',
    'typography.edit': 'Edit typography',
    'style.custom_value': 'Custom CSS value',
    'style.option.font-weight.normal': 'Regular',
    'style.option.font-weight.600': 'Semibold',
    'style.option.font-weight.bold': 'Bold',
    'typography.preset': 'Typography preset',
    'typography.custom': 'Custom',
    'typography.display': 'Display',
    'typography.heading': 'Section heading',
    'typography.body': 'Body',
    'typography.caption': 'Caption',
    'typography.invalid': 'Enter a valid CSS value.',
    'typography.unsupported': 'This editor cannot save this value.',
    'style.property.line-height': 'Line height',
    'style.property.letter-spacing': 'Letter spacing',
    'text_format.label': 'Text format',
    'text_format.paragraph': 'Paragraph',
    'text_format.inline': 'Inline text',
    'text_format.heading': 'Heading {level} (H{level})',
    'color.pick': 'Choose color',
    'color.palette': 'Page colors',
    'color.empty': 'No reusable colors on this page',
    'color.invalid': 'Enter a valid CSS color',
    'color.unsupported': 'This editor cannot save this color value',
    'style.copy': 'Copy styles',
    'style.apply': 'Apply styles',
    'style.copied_from': 'Copied from {name} · {device}',
    'style.applied_to': 'Applied to {name} · {device}',
    'style.already_matches': 'Styles already match',
    'style.no_styles': 'No styles to copy for this device',
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
  /** 插入網址圖片前檢查宿主可儲存的來源與替代文字。 */
  acceptsImageAttribute?: (name: 'src' | 'alt', value: string) => boolean
  /** Record 工廠或 defineBlock 列表 */
  blocks?: BlocksInput
  /** 釘選區塊的本機儲存命名空間；false 僅在本次面板保留。 */
  blockPinStorageKey?: string | false
  /** 在套用自訂格線欄寬前檢查宿主的樣式限制。 */
  acceptsCustomGridTracks?: (value: string) => boolean
  /** 在套用文字或背景色前檢查宿主可儲存的色值。 */
  acceptsColorValue?: (value: string) => boolean
  /** 檢查宿主可儲存的內距、外距與項目間距值。 */
  acceptsSpacingValue?: (value: string) => boolean
  /** 檢查宿主能儲存的文字排版屬性值。 */
  acceptsTypographyValue?: InspectorOptions['acceptsTypographyValue']
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

export interface SigilApp<E extends Engine = Engine> {
  engine: E
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
type SettingsView = 'layers' | 'inspector'

const COMPACT_LAYOUT_BREAKPOINT = 900

/**
 * 開箱即用產品殼 — Design tokens + Topbar + 三欄 + Inspector 分頁
 */
export function createApp(opts: AppOptions): SigilApp<HistoryEngine> {
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
  let settingsView: SettingsView = 'layers'
  let desktopPanel: 'structure' | 'blocks' | null = 'structure'
  let workspaceTitle: string | undefined
  let closeAssetLibrary: (() => void) | null = null
  let panelTrigger: HTMLElement | null = null
  let dismissBlockPlacement: (() => void) | null = null
  let clipboard: ComponentNode | null = null
  let closeExportDialog: (() => void) | null = null
  let historyDialog: ReturnType<typeof openHistoryDialog> | undefined
  let pageTextDialog: ReturnType<typeof openPageTextDialog> | undefined
  let searchQuery = ''
  let matchCase = false
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
      if (persistenceReady) {
        refreshChrome()
        historyDialog?.setSavedId(persistence.getSavedHistoryId())
      }
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
  commandMap.set('edit-history', {
    id: 'edit-history',
    toolbar: true,
    toolbarGroup: 'history',
    when: () => !destroyed,
    run() {
      if (historyDialog) return
      try {
        canvas.commitEditing({ forSave: true })
      } catch (error) {
        setStatusMessage(() => i18n.t('canvas.text_commit_failed'))
        throw error
      }
      closeCompactPanel(false)
      if (compactLayout) showExtraTools(false)
      const trigger = compactLayout ? moreTools : cmdButtons.get('edit-history')
      historyDialog = openHistoryDialog({
        engine,
        mount: root,
        i18n,
        trigger,
        savedId: persistence.getSavedHistoryId(),
        onClose: () => {
          historyDialog = undefined
        },
      })
    },
  })
  commandMap.set('find-replace', {
    id: 'find-replace',
    shortcut: 'mod+shift+f',
    when: () => !destroyed && mode === 'edit' && !mountEl.closest('[inert]'),
    run() {
      if (pageTextDialog) return
      canvas.commitEditing({ forSave: true })
      closeCompactPanel(false)
      if (compactLayout) showExtraTools(false)
      const trigger = compactLayout ? moreTools : findToggle
      pageTextDialog = openPageTextDialog({
        mount: root,
        engine,
        trigger,
        i18n,
        device: canvas.getDevice(),
        richText: opts.richText?.resolver,
        initialQuery: searchQuery,
        initialMatchCase: matchCase,
        onQueryChange(query, caseSensitive) {
          searchQuery = query
          matchCase = caseSensitive
        },
        onClose() {
          pageTextDialog = undefined
          const visibleTrigger = compactLayout ? moreTools : findToggle
          if (!destroyed && trigger !== visibleTrigger)
            visibleTrigger.focus({ preventScroll: true })
        },
        onReveal(id) {
          engine.select(id)
          canvas.revealSelection?.({ focusToolbar: true })
        },
      })
    },
  })
  commandMap.set('move-to', {
    id: 'move-to',
    when: () => canvas.canMoveSelection?.() ?? false,
    run() {
      const focused = mountEl.ownerDocument.activeElement
      canvas.moveSelection?.(
        focused instanceof HTMLElement && mountEl.contains(focused) ? focused : undefined,
      )
    },
  })
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
      'edit-history': i18n.t('history.title'),
      copy: i18n.t('app.copy'),
      paste: i18n.t('app.paste'),
      'move-to': i18n.t('move.title'),
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
    if (cmd.id === 'edit-history') b.setAttribute('aria-haspopup', 'dialog')
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
  const assetsToggle = btn('', () => openAssets(assetsToggle), true)
  const compactAssets = btn('', () => openAssets(compactAssets), true)
  function findPageText() {
    void commands
      .run('find-replace', makeCtx())
      .catch(() => setStatusMessage(() => i18n.t('canvas.command_failed')))
  }
  const findToggle = btn('', findPageText, true)
  const compactFind = btn('', findPageText, true)
  for (const button of [findToggle, compactFind]) {
    button.setAttribute('aria-haspopup', 'dialog')
    button.dataset.commandId = 'find-replace'
  }
  const findLabel = addRailIcon(findToggle, 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6')
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
  compactAssets.setAttribute('aria-haspopup', 'dialog')
  rail.append(structureToggle, libraryToggle, assetsToggle, pageStylesToggle, findToggle)
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
  const canvasActions = el('div', 'sigil-canvas-actions')

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

  canvasWrap.append(canvasBox, canvasActions)

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
    i18n.t('app.help_find_replace'),
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
  const settingsTitle = document.createElement('h3')
  settingsTitle.className = 'sigil-sidebar-title'
  const settingsClose = btn('×', () => closeCompactPanel(), true)
  settingsClose.classList.add('sigil-panel-close')
  settingsClose.setAttribute('aria-label', i18n.t('app.close_panel'))
  const layersBox = el('div', 'sigil-layers-box')
  layersBox.id = `sigil-layers-${panelIdSuffix}`
  const inspectorBox = document.createElement('div')
  inspectorBox.id = `sigil-inspector-drawer-${panelIdSuffix}`
  const views = el('div', 'sigil-settings-views')
  views.setAttribute('role', 'group')
  const layersView = btn('', () => switchSettingsView('layers'), true)
  const inspectorView = btn('', () => switchSettingsView('inspector'), true)
  layersView.dataset.settingsView = 'layers'
  inspectorView.dataset.settingsView = 'inspector'
  layersView.setAttribute('aria-controls', layersBox.id)
  inspectorView.setAttribute('aria-controls', inspectorBox.id)
  views.append(layersView, inspectorView)
  settingsHead.append(settingsTitle, views, settingsClose)
  right.append(settingsHead, layersBox, inspectorBox)

  const panelBackdrop = el('div', 'sigil-panel-backdrop')
  panelBackdrop.hidden = true
  panelBackdrop.setAttribute('aria-hidden', 'true')
  panelBackdrop.addEventListener('click', () => closeCompactPanel())

  body.append(rail, sidebar, canvasWrap, right, panelBackdrop)

  // —— Status ——
  const status = el('footer', 'sigil-status')
  const statusSel = document.createElement('span')
  const pathBox = el('div', 'sigil-status-path')
  const selectionPath = createSelectionPath(engine, pathBox, {
    i18n,
    onActivate() {
      closeCompactPanel(false)
      canvas.revealSelection?.({ focusToolbar: true })
    },
  })
  const editSelection = btn('', () => {
    toggleCompactPanel('settings', editSelection, 'inspector')
    if (activePanel !== 'settings') return
    const editable = inspectorBox.querySelectorAll<HTMLElement>(
      '[role="tabpanel"] input:not([disabled]), [role="tabpanel"] textarea:not([disabled]), [role="tabpanel"] select:not([disabled])',
    )
    const field =
      inspectorBox.querySelector<HTMLElement>(
        '.sigil-img-preview + .sigil-field-row button:not([disabled])',
      ) ?? Array.from(editable).find((control) => !control.closest('[hidden]'))
    ;(field ?? currentInspectorTab()).focus()
  })
  editSelection.classList.add('sigil-edit-selection')
  editSelection.setAttribute('aria-controls', settingsDrawerId)
  editSelection.hidden = true
  const statusDirty = document.createElement('span')
  statusDirty.dataset.saveState = ''
  const statusMsg = document.createElement('span')
  statusMsg.className = 'sigil-status-message'
  statusMsg.setAttribute('role', 'status')
  status.append(statusSel, pathBox, editSelection, statusDirty, statusMsg)

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
      extraTools.append(brand, hist, devices, compactAssets, compactFind)
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
    compactAssets.textContent = assetsToggle.title
    findToggle.title = i18n.t('page_text.title')
    findToggle.setAttribute('aria-label', findToggle.title)
    findLabel.textContent = i18n.t('page_text.short')
    compactFind.textContent = findToggle.title
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
    if (desktopPanel === 'structure') layers.focus('search')
  }

  function canInsertAsset(): boolean {
    const root = engine.getTree()
    return mode === 'edit' && !root.locked && (root.type === 'section' || root.type === 'column')
  }

  function openAssets(trigger: HTMLButtonElement): void {
    if (
      destroyed ||
      compactLayout !== (trigger === compactAssets) ||
      trigger.closest('[hidden]') ||
      closeAssetLibrary ||
      !canInsertAsset() ||
      mountEl.closest('[inert]')
    )
      return
    trigger.focus({ preventScroll: true })
    let inserted = false
    function insertImage(src: string, alt?: string): void {
      if (destroyed) return
      if (!canInsertAsset() || mountEl.closest('[inert]')) {
        setStatusMessage(() => i18n.t('app.insert_unavailable'))
        return
      }
      const image = blockImage(src)
      if (alt !== undefined) image.attributes = { ...image.attributes, alt }
      engine.insert(engine.getTree().id, image)
      engine.select(image.id)
      inserted = true
    }
    closeAssetLibrary = openMediaPicker({
      assets: opts.assets,
      pageImages: () => collectPageImages(engine.getTree(), opts.richText?.resolver),
      acceptsImageAttribute: opts.acceptsImageAttribute,
      i18n: {
        ...i18n,
        t: (key) => i18n.t(key === 'media.title' ? 'app.insert_image' : key),
      },
      onPick: (item) => insertImage(item.url),
      onInsertUrl: insertImage,
      onClose() {
        closeAssetLibrary = null
        if (inserted) {
          if (compactLayout) showExtraTools(false)
          canvas.revealSelection?.({ focusToolbar: compactLayout })
          if (
            compactLayout &&
            (document.activeElement === trigger || document.activeElement === document.body)
          )
            moreTools.focus({ preventScroll: true })
        }
      },
    })
  }

  function refreshSelection(): void {
    const id = engine.getSelection()
    const node = id ? findNode(engine.getTree(), id) : undefined
    const name = node?.name?.trim()
    statusSel.hidden = !!node && mode === 'edit'
    if (!statusSel.hidden) {
      statusSel.textContent = node ? name || node.type : i18n.t('status.none')
      statusSel.title = node?.id ?? ''
    }
    inspectorView.disabled = !node
    if (compactLayout && activePanel === 'settings' && settingsView === 'inspector' && !node) {
      const focused = document.activeElement
      const restoreFocus =
        focused === document.body || inspectorBox.contains(focused) || focused === inspectorView
      settingsView = 'layers'
      refreshSettingsView()
      if (restoreFocus && !focused?.closest('dialog, [role="dialog"], [role="menu"]'))
        layersView.focus()
    }
    const canEditHere = compactLayout && mode === 'edit' && !activePanel && !!node
    editSelection.hidden = !canEditHere
    if (canEditHere) {
      editSelection.textContent = name
        ? `${i18n.t('canvas.edit')} ${name}`
        : i18n.t('app.edit_selection')
    }
  }

  function refreshCompactPanels(): void {
    if (compactLayout ? activePanel !== 'blocks' : desktopPanel !== 'blocks')
      dismissBlockPlacement?.()
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
    refreshSettingsView()
    refreshSelection()
  }

  function refreshSettingsView(): void {
    const viewingLayers = settingsView === 'layers'
    views.hidden = !compactLayout
    settingsTitle.hidden = compactLayout
    settingsTitle.textContent = i18n.t('app.component_settings')
    views.setAttribute('aria-label', i18n.t('app.panel_view'))
    layersView.textContent = i18n.t('app.layers')
    inspectorView.textContent = i18n.t('app.component_settings')
    layersView.setAttribute('aria-pressed', String(viewingLayers))
    inspectorView.setAttribute('aria-pressed', String(!viewingLayers))
    right.dataset.view = settingsView
    right.setAttribute(
      'aria-label',
      i18n.t(compactLayout && viewingLayers ? 'app.panel_settings' : 'app.component_settings'),
    )
    layersBox.hidden = compactLayout && !viewingLayers
    inspectorBox.hidden = compactLayout && viewingLayers
    layers.setSearchVisible(
      compactLayout ? activePanel === 'settings' && viewingLayers : desktopPanel === 'structure',
    )
  }

  function currentInspectorTab(): HTMLElement {
    return (
      inspectorBox.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? inspectorView
    )
  }

  function switchSettingsView(next: SettingsView): void {
    if (
      !compactLayout ||
      activePanel !== 'settings' ||
      (next === 'inspector' && inspectorView.disabled)
    )
      return
    settingsView = next
    refreshSettingsView()
    if (next === 'layers') layers.focus()
    else currentInspectorTab().focus({ preventScroll: true })
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
    if (!next && (focusedLayer || focused === settingsToggle || focused === layersView))
      desktopPanel = 'structure'
    else if (
      !next &&
      (blocksBox.contains(focused) || focused === blocksClose || focused === blocksToggle)
    )
      desktopPanel = libraryToggle.hidden ? 'structure' : 'blocks'
    closeAssetLibrary?.()
    compactLayout = next
    selectionPath.setCompact(next)
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
    else if (!next && (focusedLayer || focused === layersView)) layers.focus()
    else if (!next && focused === inspectorView) currentInspectorTab().focus()
    else if (next && (focused === assetsToggle || assetDialogWasOpen)) moreTools.focus()
    else if (!next && (focused === compactAssets || assetDialogWasOpen)) assetsToggle.focus()
    else if (!next && focused === moreTools) editBtn.focus()
    else if (focused instanceof HTMLElement && topbar.contains(focused)) {
      if (next && (focused === editBtn || focused === previewBtn)) currentModeAction().focus()
      else focused.focus({ preventScroll: true })
    }
  }

  function toggleCompactPanel(
    panel: CompactPanel,
    trigger: HTMLElement = getPanelToggle(panel),
    view: SettingsView = 'layers',
  ): void {
    if (!compactLayout || mode === 'preview') return
    if (activePanel === panel) {
      closeCompactPanel()
      return
    }
    showExtraTools(false)
    activePanel = panel
    panelTrigger = trigger
    settingsView = view
    refreshCompactPanels()
    if (panel === 'blocks') blocksClose.focus()
    else if (view === 'layers') layersView.focus()
    else currentInspectorTab().focus()
  }

  function openCanvasSettings(trigger: HTMLElement): void {
    if (!compactLayout) return
    if (activePanel === 'settings') switchSettingsView('inspector')
    else toggleCompactPanel('settings', trigger, 'inspector')
  }

  function closeCompactPanel(restoreFocus = true): void {
    if (!compactLayout || !activePanel) return
    const previous = activePanel
    const trigger = panelTrigger
    activePanel = null
    panelTrigger = null
    refreshCompactPanels()
    if (restoreFocus)
      (trigger?.isConnected &&
      !trigger.closest('[hidden], [inert]') &&
      !trigger.matches(':disabled')
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

  function onCompactPanelKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.key !== 'Escape') return
    const target = e.target instanceof Element ? e.target : document.activeElement
    if (
      !target ||
      !root.contains(target) ||
      target.closest('dialog, [role="dialog"], [role="menu"]')
    )
      return
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
    const groups = [['copy', 'paste'], ['move-to', 'move-up', 'move-down'], ['delete']]
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

  function openBlockPlacement(id: string, trigger: HTMLElement): (() => void) | undefined {
    if (!blocksPanel?.beginInsertAfter || mode !== 'edit' || mountEl.closest('[inert]')) return
    dismissBlockPlacement?.()
    const previousPanel = desktopPanel
    if (compactLayout) toggleCompactPanel('blocks', trigger)
    else {
      desktopPanel = 'blocks'
      refreshCompactPanels()
    }
    function dismiss(): void {
      if (dismissBlockPlacement !== dismiss) return
      dismissBlockPlacement = null
      blocksPanel?.cancelInsertAfter?.()
    }
    dismissBlockPlacement = dismiss
    blocksPanel.beginInsertAfter(id, (inserted) => {
      if (dismissBlockPlacement !== dismiss || destroyed) return
      dismissBlockPlacement = null
      if (compactLayout) closeCompactPanel(false)
      else {
        desktopPanel = previousPanel
        refreshCompactPanels()
      }
      if (inserted) canvas.revealSelection?.()
      if (inserted || engine.getSelection() === id) {
        if (!trigger.closest('[hidden], [inert]') && !trigger.matches(':disabled'))
          trigger.focus({ preventScroll: true })
        else (compactLayout ? blocksToggle : libraryToggle).focus({ preventScroll: true })
      }
    })
    return dismiss
  }

  const canvas = createCanvas(engine, canvasBox, {
    selectionToolbarContainer: canvasActions,
    selectionCommands: { registry: commands, context: makeCtx },
    onInsertAfter: libraryToggle.hidden ? undefined : openBlockPlacement,
    onComponentMoved: () => closeCompactPanel(false),
    onFrameImage(id, trigger) {
      openCanvasSettings(trigger)
      inspector.openImageFraming?.(id)
    },
    onEditImageLink(id, trigger) {
      openCanvasSettings(trigger)
      inspector.openImageLink?.(id)
    },
    onEditLink(id, trigger) {
      openCanvasSettings(trigger)
      inspector.openLinkSettings?.(id)
    },
    onEditLeadingText(id, trigger) {
      openCanvasSettings(trigger)
      inspector.openLeadingText?.(id)
    },
    onEditTypography(id, trigger) {
      openCanvasSettings(trigger)
      inspector.openTypography?.(id)
    },
    onEditingDirtyChange(dirty) {
      inlineDirty = dirty
      if (persistenceReady && !destroyed) refreshChrome()
    },
    onReplaceImage: (id, trigger) => inspector.replaceImage?.(id, trigger),
    rendererOptions: { shortcodeResolver, htmlPolicy: policy },
    richText: opts.richText,
    i18n,
    chrome: false,
    onContextMenu: (_id, x, y) => openSelectionMenu(x, y),
  })
  canvas.iframe.style.minHeight = '0'
  const inspector = createInspector(engine, inspectorBox, {
    onRevealLinkTarget() {
      if (compactLayout) closeCompactPanel(false)
      canvas.revealSelection?.({ focusToolbar: true })
    },
    faq: { createItem: blockFAQItem, revealSelection: () => canvas.revealSelection?.() },
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
    richText: opts.richText?.resolver,
    acceptsCustomGridTracks: opts.acceptsCustomGridTracks,
    acceptsColorValue: opts.acceptsColorValue,
    acceptsSpacingValue: opts.acceptsSpacingValue,
    acceptsTypographyValue: opts.acceptsTypographyValue,
    assets: opts.assets,
    i18n,
    fetchJSON,
  })
  const unsubDevice = canvas.subscribeDevice((next) => inspector.setDevice(next))
  const layers = createLayersPanel(engine, layersBox, {
    searchable: true,
    headingOutline: true,
    richText: opts.richText?.resolver,
    i18n,
    preserveSearchOnActivate: () => compactLayout && activePanel === 'settings',
    onActivate() {
      canvas.revealSelection?.()
      if (compactLayout && activePanel === 'settings') switchSettingsView('inspector')
    },
    onContextMenu: (_id, x, y) => {
      openSelectionMenu(x, y)
    },
  })
  refreshCompactPanels()
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
        blockPinStorageKey: opts.blockPinStorageKey,
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
    if (next === 'preview') {
      pageTextDialog?.close()
      blocksPanel?.cancelInsertAfter?.()
      closeAssetLibrary?.()
    }
    canvas.setMode(next)
    selectionPath.setVisible(next === 'edit')
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
    compactAssets.disabled = assetsToggle.disabled
    const findCommand = commands.get('find-replace')
    findToggle.disabled = compactFind.disabled = findCommand?.when ? !findCommand.when(ctx) : false
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
      i18n.t('app.help_find_replace'),
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

    const missingSource = document.createElement('p')
    missingSource.className = 'sigil-muted'
    missingSource.setAttribute('role', 'status')
    missingSource.hidden = true
    const pageLinks = createPageLinksPanel(doc.root, {
      i18n,
      richText: opts.richText?.resolver,
      onEdit(id) {
        if (closed) return
        if (mountEl.closest('[inert]') || !pageLinks.hasSource(engine.getTree(), id)) {
          missingSource.hidden = false
          missingSource.textContent = i18n.t('app.export_link_missing')
          return
        }
        close(false)
        if (mode === 'preview') setMode('edit')
        engine.select(id)
        canvas.revealSelection?.()
        openCanvasSettings(editSelection)
        inspector.openLinkSettings?.(id, 'address')
      },
    })

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
      pageLinks.refreshLocale()
      if (!missingSource.hidden) missingSource.textContent = i18n.t('app.export_link_missing')
      summary.textContent = i18n.t('app.export_source')
      copyBtn.textContent = copied ? i18n.t('app.copied') : i18n.t('app.copy')
      actionsCloseBtn.textContent = i18n.t('app.close')
    }

    panel.append(head, hint, pageLinks.el, missingSource, source, actionsRow)
    backdrop.appendChild(panel)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close()
    })
    document.body.appendChild(backdrop)
    dlBtn.focus()

    function onDialogKeyDown(e: KeyboardEvent): void {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      trapFocus(e, backdrop)
    }
    document.addEventListener('keydown', onDialogKeyDown)

    function close(restoreFocus = true): void {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onDialogKeyDown)
      pageLinks.destroy()
      backdrop.remove()
      closeExportDialog = null
      refreshExportDialog = null
      if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus()
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
    if (
      t instanceof Element &&
      t.closest(
        'dialog, [role="dialog"], [role="menu"], [inert], .sigil-layer-search, .sigil-layer-views, .sigil-heading-outline, .sigil-block-pin, .sigil-blocks-pin-filter, .sigil-settings-views',
      )
    )
      return
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
    if (
      cmd.id === 'find-replace' &&
      (!t || !root.contains(t) || e.defaultPrevented || e.isComposing || e.keyCode === 229)
    )
      return
    const selectedId = field && engine.getSelection()
    if (selectedId && findNode(engine.getTree(), selectedId)?.locked) return
    e.preventDefault()
    void commands
      .run(cmd.id, makeCtx())
      .catch(() => setStatusMessage(() => i18n.t('canvas.command_failed')))
  }
  document.addEventListener('keydown', onKeyDown)

  function setLocale(next: Locale): void {
    if (destroyed || next === i18n.getLocale()) return
    closeMenu?.()
    i18n.setLocale(next)
    refreshLocaleChrome()
  }

  const api: SigilApp<HistoryEngine> = {
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
      historyDialog?.close()
      pageTextDialog?.close()
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
      selectionPath.destroy()
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
