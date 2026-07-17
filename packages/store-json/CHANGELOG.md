# @cluion/sigil-store-json

## 0.7.0

### Minor Changes

- d54946d: Add template library: save the selected subtree as a reusable template and drop it back onto the canvas. Introduces a `TemplateStore` adapter (mirroring ProjectStore/AssetStore) with `MemoryTemplateStore`/`JsonTemplateStore` implementations, a `templateToBlockDef` bridge (clones with new ids and resets locked/hidden), a `save-as-template` command wired into createApp/createEditor, and `createBlocksPanel` reload so newly saved templates appear immediately. Templates surface in a dedicated category and insert as clean, selectable nodes. Backend integration (HTTP/Laravel) is left to hosts via the adapter.

### Patch Changes

- Updated dependencies [d54946d]
  - @cluion/sigil-core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [c92f494]
  - @cluion/sigil-core@0.6.0

## 0.5.0

### Minor Changes

- Topbar command buttons, layer lock/hide/rename, PropSchema group and dependsOn, Vite version inject fix

### Patch Changes

- Updated dependencies
  - @cluion/sigil-core@0.5.0

## 0.4.0

### Minor Changes

- defineCommand, EditorHooks, and package version inject from package.json

### Patch Changes

- Updated dependencies
  - @cluion/sigil-core@0.4.0
