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
  type TemplateStore,
  type CommandDefinition,
  type CommandContext,
  type EditorHooks,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createPropsPanel,
  createBlocksPanel,
  createLayersPanel,
  createSelectionPath,
  createTemplateLibraryController,
  applyTheme,
  openContextMenu,
  openHistoryDialog,
  openPageTextDialog,
  type BlocksInput,
  type ThemeChoice,
  type PropsPanelOptions,
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
import { blockFAQItem, templateToBlockDef } from '@cluion/sigil-blocks'

const i18nMessages = {
  zh: {
    'history.title': '編輯歷程',
    'page_text.title': '尋找與取代',
    'canvas.title': '編輯畫布',
    'canvas.edit': '✏ 編輯',
    'canvas.preview': '👁 預覽',
    'canvas.empty_container': '拖入元件',
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
    'media.title': '媒體庫',
    'media.search': '搜尋圖片名稱',
    'media.sources': '圖片來源',
    'media.library': '素材庫',
    'media.page_images': '本頁圖片',
    'media.search_page': '搜尋本頁圖片',
    'media.page_uses': '本頁使用 {count} 次',
    'media.more': '顯示更多圖片',
    'media.empty_page': '本頁尚無圖片',
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
    'inspector.tab_content': '內容',
    'inspector.tab_style': '樣式',
    'inspector.tab_advanced': '進階',
    'inspector.empty': '尚未選取元件',
    'inspector.empty_hint': '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。',
    'inspector.no_content': '此節點無可編輯內容欄位，可切到樣式分頁',
    'inspector.image': '圖片',
    'inspector.image_alt': '替代文字',
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
    'style.property.font-size': '字級',
    'style.property.font-weight': '字重',
    'text_format.label': '文字格式',
    'text_format.paragraph': '段落',
    'text_format.inline': '行內文字',
    'text_format.heading': '標題 {level}（H{level}）',
    'color.pick': '選擇顏色',
    'style.property.color': '文字顏色',
    'style.property.padding': '內距',
    'style.property.margin': '外距',
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
    'editor.save_as_template': '存為範本',
    'editor.template_name': '範本名稱',
    'editor.copy': '複製',
    'editor.paste': '貼上',
    'editor.move_up': '上移',
    'editor.move_down': '下移',
    'editor.delete': '刪除',
    'editor.context_menu': '節點操作',
  },
  en: {
    'history.title': 'Edit history',
    'page_text.title': 'Find and replace',
    'canvas.title': 'Canvas',
    'canvas.edit': '✏ Edit',
    'canvas.preview': '👁 Preview',
    'canvas.empty_container': 'Drop components here',
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
    'media.title': 'Media library',
    'media.search': 'Search images by name',
    'media.sources': 'Image sources',
    'media.library': 'Asset library',
    'media.page_images': 'Page images',
    'media.search_page': 'Search page images',
    'media.page_uses': 'Uses on this page: {count}',
    'media.more': 'Show more images',
    'media.empty_page': 'This page has no images',
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
    'inspector.tab_content': 'Content',
    'inspector.tab_style': 'Style',
    'inspector.tab_advanced': 'Advanced',
    'inspector.empty': 'No component selected',
    'inspector.empty_hint':
      'Select a block on the canvas to edit its content, styles, and advanced properties.',
    'inspector.no_content': 'This node has no editable content fields. Use the Style tab instead.',
    'inspector.image': 'Image',
    'inspector.image_alt': 'Alternative text',
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
    'style.property.font-size': 'Font size',
    'style.property.font-weight': 'Font weight',
    'text_format.label': 'Text format',
    'text_format.paragraph': 'Paragraph',
    'text_format.inline': 'Inline text',
    'text_format.heading': 'Heading {level} (H{level})',
    'color.pick': 'Choose color',
    'style.property.color': 'Text color',
    'style.property.padding': 'Padding',
    'style.property.margin': 'Margin',
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
    'editor.save_as_template': 'Save as Template',
    'editor.template_name': 'Template name',
    'editor.copy': 'Copy',
    'editor.paste': 'Paste',
    'editor.move_up': 'Move Up',
    'editor.move_down': 'Move Down',
    'editor.delete': 'Delete',
    'editor.context_menu': 'Node actions',
  },
} satisfies MessageCatalog

