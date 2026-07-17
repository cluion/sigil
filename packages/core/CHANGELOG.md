# @cluion/sigil-core

## 0.7.0

### Minor Changes

- d54946d: Add template library: save the selected subtree as a reusable template and drop it back onto the canvas. Introduces a `TemplateStore` adapter (mirroring ProjectStore/AssetStore) with `MemoryTemplateStore`/`JsonTemplateStore` implementations, a `templateToBlockDef` bridge (clones with new ids and resets locked/hidden), a `save-as-template` command wired into createApp/createEditor, and `createBlocksPanel` reload so newly saved templates appear immediately. Templates surface in a dedicated category and insert as clean, selectable nodes. Backend integration (HTTP/Laravel) is left to hosts via the adapter.

## 0.6.0

### Minor Changes

- c92f494: Add editable Desktop, Tablet, and Mobile style inheritance across the model, renderer, Canvas, Inspector, and HTML serializer.

## 0.5.0

### Minor Changes

- Topbar command buttons, layer lock/hide/rename, PropSchema group and dependsOn, Vite version inject fix

## 0.4.0

### Minor Changes

- defineCommand, EditorHooks, and package version inject from package.json
