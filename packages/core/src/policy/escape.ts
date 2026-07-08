// 純文字 escape，零依賴內建，作為 sink 最後防線

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 把任意字串 escape 成可安全放進 textContent、屬性的純文字
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESC[c] ?? c)
}
