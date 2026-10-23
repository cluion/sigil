---
'@cluion/sigil-core': patch
---

End typing merge groups at Undo, Redo, and batch boundaries. New edits after Undo now create a new history step and discard the obsolete Redo branch, while edits before or after a batch remain independently undoable. Preserve ordinary same-field typing merges within 500ms.
