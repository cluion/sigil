/**
 * HtmlPolicy — 引擎內唯一 HTML sink 模組
 *
 * 雙 named Trusted Types policy：
 *   #template  — 信任 build-time template
 *   #sanitized — 動態／外部值，走三層防禦
 * policy 名稱由 host 指定
 *
 * 三層防禦以 setHTML 支援度判斷
 *   1. setHTML — 原生安全 sink，TT 無關
 *   2. 上層注入 sanitize
 *   3. textContent — 無 sanitize 時退為純文字，絕不 raw
 */

/**
 * 上層注入的消毒函式
 */
export type SanitizeFn = (input: string) => string

export interface HtmlPolicyOptions {
  // TT policy 名稱
  trustedTypesPolicyName?: string
  // 注入的消毒函式
  sanitize?: SanitizeFn
}

export interface HtmlPolicy {
  // 注入可信 template 或 iframe 文件
  setTemplate(el: Element, html: string): void
  // 注入動態值
  setSanitized(el: Element, untrusted: string): void
}

type TTFactory = {
  createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => TTPolicy
}

type TTPolicy = { createHTML: (s: string) => string }

const policyCache = new WeakMap<TTFactory, Map<string, TTPolicy>>()

// 偵測 Trusted Types
function getTT(): TTFactory | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as { trustedTypes?: TTFactory }
  return g.trustedTypes ?? null
}

function getOrCreatePolicy(tt: TTFactory | null, name: string): TTPolicy | null {
  if (!tt) return null
  let policies = policyCache.get(tt)
  if (!policies) {
    policies = new Map()
    policyCache.set(tt, policies)
  }
  const cached = policies.get(name)
  if (cached) return cached
  const policy = tt.createPolicy(name, { createHTML: (s) => s })
  policies.set(name, policy)
  return policy
}

/**
 * 建立預設 HtmlPolicy
 *
 * host 須將兩個 policy 加入 CSP 白名單
 */
export function createDefaultPolicy(opts: HtmlPolicyOptions = {}): HtmlPolicy {
  const base = opts.trustedTypesPolicyName ?? 'sigil'
  const tt = getTT()
  const templatePolicy = getOrCreatePolicy(tt, `${base}#template`)
  const sanitizedPolicy = getOrCreatePolicy(tt, `${base}#sanitized`)

  return {
    setTemplate(el, html) {
      const trusted = templatePolicy ? templatePolicy.createHTML(html) : html
      // policy 內的受控 sink
      if (el.tagName.toUpperCase() === 'IFRAME') {
        const iframe = el as HTMLIFrameElement
        iframe.srcdoc = trusted as string
      } else {
        el.innerHTML = trusted as string
      }
    },
    setSanitized(el, untrusted) {
      const e = el as Element & { setHTML?: (input: string) => void }
      // 1 原生 setHTML
      if (typeof e.setHTML === 'function') {
        e.setHTML(untrusted)
        return
      }
      // 2 注入的 sanitize
      if (opts.sanitize) {
        const cleaned = opts.sanitize(untrusted)
        const trusted = sanitizedPolicy ? sanitizedPolicy.createHTML(cleaned) : cleaned
        el.innerHTML = trusted as string
        return
      }
      // 3. 無 sanitize → 純文字，絕不 raw HTML
      el.textContent = untrusted
    },
  }
}
