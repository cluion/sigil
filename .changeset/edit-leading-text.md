---
'@cluion/sigil-core': patch
'@cluion/sigil-ui': minor
'@cluion/sigil-app': minor
'@cluion/sigil': minor
---

Edit the leading text of a component from its canvas toolbar. Updating the parent's content preserves nested components, including their position and interactions.

Explicitly replacing children through `engine.update()` now refreshes the canvas and selected fields in one undo step.
