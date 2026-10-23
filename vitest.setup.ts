// happy-dom 未實作原生對話框；Vitest 4 的 spy 需要先有函式。
// 預設拋錯，讓每個互動測試明確指定確認／取消結果，避免隱藏未 mock 的呼叫。
if (typeof window !== 'undefined') {
  window.prompt = () => {
    throw new Error('Mock window.prompt before invoking a dialog in tests')
  }
  window.confirm = () => {
    throw new Error('Mock window.confirm before invoking a dialog in tests')
  }
}
