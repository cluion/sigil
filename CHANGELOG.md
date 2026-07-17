# Changelog

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
