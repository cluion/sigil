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

## FAQ

FAQ 預設提供六組完整顯示的問答。宿主可以覆寫區塊文案與完整問答陣列：

```ts
import { blockFAQ } from '@cluion/sigil-blocks'

const faq = blockFAQ({
  eyebrow: '支援中心',
  title: '開始之前，先了解這些',
  description: '整理導入時最常遇到的問題。',
  ariaLabel: '導入問答',
  items: [
    {
      question: '是否需要特定前端框架？',
      answer: '不需要，也能整合進 Vue、React 或其他框架。',
    },
    {
      question: '可以接到既有後端嗎？',
      answer: '可以，公開介面不綁定特定後端技術。',
    },
  ],
})
```

「FAQ 常見問題」使用 `dl`，每組問答以 `div` 包住一個 `dt` 與 `dd`。問題與答案會完整顯示，Desktop 為兩欄，Tablet 與 Mobile 為單欄。

## 折疊式 FAQ

在活動頁放入報到時間、工具或材料等常見問題，讓讀者自行展開需要的答案。已在 `createApp` 的 `blocks` 加入 `marketingBlockDefs` 的宿主可直接使用。

1. 打開「區塊」，搜尋「折疊式 FAQ」並插入。預設有三題，第一題是「需要自備工具嗎？」。
2. 選取「折疊式 FAQ」區塊，在檢查器點選一個題目，或選「新增問答」。
3. 填寫「問題」和「答案」。選「返回問答清單」可依最新題目找到對應的問答。單題的預設圖層名稱為「問答項目」，可依需要重新命名。
4. 切到「預覽」，點選題目展開或收合答案。也可用 Tab 移至題目，再按 Enter 或空白鍵操作。
5. 選「匯出」再選「下載 .html」。用瀏覽器打開下載檔時，每題預設收合，可直接展開閱讀。

宿主也可以用 `blockAccordionFAQ()` 建立整組問答，或用 `blockFAQItem()` 在既有區塊末尾新增一題。

```ts
import { blockAccordionFAQ, blockFAQItem } from '@cluion/sigil-blocks'

const faq = blockAccordionFAQ({
  title: '行前準備',
  items: [{ question: '需要自備工具嗎？', answer: '活動現場會提供所需工具與材料。' }],
})

// 先插入整組，再加入另一題。app 為上方 createApp 建立的實例。
app.engine.insert(app.engine.getTree().id, faq)
app.engine.insert(
  faq.id,
  blockFAQItem({ question: '幾點開始報到？', answer: '上午九點開放報到。' }),
)
```

區塊的每題都是 `section` 下的直屬 `details`，首個子節點 `summary` 是問題，接著的 `p` 是答案。下載檔使用瀏覽器內建的展開行為。

直接使用 `@cluion/sigil-ui` 組裝面板時，可在 `createInspector` 或 `createPropsPanel` 的選項傳入 `faq: { createItem: blockFAQItem }`，讓作者能從面板新增問答。

## 設計邊界

- 不依賴 shortcode、富文字 adapter 或第三方 runtime
- 不寫死遠端圖片、品牌字型或全域 CSS selector
- CTA 使用 `type="button"`，實際 click 行為由宿主接管
- `marketingBlockDefs` 包含 Hero、Pricing、FAQ 常見問題與折疊式 FAQ
