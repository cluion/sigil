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

桌面左側的「頁面結構」顯示目前頁名與可收合的圖層。「新增區塊」可點選或按 Enter 加到頁尾，也可直接拖到畫布指定位置。「頁面樣式」會選取根節點。要在頁尾加入照片，桌面可點左側「素材庫」，手機可開啟「更多工具」並點「插入圖片至頁尾」。

選取畫布元件後，畫布下方會顯示元件名稱，以及選取父層、複製、刪除等可用操作。要改標題或按鈕文字，點一下元件，再按「編輯文字」，就能在原處直接輸入。按「完成編輯」套用，按「取消編輯」保留原文。桌面也可以雙擊文字開始。改完一段後，復原一次就能回到編輯前的內容。

例如「報名前請閱讀 **參加須知**」的「參加須知」是獨立連結。點選前面的「報名前請閱讀」，再按「編輯開頭文字」，就能在設定面板修改或清空這段文字。後面的連結會留在原位，點選它即可單獨修改連結文字或目的地。若開頭已經清空，可從圖層選取段落再補上文字。

用鍵盤操作時，Tab 可進入元件工具列，左右方向鍵可切換動作。普通文字可按 Enter 完成、Esc 取消，或按 Tab 移到「完成編輯」。中文輸入法組字期間，Enter 交給輸入法選字。捲動長頁面後，按「在畫布定位」可回到選取元件。

選取活動範本的「主要行動」後，底部會顯示「活動頁 › 主視覺 › 活動簡介 › 主要行動」。要改整段主視覺的背景，直接點路徑中的「主視覺」，畫布、圖層與設定面板就會一起選到該區段。手機可點底部「元件路徑」選擇上層，再點「編輯 主視覺」開啟設定。瀏覽路徑不會增加復原步驟。

要找出某段文字在哪裡，打開「圖層」，在「搜尋圖層」輸入頁面文字、圖層名稱或 HTML ID。搜尋會涵蓋收合的分支，並標出命中詞。若有同名圖層，可輸入上層名稱和圖層名稱，例如「頁尾 標題」，結果也會列出所在路徑。點選結果或使用方向鍵和 Enter，就會選取該圖層並將元件捲入畫布。按 Esc 可清除搜尋並返回原本的圖層樹。

要在頁面中段加入內容，先選取畫布上的元件，或在圖層中點選元件、按 Enter 讓畫布捲到該處。接著按元件工具列的「在下方新增區塊」，區塊庫會標示插入位置。點選區塊，或以鍵盤聚焦區塊後按 Enter，即可把它插在所選元件的同一層、緊接在它後面。手機可使用相同操作，按「取消」或 Esc 即可返回畫布。

在區塊庫點選「折疊式 FAQ」旁的星號，下次開啟時可選「只看已釘選」快速找到它。搜尋可組合分類與關鍵字，例如輸入「行銷 FAQ」，再按 ↓ 選第一個結果，按 Enter 插入。自訂範本也可釘選，重新命名後仍會出現在清單。釘選只影響此瀏覽器的區塊庫，Laravel 範例會依登入帳號分開保留。

要把現有按鈕從「主視覺」搬到「活動資訊」，選取按鈕後，在畫布工具列或圖層右鍵選單開啟「移動元件」。搜尋並選擇「活動資訊」，再指定放在開頭、結尾或某個元件之前。確認後畫布會捲到按鈕的新位置，按一次「復原」即可放回原處。在手機上也可以點選完成整個流程。

嵌入容器窄於 900px 時，面板會收成抽屜。第一次開啟時，寬度在 480px 以內會套用手機樣式，之後調整視窗大小會保留選擇的裝置。點畫布上的文字或圖片，再點底部「編輯」即可進入該元件的設定。可以在畫布上滑動瀏覽，從「更多工具」切換裝置或匯出，按 Escape 或點背景可關閉抽屜。

在手機上點工具列的「圖層」可用整個抽屜瀏覽圖層。點選圖層或搜尋結果，就會開啟該元件的設定。使用鍵盤時，可用方向鍵瀏覽圖層樹，再按 Enter 或空白鍵進入設定。點抽屜上方的「圖層」會回到原本的捲動位置，搜尋詞也會保留。要替元件取一個好找的名稱，可在「進階」按「重新命名圖層」。若改名後已不符合原本的搜尋詞，返回時可直接輸入新名稱。

### 一次修改整頁的活動名稱

在左側工具列按「尋找」，手機從「更多工具」開啟「尋找與取代」。嵌入版的入口在圖層標題旁。在編輯器工具上也可按 Ctrl+Shift+F，macOS 使用 ⌘+Shift+F。

