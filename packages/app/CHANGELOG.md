# @cluion/sigil-app

## 0.18.0

### Patch Changes

- Updated dependencies [d5720a5]
- Updated dependencies [d2ec868]
- Updated dependencies [8bbff6a]
  - @cluion/sigil-blocks@0.18.0
  - @cluion/sigil-core@0.18.0
  - @cluion/sigil-shortcode@0.18.0
  - @cluion/sigil-store-json@0.18.0
  - @cluion/sigil-ui@0.18.0

## 0.17.0

### Minor Changes

- a660a4e: Wire rich-text adapters through App and Editor with required sanitizers, safe exports, demo integration, and documentation.

### Patch Changes

- Updated dependencies [a660a4e]
- Updated dependencies [1697b10]
- Updated dependencies [ca2bbd1]
  - @cluion/sigil-ui@0.17.0
  - @cluion/sigil-core@0.17.0
  - @cluion/sigil-blocks@0.17.0
  - @cluion/sigil-shortcode@0.17.0
  - @cluion/sigil-store-json@0.17.0

## 0.16.0

### Minor Changes

- ba7a5a0: Connect template rename and delete actions in App and Editor with shared loading, failure, retry, and reload behavior.

### Patch Changes

- Updated dependencies [ba7a5a0]
- Updated dependencies [246fdcb]
- Updated dependencies [e007805]
  - @cluion/sigil-ui@0.16.0
  - @cluion/sigil-core@0.16.0
  - @cluion/sigil-store-json@0.16.0
  - @cluion/sigil-blocks@0.16.0
  - @cluion/sigil-shortcode@0.16.0

## 0.15.0

### Minor Changes

- aa1dc1c: Localize the primary Blocks, Layers, and Media interactions through the existing i18n adapter.
- 9ded309: Localize Inspector, PropsPanel, PropForm, and responsive style controls through the shared i18n adapter.
- db33b1a: Localize remaining App, Editor, and Canvas shell strings, including keyboard help, template prompts, context menus, and empty containers.

### Patch Changes

- Updated dependencies [aa1dc1c]
- Updated dependencies [9ded309]
- Updated dependencies [db33b1a]
  - @cluion/sigil-ui@0.15.0
  - @cluion/sigil-blocks@0.15.0
  - @cluion/sigil-core@0.15.0
  - @cluion/sigil-shortcode@0.15.0
  - @cluion/sigil-store-json@0.15.0

## 0.14.0

### Minor Changes

- ba0979d: Add keyboard block insertion, accessible layer-tree navigation, and modal dialog focus management. Block items now insert at the document root with Enter or Space; layer rows support roving focus, selection, renaming, and context-menu shortcuts; export and media dialogs trap focus, close with Escape, expose modal labels, and restore focus to their trigger.

### Patch Changes

- Updated dependencies [ba0979d]
  - @cluion/sigil-ui@0.14.0
  - @cluion/sigil-blocks@0.14.0
  - @cluion/sigil-core@0.14.0
  - @cluion/sigil-shortcode@0.14.0
  - @cluion/sigil-store-json@0.14.0

## 0.13.1

### Patch Changes

- Updated dependencies [3f5872b]
  - @cluion/sigil-ui@0.13.1
  - @cluion/sigil-blocks@0.13.1
  - @cluion/sigil-core@0.13.1
  - @cluion/sigil-shortcode@0.13.1
  - @cluion/sigil-store-json@0.13.1

## 0.13.0

### Minor Changes

- 433b396: Add a container-aware compact app shell. Mounts narrower than 900px keep the canvas usable by moving Blocks and Layers / Settings into mutually exclusive drawers with backdrop dismissal, Escape handling, focus restoration, and accessible expanded state.
- 7d50eda: Drop Node.js 20 support and require Node.js 24 or newer across all published packages.

### Patch Changes

- @cluion/sigil-blocks@0.13.0
- @cluion/sigil-core@0.13.0
- @cluion/sigil-shortcode@0.13.0
- @cluion/sigil-store-json@0.13.0
- @cluion/sigil-ui@0.13.0

## 0.12.0

### Minor Changes

- 6aa0a2f: Add command-backed context menus to the canvas and layers panel. The menu exposes copy, paste, move up, move down, and delete when each command is available, supports light and dark themes, stays inside the viewport, and provides arrow-key focus navigation with Escape dismissal. Add move-up and move-down to the default editing commands.

### Patch Changes

- Updated dependencies [6aa0a2f]
  - @cluion/sigil-core@0.12.0
  - @cluion/sigil-ui@0.12.0
  - @cluion/sigil-blocks@0.12.0
  - @cluion/sigil-shortcode@0.12.0
  - @cluion/sigil-store-json@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [598f14f]
  - @cluion/sigil-ui@0.11.0
  - @cluion/sigil-blocks@0.11.0
  - @cluion/sigil-core@0.11.0
  - @cluion/sigil-shortcode@0.11.0
  - @cluion/sigil-store-json@0.11.0

