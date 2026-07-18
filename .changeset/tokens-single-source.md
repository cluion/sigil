---
'@cluion/sigil-app': patch
---

Internal: `tokens.ts` now imports `tokens.css` via `?raw`, making `tokens.css` the single source of truth for design tokens and eliminating the manual two-way sync that had drifted (e.g. the dark-theme rules were missing from the inlined copy). A small rolldown plugin in `tsdown.config.ts` handles `?raw` during build; dev/test resolve it natively via Vite. No public API change.
