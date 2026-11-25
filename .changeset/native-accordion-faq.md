---
'@cluion/sigil-blocks': minor
'@cluion/sigil-ui': minor
'@cluion/sigil-app': minor
'@cluion/sigil': minor
---

Add the accordion FAQ to the marketing block library. Authors can add questions and edit their answers in the inspector. Preview and downloaded HTML use native `details` and `summary` elements that readers can open with a pointer or keyboard.

Hosts can build a group with `blockAccordionFAQ()` or insert one question with `blockFAQItem()`. The existing `blockFAQ()` still exports the fully visible definition list.
