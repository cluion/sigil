# Getting Started

## 安裝

```bash
pnpm add @cluion/sigil-app @cluion/sigil-blocks @cluion/sigil-store-json @cluion/sigil-shortcode @cluion/sigil-core
# 或 npm i …
```

## createApp

```ts
import { createApp } from '@cluion/sigil-app'
import { basicBlocks, blockSection, blockText, blockShortcode } from '@cluion/sigil-blocks'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import { defineShortcode } from '@cluion/sigil-shortcode'

const greet = defineShortcode({
  name: 'greet',
  props: { name: 'world' },
  schema: [{ name: 'name', type: 'text', label: 'Name' }],
  template: '<span>Hello, <b data-ref="n"></b></span>',
  bind(el, ctx) {
    const n = el.querySelector('[data-ref="n"]') as HTMLElement
    ctx.effect(() => {
      n.textContent = String(ctx.props.name)
    })
  },
})

const root = blockSection()
root.children = [blockText('Edit me'), blockShortcode('greet', { name: 'Sigil' })]

const app = createApp({
  mount: '#app',
  doc: { version: 1, root },
  store: new JsonProjectStore(),
  blocks: {
    ...basicBlocks,
    Greet: () => blockShortcode('greet', { name: 'Sigil' }),
  },
  shortcodes: [greet],
})

app.toJSON() // 純快照，不存檔
await app.save() // 寫入 ProjectStore；此例僅保存在記憶體
app.toHTML()
```

`save()`、`isSaving()` 與新的 `toJSON()` 語意是下一個**尚未發布的 minor 破壞性變更**。既有 `0.20.x` 若以 `toJSON()` 存檔，請改為 `await save()`；詳見[保存契約與遷移](/guide/persistence)。

## 編輯工作區

桌面左側的「頁面結構」顯示目前頁名與可收合的圖層。「新增區塊」可點選或按 Enter 加到頁尾，也可直接拖到畫布指定位置。選取畫布元件後，可在元件旁選取父層、複製或刪除，在右側修改內容與樣式。「頁面樣式」會選取根節點。有提供 `assets` 的宿主也可從左側開啟素材庫。

嵌入容器窄於 900px 時，面板會收成抽屜。第一次開啟時，寬度在 480px 以內會套用手機樣式，之後調整視窗大小會保留選擇的裝置。點畫布上的文字或圖片，再點底部「編輯」即可進入該元件的設定。可以在畫布上滑動瀏覽，從「更多工具」切換裝置或匯出，按 Escape 或點背景可關閉抽屜。

宿主可用 `renderPageNavigation` 回傳自己建立的頁面導覽 DOM，並在儲存或切換文件後呼叫 `app.setDocumentTitle(title)` 更新頁名。Laravel 範例在這裡列出登入者最近儲存的活動頁。[Laravel 範例](/guide/examples)

## 設定活動按鈕的目的地

點選活動範本的「查看活動資訊」，在內容面板的「連到頁內區段」選擇「常見問題」。Sigil 會替尚未命名錨點的區段建立 HTML ID，按一次復原即可同時還原連結與該 ID。若要連到報名網站，在「連結網址」輸入完整網址並按「套用」。也可以從基本區塊庫插入新的「連結」。

複製、貼上或從區塊庫插入時，遇到同名 HTML ID，原生節點的副本會取得新的錨點，副本內的頁內連結與 HTML／ARIA 關聯會指向新目標。宿主自行產生的富文字與 shortcode HTML 由宿主維護。

## 語系與宿主字串

App／Editor 內建 `zh` 與 `en`。`messages` 會依語系淺層覆寫內建 catalog；未提供的 key 保留內建翻譯，空字串也是有效值。

```ts
const app = createApp({
  mount: '#app',
  locale: 'zh',
  messages: {
    zh: { 'app.brand': '內容編輯器' },
    en: { 'app.brand': 'Content Editor' },
  },
})

app.setLocale('en')
app.getLocale() // 'en'
```

`setLocale()` 會原地更新產品 chrome、面板、ARIA 與後續開啟的 prompt／confirm，不會重建 engine，也不改 tree、selection、history、dirty、theme 或 device。文件內容、區塊名稱、範本名稱與 schema label 屬宿主資料，不會被翻譯。

自組 UI 的 `createEditor()` 提供相同契約；直接使用低階 UI 時，也可把同一個 `createI18n()` 結果注入各面板後呼叫 `setLocale()`。

