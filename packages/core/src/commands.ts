import type { ComponentNode, SigilDoc } from './model/types.js'
import type { Engine } from './engine/types.js'

/**
 * 命令執行上下文 — run 內可操作 engine／存檔／剪貼簿
 */
export interface CommandContext {
  engine: Engine
  getDoc: () => SigilDoc
  /** 寫入 ProjectStore（若殼層有提供） */
  save?: () => void | Promise<void>
  clipboard: {
    get: () => ComponentNode | null
    set: (node: ComponentNode | null) => void
  }
}

/**
 * 命令定義 — 快捷鍵與可執行動作
 *
 * shortcut 例：`mod+s`、`mod+shift+z`、`Delete`（`mod` = Ctrl 或 Cmd）
 */
export interface CommandDefinition {
  id: string
  label?: string
  shortcut?: string | string[]
  /** 回傳 false 時不執行（預設 true） */
  when?: (ctx: CommandContext) => boolean
  run: (ctx: CommandContext) => void | Promise<void>
}

export function defineCommand(def: CommandDefinition): CommandDefinition {
  return def
}

export interface CommandRegistry {
  list(): CommandDefinition[]
  get(id: string): CommandDefinition | undefined
  /** 依 KeyboardEvent 找第一個匹配且 when 通過的命令 */
  match(e: KeyboardEvent, ctx: CommandContext): CommandDefinition | undefined
  run(id: string, ctx: CommandContext): Promise<boolean>
}

export function createCommandRegistry(
  commands: CommandDefinition[] = [],
): CommandRegistry {
  const map = new Map<string, CommandDefinition>()
  for (const c of commands) map.set(c.id, c)

  return {
    list() {
      return [...map.values()]
    },
    get(id) {
      return map.get(id)
    },
    match(e, ctx) {
      for (const cmd of map.values()) {
        if (!cmd.shortcut) continue
        const keys = Array.isArray(cmd.shortcut) ? cmd.shortcut : [cmd.shortcut]
        if (!keys.some((s) => matchShortcut(s, e))) continue
        if (cmd.when && !cmd.when(ctx)) continue
        return cmd
      }
      return undefined
    },
    async run(id, ctx) {
      const cmd = map.get(id)
      if (!cmd) return false
      if (cmd.when && !cmd.when(ctx)) return false
      await cmd.run(ctx)
      return true
    },
  }
}

/**
 * 解析快捷鍵字串是否匹配事件
 *
 * - `mod`／`cmd`／`meta`／`ctrl`：Ctrl 或 Meta（Cmd）
 * - `shift`、`alt`
 * - 最後一段為 key（大小寫不敏感；`delete` 另含 Backspace 需分開宣告）
 */
export function matchShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return false

  const keyToken = parts[parts.length - 1]!
  const mods = new Set(parts.slice(0, -1))

  const wantMod =
    mods.has('mod') || mods.has('cmd') || mods.has('meta') || mods.has('ctrl')
  const wantShift = mods.has('shift')
  const wantAlt = mods.has('alt')
  const isMod = e.ctrlKey || e.metaKey

  if (wantMod !== isMod) return false
  if (wantShift !== e.shiftKey) return false
  if (wantAlt !== e.altKey) return false

  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (keyToken === 'space') return eventKey === ' ' || eventKey === 'Spacebar'
  if (keyToken === 'esc' || keyToken === 'escape') return eventKey === 'Escape'
  if (keyToken === 'delete') return eventKey === 'Delete'
  if (keyToken === 'backspace') return eventKey === 'Backspace'
  if (keyToken === 'enter' || keyToken === 'return') return eventKey === 'Enter'

  return eventKey === keyToken || e.key.toLowerCase() === keyToken
}
