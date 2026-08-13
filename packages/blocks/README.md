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

`marketingBlockDefs` 可直接加入 BlocksPanel。第一個產品級區塊是可拆解編輯、具響應式預設的 Hero：

```ts
import { basicBlockDefs, blockHero, blockPricing, marketingBlockDefs } from '@cluion/sigil-blocks'

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
```

Hero 與 Pricing 都不依賴 shortcode、遠端圖片、CSS framework 或第三方 runtime。完整結構與響應式行為見 [官方行銷區塊指南](../../docs/guide/marketing-blocks.md)。

## License

MIT
