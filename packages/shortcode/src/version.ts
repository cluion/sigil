/**
 * Build／test／vite define 注入；未注入時用 typeof 後備（避免 dev ReferenceError）
 * 見 tsdown.config、vitest.config、scripts/sigil-version-defines.mjs
 */
declare const __SIGIL_SHORTCODE_VERSION__: string | undefined

/** 與 package.json version 對齊 */
export const SIGIL_SHORTCODE_VERSION: string =
  typeof __SIGIL_SHORTCODE_VERSION__ !== 'undefined'
    ? __SIGIL_SHORTCODE_VERSION__
    : '0.0.0-dev'
