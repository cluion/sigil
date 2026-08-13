# 官方行銷區塊

`@cluion/sigil-blocks` 除了基礎 section／text／image／button／column，也提供可直接加入 BlocksPanel 的產品級行銷區塊。

## Hero

```ts
import { basicBlockDefs, blockHero, marketingBlockDefs } from '@cluion/sigil-blocks'
import { createApp } from '@cluion/sigil-app'

const app = createApp({
  mount: '#app',
  blocks: [...basicBlockDefs, ...marketingBlockDefs],
})

const hero = blockHero({
  eyebrow: '新功能',
  title: '更快建立漂亮頁面',
  description: '使用清楚的區塊與直覺流程，建立適合各種裝置的內容。',
  ctaLabel: '免費試用',
  ariaLabel: '產品介紹',
})
```

Hero 是一般 `ComponentNode` 子樹，不是不可拆解的 HTML template：

```text
section 主視覺
├─ span 眉標
├─ h1 主標題
├─ p 說明
└─ button 主要行動
```

每個節點都有獨立 id，可在圖層、畫布與屬性面板分別編輯。`style` 提供 Desktop 基礎，`responsiveStyles` 覆寫 Tablet／Mobile；`toHTML()` 會輸出相同語意標籤與 media rules。

## Pricing

Pricing 預設提供入門、專業、企業三個方案，專業方案標示為推薦。宿主可傳入完整方案陣列：

```ts
import { blockPricing } from '@cluion/sigil-blocks'

const pricing = blockPricing({
  eyebrow: '彈性方案',
  title: '選擇適合你的成長方案',
  description: '從免費開始，需要更多能力時再升級。',
  ariaLabel: '價格比較',
  plans: [
    {
      name: '入門',
      price: '免費',
      description: '適合個人快速開始。',
      features: ['1 個網站', '基礎區塊'],
      ctaLabel: '免費開始',
    },
    {
      name: '專業',
      price: 'NT$990',
      period: '／月',
      description: '給需要完整功能的團隊。',
      features: ['不限網站', '完整行銷區塊', '優先支援'],
      ctaLabel: '選擇專業版',
      featured: true,
      badgeLabel: '最受歡迎',
    },
  ],
})
```

Pricing 同樣是一般節點樹：外層 `section` 包含標題與方案列表，每個方案使用 `article`，功能清單使用 `ul/li`。Desktop 三欄、Tablet 兩欄、Mobile 單欄；推薦樣式只影響 presentation，不增加不可序列化狀態。

## 設計邊界

- 不依賴 shortcode、富文字 adapter 或第三方 runtime
- 不寫死遠端圖片、品牌字型或全域 CSS selector
- CTA 使用 `type="button"`，實際 click 行為由宿主接管
- `marketingBlockDefs` 目前包含 Hero 與 Pricing；FAQ 會以獨立切片加入
