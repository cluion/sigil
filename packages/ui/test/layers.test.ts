import { describe, it, expect, vi } from 'vitest'
import { createEngine, createI18n } from '@cluion/sigil-core'
import { createLayersPanel } from '../src/layers.js'

describe('createLayersPanel', () => {
  it('切換標題大綱時保留圖層查詢與展開狀態，返回時揭露新選取', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'hero',
              type: 'section',
              children: [{ id: 'title', type: 'text', tagName: 'h1', content: '首場活動' }],
            },
            { id: 'intro', type: 'text', content: '報名方式' },
          ],
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const onActivate = vi.fn()
    const i18n = createI18n({ zh: {}, en: { 'layers.all': 'All layers' } })
    const handle = createLayersPanel(engine, box, {
      searchable: true,
      headingOutline: true,
      onActivate,
      i18n,
    })
    const tree = box.querySelector<HTMLElement>('[role="tree"]')!
    const group = tree.querySelector<HTMLElement>('[role="treeitem"][data-layer-id="hero"]')!
    const all = box.querySelector<HTMLButtonElement>('[data-layer-view="tree"]')!
    const outline = box.querySelector<HTMLButtonElement>('[data-layer-view="outline"]')!
    const search = box.querySelector<HTMLInputElement>('.sigil-layer-search-input')!
    Object.defineProperty(box, 'clientHeight', { value: 140 })
    Object.defineProperties(tree, { clientHeight: { value: 100 }, scrollHeight: { value: 900 } })
    const treeBounds = vi
      .spyOn(tree, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 180, 100))
    try {
      group.querySelector<HTMLButtonElement>('[data-layer-action="toggle"]')!.click()
      search.value = '報名'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      const result = box.querySelector('[data-layer-result="intro"]')!
      expect(box.querySelector('[data-heading-id]')).toBeNull()
      outline.click()
      expect(all.getAttribute('aria-pressed')).toBe('false')
      expect(outline.getAttribute('aria-pressed')).toBe('true')
      expect(result.closest('[hidden]')).not.toBeNull()
      all.click()
      expect(search.value).toBe('報名')
      expect(box.querySelector('[data-layer-result="intro"]')?.closest('[hidden]')).toBeNull()
      expect(group.getAttribute('aria-expanded')).toBe('false')
      outline.click()
      handle.focus('search')
      expect(document.activeElement?.getAttribute('aria-label')).toBe('搜尋標題')
      box.querySelector<HTMLButtonElement>('[data-heading-id="title"]')!.click()
      expect(onActivate.mock.calls).toEqual([['title']])
      expect(engine.getSelection()).toBe('title')
      expect(engine.canUndo()).toBe(false)
      i18n.setLocale('en')
      expect(all.textContent).toBe('All layers')
      all.click()
      expect(treeBounds).not.toHaveBeenCalled()
      search.value = ''
      search.dispatchEvent(new Event('input', { bubbles: true }))
      expect(tree.hidden).toBe(false)
      expect(treeBounds).toHaveBeenCalled()
      expect(tree.querySelector('[data-layer-id="hero"][aria-expanded="true"]')).not.toBeNull()
      expect(tree.querySelector('[data-layer-id="title"][aria-selected="true"]')).not.toBeNull()
      expect(box.querySelector('[data-heading-id]')?.closest('[hidden]')).not.toBeNull()
    } finally {
      handle.destroy()
      box.remove()
      engine.destroy()
    }
  })

  it('單獨啟用大綱可重新揭露收合的同一個標題，將最新圖層列捲入內層清單', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            {
              id: 'group',
              type: 'section',
              children: [{ id: 'title', type: 'text', tagName: 'h2', content: '報名' }],
            },
          ],
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const handle = createLayersPanel(engine, box, { headingOutline: true })
    const tree = box.querySelector<HTMLElement>('[role="tree"]')!
    const row = () => tree.querySelector<HTMLElement>('[role="treeitem"][data-layer-id="title"]')
    Object.defineProperty(box, 'clientHeight', { value: 140 })
    Object.defineProperties(tree, { clientHeight: { value: 100 }, scrollHeight: { value: 900 } })
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this === tree ? new DOMRect(0, 0, 180, 100) : new DOMRect(0, 410, 180, 30)
      })
    try {
      engine.select('title')
      tree
        .querySelector<HTMLButtonElement>(
          '[role="treeitem"][data-layer-id="group"] [data-layer-action="toggle"]',
        )!
        .click()
      expect(row()).toBeNull()
      tree.scrollTop = 0
      box.querySelector<HTMLButtonElement>('[data-layer-view="outline"]')!.click()
      box.querySelector<HTMLButtonElement>('[data-heading-id="title"]')!.click()
      engine.insert('page', { id: 'other', type: 'text', content: '更多內容' })
      expect(row()).toBeNull()
      box.querySelector<HTMLButtonElement>('[data-layer-view="tree"]')!.click()
      expect(row()?.getAttribute('aria-selected')).toBe('true')
      expect(tree.scrollTop).toBe(340)
      expect(box.scrollTop).toBe(0)
    } finally {
      bounds.mockRestore()
      handle.destroy()
      engine.destroy()
      box.remove()
    }
  })

  it('可依目前面板保留搜尋結果與焦點，切回一般模式會揭露所選圖層', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [{ id: 'heading', type: 'text', name: '活動標題' }],
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    let preserve = true
    const handle = createLayersPanel(engine, box, {
      searchable: true,
      preserveSearchOnActivate: () => preserve,
    })
    try {
      const input = box.querySelector('input')!
      input.value = '活動'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(document.activeElement).toBe(box.querySelector('[data-layer-result="heading"]'))
      expect(engine.getSelection()).toBe('heading')
      expect(input.value).toBe('活動')
      expect(box.querySelector<HTMLElement>('[role="tree"]')!.hidden).toBe(true)
      preserve = false
      box.querySelector<HTMLButtonElement>('[data-layer-result="heading"]')!.click()
      expect(input.value).toBe('')
      expect(document.activeElement).toBe(
        box.querySelector('[role="treeitem"][aria-label="活動標題"]'),
      )
      expect(engine.canUndo()).toBe(false)
    } finally {
      handle.destroy()
      box.remove()
      engine.destroy()
    }
  })

  it('在收合的圖層中搜尋及取消，選擇結果時才展開該分支並交還鍵盤焦點', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: ['a', 'b'].map((id) => ({
            id,
            type: 'section',
            children: [{ id: id + '-leaf', type: 'text', name: '小標題', content: '報名資訊' }],
          })),
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const onActivate = vi.fn()
    const handle = createLayersPanel(engine, box, { searchable: true, onActivate })
    const row = (id: string) =>
      box.querySelector<HTMLElement>(`[role="treeitem"][data-layer-id="${id}"]`)
    const tree = box.querySelector<HTMLElement>('[role="tree"]')!
    const input = box.querySelector<HTMLInputElement>('input[type="search"]')!
    const search = (text: string) => {
      input.focus()
      input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    try {
      engine.select('root')
      for (const id of ['a', 'b'])
        row(id)!.querySelector<HTMLButtonElement>('[data-layer-action="toggle"]')!.click()
      const originalRow = row('a')
      search('報名資訊')
      expect(tree.hidden).toBe(true)
      expect(box.querySelectorAll('[data-layer-result]')).toHaveLength(2)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(tree.hidden).toBe(false)
      expect(row('a')).toBe(originalRow)
      expect(row('a-leaf')).toBeNull()
      expect(row('b-leaf')).toBeNull()
      expect(engine.getSelection()).toBe('root')
      search('報名資訊')
      box.querySelector<HTMLButtonElement>('[data-layer-result="b-leaf"]')!.click()
      expect(tree.hidden).toBe(false)
      expect(engine.getSelection()).toBe('b-leaf')
      expect(row('a-leaf')).toBeNull()
      expect(document.activeElement).toBe(row('b-leaf'))
      expect(row('b-leaf')?.getAttribute('aria-selected')).toBe('true')
      expect(onActivate.mock.calls).toEqual([['b-leaf']])
      expect(engine.canUndo()).toBe(false)
    } finally {
      handle.destroy()
      box.remove()
      engine.destroy()
    }
  })

  it('折疊子樹保留選取與其他分支的 DOM，外部選取可揭露並捲到指定列', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [
            {
              id: 'group',
              type: 'section',
              children: [
                {
                  id: 'inner',
                  type: 'section',
                  children: [{ id: 'leaf', type: 'text', name: '初稿', hidden: true }],
                },
              ],
            },
            { id: 'sibling', type: 'text' },
          ],
        },
      },
    })
    const panel = document.createElement('div')
    const outside = document.createElement('button')
    document.body.append(panel, outside)
    const handle = createLayersPanel(engine, panel)
    const row = (id: string) =>
      panel.querySelector<HTMLElement>(`[role="treeitem"][data-layer-id="${id}"]`)
    const key = (id: string, value: string) =>
      row(id)!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
    try {
      const sibling = row('sibling')
      expect(row('group')?.getAttribute('aria-expanded')).toBe('true')
      expect(row('leaf')?.hasAttribute('aria-expanded')).toBe(false)
      engine.select('leaf')
      row('inner')!.querySelector<HTMLButtonElement>('[data-layer-action="toggle"]')!.click()
      expect(engine.getSelection()).toBe('leaf')
      expect(row('leaf')).toBeNull()
      row('group')!.focus()
      key('group', 'ArrowLeft')
      expect(row('group')?.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(row('group'))
      key('group', 'ArrowDown')
      expect(document.activeElement).toBe(sibling)
      key('sibling', 'ArrowUp')
      key('group', 'ArrowRight')
      expect(document.activeElement).toBe(row('group'))
      expect(row('inner')?.getAttribute('aria-expanded')).toBe('false')
      key('group', 'ArrowRight')
      expect(document.activeElement).toBe(row('inner'))
      key('inner', 'ArrowLeft')
      expect(document.activeElement).toBe(row('group'))
      key('group', 'ArrowLeft')
      engine.update('leaf', { name: '已更名' })
      engine.undo()
      engine.redo()
      expect(row('leaf')).toBeNull()
      expect(row('sibling')).toBe(sibling)
      outside.focus()
      engine.select('leaf')
      expect(row('group')?.getAttribute('aria-expanded')).toBe('true')
      expect(row('inner')?.getAttribute('aria-expanded')).toBe('true')
      expect(row('leaf')?.getAttribute('aria-label')).toBe('已更名')
      expect(row('leaf')?.classList.contains('sigil-layer-row--hidden')).toBe(true)
      expect(row('leaf')?.getAttribute('aria-selected')).toBe('true')
      expect(row('leaf')?.tabIndex).toBe(0)
      expect(document.activeElement).toBe(outside)
      Object.defineProperties(panel, { clientHeight: { value: 100 }, scrollHeight: { value: 900 } })
      vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 180, 100))
      vi.spyOn(row('leaf')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 410, 180, 30))
      engine.select('leaf')
      expect(panel.scrollTop).toBe(340)
    } finally {
      handle.destroy()
      engine.destroy()
      panel.remove()
      outside.remove()
    }
  })

  it('大型文件只建立根與第一層，選取時只掛載目標所屬分支', () => {
    const sections = Array.from({ length: 10 }, (_, i) => ({
      id: `section-${i}`,
      type: 'section',
      children: Array.from({ length: 10 }, (_, j) => ({ id: `text-${i}-${j}`, type: 'text' })),
    }))
    const engine = createEngine({
      doc: { version: 1, root: { id: 'root', type: 'section', children: sections } },
    })
    const panel = document.createElement('div')
    const handle = createLayersPanel(engine, panel)
    try {
      expect(panel.querySelectorAll('[role="treeitem"]')).toHaveLength(11)
      expect(panel.querySelectorAll('[aria-expanded="false"]')).toHaveLength(10)
      engine.select('text-8-4')
      expect(panel.querySelectorAll('[role="treeitem"]')).toHaveLength(21)
      expect(panel.querySelector('[aria-selected="true"]')?.getAttribute('data-layer-id')).toBe(
        'text-8-4',
      )
      expect(panel.querySelectorAll('[aria-expanded="false"]')).toHaveLength(9)
    } finally {
      handle.destroy()
      engine.destroy()
    }
  })

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

  it('只有明確點選圖層和鍵盤確認才會通知宿主定位已選取的元件', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'page', type: 'section', children: [{ id: 'title', type: 'text' }] },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const onActivate = vi.fn((id: string) => expect(engine.getSelection()).toBe(id))
    const panel = createLayersPanel(engine, box, { onActivate, onContextMenu: vi.fn() })
    const row = (id: string) =>
      box.querySelector<HTMLElement>(`[role="treeitem"][data-layer-id="${id}"]`)!
    const key = (id: string, value: string) =>
      row(id).dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
    const action = (id: string, value: string) =>
      row(id).querySelector<HTMLButtonElement>(`[data-layer-action="${value}"]`)!.click()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('新標題')
    try {
      engine.select('title')
      key('page', 'ArrowDown')
      key('title', 'Home')
      action('page', 'toggle')
      key('page', 'ArrowRight')
      action('title', 'lock')
      action('title', 'visibility')
      key('title', 'F2')
      key('title', 'ContextMenu')
      row('title').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      expect(onActivate).not.toHaveBeenCalled()

      row('title').querySelector<HTMLElement>('.sigil-layer-label')!.click()
      row('title').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
      key('page', 'Enter')
      key('title', ' ')
      expect(onActivate.mock.calls).toEqual([['title'], ['page'], ['title']])
    } finally {
      prompt.mockRestore()
      panel.destroy()
      box.remove()
    }
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

  it('右鍵同步選取與焦點並回報節點與座標', () => {
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
    document.body.append(box)
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
    expect(document.activeElement).toBe(row)
    panel.destroy()
    box.remove()
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
