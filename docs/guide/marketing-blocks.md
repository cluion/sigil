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

## 設計邊界

- 不依賴 shortcode、富文字 adapter 或第三方 runtime
- 不寫死遠端圖片、品牌字型或全域 CSS selector
- CTA 使用 `type="button"`，實際 click 行為由宿主接管
- `marketingBlockDefs` 目前包含 Hero；Pricing 與 FAQ 會以獨立切片加入
