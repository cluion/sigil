import type { ComponentNode } from './model/types.js'
import type { ShortcodeResolver } from './renderer/shortcode-resolver.js'

export interface HydrateOptions {
  shortcodeResolver: ShortcodeResolver
}

/**
 * 正式站 hydration — 找 [data-shortcode] host,re-resolve 跑 bind 恢復互動
 *
 * 從 data 屬性重建 live shortcode
 * 僅支援 DOM 環境
 */
export function hydrate(root: ParentNode, opts: HydrateOptions): void {
  const hosts = root.querySelectorAll('[data-shortcode]')
  for (const host of hosts) {
    if (!(host instanceof HTMLElement)) continue
    const name = host.getAttribute('data-shortcode')
    if (!name) continue
    const props = JSON.parse(host.getAttribute('data-props') ?? '{}') as Record<string, unknown>
    const node: ComponentNode = {
      id: host.getAttribute('data-sigil-id') ?? '',
      type: 'shortcode',
      shortcode: { name, props },
    }
    host.replaceChildren()
    opts.shortcodeResolver.resolve(node, host, 'live')
  }
}
