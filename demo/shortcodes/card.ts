import { defineShortcode } from '@cluion/sigil-shortcode'

/**
 * 卡片 shortcode — 示範 slots:template 含 <slot>,可拖子節點進去
 */
export const cardDef = defineShortcode({
  name: 'card',
  label: '卡片(可拖入)',
  template:
    '<div style="border:1px solid #ccc;padding:8px;min-height:40px">' +
    '<slot>拖入元件</slot>' +
    '</div>',
})
