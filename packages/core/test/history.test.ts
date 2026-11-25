import { describe, expect, it, vi } from 'vitest'
import {
  createEngine,
  createProjectPersistence,
  createRenderer,
  type Engine,
  type EngineEvent,
  type HistoryEngine,
  type HistoryKind,
} from '../src/index.js'

function setup(): HistoryEngine {
  return createEngine({
    doc: {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        children: [
          { id: 'head', type: 'text', name: '主標題', content: '春季', attributes: { lang: 'zh' } },
          { id: 'cta', type: 'button', attributes: { 'ARIA-LABEL': '報名活動' }, content: '報名' },
        ],
      },
    },
  })
}

describe('可跳轉的編輯歷程', () => {
  it('整頁文字一次更新，保留鎖定子樹、選取與前後歷程', () => {
    const engine = setup()
    engine.insert('root', {
      id: 'group',
      type: 'section',
      locked: true,
      children: [{ id: 'hidden-from-edit', type: 'text', content: '春季' }],
    })
    engine.select('cta')
    const previous = engine.getTree()
    const events: EngineEvent[] = []
    engine.subscribe((event) => events.push(event))
    engine.updateTextContents(
      new Map([
        ['head', '冬季'],
        ['cta', '立刻報名'],
        ['hidden-from-edit', '禁止'],
        ['absent', '略過'],
      ]),
    )
    const next = engine.getTree()
    expect(events.map((event) => event.type)).toEqual(['history', 'tree'])
    expect(events[1]).toEqual({
      type: 'tree',
      tree: next,
      textChanges: {
        from: previous,
        patches: [
          { type: 'update', id: 'head', content: '冬季' },
          { type: 'update', id: 'cta', content: '立刻報名' },
        ],
      },
    })
    expect(next.children?.[2]).toBe(previous.children?.[2])
    expect(next.children?.[1]?.attributes).toBe(previous.children?.[1]?.attributes)
    expect(engine.getHistory().entries.at(-1)?.kind).toBe('replace-text')
    engine.undo()
    expect(engine.getTree()).toBe(previous)
    events.length = 0
    engine.updateTextContents(new Map([['head', '春季']]))
    expect(events).toHaveLength(0)
    engine.redo()
    expect(engine.getTree()).toBe(next)
    expect(engine.getSelection()).toBe('cta')
  })

  it('批次文字通知期間同步 Undo 時，只送出最後有效的樹', () => {
    const engine = setup()
    const original = engine.getTree()
    engine.subscribe((event) => {
      if (event.type === 'history' && engine.getHistory().currentId === 1) engine.undo()
    })
    const trees: Extract<EngineEvent, { type: 'tree' }>[] = []
    engine.subscribe((event) => {
      if (event.type === 'tree') trees.push(event)
    })
    engine.updateTextContents(
      new Map([
        ['head', '冬季'],
        ['cta', '出發'],
      ]),
    )
    expect(trees).toEqual([{ type: 'tree', tree: original }])
  })

  it('移除子樹時暫停其選取，復原或同批還原後能接續編輯', () => {
    const engine = setup()
    const tree = engine.getTree()
    const children = tree.children!
    engine.select('head')
    engine.update('root', { children: [] })
    expect(engine.getSelection()).toBeNull()
    engine.undo()
    expect(engine.getSelection()).toBe('head')
    engine.batch(() => {
      engine.remove('head')
      engine.insert('root', children[0]!, 0)
    })
    expect(engine.getTree()).toBe(tree)
    expect(engine.getSelection()).toBe('head')
    engine.remove('head')
    engine.select(null)
    engine.undo()
    expect(engine.getSelection()).toBeNull()
  })

  it('Undo 時失去的選取可跨多步返回，明確清除／改選後則維持使用者選擇', () => {
    const e = setup()
    e.update('head', { name: 'Before' })
    e.insert('root', { id: 'copy', type: 'section' })
    const withCopy = e.getHistory().currentId
    e.select('copy')
    const selection = vi.fn()
    e.subscribe((ev) => {
      if (ev.type === 'selection') selection(ev.id)
    })
    e.undo()
    expect(e.getSelection()).toBeNull()
    e.undo()
    expect(e.getSelection()).toBeNull()
    e.goToHistory(withCopy)
    expect(e.getSelection()).toBe('copy')
    expect(selection.mock.calls).toEqual([[null], ['copy']])
    e.undo()
    e.select(null)
    e.redo()
    expect(e.getSelection()).toBeNull()
    e.select('copy')
    e.undo()
    e.select('cta')
    e.redo()
    expect(e.getSelection()).toBe('cta')
  })

  it('編輯出新分支後，即使再跳回仍保留該元件的舊狀態也不復活先前選取', () => {
    const e = setup()
    e.insert('root', { id: 'copy', type: 'text' })
    const withCopy = e.getHistory().currentId
    e.remove('copy')
    const withoutCopy = e.getHistory().currentId
    e.update('head', { content: '另一個未來' })
    e.goToHistory(withCopy)
    e.select('copy')
    e.goToHistory(withoutCopy)
    expect(e.getSelection()).toBeNull()
    e.batch(() => e.update('cta', { name: '新分支' }))
    e.goToHistory(withCopy)
    expect(e.getTree().children?.some((node) => node.id === 'copy')).toBe(true)
    expect(e.getSelection()).toBeNull()
  })
  it('history 訂閱者同步跳到另一筆時，畫布仍與最後選擇的文件相同', () => {
    const engine = setup()
    const renderer = createRenderer()
    const canvas = document.createElement('div')
    renderer.mount(engine.getTree(), canvas)
    engine.subscribe((e) => {
      if (e.type === 'history' && engine.getHistory().currentId === 1) engine.goToHistory(0)
    })
    engine.subscribe((e) => {
      if (e.type === 'tree') renderer.reconcile(e.tree)
      if (e.type === 'patch') renderer.applyPatch(e.patch)
    })
    engine.update('head', { content: '暫時修改' })
    expect(engine.getHistory().currentId).toBe(0)
    expect(canvas.querySelector('[data-sigil-id=head]')?.textContent).toBe(
      engine.getTree().children?.[0]?.content,
    )
    renderer.destroy()
  })
  it('存檔時的 checkpoint 結束連續輸入，立刻輸入下一字仍可準確回到已存文字', () => {
    const engine = setup()
    engine.update('head', { content: '已儲存' })
    const tree = engine.getTree()
    const changes = vi.fn()
    engine.subscribe(changes)
    const saved = engine.checkpointHistory()!
    expect(changes).not.toHaveBeenCalled()
    expect(engine.getHistory().entries.map((e) => e.id)).toEqual([0, saved])
    engine.update('head', { content: '已儲存後繼續輸入' })
    expect(engine.getHistory().currentId).not.toBe(saved)
    expect(engine.goToHistory(saved)).toBe(true)
    expect(engine.getTree()).toBe(tree)
    expect(engine.getTree().children?.[0]?.content).toBe('已儲存')
    engine.batch(() => {
      engine.update('head', { content: '批次中' })
      expect(engine.checkpointHistory()).toBeUndefined()
    })
    engine.destroy()
    expect(engine.checkpointHistory()).toBe(engine.getHistory().currentId)
  })
  it('具名標題的純文字摘要隨連打更新，保留不可變記錄、分支 ID 與明確批次界線', () => {
    const engine = setup()
    const initial = engine.getTree()
    engine.update('head', { content: '春季市集' })
    const original = engine.getHistory()
    expect(original).toEqual({
      currentId: 1,
      entries: [
        { id: 0, kind: 'initial', target: '' },
        { id: 1, kind: 'text', target: '主標題', detail: '春季市集' },
      ],
    })
    engine.update('head', { content: '春季\n  市集開幕' })
    expect(engine.getHistory().entries.at(-1)).toEqual({
      id: 1,
      kind: 'text',
      target: '主標題',
      detail: '春季 市集開幕',
    })
    expect(original.entries[1]?.detail).toBe('春季市集')
    engine.batch(() => engine.update('head', { content: '獨立的一步' }))
    const abandoned = engine.getHistory().currentId
    expect(abandoned).toBe(2)
    expect(engine.goToHistory(1)).toBe(true)
    engine.update('head', { content: '新分支' })
    const next = engine.getHistory()
    expect(next.currentId).toBe(3)
    expect(next.entries.map((e) => e.id)).toEqual([0, 1, 3])
    expect(next.entries[1]?.detail).toBe('春季 市集開幕')
    expect(next.entries[2]?.detail).toBe('新分支')
    expect(engine.goToHistory(abandoned)).toBe(false)
    expect(engine.canRedo()).toBe(false)
    expect(engine.goToHistory(0)).toBe(true)
    expect(engine.getTree()).toBe(initial)
    engine.redo()
    expect(engine.getHistory().currentId).toBe(1)
    engine.redo()
    expect(engine.getTree().children?.[0]?.content).toBe('新分支')
  })

  it('跳越多步只重建一次畫布，保存檢查點依原樹身分恢復；選取存在則保留', async () => {
    const engine = setup()
    const persistence = createProjectPersistence({
      engine,
      store: { load: async () => null, save: async () => {} },
    })
    const renderer = createRenderer()
    const canvas = document.createElement('div')
    renderer.mount(engine.getTree(), canvas)
    const events: EngineEvent[] = []
    engine.subscribe((e) => {
      events.push(e)
      if (e.type === 'patch') renderer.applyPatch(e.patch)
      if (e.type === 'tree') renderer.reconcile(e.tree)
    })
    engine.update('head', { style: { color: 'red' } })
    const saved = engine.getHistory().currentId
    await persistence.save()
    engine.update('cta', { locked: true })
    engine.insert('root', { id: 'photo', type: 'image', attributes: { alt: '現場照片' } })
    const last = engine.getHistory().currentId
    engine.select('photo')
    events.length = 0
    expect(engine.goToHistory(saved)).toBe(true)
    expect(events.map((e) => e.type)).toEqual(['tree', 'selection', 'history'])
    expect(engine.getSelection()).toBe(null)
    expect(canvas.querySelector('img')).toBeNull()
    expect(persistence.isDirty()).toBe(false)
    engine.select('head')
    events.length = 0
    expect(engine.goToHistory(last)).toBe(true)
    expect(events.map((e) => e.type)).toEqual(['tree', 'history'])
    expect(engine.getSelection()).toBe('head')
    expect(canvas.querySelector('img')?.alt).toBe('現場照片')
    expect(persistence.isDirty()).toBe(true)
    events.length = 0
    for (const invalid of [NaN, Infinity, 0.5, -1, 4000, last])
      expect(engine.goToHistory(invalid)).toBe(false)
    expect(events).toEqual([])
    renderer.destroy()
    persistence.destroy()
  })

  it('忽略相同值、缺失目標及淨結果相同的批次，維持 redo 分支和原文件參照', () => {
    const engine = setup()
    const initial = engine.getTree()
    engine.update('head', { name: '有效變更' })
    const changedId = engine.getHistory().currentId
    engine.undo()
    const notify = vi.fn()
    engine.subscribe((e) => {
      if (e.type === 'history') notify()
    })
    engine.update('head', { name: ' 主標題 ' })
    engine.update('head', { content: '春季' })
    engine.update('head', { attributes: { lang: 'zh' }, removeAttributes: ['not-present'] })
    engine.update('head', { style: { color: '' }, responsiveStyles: { mobile: { padding: '' } } })
    engine.update('root', { children: structuredClone(initial.children) })
    engine.insert('absent', { id: 'missing', type: 'text' })
    engine.remove('absent')
    engine.remove('root')
    engine.batch(() => {
      engine.insert('cta', { id: 'temp', type: 'text' })
      engine.remove('temp')
    })
    expect(engine.getTree()).toBe(initial)
    expect(notify).not.toHaveBeenCalled()
    expect(engine.canRedo()).toBe(true)
    expect(engine.getHistory().entries.map((e) => e.id)).toEqual([0, changedId])
    engine.update('head', { content: '草稿' })
    engine.update('head', { content: '春季' })
    expect(engine.getTree()).toBe(initial)
    expect(engine.getHistory()).toEqual({
      currentId: 0,
      entries: [{ id: 0, kind: 'initial', target: '' }],
    })
    expect(engine.canUndo()).toBe(false)
  })

  it('同一或多目標的巢狀批次分別顯示對應標籤，一次復原；發生例外時保留已套用變更', () => {
    const engine = setup()
    const history = vi.fn()
    engine.subscribe((e) => {
      if (e.type === 'history') history()
    })
    engine.batch(() => {
      engine.update('head', { style: { color: 'red' } })
      engine.batch(() => engine.update('head', { responsiveStyles: { mobile: { color: 'gold' } } }))
      expect(engine.goToHistory(0)).toBe(false)
    })
    expect(history).toHaveBeenCalledTimes(1)
    expect(engine.getHistory().entries.at(-1)).toEqual({ id: 1, kind: 'style', target: '主標題' })
    expect(() =>
      engine.batch(() => {
        engine.update('head', { name: '開幕標題' })
        engine.remove('cta')
        throw Error('interrupted')
      }),
    ).toThrow('interrupted')
    expect(engine.getHistory().entries.at(-1)).toEqual({ id: 2, kind: 'group', target: '' })
    expect(history).toHaveBeenCalledTimes(2)
    expect(engine.getTree().children?.length).toBe(1)
    engine.undo()
    expect(engine.getTree().children?.length).toBe(2)
    expect(engine.getTree().children?.[0]?.name).toBe('主標題')
  })

  it('建立、搬移、改名、顯示與鎖定的步驟以作者名稱、標籤或圖片 alt 描述', () => {
    const engine = setup()
    engine.insert('root', {
      id: 'private-photo-id',
      type: 'image',
      attributes: { ALT: '展場入口' },
    })
    engine.move('private-photo-id', 'root', 0)
    engine.update('private-photo-id', { name: '攤位' })
    engine.update('private-photo-id', { hidden: true })
    engine.update('private-photo-id', { hidden: false })
    engine.update('private-photo-id', { locked: true })
    engine.update('private-photo-id', { locked: false })
    engine.update('private-photo-id', { attributes: { src: '/photo.png' } })
    engine.remove('private-photo-id')
    const entries = engine.getHistory().entries.slice(1)
    const kinds: HistoryKind[] = [
      'insert',
      'move',
      'rename',
      'hide',
      'show',
      'lock',
      'unlock',
      'update',
      'remove',
    ]
    expect(entries.map((e) => e.kind)).toEqual(kinds)
    expect(entries.map((e) => e.target)).toEqual(['展場入口', '展場入口', ...Array(7).fill('攤位')])
    expect(JSON.stringify(entries)).not.toContain('private-photo-id')
  })

  it('記錄不包含 raw markup，不重複相同摘要，Unicode 文字截短而不拆開 surrogate pair', () => {
    const engine = setup()
    engine.update('head', { content: '<em>標記</em>' })
    expect(engine.getHistory().entries.at(-1)).toMatchObject({ target: '主標題' })
    expect(engine.getHistory().entries.at(-1)).not.toHaveProperty('detail')
    engine.update('head', { content: '主標題' })
    expect(engine.getHistory().entries.at(-1)).not.toHaveProperty('detail')
    const emoji = '🌱'.repeat(60)
    engine.update('head', { content: emoji })
    expect(Array.from(engine.getHistory().entries.at(-1)!.detail!)).toHaveLength(48)
    expect(engine.getHistory().entries.at(-1)?.detail).toBe('🌱'.repeat(47) + '…')
    engine.update('cta', { content: '已報名' })
    expect(engine.getHistory().entries.at(-1)).toMatchObject({
      target: '報名活動',
      detail: '已報名',
    })
  })

  it('宿主解除訂閱後，保留的 Engine 可逐一取回百步快照，再編輯並接收新的訂閱', () => {
    const engine = setup()
    const compatible: Engine = engine
    const roots = [compatible.getTree()]
    for (let index = 0; index < 100; index++) {
      compatible.update(index % 2 === 0 ? 'head' : 'cta', { content: '歷史 ' + index })
      roots.push(compatible.getTree())
    }
    const history = engine.getHistory()
    expect(history.entries).toHaveLength(101)
    const detached = vi.fn()
    compatible.subscribe(detached)
    compatible.destroy()
    expect(engine.getHistory()).toEqual(history)

    let cursor = 100
    while (compatible.canUndo()) {
      compatible.undo()
      expect(compatible.getTree()).toBe(roots[--cursor])
    }
    expect(cursor).toBe(0)
    while (compatible.canRedo()) {
      compatible.redo()
      expect(compatible.getTree()).toBe(roots[++cursor])
    }
    expect(cursor).toBe(100)
    const events: EngineEvent[] = []
    const unsubscribe = compatible.subscribe((event) => events.push(event))
    expect(engine.goToHistory(50)).toBe(true)
    expect(compatible.getTree()).toBe(roots[50])
    compatible.update('head', { content: '獨立編輯' })
    expect(engine.checkpointHistory()).toBe(101)
    expect(compatible.getTree().children?.[0]?.content).toBe('獨立編輯')
    expect(events.map((event) => event.type)).toEqual(['tree', 'history', 'history', 'patch'])
    unsubscribe()
    expect(detached).not.toHaveBeenCalled()
  })
})
