---
'@cluion/sigil-ui': patch
---

Keep ordinary fragment-link activation inside the preview canvas instead of navigating its srcdoc frame to the host editor. Respect alternate targets, downloads, modified clicks, and already handled events, and remove navigation listeners when the canvas is destroyed.
