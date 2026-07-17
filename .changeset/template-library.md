---
'@cluion/sigil-core': minor
'@cluion/sigil-blocks': minor
'@cluion/sigil-ui': minor
'@cluion/sigil-store-json': minor
'@cluion/sigil': minor
'@cluion/sigil-app': minor
---

Add template library: save the selected subtree as a reusable template and drop it back onto the canvas. Introduces a `TemplateStore` adapter (mirroring ProjectStore/AssetStore) with `MemoryTemplateStore`/`JsonTemplateStore` implementations, a `templateToBlockDef` bridge (clones with new ids and resets locked/hidden), a `save-as-template` command wired into createApp/createEditor, and `createBlocksPanel` reload so newly saved templates appear immediately. Templates surface in a dedicated category and insert as clean, selectable nodes. Backend integration (HTTP/Laravel) is left to hosts via the adapter.
