---
'@cluion/sigil-core': minor
'@cluion/sigil-app': minor
'@cluion/sigil': minor
---

Make App/Editor `toJSON()` a pure detached snapshot. **Breaking change:** replace calls that relied on implicit persistence with `await app.save()` or `await editor.save()`.

Explicit saves capture the requested revision, serialize writes, reject on failure, preserve newer edits as dirty, and isolate host callbacks from engine/history data. Expose `isSaving()` and SDK `isDirty()`, await save commands, report keyboard/UI failures through `onSaveError`, and stop queued saves on destroy. Preserve document metadata and stylesheets across engine serialization.

Pause App document shortcuts while its host is inert so a host-controlled reload cannot accept edits or saves during replacement.
