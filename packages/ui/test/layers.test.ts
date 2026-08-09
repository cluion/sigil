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

  it('可自訂圖層樹的無障礙名稱', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section' } },
    })
    const box = document.createElement('div')
    const panel = createLayersPanel(engine, box, { ariaLabel: 'Layers' })

    expect(box.getAttribute('aria-label')).toBe('Layers')

    panel.destroy()
  })

  it('提供 tree 語意、roving focus 與鍵盤選取', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'a',
              type: 'section',
              name: 'A',
              children: [{ id: 'a1', type: 'text', content: 'nested', name: 'A1' }],
            },
            { id: 'b', type: 'text', content: 'sibling', name: 'B' },
          ],
        },
      },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const panel = createLayersPanel(engine, box)
    const rows = () => [...box.querySelectorAll<HTMLElement>('.sigil-layer-row')]
    const row = (id: string) =>
      rows().find((candidate) => candidate.dataset.layerId === id) as HTMLElement

    expect(box.getAttribute('role')).toBe('tree')
    expect(box.getAttribute('aria-label')).toBe('圖層')
    expect(row('r').getAttribute('role')).toBe('treeitem')
    expect(row('a1').getAttribute('aria-level')).toBe('3')
    expect(rows().filter((candidate) => candidate.tabIndex === 0)).toEqual([row('r')])

    row('r').focus()
    row('r').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(document.activeElement).toBe(row('a'))

    row('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(row('a1'))

    row('a1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(document.activeElement).toBe(row('a'))

    row('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(row('b'))

    row('b').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(engine.getSelection()).toBe('b')
    expect(row('b').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(row('b'))
    expect(rows().filter((candidate) => candidate.tabIndex === 0)).toEqual([row('b')])

    row('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(row('r'))

    panel.destroy()
    box.remove()
  })

  it('F2 重命名，選單鍵同步選取並回報列座標', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'x', name: '舊名稱' }],
        },
      },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const onContextMenu = vi.fn()
    const panel = createLayersPanel(engine, box, { onContextMenu })
    const getRow = () => box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('新名稱')

    getRow().focus()
    getRow().dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    expect(engine.getTree().children?.[0]?.name).toBe('新名稱')
    expect(document.activeElement).toBe(getRow())

    getRow().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }))
    expect(engine.getSelection()).toBe('t')
    expect(onContextMenu).toHaveBeenCalledWith('t', 0, 0)
    expect(document.activeElement).toBe(getRow())

    prompt.mockRestore()
    panel.destroy()
    box.remove()
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

  it('右鍵同步選取並回報節點與座標', () => {
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
    const onContextMenu = vi.fn()
    const panel = createLayersPanel(engine, box, { onContextMenu })
    const row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 18,
      clientY: 24,
    })

    row.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(engine.getSelection()).toBe('t')
    expect(onContextMenu).toHaveBeenCalledOnce()
    expect(onContextMenu).toHaveBeenCalledWith('t', 18, 24)
    panel.destroy()
  })
})
