/**
 * HtmlPolicy — 引擎內唯一 HTML sink 模組
 *
 * 雙 named Trusted Types policy：
 *   #template  — build-time template（自家產出，信任），createHTML 直通
 *   #sanitized — 動態／外部值，走三層防禦
 * policy 名稱由 host 指定；永不建立 default policy
 *
 * 三層防禦（偵測軸為有無 setHTML，非有無 TT）：
 *   1. setHTML — 原生安全 sink，TT 無關
 *   2. 注入的 sanitize（如 DOMPurify.sanitize）— Safari 無 setHTML 時；core 零依賴，由上層注入
 *   3. textContent — 無 sanitize 時退為純文字，絕不 raw
 */

/**
 * 注入式消毒函式（如 DOMPurify.sanitize）；core 零依賴，不內建
 */
export type SanitizeFn = (input: string) => string

export interface HtmlPolicyOptions {
  // TT policy 名稱（host 可訂），預設 'sigil'
  trustedTypesPolicyName?: string
  // 注入的消毒函式
  sanitize?: SanitizeFn
}

export interface HtmlPolicy {
  // 注入 build-time template（信任產出）
  setTemplate(el: Element, html: string): void
  // 注入動態／外部值（走三層防禦）
  setSanitized(el: Element, untrusted: string): void
}

type TTFactory = {
  createPolicy: (
    name: string,
    rules: { createHTML: (s: string) => string },
  ) => { createHTML: (s: string) => string }
}

// 偵測全域 Trusted Types（瀏覽器有，Node 無）
function getTT(): TTFactory | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as { trustedTypes?: TTFactory }
  return g.trustedTypes ?? null
}

/**
 * 建立預設 HtmlPolicy
 *
 * 永不建立 default policy；host 須把 `${name}#template` 與 `${name}#sanitized`
 * 加入 CSP trusted-types 白名單
 */
export function createDefaultPolicy(opts: HtmlPolicyOptions = {}): HtmlPolicy {
  const base = opts.trustedTypesPolicyName ?? 'sigil'
  const tt = getTT()
  const templatePolicy = tt?.createPolicy(`${base}#template`, { createHTML: (s) => s }) ?? null
  const sanitizedPolicy = tt?.createPolicy(`${base}#sanitized`, { createHTML: (s) => s }) ?? null

  return {
    setTemplate(el, html) {
      const trusted = templatePolicy ? templatePolicy.createHTML(html) : html
      // 受控 sink：僅在 policy 模組內允許（eslint override）
      el.innerHTML = trusted as string
    },
    setSanitized(el, untrusted) {
      const e = el as Element & { setHTML?: (input: string) => void }
      // 1. 原生 setHTML（TT 無關安全 sink）
      if (typeof e.setHTML === 'function') {
        e.setHTML(untrusted)
        return
      }
      // 2. 注入的 sanitize（DOMPurify）；結果不再序列化重解析
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
