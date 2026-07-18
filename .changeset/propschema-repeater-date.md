---
'@cluion/sigil-core': minor
'@cluion/sigil-ui': minor
---

Add `repeater` and `date` PropSchema field types. `repeater` renders an add/remove list of groups, each with its own sub-schema (e.g. a list of links with label + href); sub-field changes reassemble the whole array and write it back. `date` renders a native `<input type="date">` and stores the value as a string. Repeater items get a bordered card layout with the delete action right-aligned.
