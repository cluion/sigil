import { describe, it, expect, vi } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createLayersPanel } from '../src/layers.js'

describe('createLayersPanel', () => {
  it('顯示節點並可選取', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'hi', name: '我的文字' }],
        },
      },
    })
    const box = document.createElement('div')
    const panel = createLayersPanel(engine, box)
    expect(box.textContent).toContain('我的文字')
    const row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    row.click()
    expect(engine.getSelection()).toBe('t')
    panel.destroy()
  })

  it('鎖定／隱藏按鈕切換旗標', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'x' }],
        },
      },
    })
    const box = document.createElement('div')
    const panel = createLayersPanel(engine, box)
    const row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    const btns = row.querySelectorAll('.sigil-layer-icon-btn')
    expect(btns.length).toBeGreaterThanOrEqual(2)
    // 隱藏
    ;(btns[0] as HTMLButtonElement).click()
    expect(engine.getTree().children?.[0]?.hidden).toBe(true)
    // 鎖定
    ;(btns[1] as HTMLButtonElement).click()
    expect(engine.getTree().children?.[0]?.locked).toBe(true)
    panel.destroy()
  })

  it('雙擊重命名', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'x' }],
        },
      },
    })
    const box = document.createElement('div')
    const panel = createLayersPanel(engine, box)
    vi.spyOn(window, 'prompt').mockReturnValue('新名稱')
    const row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(engine.getTree().children?.[0]?.name).toBe('新名稱')
    panel.destroy()
  })
})
