import { createId, cloneWithNewIds, type ComponentNode, type TemplateDef } from '@cluion/sigil-core'

/**
 * 區塊定義 — 圖示、分類、搜尋關鍵字 + create 工廠
 */
export interface BlockDefinition {
  id: string
  label: string
  category?: string
  /** 短圖示，emoji 或單字 */
  icon?: string
  keywords?: string[]
  create: () => ComponentNode
}

/** 舊 API：label → 工廠 */
export type BlockFactory = () => ComponentNode

export type BlocksInput = Record<string, BlockFactory> | BlockDefinition[]

/**
 * 宣告區塊定義
 */
export function defineBlock(def: BlockDefinition): BlockDefinition {
  return def
}

/**
 * 轉換為 BlockDefinition 陣列
 */
export function normalizeBlocks(input: BlocksInput | undefined): BlockDefinition[] {
  if (!input) return []
  if (Array.isArray(input)) return input.map((d) => ({ category: '一般', ...d }))
  return Object.entries(input).map(([label, create]) =>
    defineBlock({
      id: label,
      label,
      category: '一般',
      create,
    }),
  )
}

export function blockSection(): ComponentNode {
  return { id: createId(), type: 'section', children: [] }
}

export function blockText(content = '文字'): ComponentNode {
  return { id: createId(), type: 'text', content }
}

export function blockImage(src = 'https://placehold.co/120'): ComponentNode {
  return { id: createId(), type: 'image', attributes: { src } }
}

export function blockButton(label = '按鈕'): ComponentNode {
  return { id: createId(), type: 'button', content: label }
}

export function blockColumn(): ComponentNode {
  return { id: createId(), type: 'column', children: [] }
}

export function blockShortcode(
  name: string,
  props: Record<string, unknown> = {},
): ComponentNode {
  return { id: createId(), type: 'shortcode', shortcode: { name, props } }
}

/**
 * 範本轉 BlockDefinition — 插入時 cloneWithNewIds 並重設鎖定／隱藏
 *
 * 與 paste 命令同路徑：clone 帶新 id 避免衝突，重設 locked／hidden 維持乾淨插入
 */
export function templateToBlockDef(tpl: TemplateDef): BlockDefinition {
  return defineBlock({
    id: `template:${tpl.id}`,
    label: tpl.label,
    category: tpl.category ?? '範本',
    icon: tpl.icon,
    create: () => {
      const cloned = cloneWithNewIds(tpl.node)
      delete cloned.locked
      delete cloned.hidden
      return cloned
    },
  })
}

/** 舊版 Record 預設區塊 */
export const basicBlocks: Record<string, BlockFactory> = {
  section: blockSection,
  text: blockText,
  image: blockImage,
  button: blockButton,
  column: blockColumn,
}

/** 含分類與圖示的預設區塊 */
export const basicBlockDefs: BlockDefinition[] = [
  defineBlock({
    id: 'section',
    label: '容器',
    category: '版面',
    icon: '▦',
    keywords: ['section', 'container', '區塊'],
    create: blockSection,
  }),
  defineBlock({
    id: 'column',
    label: '欄',
    category: '版面',
    icon: '▥',
    keywords: ['column', 'col'],
    create: blockColumn,
  }),
  defineBlock({
    id: 'text',
    label: '文字',
    category: '內容',
    icon: 'T',
    keywords: ['text', 'paragraph'],
    create: () => blockText(),
  }),
  defineBlock({
    id: 'image',
    label: '圖片',
    category: '媒體',
    icon: '🖼',
    keywords: ['image', 'img', 'media'],
    create: () => blockImage(),
  }),
  defineBlock({
    id: 'button',
    label: '按鈕',
    category: '內容',
    icon: '▢',
    keywords: ['button', 'btn', 'cta'],
    create: () => blockButton(),
  }),
]