輸入活動名稱後，結果會逐處標出相符文字。選取其中一列可跳到畫布，或輸入新名稱再按「取代一處」。選「全部取代」會先列出可修改的處數，確認後可用一次「復原」撤回整批修改。取代文字留白代表刪除。鎖定內容會標示在結果裡並跳過修改。

搜尋範圍是目前裝置下的原生元件文字，包含標題、按鈕與連結的顯示文字。每個元件分開搜尋，因此取代按鈕文字會保留原連結目的地。富文字與 shortcode 的內容由各自的編輯器管理。

### 回到先前的編輯步驟

在「復原」「重做」旁開啟「編輯歷程」。手機從「更多」開啟。每一列會標示改了什麼，具名標題的文字修改也會顯示當時的字句。選擇想保留的那一步，再按「回到這一步」，畫布就會一次還原到當時的內容與排版。只想查看時，按 Esc 或「關閉」即可。

「已儲存」會標出上次成功存檔的那一步。跳回先前的步驟後，仍可重做後面的修改。若在這時開始新的修改，後續歷程就會從這一步重新記錄。歷程從本次開啟文件算起。要下次打開時看到這個狀態，請存檔。

### 新增標題或調整現有文字的層級

要找長頁裡的章節，在圖層面板切到「標題大綱」。大綱會依頁面順序列出 H1–H6。點「H2 活動資訊」即可選取畫布上的對應標題，也可以在「搜尋標題」輸入文字後按 ↓、Enter。手機點選後會開啟該標題的設定；點「圖層」可回到大綱繼續瀏覽。

從「新增區塊」搜尋「標題」並插入，預設為第二級標題（H2）。若要讓已有的文字成為小節標題，直接選取畫布上的文字，在「內容 → 文字格式」選「標題 3（H3）」。同一欄位可選段落、行內文字或 H1–H6。手機可先點選文字，再點底部「編輯」進入內容面板。

例如，活動頁可以用 H1 作頁名、H2 作「活動資訊」、H3 作該區段下的小節。變更會套用到整份頁面，保留原本的文字、圖層名稱、錨點與已設定的各裝置樣式。按一次「復原」可回到原格式。下載的 HTML 也會使用選定的標題層級。

