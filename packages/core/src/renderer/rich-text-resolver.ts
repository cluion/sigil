import type { ComponentNode } from '../model/types.js'

/**
 * 富文字 resolver
 *
 * 只判斷節點與讀取未信任 markup，不直接操作 DOM
 */
export interface RichTextResolver {
  supports(node: ComponentNode): boolean
  read(node: ComponentNode): string
}
