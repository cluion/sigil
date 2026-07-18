// tokens.css 為唯一真源；build (rolldown) 與 dev/test (vite) 都原生支援 ?raw
import tokensCss from './tokens.css?raw'

/** 將 design tokens 注入 document，只注入一次 */
let injected = false

export function ensureTokens(): void {
  if (injected || typeof document === 'undefined') return
  if (document.getElementById('sigil-tokens')) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'sigil-tokens'
  style.textContent = tokensCss
  document.head.appendChild(style)
  injected = true
}
