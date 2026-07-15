import type { ComponentNode } from '../model/types.js'
import type { PropSchema, PropType } from '../model/schema.js'
import { createId } from '../model/index.js'

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

/** escape shortcode 字串 */
function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const SHORTCODE_RE = /\[([A-Za-z0-9_-]+)((?:\s+[A-Za-z0-9_-]+="(?:[^"\\]|\\.)*")*)\s*\/\]/g
const PROP_RE = /([A-Za-z0-9_-]+)="((?:[^"\\]|\\.)*)"/g

/**
 * 掃描字串中所有 shortcode,產 ComponentNode[];非 shortcode 文字忽略
 *
 * 格式不合法的 token 視為文字忽略,不中斷;
 * 依 schema 還原 prop 型別
 */
export function parse(text: string, opts?: ParserOptions): ComponentNode[] {
  const idFactory = opts?.idFactory ?? createId
  const nodes: ComponentNode[] = []
  for (const m of text.matchAll(SHORTCODE_RE)) {
    const name = m[1]!
    const schemaByName = opts?.getSchema
      ? new Map(opts.getSchema(name)?.map((s) => [s.name, s.type]))
      : undefined
    const props: Record<string, unknown> = {}
    for (const pm of (m[2] ?? '').matchAll(PROP_RE)) {
      props[pm[1]!] = convert(unescapeString(pm[2]!), schemaByName?.get(pm[1]!))
    }
    nodes.push({ id: idFactory(), type: 'shortcode', shortcode: { name, props } })
  }
  return nodes
}

/** unescape shortcode 字串 */
function unescapeString(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

function convert(v: string, type?: PropType): unknown {
  if (type === 'number') return Number(v)
  if (type === 'boolean') return v === 'true'
  return v
}
