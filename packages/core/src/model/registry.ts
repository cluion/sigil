export interface TypeEntry {
  tagName?: string
}

export interface TypeRegistry {
  get(type: string): TypeEntry | null
  register(type: string, entry: TypeEntry): void
}

const NATIVE: Record<string, TypeEntry> = {
  section: { tagName: 'section' },
  text: { tagName: 'span' },
  image: { tagName: 'img' },
  button: { tagName: 'button' },
  column: { tagName: 'div' },
  shortcode: { tagName: 'div' },
}

/**
 * 建立 type registry
 *
 * 推導內建 type 的 tagName
 */
export function createTypeRegistry(entries?: Record<string, TypeEntry>): TypeRegistry {
  const map: Record<string, TypeEntry> = { ...NATIVE, ...entries }
  return {
    get(type) {
      return map[type] ?? null
    },
    register(type, entry) {
      map[type] = entry
    },
  }
}
