// signal — 極簡 signal primitives（對齊 TC39 Signal.State／Computed）

type Cleanup = () => void

/**
 * 可訂閱物件（state 與 computed 共用），持有訂閱者 effect 集合
 */
interface Subscribable {
  subs: Set<Effect>
}

/**
 * 副作用：fn 為反應函式，deps 為訂閱來源，cleanup 為上次的清除函式
 */
interface Effect {
  fn: () => void | Cleanup
  deps: Set<Subscribable>
  cleanup?: Cleanup
  disposed: boolean
  running: boolean
}

/** 正在收集依賴的 computation（effect／computed 內部） */
let active: Effect | null = null

/** batch 深度，>0 時 set 只排隊不立即觸發 */
let batching = 0

/** batch 累積待觸發的 effect */
const pending = new Set<Effect>()

/**
 * 執行一個 effect：清舊依賴／cleanup，在收集模式下跑 fn，記錄新依賴
 *
 * running 旗標防止 fn 內同步改動自身訂閱的 state 造成重入無限迴圈
 */
function runEffect(e: Effect): void {
  if (e.disposed || e.running) return
  e.running = true
  for (const dep of e.deps) dep.subs.delete(e)
  e.deps.clear()
  if (e.cleanup) {
    const c = e.cleanup
    e.cleanup = undefined
    c()
  }
  const prev = active
  active = e
  try {
    const ret = e.fn()
    if (typeof ret === 'function') e.cleanup = ret
  } finally {
    active = prev
    e.running = false
  }
}

export interface SignalState<T> {
  get(): T
  set(v: T): void
}

export interface SignalComputed<T> {
  get(): T
}

/**
 * 建立可讀寫的 signal state
 *
 * get 時若處於依賴收集（effect 內），自動與當前 effect 雙向登記；
 * set 時同值跳過，否則通知訂閱者（batch 內排隊，否則立即觸發）
 */
export function state<T>(initial: T): SignalState<T> {
  const node: Subscribable & { value: T } = { value: initial, subs: new Set<Effect>() }
  return {
    get(): T {
      if (active && !active.disposed) {
        node.subs.add(active)
        active.deps.add(node)
      }
      return node.value
    },
    set(v: T): void {
      if (Object.is(v, node.value)) return
      node.value = v
      // 複製快照，避免重跑時改動 subs 造成迭代錯位
      const subs = Array.from(node.subs)
      for (const e of subs) {
        if (e.disposed) continue
        if (batching > 0) pending.add(e)
        else runEffect(e)
      }
    },
  }
}

/**
 * 建立計算衍生值（lazy memo）
 *
 * 首次 get 才計算並訂閱來源；來源變動時標記為髒、通知訂閱此 computed 的 effect 重跑；
 * 未變動時 get 回快取不重算
 */
export function computed<T>(fn: () => T): SignalComputed<T> {
  let value: T | undefined
  let dirty = true
  const subs = new Set<Effect>()
  const self: Subscribable = { subs }

  // 內部 derivation：訂閱來源，來源變動時標髒並通知外層訂閱者
  const derivation: Effect = {
    fn: () => {
      dirty = true
      const snapshot = Array.from(subs)
      for (const s of snapshot) {
        if (s.disposed) continue
        if (batching > 0) pending.add(s)
        else runEffect(s)
      }
    },
    deps: new Set<Subscribable>(),
    disposed: false,
    running: false,
  }

  function recompute(): void {
    for (const dep of derivation.deps) dep.subs.delete(derivation)
    derivation.deps.clear()
    const prev = active
    active = derivation
    try {
      value = fn()
    } finally {
      active = prev
    }
    dirty = false
  }

  return {
    get(): T {
      if (dirty) recompute()
      if (active && !active.disposed) {
        subs.add(active)
        active.deps.add(self)
      }
      return value as T
    },
  }
}

/**
 * 建立副作用：首次立即執行，自動追蹤讀取的 signal；
 * 回傳 dispose，呼叫後不再收通知並執行殘留 cleanup
 */
export function effect(fn: () => void | Cleanup): () => void {
  const e: Effect = { fn, deps: new Set<Subscribable>(), disposed: false, running: false }
  runEffect(e)
  return () => {
    if (e.disposed) return
    e.disposed = true
    for (const dep of e.deps) dep.subs.delete(e)
    e.deps.clear()
    if (e.cleanup) {
      const c = e.cleanup
      e.cleanup = undefined
      c()
    }
  }
}

/**
 * 批次：fn 內所有 set 只排隊，結束後統一觸發（訂閱多來源的 effect 只跑一次）
 */
export function batch(fn: () => void): void {
  batching++
  try {
    fn()
  } finally {
    batching--
    if (batching === 0) {
      const effects = Array.from(pending)
      pending.clear()
      for (const e of effects) {
        if (!e.disposed) runEffect(e)
      }
    }
  }
}

/**
 * 不追蹤：在 fn 內讀 signal 不建立依賴（用於 effect 內讀取但不希望重跑的情境）
 */
export function untrack<T>(fn: () => T): T {
  const prev = active
  active = null
  try {
    return fn()
  } finally {
    active = prev
  }
}
