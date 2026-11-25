import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlockPins } from '../src/block-pins.js'

const mounted: ReturnType<typeof createBlockPins>[] = []

function mount(key?: string | false, onChange = vi.fn(), owner: Window | null = window) {
  const pins = createBlockPins(owner, key, onChange)
  mounted.push(pins)
  return pins
}

function instrumentStorage() {
  const storage = localStorage
  const getItem = vi.fn((key: string) => storage.getItem(key))
  const setItem = vi.fn((key: string, value: string) => storage.setItem(key, value))
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem,
    setItem,
    removeItem: (key) => storage.removeItem(key),
    key: (index) => storage.key(index),
    clear: () => storage.clear(),
    get length() {
      return storage.length
    },
  })
  return { getItem, setItem }
}

afterEach(() => {
  for (const pins of mounted.splice(0)) pins.destroy()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('區塊釘選的瀏覽器偏好', () => {
  it('保留未載入的範本 ID，區塊重新命名或工作區重開仍可使用原釘選', () => {
    const pins = mount()
    pins.toggle('template:海報')
    pins.destroy()

    const builtins = mount()
    expect(builtins.has('text')).toBe(false)
    builtins.toggle('text')
    builtins.destroy()

    const reopened = mount()
    expect(reopened.has('template:海報')).toBe(true)
    expect(reopened.has('text')).toBe(true)
    reopened.toggle('template:海報')
    reopened.destroy()
    expect(mount().has('template:海報')).toBe(false)
    expect(mount().has('text')).toBe(true)
  })

  it('同一範圍的面板立刻同步，分隔符號、引號與空字串也能正確區隔', () => {
    const onChange = vi.fn()
    const first = mount('main', onChange)
    const other = mount('main', onChange)
    const separate = mount('main:hero"')
    const emptyKey = mount('')
    expect(onChange).not.toHaveBeenCalled()
    first.toggle('hero":button')
    expect(other.has('hero":button')).toBe(true)
    expect(separate.has('button')).toBe(false)
    expect(emptyKey.has('hero":button')).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(2)
    first.destroy()
    other.toggle('hero":button')
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(first.toggle('hero":button')).toBe(false)
    other.destroy()
    const reopened = mount('main')
    first.destroy()
    reopened.toggle('text')
    expect(mount('main').has('text')).toBe(true)
  })

  it('記憶體模式不讀取 storage，每個面板各自擁有釘選', () => {
    const getStorage = vi.spyOn(window, 'localStorage', 'get')
    const pins = mount(false)
    pins.toggle('cta')
    expect(pins.has('cta')).toBe(true)
    expect(pins.hasSessionChanges()).toBe(false)
    expect(mount(false).has('cta')).toBe(false)
    expect(mount(undefined, vi.fn(), null).has('cta')).toBe(false)
    expect(getStorage).not.toHaveBeenCalled()
  })

  it('被瀏覽器拒絕存取時，在同一視窗維持目前面板的釘選', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    const pins = mount('private')
    expect(pins.toggle('hero')).toBe(false)
    const other = mount('private')
    expect(other.has('hero')).toBe(true)
    expect(other.hasSessionChanges()).toBe(true)
    pins.toggle('hero')
    expect(pins.has('hero')).toBe(false)
    expect(other.hasSessionChanges()).toBe(false)
  })

  it('寫入失敗時仍能取消及重新釘選，釋放空間後可再次保存', () => {
    const { setItem } = instrumentStorage()
    const pins = mount()
    setItem.mockImplementationOnce(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(pins.toggle('button')).toBe(false)
    expect(pins.has('button')).toBe(true)
    expect(pins.toggle('button')).toBe(true)
    expect(pins.hasSessionChanges()).toBe(false)
    expect(pins.toggle('button')).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(2)
    pins.destroy()
    expect(mount().has('button')).toBe(true)
  })

  it('其他釘選成功不會掩蓋仍未保存的異動，各面板可同步看到分頁已解決的項目', () => {
    const durable = localStorage
    const { setItem } = instrumentStorage()
    const first = mount()
    const peer = mount()
    const differentScope = mount('other-workspace')
    first.toggle('saved')
    setItem.mockImplementationOnce(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    first.toggle('pending')
    const pendingKey = setItem.mock.calls.at(-1)![0]
    expect(first.hasSessionChanges()).toBe(true)
    expect(peer.hasSessionChanges()).toBe(true)
    expect(differentScope.hasSessionChanges()).toBe(false)
    expect(peer.toggle('saved')).toBe(true)
    expect(peer.has('pending')).toBe(true)
    expect(peer.hasSessionChanges()).toBe(true)
    expect(durable.getItem(pendingKey)).toBeNull()

    const onChange = vi.fn()
    const later = mount(undefined, onChange)
    expect(later.hasSessionChanges()).toBe(true)
    durable.setItem(pendingKey, '1')
    window.dispatchEvent(
      new StorageEvent('storage', { key: pendingKey, newValue: '1', storageArea: localStorage }),
    )
    expect(onChange).toHaveBeenCalledOnce()
    expect(later.has('pending')).toBe(true)
    expect(first.hasSessionChanges()).toBe(false)
    expect(peer.hasSessionChanges()).toBe(false)
    expect(setItem).toHaveBeenCalledTimes(2)
  })

  it('只讀取呈現過的 ID 並快取，遇到未知值會在下次操作時修正', () => {
    const pins = mount()
    pins.toggle('hero')
    pins.destroy()
    const key = localStorage.key(0)!
    localStorage.setItem(key, '{invalid-json')
    localStorage.setItem('unrelated', 'other-app')
    const { getItem } = instrumentStorage()
    const fresh = mount()
    expect(fresh.has('hero')).toBe(false)
    expect(fresh.has('hero')).toBe(false)
    expect(getItem).toHaveBeenCalledExactlyOnceWith(key)
    fresh.toggle('hero')
    expect(localStorage.getItem(key)).toBe('1')
    expect(localStorage.getItem('unrelated')).toBe('other-app')
  })

  it('回讀分頁通知當下的屬性，忽略較舊事件與 sessionStorage', () => {
    const onChange = vi.fn()
    const pins = mount('sync', onChange)
    pins.toggle('text')
    const key = localStorage.key(0)!
    function send(storageArea: Storage, changedKey: string | null, newValue: string | null) {
      const event = new StorageEvent('storage', { key: changedKey, newValue, storageArea })
      window.dispatchEvent(event)
    }
    localStorage.removeItem(key)
    send(sessionStorage, key, null)
    expect(pins.has('text')).toBe(true)
    send(localStorage, key, '1')
    expect(pins.has('text')).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(2)
    localStorage.setItem(key, '1')
    send(localStorage, key, '1')
    expect(pins.has('text')).toBe(true)
    localStorage.clear()
    send(localStorage, null, null)
    expect(pins.has('text')).toBe(false)
    const calls = onChange.mock.calls.length
    pins.destroy()
    send(localStorage, null, null)
    expect(onChange).toHaveBeenCalledTimes(calls)
  })
})
