import { describe, it, expect } from 'vitest'
import { MemoryAssetStore } from '../src/index.js'

describe('MemoryAssetStore', () => {
  it('list 回傳初始項目', () => {
    const s = new MemoryAssetStore([{ id: '1', url: 'https://example.com/a.png', name: 'a' }])
    expect(s.list()).toHaveLength(1)
    expect(s.list()[0]!.url).toContain('example.com')
  })

  it('upload 加入列表', () => {
    const s = new MemoryAssetStore()
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    const item = s.upload(file)
    expect(item.name).toBe('x.png')
    expect(s.list()).toHaveLength(1)
    expect(item.url.startsWith('blob:') || item.url.length > 0).toBe(true)
  })
})
