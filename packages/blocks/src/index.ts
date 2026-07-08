import { createId, type ComponentNode } from '@cluion/sigil-core'

/**
 * 建立容器區塊
 */
export function blockSection(): ComponentNode {
  return { id: createId(), type: 'section', children: [] }
}

/**
 * 建立文字區塊
 */
export function blockText(content = ''): ComponentNode {
  return { id: createId(), type: 'text', content }
}

/**
 * 建立圖片區塊
 */
export function blockImage(src = ''): ComponentNode {
  return { id: createId(), type: 'image', attributes: { src } }
}

/**
 * 建立按鈕區塊
 */
export function blockButton(label = '按鈕'): ComponentNode {
  return { id: createId(), type: 'button', content: label }
}

/**
 * 建立欄區塊
 */
export function blockColumn(): ComponentNode {
  return { id: createId(), type: 'column', children: [] }
}

// 預設區塊工廠集
export const basicBlocks = {
  section: blockSection,
  text: blockText,
  image: blockImage,
  button: blockButton,
  column: blockColumn,
}
