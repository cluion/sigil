const defaultKey = 'sigil-block-pins'
const windows = new WeakMap<Window, Map<string, ReturnType<typeof createGroup>>>()

function createGroup(view: Window | null, key: string) {
  const cache = new Map<string, boolean>()
  const sessionChanges = new Map<string, boolean>()
  const listeners = new Set<() => void>()
  // 每個 ID 各自儲存，分頁同時釘選不同區塊時不會覆寫彼此。
  const prefix = 'sigil:pin:' + JSON.stringify(key) + ':'
  let storage: Storage | undefined
  try {
    storage = view?.localStorage
  } catch {
    // 瀏覽器禁止取得 localStorage 時改用這組面板共用的記憶體。
  }

  function read(id: string): boolean | undefined {
    try {
      return storage ? storage.getItem(prefix + id) === '1' : undefined
    } catch {
      return undefined
    }
  }

  function has(id: string): boolean {
    if (!cache.has(id)) cache.set(id, read(id) ?? false)
    return sessionChanges.get(id) ?? cache.get(id)!
  }

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function onStorage(event: StorageEvent): void {
    if (!storage || event.storageArea !== storage) return
    if (event.key === null) {
      cache.clear()
      sessionChanges.clear()
      notify()
      return
    }
    if (!event.key.startsWith(prefix)) return
    const id = event.key.slice(prefix.length)
    if (!cache.has(id)) return
    // 事件可能在目前視窗已寫入較新值之後才送達。
    const pinned = read(id)
    if (pinned === undefined) return
    const hadSessionChange = sessionChanges.delete(id)
    if (cache.get(id) === pinned && !hadSessionChange) return
    cache.set(id, pinned)
    notify()
  }
  if (storage) view?.addEventListener('storage', onStorage)

  function toggle(id: string): boolean {
    const pinned = !has(id)
    let persisted = !!storage
    try {
      if (pinned) storage?.setItem(prefix + id, '1')
      else storage?.removeItem(prefix + id)
    } catch {
      persisted = false
    }
    if (persisted) {
      cache.set(id, pinned)
      sessionChanges.delete(id)
    } else {
      const stored = read(id) ?? cache.get(id)!
      cache.set(id, stored)
      if (pinned === stored) sessionChanges.delete(id)
      else sessionChanges.set(id, pinned)
    }
    notify()
    return persisted
  }

  return {
    has,
    toggle,
    hasSessionChanges: () => sessionChanges.size > 0,
    listeners,
    stop: () => view?.removeEventListener('storage', onStorage),
  }
}

export function createBlockPins(
  view: Window | null,
  storageKey: string | false | undefined,
  onChange: () => void,
) {
  const owner = storageKey === false ? null : view
  const key = typeof storageKey === 'string' ? storageKey : defaultKey
  let scopes = owner ? windows.get(owner) : undefined
  if (owner && !scopes) {
    scopes = new Map()
    windows.set(owner, scopes)
  }
  const group = scopes?.get(key) ?? createGroup(owner, key)
  scopes?.set(key, group)
  const listener = () => onChange()
  group.listeners.add(listener)

  return {
    has: group.has,
    hasSessionChanges: () => storageKey !== false && group.hasSessionChanges(),
    toggle: (id: string) => group.listeners.has(listener) && group.toggle(id),
    destroy() {
      if (!group.listeners.delete(listener) || group.listeners.size) return
      group.stop()
      scopes?.delete(key)
    },
  }
}