- `createEditor`：`@cluion/sigil`
- `createEngine`：`@cluion/sigil-core`
- 官方區塊：[Marketing Blocks 與 Hero](/guide/marketing-blocks)
- 可選富文字：[RichTextAdapter 與安全輸出](/guide/rich-text)
- 響應式樣式：見 [Desktop／Tablet／Mobile 覆寫](/guide/responsive-styles)
- 擴充（commands／hooks／圖層／dependsOn）：見 [擴充指南](/guide/extensibility)
- 本機完整 demo：`pnpm dev`

## shortcode

```ts
import { defineShortcode } from '@cluion/sigil-shortcode'

defineShortcode({
  name: 'counter',
  props: { step: 1 },
  schema: [{ name: 'step', type: 'number', label: 'Step' }],
  template: '<button type="button" data-ref="b">+</button> <b data-ref="n">0</b>',
  bind(el, ctx) {
    let n = 0
    const disp = el.querySelector('[data-ref="n"]') as HTMLElement
    el.querySelector('[data-ref="b"]')!.addEventListener('click', () => {
      n += Number(ctx.props.step) || 1
      disp.textContent = String(n)
    })
  },
})
```

`bind`：`props`、`effect`、`fetchJSON`、`store`、`emit`／`on`、`mode`、`abort`。

## ProjectStore

```ts
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'

const store: ProjectStore = {
  async load() {
    const response = await fetch('/api/page', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`load failed: ${response.status}`)
    return (await response.json()) as SigilDoc
  },
  async save(doc) {
    const response = await fetch('/api/page', {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')!.content,
      },
      credentials: 'same-origin',
      body: JSON.stringify(doc),
    })
    if (!response.ok) throw new Error(`save failed: ${response.status}`)
  },
}

// 宿主先載入，再掛載。載入失敗時中止，不以空白文件覆蓋原內容。
const doc: SigilDoc = (await store.load()) ?? { version: 1, root: blockSection() }
const app = createApp({ mount: '#app', doc, store, blocks: basicBlocks })
await app.save()
```

此片段沿用前例的 `createApp`、`blockSection`、`basicBlocks` imports，並假設宿主提供同源 Session API 與 CSRF meta。伺服器仍須驗證身分、權限及文件結構；TypeScript 型別斷言不是執行時驗證。只把確認為「文件不存在」的 404 當作 `null`，不要把 401／403／500 當作空白頁。

App／Editor 沒有自動呼叫 `store.load()`，也沒有高階 `load()` API。`JsonProjectStore` 只提供記憶體與 JSON 字串操作。倉庫的 `examples/laravel/` 提供可執行的活動頁後台，包含 Session 登入、owner 隔離、revision 衝突、文件驗證與持久化圖片；請依該目錄 README 使用目前工作樹建置。範例限制與新保存 API 均不代表已發布的 `0.20.x` 行為。完整保存狀態見[保存契約](/guide/persistence)。

## AssetStore

```ts
import { MemoryAssetStore } from '@cluion/sigil-store-json'

const assets = new MemoryAssetStore([{ id: '1', url: 'https://placehold.co/120', name: 'demo' }])

createApp({ mount: '#app', assets })
```

使用 `createApp` 並傳入 `assets` 後，可雙擊畫布圖片，或選取圖片按工具列的「更換圖片」。內容分頁也有「選圖」。有多張圖片時可依名稱搜尋，「使用中」標出目前的照片。選取新圖會保留既有替代文字，若新照片主題不同，可在內容分頁改寫。shortcode 的 PropSchema 可設 `type: 'media'`，表單同樣接 AssetStore。

`MemoryAssetStore` 的上傳使用 object URL，僅供 demo／當前頁面使用；需要重載後仍能使用的圖片時，宿主必須提供持久化上傳與素材 URL。

媒體庫會顯示載入與上傳進度。上傳失敗時保留對話框，預設可重試原檔。宿主可設定 `uploadAccept` 篩選檔案選擇器，並在 `upload(file)` 驗證實際檔案。透過 `describeUploadError(error)` 可回傳給使用者的 `message` 與 `retryable`。例如檔案過大時回傳換檔提示和 `retryable: false`，遇到未辨識的錯誤可回傳 `undefined` 使用預設重試流程。

切換選取或銷毀編輯器時會關閉所屬選圖視窗，語系切換則保留操作並更新文案。關閉後收到的圖片不會套用，已送出的請求仍可能在伺服器完成。HTTP adapter 須檢查回應狀態，再回傳素材或拋出錯誤。

## 本倉庫

```bash
pnpm install && pnpm dev
```

## License

MIT
