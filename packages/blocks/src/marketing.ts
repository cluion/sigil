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

/** 單一價格方案文案與狀態 */
export interface PricingPlanOptions {
  name: string
  price: string
  period?: string
  description?: string
  features?: readonly string[]
  ctaLabel?: string
  featured?: boolean
  badgeLabel?: string
}

/** Pricing 區塊可覆寫內容 */
export interface PricingBlockOptions {
  eyebrow?: string
  title?: string
  description?: string
  ariaLabel?: string
  plans?: readonly PricingPlanOptions[]
}

const DEFAULT_PRICING_PLANS: readonly PricingPlanOptions[] = [
  {
    name: '入門',
    price: '免費',
    description: '適合個人與小型專案快速開始。',
    features: ['1 個網站', '基礎區塊', '社群支援'],
    ctaLabel: '免費開始',
  },
  {
    name: '專業',
    price: 'NT$990',
    period: '／月',
    description: '給需要完整功能與品牌彈性的成長團隊。',
    features: ['不限網站', '完整行銷區塊', '優先支援'],
    ctaLabel: '選擇專業版',
    featured: true,
    badgeLabel: '最受歡迎',
  },
  {
    name: '企業',
    price: '聯絡我們',
    description: '適合重視治理、安全與導入服務的組織。',
    features: ['進階權限', '導入協助', '專屬支援'],
    ctaLabel: '聯絡顧問',
  },
]

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

/**
 * 建立響應式 Pricing
 *
 * 方案與功能清單都展開成可編輯的語意節點
 */
export function blockPricing(options: PricingBlockOptions = {}): ComponentNode {
  const plans = options.plans ?? DEFAULT_PRICING_PLANS
  return {
    id: createId(),
    type: 'section',
    name: '方案價格',
    attributes: { 'aria-label': options.ariaLabel ?? '方案價格' },
    style: {
      'box-sizing': 'border-box',
      width: '100%',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      gap: '1.25rem',
      padding: '5rem 3rem',
      overflow: 'hidden',
      color: '#0f172a',
      'text-align': 'center',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      'border-radius': '1.5rem',
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
    },
    responsiveStyles: {
      tablet: { padding: '4rem 2rem' },
      mobile: { padding: '3.5rem 1rem', 'border-radius': '1rem' },
    },
    children: [
      {
        id: createId(),
        type: 'text',
        tagName: 'span',
        name: '價格眉標',
        content: options.eyebrow ?? '簡單透明的方案',
        style: {
          color: '#4f46e5',
          'font-size': '0.875rem',
          'font-weight': '750',
          'line-height': '1.25',
          'letter-spacing': '0.08em',
          'text-transform': 'uppercase',
        },
      },
      {
        id: createId(),
        type: 'text',
        tagName: 'h2',
        name: '價格標題',
        content: options.title ?? '選擇適合你的成長方案',
        style: {
          margin: '0',
          'max-width': '48rem',
          'font-size': '2.75rem',
          'font-weight': '750',
          'line-height': '1.12',
          'letter-spacing': '-0.025em',
        },
        responsiveStyles: {
          tablet: { 'font-size': '2.375rem' },
          mobile: { 'font-size': '2rem' },
        },
      },
      {
        id: createId(),
        type: 'text',
        tagName: 'p',
        name: '價格說明',
        content: options.description ?? '從免費開始，需要更多能力時再升級。',
        style: {
          margin: '0 0 2rem',
          'max-width': '40rem',
          color: '#64748b',
          'font-size': '1.0625rem',
          'line-height': '1.7',
        },
        responsiveStyles: {
          mobile: { margin: '0 0 1.25rem', 'font-size': '1rem' },
        },
      },
      {
        id: createId(),
        type: 'section',
        tagName: 'div',
        name: '方案列表',
        attributes: { role: 'list', 'aria-label': '方案列表' },
        style: {
          width: '100%',
          'max-width': '72rem',
          display: 'grid',
          'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
          'align-items': 'stretch',
          gap: '1rem',
          'text-align': 'left',
        },
        responsiveStyles: {
          tablet: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' },
          mobile: { 'grid-template-columns': 'minmax(0, 1fr)' },
        },
        children: plans.map(createPricingPlan),
      },
    ],
  }
}

