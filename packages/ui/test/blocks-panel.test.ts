import { describe, it, expect } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createBlocksPanel } from '../src/blocks-panel.js'

describe('createBlocksPanel', () => {
  it('BlockDef 陣列顯示分類與圖示', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    createBlocksPanel(engine, box, iframe, [
      {
        id: 't',
        label: '文字',
        category: '內容',
        icon: 'T',
        create: () => ({ id: 'x', type: 'text', content: 'a' }),
      },
      {
        id: 's',
        label: '容器',
        category: '版面',
        icon: '▦',
        create: () => ({ id: 'y', type: 'section', children: [] }),
      },
    ])
    const cats = [...box.querySelectorAll('.sigil-blocks-category')].map((el) => el.textContent)
    expect(cats).toContain('內容')
    expect(cats).toContain('版面')
    expect(box.querySelector('.sigil-block-icon')?.textContent).toBeTruthy()
  })

  it('搜尋過濾 keywords', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    createBlocksPanel(engine, box, iframe, [
      {
        id: 'hero',
        label: '主視覺',
        category: '媒體',
        keywords: ['banner'],
        create: () => ({ id: 'h', type: 'image', attributes: { src: '' } }),
      },
      {
        id: 'txt',
        label: '文字',
        category: '內容',
        create: () => ({ id: 't', type: 'text', content: '' }),
      },
    ])
    const search = box.querySelector('input') as HTMLInputElement
    search.value = 'banner'
    search.dispatchEvent(new Event('input'))
    const labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toEqual(['主視覺'])
  })

  it('reload 後新項目出現', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    const panel = createBlocksPanel(engine, box, iframe, [
      { id: 'a', label: 'A', create: () => ({ id: 'a', type: 'text', content: '' }) },
    ])
    let labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toEqual(['A'])

    // 另存後注入新範本
    panel.reload([
      { id: 'a', label: 'A', create: () => ({ id: 'a', type: 'text', content: '' }) },
      { id: 'b', label: 'B', category: '範本', create: () => ({ id: 'b', type: 'text', content: '' }) },
    ])
    labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toContain('B')
  })
})
