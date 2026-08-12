# @cluion/sigil-core

## 0.17.0

### Minor Changes

- ca2bbd1: Add an optional rich-text resolver with policy-backed DOM rendering and sanitized or escaped HTML export.

## 0.16.0

### Minor Changes

- e007805: Add `TemplateStore.remove?` and memory JSON template store deletion support to enable template rename/delete flows.

## 0.15.0

## 0.14.0

## 0.13.1

## 0.13.0

### Minor Changes

- 7d50eda: Drop Node.js 20 support and require Node.js 24 or newer across all published packages.

## 0.12.0

### Minor Changes

- 6aa0a2f: Add command-backed context menus to the canvas and layers panel. The menu exposes copy, paste, move up, move down, and delete when each command is available, supports light and dark themes, stays inside the viewport, and provides arrow-key focus navigation with Escape dismissal. Add move-up and move-down to the default editing commands.

## 0.11.0

## 0.10.0

### Minor Changes

- 6915ccb: Add `optionsFrom` to PropSchema for dynamic select options. A `select` field can declare `optionsFrom(ctx)` where `ctx` carries the current `props`, a `fetchJSON` adapter, and an abort `signal`; pair it with `dependsOn` and the options reload (aborting the previous request, race-safe) whenever the dependency prop changes. This completes the product-card spec-cascade use case (color → size). `createInspector` / `createPropsPanel` / `createPropForm` now accept an optional `fetchJSON`; `createApp` / `createEditor` thread their existing `fetchJSON` down to the form. Without `fetchJSON` injected, an `optionsFrom` select shows "無法載入" instead of crashing.

## 0.9.0

## 0.8.0

### Minor Changes

- 77d9126: Add `repeater` and `date` PropSchema field types. `repeater` renders an add/remove list of groups, each with its own sub-schema (e.g. a list of links with label + href); sub-field changes reassemble the whole array and write it back. `date` renders a native `<input type="date">` and stores the value as a string. Repeater items get a bordered card layout with the delete action right-aligned.

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