export interface EditorOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  /** 頁面存取 adapter */
  store?: ProjectStore
  /** 供原生圖片與 shortcode 媒體欄位選取和上傳素材。 */
  assets?: PropsPanelOptions['assets']
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
  acceptsTypographyValue?: PropsPanelOptions['acceptsTypographyValue']
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
  /** 主題：light／dark／auto；預設 auto。SDK 無切換按鈕，宿主自理 */
  theme?: ThemeChoice
  /** 額外命令可覆寫同 id 預設 */
  commands?: CommandDefinition[]
  /** 生命週期 hooks */
  hooks?: EditorHooks
}

export interface SigilEditor<E extends Engine = Engine> {
  engine: E
  /** Pure detached snapshot; use save() to write to ProjectStore. */
  toJSON(): SigilDoc
  /** Persist the revision captured at invocation; rejects on failure. */
  save(): Promise<SigilDoc>
  isSaving(): boolean
  isDirty(): boolean
  toHTML(mode?: HtmlMode): string
  /** 執行已註冊命令 */
  runCommand(id: string): Promise<boolean>
  /** 取得目前介面語系 */
  getLocale(): Locale
  /** 原地切換介面語系，不重建 engine */
  setLocale(locale: Locale): void
  destroy(): void
}

export { defineCommand, createDefaultEditingCommands }
export type { CommandDefinition, CommandContext, EditorHooks, RichTextAdapter }

/**
 * 建立 editor — SDK 級組合
 * 開箱產品殼請用 `@cluion/sigil-app` 的 createApp
 */
