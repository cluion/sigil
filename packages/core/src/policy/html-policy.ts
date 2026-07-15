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
  // 注入可信 template
  setTemplate(el: Element, html: string): void
  // 注入動態值
  setSanitized(el: Element, untrusted: string): void
}

type TTFactory = {
  createPolicy: (
    name: string,
    rules: { createHTML: (s: string) => string },
  ) => { createHTML: (s: string) => string }
}

// 偵測 Trusted Types
function getTT(): TTFactory | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as { trustedTypes?: TTFactory }
  return g.trustedTypes ?? null
}

/**
 * 建立預設 HtmlPolicy
 *
 * host 須將兩個 policy 加入 CSP 白名單
 */
export function createDefaultPolicy(opts: HtmlPolicyOptions = {}): HtmlPolicy {
  const base = opts.trustedTypesPolicyName ?? 'sigil'
  const tt = getTT()
  const templatePolicy = tt?.createPolicy(`${base}#template`, { createHTML: (s) => s }) ?? null
  const sanitizedPolicy = tt?.createPolicy(`${base}#sanitized`, { createHTML: (s) => s }) ?? null

  return {
    setTemplate(el, html) {
      const trusted = templatePolicy ? templatePolicy.createHTML(html) : html
      // policy 內的受控 sink
      el.innerHTML = trusted as string
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
