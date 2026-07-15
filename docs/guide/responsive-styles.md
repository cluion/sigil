# 響應式樣式

Sigil 的 Desktop 樣式沿用既有 `style`；Tablet 與 Mobile 只保存差異覆寫。這是 additive 的 schema v1 欄位，舊文件不需要 migration。

```ts
const node = {
  id: 'hero',
  type: 'section',
  style: {
    padding: '48px',
    'font-size': '32px',
  },
  responsiveStyles: {
    tablet: {
      padding: '32px',
    },
    mobile: {
      padding: '16px',
      'font-size': '24px',
    },
  },
}
```

## 繼承規則

- Desktop 只使用 `style`。
- Tablet 使用 `style`，再套用 `responsiveStyles.tablet`。
- Mobile 使用 `style`，再依序套用 Tablet、Mobile 覆寫。
- 在非 Desktop 裝置按「使用繼承」，會刪除該 property 的覆寫，而不是複製上一層的值。
- 清除某個 breakpoint 只影響該層；Desktop 與其他 breakpoint 保留。

`createApp()` 與 `createEditor()` 的裝置按鈕會同步 Canvas 和樣式面板。面板會標示每個值是目前裝置的「覆寫」，還是繼承自 Desktop／Tablet。

## Core API

```ts
import { createStylePatch, getEffectiveStyle, getStyleSource } from '@cluion/sigil-core'

const effective = getEffectiveStyle(node, 'mobile')
const source = getStyleSource(node, 'mobile', 'padding')

engine.update(node.id, createStylePatch('tablet', 'padding', '24px'))
engine.update(node.id, createStylePatch('tablet', 'padding', '')) // 回到繼承
```

預設 breakpoint 為 Tablet `max-width: 768px`、Mobile `max-width: 480px`。目前不提供自訂 breakpoint 編輯器。

## HTML 輸出

`toHTML()` 只在文件包含 responsive 覆寫時加入一段 `<style data-sigil-responsive>`，並用穩定的 `data-sigil-r` 標記把 media query 對到節點。Tablet 規則先輸出、Mobile 後輸出，因此 Mobile 自動繼承 Tablet。

Static 與 hydrated shortcode 都保留相同的樣式行為。Static shortcode 若有 class、attribute、base style 或 responsive style，輸出會建立一層 `<div>` host 來承載 presentation；沒有 presentation 的 shortcode 維持原本的純 static HTML。
