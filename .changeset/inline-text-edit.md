---
'@cluion/sigil-ui': minor
---

Double-click a text or button node on the canvas to edit its content in place (contenteditable, single-line). Enter or blur commits the change, Esc cancels. The canvas toggles iframe pointer-events while editing so the caret is reachable; on commit it re-selects the node so the Inspector's content field stays in sync. Only `text` and `button` nodes are editable this way (rich text is out of scope).
