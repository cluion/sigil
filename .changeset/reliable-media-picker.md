---
'@cluion/sigil-ui': patch
---

Show distinct media loading, empty, and failure states with localized retry controls. Handle synchronous and asynchronous asset adapter failures, prevent overlapping uploads, retry the selected file, and ignore delayed results after closing the picker while preserving focus restoration.

Close owned media pickers when Inspector fields or property forms are replaced or destroyed, and prevent stale controls from reopening or applying results. Preserve active uploads across locale changes and retain concurrently edited image attributes when applying a selected URL.