export function createEditor(opts: EditorOptions): SigilEditor<HistoryEngine> {
  if (opts.richText && !opts.sanitize) {
    throw new Error('createEditor：richText 必須搭配 sanitize')
  }
  const mountEl =
    typeof opts.mount === 'string' ? document.querySelector<HTMLElement>(opts.mount) : opts.mount
  if (!mountEl) throw new Error('createEditor：mount 目標不存在')

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
  const hooks = opts.hooks

  let clipboard: ComponentNode | null = null
  let templateLibrary: TemplateLibraryController | null = null
  let destroyed = false
  let pendingCanvasEdit = false
  let historyDialog: ReturnType<typeof openHistoryDialog> | undefined
  let pageTextDialog: ReturnType<typeof openPageTextDialog> | undefined
  let searchQuery = ''
  let matchCase = false
  let previewing = false

  const persistence = createProjectPersistence({
    engine,
    store,
    hooks,
    onStateChange: () => historyDialog?.setSavedId(persistence.getSavedHistoryId()),
  })

  async function save(): Promise<SigilDoc> {
    canvas.commitEditing({ forSave: true })
    return persistence.save()
  }

  const commandMap = new Map<string, CommandDefinition>()
  for (const c of createDefaultEditingCommands()) commandMap.set(c.id, c)
  commandMap.set('edit-history', {
    id: 'edit-history',
    when: () => !destroyed,
    run() {
      if (historyDialog) return
      canvas.commitEditing({ forSave: true })
      commandError.textContent = ''
      historyDialog = openHistoryDialog({
        engine,
        mount: layout,
        i18n,
        trigger: historyButton,
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
    when: () => !destroyed && !previewing && !mountEl.closest('[inert]'),
    run() {
      if (pageTextDialog) return
      canvas.commitEditing({ forSave: true })
      commandError.textContent = ''
      pageTextDialog = openPageTextDialog({
        mount: layout,
        engine,
        trigger: findButton,
        i18n,
        device: canvas.getDevice(),
        richText: opts.richText?.resolver,
        initialQuery: searchQuery,
        initialMatchCase: matchCase,
        onQueryChange(query, caseSensitive) {
          searchQuery = query
          matchCase = caseSensitive
        },
        onClose: () => {
          pageTextDialog = undefined
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
  // 範本：另存為範本命令
  if (opts.templates) {
    commandMap.set(
      'save-as-template',
      defineCommand({
        id: 'save-as-template',
        label: i18n.t('editor.save_as_template'),
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
            .prompt(i18n.t('editor.template_name'), node.name?.trim() || node.type)
            ?.trim()
          if (!label) return
          await templateLibrary?.save({ id: createId(), label, node })
        },
      }),
    )
  }
  for (const command of opts.commands ?? []) {
    if (command.id === 'save') {
      commandMap.set(command.id, {
        ...command,
        run(ctx) {
          canvas.commitEditing({ forSave: true })
          return command.run(ctx)
        },
      })
    } else {
      commandMap.set(command.id, command)
    }
  }
  const commands = createCommandRegistry([...commandMap.values()])

  function makeCtx(): CommandContext {
    return {
      engine,
      getDoc: () => engine.toJSON(),
      save: async () => {
        await save()
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
      copy: i18n.t('editor.copy'),
      paste: i18n.t('editor.paste'),
      'move-to': i18n.t('move.title'),
      'move-up': i18n.t('editor.move_up'),
      'move-down': i18n.t('editor.move_down'),
      delete: i18n.t('editor.delete'),
      'save-as-template': i18n.t('editor.save_as_template'),
    }
    return known[cmd.id] ?? cmd.label ?? cmd.id
  }

  mountEl.replaceChildren()
  const layout = document.createElement('div')
  layout.style.display = 'flex'
  layout.style.flexDirection = 'column'
  layout.style.height = '100%'
  layout.style.maxHeight = '100dvh'
  const panels = document.createElement('div')
  panels.style.flex = '1'
  panels.style.minHeight = '0'
  panels.style.display = 'flex'
  panels.style.gap = '12px'
  panels.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 2fr)'
  panels.style.gridTemplateRows = 'minmax(0, 2fr) minmax(0, 1fr)'
  const blocksBox = document.createElement('div')
  blocksBox.style.width = '140px'
  blocksBox.style.overflowY = 'auto'
  const canvasColumn = document.createElement('div')
  canvasColumn.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column'
  canvasColumn.style.gridArea = '1 / 1 / 2 / -1'
  const canvasBox = document.createElement('div')
  canvasBox.style.cssText = 'flex:1 1 420px;min-width:0;min-height:0'
  const canvasActions = document.createElement('div')
  canvasActions.className = 'sigil-canvas-actions'
  canvasActions.style.cssText = 'flex:none;min-width:0'
  canvasColumn.append(canvasBox, canvasActions)
  const rightBox = document.createElement('div')
  rightBox.style.width = '260px'
  rightBox.style.overflowY = 'auto'
  rightBox.style.display = 'flex'
  rightBox.style.flexDirection = 'column'
  rightBox.style.gap = '8px'
  const layersTitle = document.createElement('h4')
  layersTitle.textContent = i18n.t('layers.title')
  const layersHeader = document.createElement('div')
  layersHeader.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px'
  const findButton = document.createElement('button')
  findButton.type = 'button'
  findButton.className = 'sigil-btn sigil-btn--ghost'
  findButton.style.cssText = 'min-height:44px;max-width:100%'
  findButton.setAttribute('aria-haspopup', 'dialog')
  findButton.dataset.commandId = 'find-replace'
  findButton.textContent = i18n.t('page_text.title')
  findButton.addEventListener('click', () => {
    void commands.run('find-replace', makeCtx()).catch(() => {
      commandError.textContent = i18n.t('canvas.command_failed')
    })
  })
  layersHeader.append(layersTitle, findButton)
  const layersBox = document.createElement('div')
  layersBox.style.height = '200px'
  layersBox.style.flexShrink = '0'
  layersBox.style.overflow = 'auto'
  layersBox.style.border = '1px solid #eee'
  const propsTitle = document.createElement('h4')
  propsTitle.textContent = i18n.t('props.title')
  const propsBox = document.createElement('div')
  rightBox.append(layersHeader, layersBox, propsTitle, propsBox)
  panels.append(blocksBox, canvasColumn, rightBox)
  const pathBox = document.createElement('div')
  pathBox.style.cssText = 'flex:1;min-width:0'
  const footer = document.createElement('div')
  footer.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-width:0'
  const historyButton = document.createElement('button')
  historyButton.type = 'button'
  historyButton.className = 'sigil-btn sigil-btn--ghost'
  historyButton.style.cssText = 'min-height:44px;max-width:100%'
  historyButton.dataset.commandId = 'edit-history'
  historyButton.setAttribute('aria-haspopup', 'dialog')
  historyButton.textContent = i18n.t('history.title')
  historyButton.addEventListener('click', () => {
    void commands.run('edit-history', makeCtx()).catch(() => {
      commandError.textContent = i18n.t('canvas.command_failed')
    })
  })
  const commandError = document.createElement('span')
  commandError.setAttribute('role', 'status')
  footer.append(pathBox, historyButton, commandError)
  layout.append(panels, footer)
  mountEl.appendChild(layout)

  // 主題：套到 layout；SDK 無 toggle，宿主可 destroy+remount 切換
  const cleanupTheme = applyTheme(layout, opts.theme ?? 'auto')
  const selectionPath = createSelectionPath(engine, pathBox, {
    i18n,
    onActivate: () => canvas.revealSelection?.({ focusToolbar: true }),
  })
  function resizeLayout(width: number): void {
    if (width <= 0) return
    selectionPath.setCompact(width <= RESPONSIVE_BREAKPOINT_WIDTHS.mobile)
    const compact = width <= RESPONSIVE_BREAKPOINT_WIDTHS.tablet
    panels.style.display = compact ? 'grid' : 'flex'
    blocksBox.style.width = compact ? 'auto' : '140px'
    rightBox.style.width = compact ? 'auto' : '260px'
  }
  const measureLayout = () => resizeLayout(layout.getBoundingClientRect().width)
  const layoutObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(([entry]) => {
          if (entry) resizeLayout(entry.contentRect.width)
        })
  if (layoutObserver) layoutObserver.observe(layout)
  else window.addEventListener('resize', measureLayout)
  measureLayout()

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
      theme: layout.classList.contains('sigil-theme-dark') ? 'dark' : 'light',
      ariaLabel: i18n.t('editor.context_menu'),
      onClose: () => (closeMenu = null),
    })
  }

  const canvas = createCanvas(engine, canvasBox, {
    selectionToolbarContainer: canvasActions,
    onModeChange(mode) {
      previewing = mode === 'preview'
      selectionPath.setVisible(!previewing)
      findButton.disabled = previewing
      if (previewing) pageTextDialog?.close()
    },
    selectionCommands: { registry: commands, context: makeCtx },
    onReplaceImage: (id, trigger) => props.replaceImage?.(id, trigger),
    onFrameImage: () => propsBox.querySelector<HTMLElement>('.sigil-image-framing')?.focus(),
    onEditImageLink: () =>
      propsBox.querySelector<HTMLInputElement>('input[data-image-link-address]')?.focus(),
    onEditLink: () => propsBox.querySelector<HTMLSelectElement>('[data-link-kind]')?.focus(),
    onEditLeadingText: () =>
      propsBox.querySelector<HTMLInputElement>('input[data-leading-text]:enabled')?.focus(),
    onEditTypography: () =>
      propsBox.querySelector<HTMLSelectElement>('[data-typography-preset]')?.focus(),
    onInsertAfter:
      opts.templates || Object.keys(opts.blocks ?? {}).length
        ? (id, trigger) => {
            blocksPanel?.beginInsertAfter?.(id, (inserted) => {
              if (inserted) canvas.revealSelection?.()
              if (
                (inserted || engine.getSelection() === id) &&
                !trigger.closest('[hidden], [inert]')
              )
                trigger.focus({ preventScroll: true })
            })
            return () => blocksPanel?.cancelInsertAfter?.()
          }
        : undefined,
    rendererOptions: { shortcodeResolver, htmlPolicy: policy },
    richText: opts.richText,
    i18n,
    onEditingDirtyChange(dirty) {
      pendingCanvasEdit = dirty
    },
    onContextMenu: (_id, x, y) => openSelectionMenu(x, y),
  })
  canvas.iframe.style.minHeight = '0'
  canvas.iframe.style.boxSizing = 'border-box'
  const props = createPropsPanel(engine, propsBox, {
    assets: opts.assets,
    onRevealLinkTarget: () => canvas.revealSelection?.({ focusToolbar: true }),
    faq: { createItem: blockFAQItem, revealSelection: () => canvas.revealSelection?.() },
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
    richText: opts.richText?.resolver,
    acceptsCustomGridTracks: opts.acceptsCustomGridTracks,
    acceptsColorValue: opts.acceptsColorValue,
    acceptsSpacingValue: opts.acceptsSpacingValue,
    acceptsTypographyValue: opts.acceptsTypographyValue,
    i18n,
    fetchJSON,
  })
  const unsubDevice = canvas.subscribeDevice((device) => props.setDevice(device))
  const layers = createLayersPanel(engine, layersBox, {
    searchable: true,
    headingOutline: true,
    richText: opts.richText?.resolver,
    i18n,
    onActivate: () => canvas.revealSelection?.(),
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

  const unsubSel = engine.subscribe((ev) => {
    if (ev.type === 'selection') runOnSelect(hooks, ev.id, engine)
  })

  let composingField: EventTarget | null = null
  function onFieldComposition(e: Event): void {
    composingField = e.type === 'compositionstart' ? e.target : null
  }
  propsBox.addEventListener('compositionstart', onFieldComposition)
  propsBox.addEventListener('compositionend', onFieldComposition)
  propsBox.addEventListener('focusout', onFieldComposition)

  function onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || layout.closest('[inert]'))
      return
    const t = e.target as HTMLElement | null
    if (
      t instanceof Element &&
      t.closest(
        'dialog, [role="dialog"], [role="menu"], [inert], .sigil-layer-search, .sigil-layer-views, .sigil-heading-outline, .sigil-block-pin, .sigil-blocks-pin-filter',
      )
    )
      return
    const field =
      t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable)
    if (field) {
      if (!propsBox.contains(t) || composingField === t || !(e.ctrlKey || e.metaKey)) return
      if (t.matches(':disabled, [readonly], [aria-readonly="true"]')) return
      const id = engine.getSelection()
      if (id && findNode(engine.getTree(), id)?.locked) return
    }
    const cmd = commands.match(e, makeCtx())
    if (!cmd || (field && cmd.id !== 'save')) return
    if (cmd.id === 'find-replace' && (!t || !layout.contains(t))) return
    e.preventDefault()
    void commands.run(cmd.id, makeCtx()).catch(() => {
      commandError.textContent = i18n.t('canvas.command_failed')
    })
  }
  document.addEventListener('keydown', onKeyDown)

  runAfterLoad(hooks, engine.toJSON(), engine)

  function setLocale(next: Locale): void {
    if (destroyed || next === i18n.getLocale()) return
    closeMenu?.()
    i18n.setLocale(next)
    layersTitle.textContent = i18n.t('layers.title')
    propsTitle.textContent = i18n.t('props.title')
    historyButton.textContent = i18n.t('history.title')
    findButton.textContent = i18n.t('page_text.title')
    if (commandError.textContent) commandError.textContent = i18n.t('canvas.command_failed')
  }

  return {
    engine,
    toJSON() {
      return structuredClone(engine.toJSON())
    },
    toHTML(mode?: HtmlMode) {
      return toHTML(engine.toJSON(), {
        shortcodeResolver,
        richTextResolver: opts.richText?.resolver,
        sanitize: opts.sanitize,
        mode,
      })
    },
    save,
    isDirty: () => pendingCanvasEdit || persistence.isDirty(),
    isSaving: persistence.isSaving,
    runCommand(id: string) {
      return commands.run(id, makeCtx())
    },
    getLocale() {
      return i18n.getLocale()
    },
    setLocale,
    destroy() {
      if (destroyed) return
      destroyed = true
      persistence.destroy()
      runBeforeDestroy(hooks, engine)
      historyDialog?.close()
      pageTextDialog?.close()
      closeMenu?.()
      layoutObserver?.disconnect()
      if (!layoutObserver) window.removeEventListener('resize', measureLayout)
      selectionPath.destroy()
      cleanupTheme()
      document.removeEventListener('keydown', onKeyDown)
      propsBox.removeEventListener('compositionstart', onFieldComposition)
      propsBox.removeEventListener('compositionend', onFieldComposition)
      propsBox.removeEventListener('focusout', onFieldComposition)
      unsubSel()
      unsubDevice()
      templateLibrary?.destroy()
      blocksPanel?.destroy()
      layers.destroy()
      props.destroy()
      canvas.destroy()
      engine.destroy()
    },
  }
}