要讓活動主標題在桌面醒目、手機上縮小，可直接在畫布工具列按「調整文字排版」。選擇「展示標題」，再切到手機套用「章節標題」。畫布與下載的網頁都會依裝置寬度顯示標題大小。[排版預設與個別調整](./responsive-styles.md#調整文字排版)

宿主可用 `renderPageNavigation` 回傳自己建立的頁面導覽 DOM，並在儲存或切換文件後呼叫 `app.setDocumentTitle(title)` 更新頁名。Laravel 範例在這裡列出登入者最近儲存的活動頁。[Laravel 範例](/guide/examples)

## 設定活動按鈕的目的地

選取活動範本的「查看活動資訊」，按畫布工具列的「編輯連結」開啟設定。也可以從基本區塊庫插入「連結」，再到內容面板設定目的地。

| 讀者點擊後的動作 | 編輯方式                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 跳到頁內區段     | 將「連結類型」設為「網址或頁內區段」，在「連到頁內區段」選擇「常見問題」。按「在畫布定位區段」可直接選取該區段。                                    |
| 開啟報名網站     | 在「網址或頁內區段」模式填入完整的「連結網址」，按「套用」。若想讓讀者保留目前頁面，可勾選「在新分頁開啟」。                                        |
| 寄信或撥電話     | 選擇「電子郵件」或「電話」，填入電子郵件地址或電話號碼後按「套用」。Sigil 會產生 `mailto:` 或 `tel:` 連結，讀者點擊時由裝置上的郵件或電話程式處理。 |

在內嵌預覽中點擊頁內連結，畫布會捲到目的區段。如果目的地在收合的 FAQ 答案內，預覽會先展開答案。開啟匯出的 HTML 時，勾選「在新分頁開啟」的連結會在新分頁顯示目的區段。

下載前，開啟「匯出 → 頁面連結」，就能看到每個原生連結元件的文字和目的地。點「只看待處理」找出尚未填寫的網址，或不存在、重複及已隱藏的頁內目標。點選該列會回到元件的連結欄位；修正後重新開啟匯出即可確認結果。

這份清單顯示外部網址、電子郵件與電話供核對。若錨點可能由宿主的富文字或 shortcode 產生，清單會提示在預覽中確認。即使仍有待處理項目，也可以直接下載。

連到尚未設定錨點的區段時，Sigil 會建立 HTML ID，按一次復原即可同時還原連結與該 ID。若原區段已刪除或多個區段共用同一個 ID，內容面板會提示原因，可從「連到頁內區段」重新指定。

複製、貼上或從區塊庫插入時，遇到同名 HTML ID，原生節點的副本會取得新的錨點，副本內的頁內連結與 HTML／ARIA 關聯會指向新目標。宿主自行產生的富文字與 shortcode HTML 由宿主維護。

### 替區段設定好讀的網址片段

1. 選取「活動資訊」，在「內容」按「編輯頁內錨點」。也可在任一原生元件的「進階」分頁找到「頁內錨點」。
2. 在「錨點名稱」輸入 `workshop-info` 或 `活動資訊`，按 Enter 或「套用錨點」。原本連到該區段的按鈕和已建立的 HTML／ARIA 參照會一起更新，一次復原可還原名稱與參照。
3. 按「複製頁內連結」取得片段，例如 `#workshop-info`。要把區段分享給讀者，將片段加在讀者可開啟的頁面網址後方。剪貼簿不可用時，可從已選取的欄位手動複製。

面板會顯示本頁的參照數。清除仍被使用的錨點前，請先重新指定其參照。若舊文件中有同名錨點，重新命名其中一個元件會保留原有連結，讓作者自行決定要改指哪個區段。改名後，先前分享給讀者的網址、宿主自訂 CSS 或富文字 HTML 若使用舊片段，也要更新。

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

要重用範本內的照片，可雙擊畫布圖片，或在選取後按「更換圖片」。在「本頁圖片」輸入圖層名稱、替代文字或檔名即可搜尋。相同的圖片網址只列一次，卡片會顯示它在本頁用了幾次。「使用中」標出正在更換的照片。換圖會保留該位置的替代文字，從頁尾新增時則可在「內容」依新圖用途填寫。

要讓活動封面可點選，選取圖片，按工具列的「圖片連結」。貼上報名網址並按「套用」，或從「連到頁內區段」直接選擇活動資訊。網站連結可勾選「在新分頁開啟」。在預覽中可直接點圖前往區段，下載 HTML 後也支援鍵盤聚焦並按 Enter 開啟。若整個連結只含這張圖片，可將替代文字寫成「報名秋日設計工作坊」，讓使用螢幕閱讀器的訪客知道點選後會去哪裡。

要連同目的地一起搬移、複製或隱藏圖片，從元件路徑或圖層選取圖片上方的「圖片連結」。回到圖片本身即可更換照片、編輯替代文字或移除圖片連結。若原連結還包含標題或其他內容，修改網址會一併變更它們的目的地。

提供 `assets` 時，選圖視窗會先開啟「素材庫」，可切換至「本頁圖片」。省略 `assets` 時，會先顯示本頁已有的圖片。若本頁也沒有圖片，頁尾插圖入口會直接開啟「圖片網址」。shortcode 的 PropSchema 可用 `type: 'media'` 讓作者使用同一個選圖視窗。

要在空白頁加入第一張照片，可從「插入圖片至頁尾」開啟「圖片網址」，貼上 HTTP(S) 網址或以 `/` 開頭的站內路徑，按「預覽圖片」。成功後會顯示圖片與原始尺寸。填好替代文字再按「插入圖片」即可一次加入照片和說明，裝飾圖可留白。修改網址後需重新預覽。這個流程會將網址存入頁面，下載 HTML 時能否離線顯示取決於宿主的圖片內嵌設定。

`MemoryAssetStore` 的上傳使用 object URL，僅供 demo／當前頁面使用；需要重載後仍能使用的圖片時，宿主必須提供持久化上傳與素材 URL。

媒體庫會顯示載入與上傳進度。上傳失敗時保留對話框，預設可重試原檔。宿主可設定 `uploadAccept` 篩選檔案選擇器，並在 `upload(file)` 驗證實際檔案。透過 `describeUploadError(error)` 可回傳給使用者的 `message` 與 `retryable`。例如檔案過大時回傳換檔提示和 `retryable: false`，遇到未辨識的錯誤可回傳 `undefined` 使用預設重試流程。

切換選取或銷毀編輯器時會關閉所屬選圖視窗，語系切換則保留操作並更新文案。關閉後收到的圖片不會套用，已送出的請求仍可能在伺服器完成。HTTP adapter 須檢查回應狀態，再回傳素材或拋出錯誤。

## 本倉庫

```bash
pnpm install && pnpm dev
```

## License

MIT
