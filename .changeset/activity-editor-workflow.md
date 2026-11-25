---
'@cluion/sigil-app': minor
'@cluion/sigil-ui': minor
'@cluion/sigil-core': minor
'@cluion/sigil-blocks': minor
'@cluion/sigil': patch
---

Edit image alternatives and responsive spacing in the inspector, navigate compact panels by keyboard, and preview pages without editor guides. Downloaded HTML opens as a standalone page with an optional host-provided title. The copy action and `toHTML()` return embeddable fragments that retain their own responsive styles when combined. Reduce repaint time for large documents by using a solid editing outline on the root container.

Navigate pages and collapsible layers on the left, edit the selection on the right, and use the canvas toolbar to select its parent, duplicate it or delete it. Blocks support click, keyboard and drag insertion. Hosts can supply page navigation and update the displayed document title. On phones, tap a component to edit its content and swipe to scroll the canvas.

Set responsive layout, alignment and spacing in collapsible style sections. Insert links and choose a destination section or an address in the inspector. When duplicating, pasting or inserting a block, conflicting HTML IDs receive unique names and references inside the copy follow the renamed targets.

Replace a canvas image from its toolbar or by double-clicking it. Search images by name and see which one is in use. Asset stores can configure the file chooser and provide actionable upload errors.

Apps can prepare a document snapshot for HTML download with `prepareDownload(doc, signal)`. The Laravel activity editor uses this to include its template and uploaded photos for offline viewing. When preparation fails, users can retry or download with the original URLs.

Save active canvas text with the toolbar, the configured Save shortcut or the App and Editor APIs. Pending text updates the unsaved indicator and becomes a single undoable edit when committed.
