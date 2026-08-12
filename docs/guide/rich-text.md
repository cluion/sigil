# 可選富文字 Adapter

Sigil 不綁定特定 RTE。宿主透過 `RichTextAdapter` 接管明確支援的節點，HTML 仍保存於既有 `ComponentNode.content`，文件版本維持 `1`。

## 高階入口

`createApp()` 與 `createEditor()` 都接受相同的 `richText` 與 `sanitize` 選項：

```ts
import { createApp, type RichTextAdapter } from '@cluion/sigil-app'

const richText: RichTextAdapter = {
  resolver: {
    supports: (node) => node.type === 'rich-text',
    read: (node) => node.content ?? '',
  },
  start({ element, document, requestCommit, requestCancel }) {
    element.contentEditable = 'true'
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') requestCommit()
      if (event.key === 'Escape') requestCancel()
    }
    element.addEventListener('keydown', onKeyDown)
    let destroyed = false

    return {
      focus: () => element.focus(),
      getValue: () => element.innerHTML,
      destroy() {
        if (destroyed) return
        destroyed = true
        element.removeEventListener('keydown', onKeyDown)
        element.removeAttribute('contenteditable')
      },
    }
  },
}

const app = createApp({
  mount: '#app',
  doc: {
    version: 1,
    root: {
      id: 'rich-1',
      type: 'rich-text',
      content: '<p>Hello <strong>Sigil</strong></p>',
    },
  },
  richText,
  sanitize: sanitizeHtml,
})
```

`sanitizeHtml` 由宿主提供。高階入口收到 `richText` 卻沒有 `sanitize` 時會立即拋錯，避免 Canvas 與匯出結果使用不同安全規則。

## Adapter 契約

| 成員                      | 責任                                                     |
| ------------------------- | -------------------------------------------------------- |
| `resolver.supports(node)` | 明確決定哪些節點使用富文字                               |
| `resolver.read(node)`     | 回傳未信任 HTML 字串                                     |
| `start(context)`          | 同步建立 editor session                                  |
| `session.focus()`         | 將焦點移入 editor                                        |
| `session.getValue()`      | commit 時回傳 HTML 字串                                  |
| `session.destroy()`       | 移除 listener、observer、toolbar 或 portal，且可重複呼叫 |

Canvas 只在 commit 時呼叫一次 `engine.update(id, { content })`，因此一次富文字提交對應一個 undo step。Escape、cancel 與 destroy 不會寫回；切換預覽模式或裝置前會先 commit。

PropsPanel 與 Inspector 只顯示文字摘要及「請在畫布編輯」提示，不提供 raw markup 輸入欄位。

## 安全規則

- store、engine、adapter、clipboard 與 template 中的 markup 都是不可信字串
- `sanitize` 應採 allowlist，至少移除 `script`、事件屬性、`javascript:` URL、危險 SVG／MathML 與不允許的 style
- Canvas 的 DOM 寫入統一經 `HtmlPolicy`，static／hydrated export 使用同一個 `sanitize`
- 不傳 adapter 時，既有 text／button 路徑與純文字 escaping 維持不變
- 低階 `toHTML()` 有 resolver 卻沒有 sanitizer 時只會輸出 escaped markup

本倉庫 `pnpm dev` 的 demo 提供零依賴 `contenteditable` adapter 與嚴格 allowlist sanitizer，只示範 `<strong>`、`<em>` 及安全連結。正式產品應使用經審核、持續更新的 sanitizer 與 RTE。
