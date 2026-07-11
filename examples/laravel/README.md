# Laravel 參考：ProjectStore 後端

此目錄是**參考實作**・並非完整 Laravel 專案  
示範如何用 Laravel 存取 Sigil 的 `SigilDoc` JSON  
對應 core 的 `ProjectStore` 契約

前端仍用 `createEditor` 並傳入 `store`  
`store` 改為呼叫 Laravel API

## 契約對照

| TypeScript `ProjectStore` | Laravel |
|---|---|
| `load` 回傳 `SigilDoc` 或 `null` | `GET /api/pages/{key}` → JSON body 或 404 |
| `save` 寫入文件 | `PUT /api/pages/{key}` body 為 `SigilDoc` |

`SigilDoc` 形狀：

```json
{
  "version": 1,
  "root": { "id": "…", "type": "section", "children": [] },
  "meta": { "title": "可選" }
}
```

## 安裝到既有 Laravel 專案

1. 複製或改編本目錄檔案

   | 檔案 | 建議路徑 |
   |---|---|
   | `migration_create_sigil_pages.php` | `database/migrations/…_create_sigil_pages_table.php` |
   | `Models/SigilPage.php` | `app/Models/SigilPage.php` |
   | `Http/Controllers/SigilPageController.php` | `app/Http/Controllers/…` |
   | `routes-api.php` | 合併進 `routes/api.php` |
   | `resources/views/sigil-editor.blade.php` | Blade 編輯頁・可選 |

2. 執行 migration

   ```bash
   php artisan migrate
   ```

3. 前端用 Vite 或靜態資源注入 HTTP store・見下方

## 前端 HTTP ProjectStore

```ts
import type { ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { createEditor } from '@cluion/sigil'

function createHttpStore(pageKey: string, csrf?: string): ProjectStore {
  const base = `/api/pages/${encodeURIComponent(pageKey)}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (csrf) headers['X-CSRF-TOKEN'] = csrf

  return {
    async load() {
      const r = await fetch(base, { headers, credentials: 'same-origin' })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`load failed: ${r.status}`)
      return (await r.json()) as SigilDoc
    },
    async save(doc) {
      const r = await fetch(base, {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(doc),
      })
      if (!r.ok) throw new Error(`save failed: ${r.status}`)
    },
  }
}

// 首次載入
const store = createHttpStore('home', document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? undefined)
const doc = (await store.load()) ?? { version: 1, root: { id: 'r', type: 'section', children: [] } }

const editor = createEditor({
  mount: '#sigil-root',
  doc,
  store,
})
// 存檔：editor.toJSON 會觸發 store.save
```

> Blade 若內嵌 Vite 打包的 JS  
> 請確保 `@cluion/sigil` 等套件由前端 build 引入  
> Laravel 只負責 JSON API

## CSRF 與認證

- Session 登入：`credentials: 'same-origin'` 加上 CSRF header・見上
- Sanctum 或 token：改 `Authorization: Bearer …` 並在 `routes/api.php` 套用對應 middleware
- **權限與多租戶由宿主應用負責**・Sigil 不做認證

## 安全

- 後端應驗證 JSON 結構・至少檢查 `version` 與 `root` 為 object
- 勿把未消毒的 HTML 當信任內容存  
  Sigil 文件是 JSON 樹・輸出 HTML 時再用引擎 `toHTML`
- 可選：在 `save` 前用 PHP 檢查 `root.type` 白名單

## 相關

- [Getting Started · ProjectStore](../../docs/guide/getting-started.md)
- [`@cluion/sigil-store-json`](../../packages/store-json/README.md)
