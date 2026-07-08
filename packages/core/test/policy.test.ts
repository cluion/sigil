import { describe, it, expect } from 'vitest'
import { escapeHtml, createDefaultPolicy } from '../src/index.js'

describe('escapeHtml', () => {
  it('escape HTML 後設字元', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
    expect(escapeHtml("a'b&c")).toBe('a&#39;b&amp;c')
  })

  it('escape onerror payload，使其無法成為屬性', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
  })
})

describe('createDefaultPolicy — setTemplate／setSanitized', () => {
  it('暴露兩個 sink 方法', () => {
    const p = createDefaultPolicy()
    expect(typeof p.setTemplate).toBe('function')
    expect(typeof p.setSanitized).toBe('function')
  })
})

describe('setSanitized — 三層防禦', () => {
  // happy-dom 無 setHTML → 跳過第一層，測第二／三層
  it('第二層：呼叫注入的 sanitize 後設 innerHTML', () => {
    const el = document.createElement('div')
    let called = false
    const p = createDefaultPolicy({
      sanitize: (s: string) => {
        called = true
        expect(s).toBe('<bad>')
        return 'CLEANED'
      },
    })
    p.setSanitized(el, '<bad>')
    expect(called).toBe(true)
    expect(el.innerHTML).toBe('CLEANED')
  })

  it('第三層：無 sanitize → textContent，絕不 raw HTML（不建立元素）', () => {
    const el = document.createElement('div')
    const p = createDefaultPolicy()
    p.setSanitized(el, '<img src=x onerror=alert(1)>')
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(el.querySelector('img')).toBeNull()
  })
})
