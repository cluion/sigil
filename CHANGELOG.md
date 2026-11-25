# Changelog

完整版本記錄以各套件的 CHANGELOG 為準：[App](packages/app/CHANGELOG.md)、[Editor](packages/editor/CHANGELOG.md)、[Core](packages/core/CHANGELOG.md)、[UI](packages/ui/CHANGELOG.md)、[Blocks](packages/blocks/CHANGELOG.md)、[Shortcode](packages/shortcode/CHANGELOG.md)、[Store JSON](packages/store-json/CHANGELOG.md)。本檔下方 `0.1.0`–`0.12.0` 為歷史專案摘要，並非最新版本。工作樹的七個套件目前均宣告 `0.20.0`；未發布變更由 changesets 追蹤。

## Unreleased — 1.0 交付準備

- App／Editor 新增可等待的 `save()` 與 `isSaving()`；`toJSON()` 改為沒有保存副作用的隔離快照。這是下一個 minor 的破壞性變更，既有呼叫者需依[升級指南](docs/guide/upgrading.md)遷移。保存失敗、排隊及保存期間的新編輯不會誤清 dirty。
- 保留文件 metadata／stylesheets；修正素材選擇器的錯誤重試、關閉與非同步生命週期，以及預覽錨點與宿主 inert 期間的快捷鍵。
- 修正既有 Undo／Redo／batch 的輸入合併邊界：Undo 後的新編輯會清除舊 Redo 分支，Redo 與批次前後的編輯保留獨立歷史；一般同欄位連打仍在 500ms 內合併。
- Laravel 範例改為可執行的活動頁後台，提供認證、owner 隔離、revision 衝突、文件驗證、持久化素材及整合測試。舊版參考片段的資料不會自動移轉。
- 新增三畫面視覺回歸、公開 API 消費端契約、三引擎相容性矩陣與效能量測；修正 demo sanitizer 在有 Trusted Types、缺原生 `setHTML()` 的瀏覽器無法解析富文字的問題。
- E2E 啟動／執行中取消會先結束子程序，再清理當次暫存資料。
- 定義 API／瀏覽器／效能邊界與真人試用任務。2026-10-23 首個候選 `f814c8e851c697c415444ee726e71532afdcace5` 的 [CI run 39952171811](https://github.com/cluion/sigil/actions/runs/39952171811) 七個 jobs 成功，三引擎 45／45 案通過；完整 checkout SHA 與驗收範圍見[交付記錄](RELEASING.md)。Hosted 5,000 節點有四項超過 reference 效能預算，不宣稱效能全綠。真人驗收與最終固定版本交付仍待完成，以上變更尚未發布。

## 0.12.0

- Command-backed context menus on the canvas and layers panel with copy, paste, move up, move down, and delete actions
- Menu actions follow command availability, so locked nodes and boundary positions do not expose invalid moves
- Keyboard focus navigation, Escape dismissal, focus restoration, light and dark themes, and viewport-safe positioning

## 0.11.0

- Double-click a text or button node to edit its content in place on the canvas (contenteditable, single-line)
- Enter or blur commits; Esc cancels; on commit the node is re-selected so the Inspector content field stays in sync
- Only `text` and `button` nodes are editable this way

## 0.10.0

- PropSchema `optionsFrom`: dynamic select options via `optionsFrom(ctx)` with `fetchJSON` + abort `signal`; pair with `dependsOn` for race-safe reload on dependency change (e.g. color → size cascade)
- `createInspector` / `createPropsPanel` / `createPropForm` now accept optional `fetchJSON`; `createApp` / `createEditor` thread it through
- Without `fetchJSON` injected, an `optionsFrom` select degrades to "無法載入" instead of crashing
- Completes PropSchema advanced types (group / media / dependsOn / repeater / date / optionsFrom)

## 0.9.0

- Dark theme: `createApp` / `createEditor` accept `theme: 'light' | 'dark' | 'auto'`; app shell has a topbar toggle cycling the three modes, persisted to `localStorage`; `auto` tracks `prefers-color-scheme`
- Canvas iframe stays white regardless of theme (real-page preview)
- Refined global scrollbar style across all editor panels
- Internal: `tokens.css` is now the single source of truth (imported via `?raw`), eliminating the manual two-way sync that had drifted

## 0.8.0

- PropSchema `repeater`: add/remove list of groups, each with its own sub-schema (e.g. links with label + href); changes reassemble the whole array
- PropSchema `date`: native date input, value stored as string
- Repeater items get a bordered card layout with delete action right-aligned

## 0.7.0

- Drag alignment guides: teal reference lines when edges/centers align with siblings or parent; gap labels show pixel distance
- Insert drag shows gap hints only (new node has no size); move drag shows both guides and gaps
- `TemplateStore` adapter (`MemoryTemplateStore` / `JsonTemplateStore`) for reusable node subtrees
- `templateToBlockDef` bridge clones with new ids and resets locked/hidden on insert
- `save-as-template` command in `createApp` / `createEditor`; `createBlocksPanel` reloads so saved templates appear immediately
- `createBlocksPanel` gains `reload(blocks?)`

## 0.6.0

- Responsive styles: Desktop base + Tablet/Mobile overrides (`responsiveStyles`)
- Inspector reads/writes per-device styles; shows inheritance vs override
- Renderer merges base + breakpoint by active device
- `toHTML()` emits `@media` rules + `data-sigil-r` keys for deployable output
- Backward compatible: old `style` docs load without migration

## 0.5.0

- Topbar bound to commands (`toolbar` / `toolbarGroup`)
- Layer lock, hide, rename (`name` / `locked` / `hidden`)
- PropSchema `group` and `dependsOn` for property forms
- Selection badge and status show layer `name`
- Fix: Vite dev injects `SIGIL_*_VERSION` (no ReferenceError)

## 0.4.0

- `defineCommand` / command registry / default editing commands
- `EditorHooks` (`onSelect`, `beforeSave`, `afterSave`, `afterLoad`, `beforeDestroy`)
- `createApp` / `createEditor`: `commands`, `hooks`, `runCommand`
- Package `SIGIL_*_VERSION` injected from `package.json` at build/test
- Changesets `version-packages` flow

## 0.3.0

- Empty canvas guide and no-selection tips
- Save flow: dirty flag, ProjectStore save, Ctrl/Cmd+S, beforeunload
- Export HTML dialog (copy / download)
- DnD drop indicator, invalid feedback, edge auto-scroll
- Canvas selection / hover rings
- Type badge for all nodes (including image), fixed positioning

## 0.2.0

- `AssetStore` / `MemoryAssetStore` and media picker
- PropSchema `media` type
- Style panel groups and clear styles
- `defineBlock` with categories, icons, keywords
- Examples Vue/React use `createApp`
- Demo banner shortcode and block library groups

## 0.1.0

Initial public release.

- `@cluion/sigil-app` — createApp product shell
- `@cluion/sigil` — createEditor SDK
- `@cluion/sigil-core` — engine, CSP, serialize
- `@cluion/sigil-shortcode` — defineShortcode
- `@cluion/sigil-ui` — canvas and panels
- `@cluion/sigil-blocks` — default blocks
- `@cluion/sigil-store-json` — JSON ProjectStore
