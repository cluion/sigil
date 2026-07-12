/** Build／test 由 define 注入；見 tsdown.config 與 vitest.config */
declare const __SIGIL_APP_VERSION__: string

/** 與 package.json version 對齊 */
export const SIGIL_APP_VERSION: string = __SIGIL_APP_VERSION__
