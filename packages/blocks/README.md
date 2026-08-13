# `@cluion/sigil-blocks`

區塊工廠、`defineBlock` 與可直接使用的官方行銷區塊。

```bash
pnpm add @cluion/sigil-blocks
```

```ts
import { defineBlock, basicBlockDefs, blockShortcode } from '@cluion/sigil-blocks'

const blocks = [
  ...basicBlockDefs,
  defineBlock({
    id: 'hero',
    label: '主視覺',
    category: '媒體',
    icon: '🖼',
    keywords: ['banner', 'hero'],
    create: () => blockShortcode('banner', { title: 'Hi' }),
  }),
]

createApp({ mount: '#app', blocks })
```

仍支援舊式 `Record<string, () => ComponentNode>`（如 `basicBlocks`）。

## Marketing Blocks

`marketingBlockDefs` 可直接加入 BlocksPanel，內含可拆解編輯、具響應式預設的產品級行銷區塊：

```ts
import {
  basicBlockDefs,
  blockFAQ,
  blockHero,
  blockPricing,
  marketingBlockDefs,
} from '@cluion/sigil-blocks'

createApp({
  mount: '#app',
  blocks: [...basicBlockDefs, ...marketingBlockDefs],
})

const hero = blockHero({
  eyebrow: '新功能',
  title: '更快建立漂亮頁面',
  description: '所有文案與樣式仍是一般 ComponentNode，可在畫布與屬性面板編輯。',
  ctaLabel: '立即開始',
  ariaLabel: '產品主視覺',
})

const pricing = blockPricing({
  title: '選擇適合你的方案',
  plans: [
    {
      name: '專業',
      price: 'NT$990',
      period: '／月',
      features: ['不限網站', '完整行銷區塊'],
      ctaLabel: '開始使用',
      featured: true,
    },
  ],
})

const faq = blockFAQ({
  title: '開始之前，先了解這些',
  items: [
    {
      question: '需要特定前端框架嗎？',
      answer: '不需要，也能整合進 Vue、React 或其他框架。',
    },
  ],
})
```

Hero、Pricing 與 FAQ 都不依賴 shortcode、遠端圖片、CSS framework 或第三方 runtime。完整結構與響應式行為見 [官方行銷區塊指南](../../docs/guide/marketing-blocks.md)。

## License

MIT
