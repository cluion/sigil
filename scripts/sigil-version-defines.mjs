/**
 * Vite / vitest define：把各包 package.json version 注入 __SIGIL_*_VERSION__
 * 供 dev 走 src 時與 tsdown build 一致。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function pkgVersion(rel) {
  const j = JSON.parse(readFileSync(join(root, rel, 'package.json'), 'utf8'))
  return j.version
}

/** @returns {Record<string, string>} */
export function sigilVersionDefines() {
  return {
    __SIGIL_CORE_VERSION__: JSON.stringify(pkgVersion('packages/core')),
    __SIGIL_SHORTCODE_VERSION__: JSON.stringify(pkgVersion('packages/shortcode')),
    __SIGIL_APP_VERSION__: JSON.stringify(pkgVersion('packages/app')),
  }
}
