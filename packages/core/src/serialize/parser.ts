import type { ComponentNode } from '../model/types.js'
import type { PropSchema } from '../model/schema.js'

export interface ParserOptions {
  /** 取 shortcode 的 PropSchema;parse 時依型別還原 prop 值 */
  getSchema?: (name: string) => PropSchema[] | undefined
  /** 產生節點 id;預設 createId */
  idFactory?: () => string
}

/**
 * 單一 shortcode 節點 → `[name k="v"/]`;非 shortcode 節點拋錯
 */
export function stringify(node: ComponentNode): string {
  const ref = node.shortcode
  if (!ref) throw new Error('stringify:節點非 shortcode(缺 node.shortcode)')
  const parts: string[] = ['[', ref.name]
  for (const [k, v] of Object.entries(ref.props)) {
    parts.push(` ${k}="${escapeString(String(v))}"`)
  }
  parts.push('/]')
  return parts.join('')
}

/** escape 值:\ → \\、" → \\"(stringify 用;parse 用 unescapeString 反向) */
function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
