/**
 * Build 等環境注入 未注入時以 typeof 避免 dev ReferenceError
 * 見 tsdown.config、vitest.config、scripts/sigil-version-defines.mjs
 */
declare const __SIGIL_CORE_VERSION__: string | undefined

/** 與 package.json version 對齊 */
export const SIGIL_CORE_VERSION: string =
  typeof __SIGIL_CORE_VERSION__ !== 'undefined' ? __SIGIL_CORE_VERSION__ : '0.0.0-dev'
