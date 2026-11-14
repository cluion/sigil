import { describe, it, expect, vi } from 'vitest'
import { createEngine, createI18n } from '@cluion/sigil-core'
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

  it('runtime locale 切換更新操作並保留焦點，destroy 後停止更新', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'x', hidden: true, locked: true }],
        },
      },
    })
    const i18n = createI18n({
      zh: {},
      en: {
        'layers.title': 'Layers',
        'layers.show': 'Show',
        'layers.hide': 'Hide',
        'layers.lock': 'Lock',
        'layers.unlock': 'Unlock',
        'layers.rename_prompt': 'Layer name',
      },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const panel = createLayersPanel(engine, box, { i18n })
    let row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    let actions = row.querySelectorAll<HTMLButtonElement>('.sigil-layer-icon-btn')

    expect(box.getAttribute('aria-label')).toBe('圖層')
    expect(actions[0]?.getAttribute('aria-label')).toBe('顯示')
    actions[0]?.focus()

    i18n.setLocale('en')

    row = box.querySelector('.sigil-layer-row[data-layer-id="t"]') as HTMLElement
    actions = row.querySelectorAll<HTMLButtonElement>('.sigil-layer-icon-btn')

    expect(box.getAttribute('aria-label')).toBe('Layers')
    expect(actions[0]?.getAttribute('aria-label')).toBe('Show')
    expect(actions[1]?.getAttribute('aria-label')).toBe('Unlock')
    expect((document.activeElement as HTMLElement).dataset.layerAction).toBe('visibility')
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    expect(prompt).toHaveBeenCalledWith('Layer name', '')

    prompt.mockRestore()
    panel.destroy()
    i18n.setLocale('zh')
    expect(box.getAttribute('aria-label')).toBe('Layers')
    box.remove()
  })

  it('選取只更新受影響列，保留 DOM、焦點與單一 tab stop', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', name: 'A' },
            { id: 'b', type: 'text', name: 'B' },
          ],
        },
      },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const panel = createLayersPanel(engine, box)
    const a = box.querySelector<HTMLElement>('.sigil-layer-row[data-layer-id="a"]')!
    const b = box.querySelector<HTMLElement>('.sigil-layer-row[data-layer-id="b"]')!

    a.focus()
    engine.select('a')
    expect(box.querySelector('.sigil-layer-row[data-layer-id="a"]')).toBe(a)
    expect(box.querySelector('.sigil-layer-row[data-layer-id="b"]')).toBe(b)
    expect(document.activeElement).toBe(a)
    expect(a.getAttribute('aria-selected')).toBe('true')

    engine.select('b')
    expect(a.getAttribute('aria-selected')).toBe('false')
    expect(b.getAttribute('aria-selected')).toBe('true')
    expect(b.classList.contains('sigil-layer-row--active')).toBe(true)
    expect(document.activeElement).toBe(a)
    expect(
      [...box.querySelectorAll<HTMLElement>('.sigil-layer-row')].filter(
        (row) => row.tabIndex === 0,
      ),
    ).toEqual([a])

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    engine.select('b')
    expect(
      [...box.querySelectorAll<HTMLElement>('.sigil-layer-row')].filter(
        (row) => row.tabIndex === 0,
      ),
    ).toEqual([b])
    expect(box.querySelector('.sigil-layer-row[data-layer-id="a"]')).toBe(a)
    expect(box.querySelector('.sigil-layer-row[data-layer-id="b"]')).toBe(b)

    panel.destroy()
    box.remove()
    outside.remove()
  })

  it('單節點更新與 Undo／Redo 保留列，操作讀取最新節點狀態', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', name: '舊名稱', content: 'old' }],
        },
      },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const panel = createLayersPanel(engine, box)
    const row = box.querySelector<HTMLElement>('.sigil-layer-row[data-layer-id="t"]')!
    const visibility = row.querySelector<HTMLButtonElement>('[data-layer-action="visibility"]')!
    const lock = row.querySelector<HTMLButtonElement>('[data-layer-action="lock"]')!

    visibility.focus()
    engine.update('t', { name: '新名稱', hidden: true, locked: true })
    expect(box.querySelector('.sigil-layer-row[data-layer-id="t"]')).toBe(row)
    expect(document.activeElement).toBe(visibility)
    expect(row.getAttribute('aria-label')).toBe('新名稱')
    expect(row.classList.contains('sigil-layer-row--hidden')).toBe(true)
    expect(row.classList.contains('sigil-layer-row--locked')).toBe(true)
    expect(visibility.getAttribute('aria-pressed')).toBe('true')
    expect(lock.getAttribute('aria-pressed')).toBe('true')

    visibility.click()
    expect(engine.getTree().children?.[0]?.hidden).toBeUndefined()
    expect(visibility.getAttribute('aria-pressed')).toBe('false')
    engine.undo()
    expect(box.querySelector('.sigil-layer-row[data-layer-id="t"]')).toBe(row)
    expect(engine.getTree().children?.[0]?.hidden).toBe(true)
    expect(visibility.getAttribute('aria-pressed')).toBe('true')
    engine.redo()
    expect(box.querySelector('.sigil-layer-row[data-layer-id="t"]')).toBe(row)
    expect(visibility.getAttribute('aria-pressed')).toBe('false')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('最後名稱')
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(prompt).toHaveBeenCalledWith('圖層名稱', '新名稱')
    expect(row.querySelector('.sigil-layer-label')?.textContent).toBe('最後名稱')
    prompt.mockRestore()

    panel.destroy()
    box.remove()
  })

  it('結構變動與多節點 Undo 仍重建並顯示正確樹', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 'a', type: 'text', name: 'A' }],
        },
      },
    })
    const box = document.createElement('div')
    const panel = createLayersPanel(engine, box)
    const oldA = box.querySelector('.sigil-layer-row[data-layer-id="a"]')

    engine.insert('r', { id: 'b', type: 'text', name: 'B' }, 0)
    expect(
      [...box.querySelectorAll<HTMLElement>('.sigil-layer-row')].map((row) => row.dataset.layerId),
    ).toEqual(['r', 'b', 'a'])
    expect(box.querySelector('.sigil-layer-row[data-layer-id="a"]')).not.toBe(oldA)
    engine.batch(() => {
      engine.update('a', { name: 'A2' })
      engine.update('b', { name: 'B2' })
    })
    engine.undo()
    expect(
      [...box.querySelectorAll('.sigil-layer-label')].map((label) => label.textContent),
    ).toEqual(['section', 'B', 'A'])
    engine.redo()
    expect(
      [...box.querySelectorAll('.sigil-layer-label')].map((label) => label.textContent),
    ).toEqual(['section', 'B2', 'A2'])

    panel.destroy()
  })
})
