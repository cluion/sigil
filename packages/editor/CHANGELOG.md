# @cluion/sigil

## 0.9.0

### Minor Changes

- c7a5c90: Add dark theme support. `createApp` / `createEditor` accept `theme: 'light' | 'dark' | 'auto'` (`auto` tracks `prefers-color-scheme`); the app shell gets a topbar toggle that cycles the three modes and persists the choice to `localStorage`. Canvas iframe stays on a white background regardless of theme (it is a real-page preview). Also adds a refined global scrollbar style across all editor panels.

### Patch Changes

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
