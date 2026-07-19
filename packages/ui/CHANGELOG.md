# @cluion/sigil-ui

## 0.11.0

### Minor Changes

- 598f14f: Double-click a text or button node on the canvas to edit its content in place (contenteditable, single-line). Enter or blur commits the change, Esc cancels. The canvas toggles iframe pointer-events while editing so the caret is reachable; on commit it re-selects the node so the Inspector's content field stays in sync. Only `text` and `button` nodes are editable this way (rich text is out of scope).

### Patch Changes

- @cluion/sigil-core@0.11.0

## 0.10.0

### Minor Changes

- 6915ccb: Add `optionsFrom` to PropSchema for dynamic select options. A `select` field can declare `optionsFrom(ctx)` where `ctx` carries the current `props`, a `fetchJSON` adapter, and an abort `signal`; pair it with `dependsOn` and the options reload (aborting the previous request, race-safe) whenever the dependency prop changes. This completes the product-card spec-cascade use case (color → size). `createInspector` / `createPropsPanel` / `createPropForm` now accept an optional `fetchJSON`; `createApp` / `createEditor` thread their existing `fetchJSON` down to the form. Without `fetchJSON` injected, an `optionsFrom` select shows "無法載入" instead of crashing.

### Patch Changes

- Updated dependencies [6915ccb]
  - @cluion/sigil-core@0.10.0

## 0.9.0

### Minor Changes

- c7a5c90: Add dark theme support. `createApp` / `createEditor` accept `theme: 'light' | 'dark' | 'auto'` (`auto` tracks `prefers-color-scheme`); the app shell gets a topbar toggle that cycles the three modes and persists the choice to `localStorage`. Canvas iframe stays on a white background regardless of theme (it is a real-page preview). Also adds a refined global scrollbar style across all editor panels.

### Patch Changes

- @cluion/sigil-core@0.9.0

## 0.8.0

### Minor Changes

- 77d9126: Add `repeater` and `date` PropSchema field types. `repeater` renders an add/remove list of groups, each with its own sub-schema (e.g. a list of links with label + href); sub-field changes reassemble the whole array and write it back. `date` renders a native `<input type="date">` and stores the value as a string. Repeater items get a bordered card layout with the delete action right-aligned.

### Patch Changes

- Updated dependencies [77d9126]
  - @cluion/sigil-core@0.8.0

## 0.7.0

### Minor Changes

- bd80887: Add alignment guides and spacing hints during drag. When moving an existing node, teal reference lines appear when edges/centers align with siblings or the parent container, and a gap label shows the pixel distance to the neighbor. Inserting a new node shows only the gap hint (the new node has no size yet). Pure visual layer — does not change drop results or the model.
- d54946d: Add template library: save the selected subtree as a reusable template and drop it back onto the canvas. Introduces a `TemplateStore` adapter (mirroring ProjectStore/AssetStore) with `MemoryTemplateStore`/`JsonTemplateStore` implementations, a `templateToBlockDef` bridge (clones with new ids and resets locked/hidden), a `save-as-template` command wired into createApp/createEditor, and `createBlocksPanel` reload so newly saved templates appear immediately. Templates surface in a dedicated category and insert as clean, selectable nodes. Backend integration (HTTP/Laravel) is left to hosts via the adapter.

### Patch Changes

- Updated dependencies [d54946d]
  - @cluion/sigil-core@0.7.0

## 0.6.0

### Minor Changes

- c92f494: Add editable Desktop, Tablet, and Mobile style inheritance across the model, renderer, Canvas, Inspector, and HTML serializer.

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