function createPricingPlan(plan: PricingPlanOptions): ComponentNode {
  const featured = plan.featured === true
  const badge = featured
    ? [
        {
          id: createId(),
          type: 'text',
          tagName: 'span',
          name: `${plan.name}推薦標記`,
          content: plan.badgeLabel ?? '推薦',
          style: {
            'align-self': 'flex-start',
            padding: '0.375rem 0.75rem',
            color: '#3730a3',
            background: '#e0e7ff',
            'border-radius': '999px',
            'font-size': '0.75rem',
            'font-weight': '750',
            'line-height': '1.25',
            'letter-spacing': '0.04em',
          },
        } satisfies ComponentNode,
      ]
    : []

  return {
    id: createId(),
    type: 'section',
    tagName: 'article',
    name: `${plan.name}方案`,
    attributes: {
      role: 'listitem',
      'aria-label': `${plan.name}方案`,
      ...(featured ? { 'data-featured': 'true' } : {}),
    },
    style: {
      'box-sizing': 'border-box',
      'min-width': '0',
      display: 'flex',
      'flex-direction': 'column',
      gap: '1rem',
      padding: '1.5rem',
      background: featured ? '#ffffff' : '#f8fafc',
      border: featured ? '2px solid #6366f1' : '1px solid #cbd5e1',
      'border-radius': '1.25rem',
      'box-shadow': featured ? '0 1.25rem 3rem rgba(79, 70, 229, 0.16)' : 'none',
      transform: featured ? 'translateY(-0.75rem)' : 'none',
    },
    responsiveStyles: {
      tablet: { transform: 'none' },
      mobile: { padding: '1.5rem' },
    },
    children: [
      ...badge,
      {
        id: createId(),
        type: 'text',
        tagName: 'h3',
        name: `${plan.name}名稱`,
        content: plan.name,
        style: { margin: '0', 'font-size': '1.375rem', 'font-weight': '750', 'line-height': '1.2' },
      },
      {
        id: createId(),
        type: 'text',
        tagName: 'p',
        name: `${plan.name}說明`,
        content: plan.description ?? '',
        style: { margin: '0', color: '#64748b', 'line-height': '1.6' },
      },
      {
        id: createId(),
        type: 'section',
        tagName: 'div',
        name: `${plan.name}價格`,
        style: {
          display: 'grid',
          'grid-template-columns': 'minmax(0, 1fr)',
          gap: '0.375rem',
        },
        children: [
          {
            id: createId(),
            type: 'text',
            tagName: 'strong',
            name: `${plan.name}金額`,
            content: plan.price,
            style: {
              'min-width': '0',
              'max-width': '100%',
              'font-size': '1.5rem',
              'font-weight': '800',
              'line-height': '1.1',
              'letter-spacing': '-0.025em',
              'overflow-wrap': 'anywhere',
            },
            responsiveStyles: { mobile: { 'font-size': '2rem' } },
          },
          {
            id: createId(),
            type: 'text',
            tagName: 'span',
            name: `${plan.name}週期`,
            content: plan.period ?? '',
            style: { color: '#64748b', 'font-size': '0.9375rem' },
          },
        ],
      },
      {
        id: createId(),
        type: 'section',
        tagName: 'ul',
        name: `${plan.name}功能`,
        style: {
          display: 'flex',
          'flex-direction': 'column',
          gap: '0.75rem',
          margin: '0',
          padding: '0',
          'list-style': 'none',
          color: '#334155',
          'line-height': '1.5',
        },
        children: (plan.features ?? []).map((feature) => ({
          id: createId(),
          type: 'text',
          tagName: 'li',
          name: `${plan.name}功能項目`,
          content: `✓ ${feature}`,
        })),
      },
      {
        id: createId(),
        type: 'button',
        name: `${plan.name}行動`,
        attributes: { type: 'button' },
        content: plan.ctaLabel ?? '選擇方案',
        style: {
          width: '100%',
          'margin-top': 'auto',
          padding: '0.875rem 1rem',
          color: featured ? '#ffffff' : '#3730a3',
          background: featured ? '#4f46e5' : '#ffffff',
          border: featured ? '1px solid #4f46e5' : '1px solid #a5b4fc',
          'border-radius': '0.75rem',
          cursor: 'pointer',
          'font-size': '0.9375rem',
          'font-weight': '750',
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

/** BlocksPanel 使用的 Pricing 定義 */
export const pricingBlockDef: BlockDefinition = {
  id: 'marketing-pricing',
  label: 'Pricing 方案價格',
  category: '行銷',
  icon: '◇',
  keywords: ['pricing', 'plans', 'price', '方案', '價格', '行銷'],
  create: blockPricing,
}

/** 官方行銷區塊；後續切片加入 FAQ */
export const marketingBlockDefs: BlockDefinition[] = [heroBlockDef, pricingBlockDef]
