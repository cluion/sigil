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

## 在面板調整手機排列

1. 選取區段，切到「手機」，再開啟右側「樣式」的「版面」。
2. 在「顯示方式」選「彈性排列」，從「排列方向」選「直向」，再調整「項目對齊」與「項目間距」。選「自訂 CSS 值」可沿用宿主自己的尺寸或 CSS 表達式。
3. 切回「桌面」檢查原有排列，或在手機樣式按「使用繼承」還原其中一個欄位。下載的 HTML 會依閱讀者的視窗寬度套用相應樣式。

「版面」「文字」「外觀」可獨立收合。切換元件或裝置時，面板會記住展開的分類。

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

有斷點覆寫的節點會把 Desktop 基底也放在同一份樣式表，讓窄螢幕的覆寫優先。標記由各斷點的樣式內容產生，可在同一個頁面嵌入多份片段。

「下載 .html」會產生含 UTF-8 與 viewport 宣告的獨立頁面。宿主可透過 `createApp({ getExportTitle: (doc) => ... })` 指定下載頁面的標題，預設取用 `doc.meta.title`，其次使用根節點名稱。「複製」與 `toHTML()` 提供可嵌入宿主頁面的 HTML 片段。

Static 與 hydrated shortcode 都保留相同的樣式行為。Static shortcode 若有 class、attribute、base style 或 responsive style，輸出會建立一層 `<div>` host 來承載 presentation；沒有 presentation 的 shortcode 維持原本的純 static HTML。
