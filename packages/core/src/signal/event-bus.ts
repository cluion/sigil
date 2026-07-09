/**
 * 事件匯流排 — 零依賴純 pub/sub
 *
 * emit 同步通知(快照迭代,handler 內 on/off 不錯位);
 * on 回傳 dispose 移除該 handler
 */
export interface EventBus {
  emit(name: string, data?: unknown): void
  on(name: string, handler: (data?: unknown) => void): () => void
}

export function createEventBus(): EventBus {
  const handlers = new Map<string, Set<(data?: unknown) => void>>()
  return {
    emit(name, data) {
      const set = handlers.get(name)
      if (set) for (const h of [...set]) h(data)
    },
    on(name, handler) {
      let set = handlers.get(name)
      if (!set) {
        set = new Set()
        handlers.set(name, set)
      }
      set.add(handler)
      return () => {
        set!.delete(handler)
      }
    },
  }
}
