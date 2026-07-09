import type { ShortcodeDefinition } from './types.js'

/**
 * shortcode 定義登記表
 */
export interface ShortcodeRegistry {
  get(name: string): ShortcodeDefinition | null
  register(def: ShortcodeDefinition): void
  all(): ShortcodeDefinition[]
}

/**
 * 建立 registry，可傳入初始定義集
 */
export function createShortcodeRegistry(
  defs: ShortcodeDefinition[] = [],
): ShortcodeRegistry {
  const map = new Map<string, ShortcodeDefinition>()
  for (const d of defs) map.set(d.name, d)
  return {
    get(name) {
      return map.get(name) ?? null
    },
    register(def) {
      map.set(def.name, def)
    },
    all() {
      return Array.from(map.values())
    },
  }
}

/**
 * 定義 shortcode — 以泛型 P 檢查 bind 內 ctx.props 的型別，回傳 erased 定義供 registry 收存
 */
export function defineShortcode<P extends Record<string, unknown> = Record<string, unknown>>(
  def: ShortcodeDefinition<P>,
  registry?: ShortcodeRegistry,
): ShortcodeDefinition {
  const erased = def as ShortcodeDefinition
  if (registry) registry.register(erased)
  return erased
}
