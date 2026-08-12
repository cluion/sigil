import { createId, type ComponentNode } from '@cluion/sigil-core'
import type { BlockDefinition } from './index.js'

/** Hero 區塊可覆寫文案 */
export interface HeroBlockOptions {
  eyebrow?: string
  title?: string
  description?: string
  ctaLabel?: string
  ariaLabel?: string
}

/**
 * 建立置中 Hero
 *
 * 只使用原生節點與 inline responsive styles，不依賴遠端資源
 */
export function blockHero(options: HeroBlockOptions = {}): ComponentNode {
  return {
    id: createId(),
    type: 'section',
    name: '主視覺',
    attributes: { 'aria-label': options.ariaLabel ?? '主視覺' },
    style: {
      'box-sizing': 'border-box',
      width: '100%',
      'min-height': '34rem',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '1.5rem',
      padding: '6rem 3rem',
      overflow: 'hidden',
      color: '#0f172a',
      'text-align': 'center',
      background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 52%, #f5f3ff 100%)',
      border: '1px solid #e2e8f0',
      'border-radius': '1.5rem',
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
    },
    responsiveStyles: {
      tablet: {
        'min-height': '30rem',
        padding: '4.5rem 2rem',
      },
      mobile: {
        'min-height': '26rem',
        gap: '1.25rem',
        padding: '3.5rem 1.25rem',
        'border-radius': '1rem',
      },
    },
    children: [
      {
        id: createId(),
        type: 'text',
        tagName: 'span',
        name: '眉標',
        content: options.eyebrow ?? '打造更好的內容體驗',
        style: {
          display: 'inline-flex',
          padding: '0.5rem 0.875rem',
          color: '#4338ca',
          background: '#ffffff',
          border: '1px solid #c7d2fe',
          'border-radius': '999px',
          'font-size': '0.875rem',
          'font-weight': '700',
          'line-height': '1.25',
          'letter-spacing': '0.04em',
        },
      },
      {
        id: createId(),
        type: 'text',
        tagName: 'h1',
        name: '主標題',
        content: options.title ?? '讓每個想法，都能快速成為漂亮頁面',
        style: {
          margin: '0',
          'max-width': '52rem',
          'font-size': '3.5rem',
          'font-weight': '750',
          'line-height': '1.08',
          'letter-spacing': '-0.03em',
        },
        responsiveStyles: {
          tablet: { 'font-size': '2.75rem' },
          mobile: { 'font-size': '2.25rem' },
        },
      },
      {
        id: createId(),
        type: 'text',
        tagName: 'p',
        name: '說明',
        content: options.description ?? '使用清楚的區塊與直覺編輯流程，建立適合各種裝置的內容。',
        style: {
          margin: '0',
          'max-width': '42rem',
          color: '#475569',
          'font-size': '1.125rem',
          'line-height': '1.7',
        },
        responsiveStyles: {
          mobile: { 'font-size': '1rem' },
        },
      },
      {
        id: createId(),
        type: 'button',
        name: '主要行動',
        attributes: { type: 'button' },
        content: options.ctaLabel ?? '立即開始',
        style: {
          appearance: 'none',
          padding: '0.875rem 1.5rem',
          color: '#ffffff',
          background: '#4f46e5',
          border: '0',
          'border-radius': '999px',
          'box-shadow': '0 0.75rem 1.75rem rgba(79, 70, 229, 0.24)',
          cursor: 'pointer',
          'font-size': '1rem',
          'font-weight': '700',
          'line-height': '1.25',
        },
      },
    ],
  }
}

/** BlocksPanel 使用的 Hero 定義 */
export const heroBlockDef: BlockDefinition = {
  id: 'marketing-hero',
  label: 'Hero 主視覺',
  category: '行銷',
  icon: '✦',
  keywords: ['hero', 'marketing', 'banner', '主視覺', '行銷'],
  create: blockHero,
}

/** 官方行銷區塊；後續切片加入 Pricing 與 FAQ */
export const marketingBlockDefs: BlockDefinition[] = [heroBlockDef]