## 0.10.0

### Minor Changes

- 6915ccb: Add `optionsFrom` to PropSchema for dynamic select options. A `select` field can declare `optionsFrom(ctx)` where `ctx` carries the current `props`, a `fetchJSON` adapter, and an abort `signal`; pair it with `dependsOn` and the options reload (aborting the previous request, race-safe) whenever the dependency prop changes. This completes the product-card spec-cascade use case (color → size). `createInspector` / `createPropsPanel` / `createPropForm` now accept an optional `fetchJSON`; `createApp` / `createEditor` thread their existing `fetchJSON` down to the form. Without `fetchJSON` injected, an `optionsFrom` select shows "無法載入" instead of crashing.

### Patch Changes

- Updated dependencies [6915ccb]
  - @cluion/sigil-core@0.10.0
  - @cluion/sigil-ui@0.10.0
  - @cluion/sigil-blocks@0.10.0
  - @cluion/sigil-shortcode@0.10.0
  - @cluion/sigil-store-json@0.10.0

## 0.9.0

### Minor Changes

- c7a5c90: Add dark theme support. `createApp` / `createEditor` accept `theme: 'light' | 'dark' | 'auto'` (`auto` tracks `prefers-color-scheme`); the app shell gets a topbar toggle that cycles the three modes and persists the choice to `localStorage`. Canvas iframe stays on a white background regardless of theme (it is a real-page preview). Also adds a refined global scrollbar style across all editor panels.

### Patch Changes

- 1108649: Internal: `tokens.ts` now imports `tokens.css` via `?raw`, making `tokens.css` the single source of truth for design tokens and eliminating the manual two-way sync that had drifted (e.g. the dark-theme rules were missing from the inlined copy). A small rolldown plugin in `tsdown.config.ts` handles `?raw` during build; dev/test resolve it natively via Vite. No public API change.
- Updated dependencies [c7a5c90]
  - @cluion/sigil-ui@0.9.0
  - @cluion/sigil-blocks@0.9.0
  - @cluion/sigil-core@0.9.0
  - @cluion/sigil-shortcode@0.9.0
  - @cluion/sigil-store-json@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [77d9126]
  - @cluion/sigil-core@0.8.0
  - @cluion/sigil-ui@0.8.0
  - @cluion/sigil-blocks@0.8.0
  - @cluion/sigil-shortcode@0.8.0
  - @cluion/sigil-store-json@0.8.0

## 0.7.0

### Minor Changes

- d54946d: Add template library: save the selected subtree as a reusable template and drop it back onto the canvas. Introduces a `TemplateStore` adapter (mirroring ProjectStore/AssetStore) with `MemoryTemplateStore`/`JsonTemplateStore` implementations, a `templateToBlockDef` bridge (clones with new ids and resets locked/hidden), a `save-as-template` command wired into createApp/createEditor, and `createBlocksPanel` reload so newly saved templates appear immediately. Templates surface in a dedicated category and insert as clean, selectable nodes. Backend integration (HTTP/Laravel) is left to hosts via the adapter.

### Patch Changes

- Updated dependencies [bd80887]
- Updated dependencies [d54946d]
  - @cluion/sigil-ui@0.7.0
  - @cluion/sigil-core@0.7.0
  - @cluion/sigil-blocks@0.7.0
  - @cluion/sigil-store-json@0.7.0
  - @cluion/sigil-shortcode@0.7.0

## 0.6.0

### Minor Changes

- c92f494: Add editable Desktop, Tablet, and Mobile style inheritance across the model, renderer, Canvas, Inspector, and HTML serializer.

### Patch Changes

- Updated dependencies [c92f494]
  - @cluion/sigil-core@0.6.0
  - @cluion/sigil-ui@0.6.0
  - @cluion/sigil-shortcode@0.6.0
  - @cluion/sigil-store-json@0.6.0

## 0.5.0

### Minor Changes

- Topbar command buttons, layer lock/hide/rename, PropSchema group and dependsOn, Vite version inject fix

### Patch Changes

- Updated dependencies
  - @cluion/sigil-core@0.5.0
  - @cluion/sigil-shortcode@0.5.0
  - @cluion/sigil-store-json@0.5.0
  - @cluion/sigil-ui@0.5.0

## 0.4.0

### Minor Changes

- defineCommand, EditorHooks, and package version inject from package.json

### Patch Changes

- Updated dependencies
  - @cluion/sigil-core@0.4.0
  - @cluion/sigil-shortcode@0.4.0
  - @cluion/sigil-store-json@0.4.0
  - @cluion/sigil-ui@0.4.0
