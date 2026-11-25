import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type HistoryEngine, type I18n } from '@cluion/sigil-core'
import { openHistoryDialog } from '../src/index.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.()
})

function editor() {
  const engine = createEngine({
    doc: {
      version: 1,
      root: { id: 'title', type: 'text', name: 'Workshop title', content: 'First' },
    },
  })
  cleanup.push(() => engine.destroy())
  return engine
}
function open(engine: HistoryEngine, i18n?: I18n, savedId?: number) {
  const mount = document.createElement('div')
  const trigger = document.createElement('button')
  mount.append(trigger)
  document.body.append(mount)
  trigger.focus()
  const onClose = vi.fn()
  const handle = openHistoryDialog({ mount, engine, trigger, i18n, onClose, savedId })
  cleanup.push(() => {
    handle.close()
    mount.remove()
  })
  const dialog = mount.querySelector<HTMLDialogElement>('[role="dialog"]')!
  const list = dialog.querySelector<HTMLElement>('[role="listbox"]')!
  const row = (id: number) => list.querySelector<HTMLElement>(`[data-history-id="${id}"]`)
  const button = (key: string) => dialog.querySelector<HTMLButtonElement>('.sigil-history-' + key)!
  const key = (target: HTMLElement, key: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  return { parent: mount, trigger, handle, onClose, dialog, list, row, button, key }
}

describe('編輯歷程對話框', () => {
  it('先選擇歷程才確認跳轉，取消或只開啟視窗都不改文件', () => {
    const engine = editor()
    engine.update('title', { content: '第二段' })
    engine.batch(() => engine.update('title', { content: '第三段' }))
    const { entries } = engine.getHistory()
    const [initial, past, latest] = entries
    engine.undo()
    const before = engine.getTree()
    const jump = vi.spyOn(engine, 'goToHistory')
    const ui = open(engine)
    expect(ui.dialog.open).toBe(true)
    expect(document.activeElement).toBe(ui.list)
    expect(ui.row(initial!.id)?.textContent).toContain('開啟文件')
    expect(ui.row(past!.id)?.getAttribute('aria-current')).toBe('step')
    expect(ui.row(latest!.id)?.textContent).toContain('可重做')
    expect(ui.row(latest!.id)?.querySelector('.sigil-history-detail')?.textContent).toBe('第三段')
    expect(ui.row(past!.id)?.querySelector('.sigil-history-detail')?.textContent).toBe('第二段')
    expect(ui.button('restore').disabled).toBe(true)

    ui.row(latest!.id)!.click()
    expect(ui.row(latest!.id)?.getAttribute('aria-selected')).toBe('true')
    expect(ui.row(past!.id)?.getAttribute('aria-current')).toBe('step')
    expect(engine.getTree()).toBe(before)
    expect(jump).not.toHaveBeenCalled()
    ui.button('restore').click()
    expect(jump).toHaveBeenCalledExactlyOnceWith(latest!.id)
    expect(engine.getTree().content).toBe('第三段')
    expect(ui.dialog.isConnected).toBe(false)
    expect(document.activeElement).toBe(ui.trigger)
    ui.handle.close()
    expect(ui.onClose).toHaveBeenCalledOnce()
  })

  it('Tab 在可用控制項間循環，Escape 放棄選定的步驟並把焦點還給原按鈕', () => {
    const engine = editor()
    engine.update('title', { content: '第二段' })
    const before = engine.getTree()
    const ui = open(engine)
    expect(ui.key(ui.list, 'Tab', true)).toBe(true)
    expect(document.activeElement).toBe(ui.button('close'))
    expect(ui.key(ui.button('close'), 'Tab')).toBe(true)
    expect(document.activeElement).toBe(ui.list)
    expect(ui.key(ui.list, 'Home')).toBe(true)
    expect(ui.button('restore').disabled).toBe(false)
    ui.key(ui.list, 'Tab', true)
    expect(document.activeElement).toBe(ui.button('restore'))
    ui.key(ui.button('restore'), 'Escape')
    expect(engine.getTree()).toBe(before)
    expect(document.activeElement).toBe(ui.trigger)
    expect(ui.onClose).toHaveBeenCalledOnce()
  })

  it('若外部編輯取代已選的重做分支，停用舊確認並顯示新的目前步驟', () => {
    const engine = editor()
    engine.update('title', { content: '即將移除' })
    const removedId = engine.getHistory().currentId
    engine.undo()
    const ui = open(engine)
    ui.row(removedId)!.click()
    ui.button('restore').focus()
    engine.update('title', { content: '保留新分支' })
    expect(ui.row(removedId)).toBeNull()
    expect(ui.button('restore').disabled).toBe(true)
    expect(document.activeElement).toBe(ui.list)
    const current = ui.row(engine.getHistory().currentId)!
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(current.getAttribute('aria-selected')).toBe('true')
    expect(ui.list.getAttribute('aria-activedescendant')).toBe(current.id)
    ui.button('restore').click()
    expect(engine.getTree().content).toBe('保留新分支')
  })

  it('已儲存位置可非同步更新且不干擾目前位置、焦點或所選步驟，丟棄的分支不再標記', () => {
    const engine = editor()
    const first = engine.getHistory().currentId
    engine.update('title', { content: '新內容' })
    const latest = engine.getHistory().currentId
    const ui = open(engine, undefined, first)
    const originalRow = ui.row(first)!
    expect(originalRow.dataset.historySaved).toBe('true')
    expect(originalRow.dataset.historyState).toBe('past')
    originalRow.click()
    const badge = originalRow.querySelector('.sigil-history-saved')
    ui.handle.setSavedId(first)
    expect(originalRow.querySelector('.sigil-history-saved')).toBe(badge)
    ui.handle.setSavedId(latest)
    expect(ui.row(first)).toBe(originalRow)
    expect(originalRow.querySelector('.sigil-history-saved')).toBeNull()
    expect(originalRow.getAttribute('aria-selected')).toBe('true')
    expect(ui.row(latest)?.getAttribute('aria-current')).toBe('step')
    expect(ui.row(latest)?.textContent).toContain('已儲存')
    expect(document.activeElement).toBe(ui.list)
    engine.undo()
    expect(ui.row(latest)?.dataset.historyState).toBe('redo')
    expect(ui.row(latest)?.dataset.historySaved).toBe('true')
    engine.update('title', { content: '不同分支' })
    ui.handle.setSavedId(latest)
    expect(ui.list.querySelector('[data-history-saved]')).toBeNull()
    ui.handle.setSavedId(first)
    ui.handle.setSavedId(undefined)
    expect(ui.list.querySelector('[data-history-saved]')).toBeNull()
  })

  it('長歷程分批呈現並可用鍵盤與按鈕定位開端、目前與最新，不會套用待選步驟', () => {
    const engine = editor()
    for (let i = 0; i < 234; i++) {
      engine.batch(() => engine.update('title', { content: String(i) }))
    }
    const history = engine.getHistory()
    const current = history.entries[117]!.id
    engine.goToHistory(current)
    const jump = vi.spyOn(engine, 'goToHistory')
    const ui = open(engine)
    const options = () => ui.list.querySelectorAll('[role="option"]')
    expect(options()).toHaveLength(40)
    expect(ui.row(current)).toBeTruthy()
    expect(ui.row(current)?.getAttribute('aria-setsize')).toBe('235')
    expect(ui.button('last_saved').hidden).toBe(true)
    const saved = history.entries[17]!.id
    ui.handle.setSavedId(saved)
    ui.button('last_saved').click()
    expect(ui.row(saved)?.getAttribute('aria-selected')).toBe('true')
    expect(ui.row(saved)?.dataset.historySaved).toBe('true')
    expect(engine.getHistory().currentId).toBe(current)
    ui.button('first').click()
    expect(ui.row(history.entries[0]!.id)?.getAttribute('aria-selected')).toBe('true')
    ui.button('later').click()
    expect(options()[0]?.getAttribute('aria-posinset')).toBe('41')
    ui.key(ui.list, 'ArrowUp')
    expect(options()[0]?.getAttribute('aria-posinset')).toBe('1')
    ui.key(ui.list, 'End')
    expect(options()).toHaveLength(40)
    expect(options()[0]?.getAttribute('aria-posinset')).toBe('196')
    expect(ui.row(history.entries.at(-1)!.id)?.getAttribute('aria-selected')).toBe('true')
    ui.button('current_step').click()
    expect(ui.row(current)?.getAttribute('aria-selected')).toBe('true')
    expect(ui.button('restore').disabled).toBe(true)
    expect(engine.getHistory().currentId).toBe(current)
    expect(jump).not.toHaveBeenCalled()
  })

  it('121 筆開啟時顯示最後 40 步，方向鍵與翻頁都可連續往返邊界', () => {
    const engine = editor()
    for (let i = 1; i <= 120; i++) {
      engine.batch(() => engine.update('title', { content: String(i) }))
    }
    const { entries, currentId } = engine.getHistory()
    const ui = open(engine)
    function expectPage(start: number) {
      const rows = Array.from(ui.list.querySelectorAll<HTMLElement>('[role="option"]'))
      expect(rows.map((row) => Number(row.dataset.historyId))).toEqual(
        entries.slice(start, start + 40).map((entry) => entry.id),
      )
    }
    function expectSelected(index: number) {
      const row = ui.row(entries[index]!.id)!
      expect(row.getAttribute('aria-selected')).toBe('true')
      expect(ui.list.getAttribute('aria-activedescendant')).toBe(row.id)
    }
    expectPage(81)
    expectSelected(120)
    expect(ui.row(currentId)?.getAttribute('aria-current')).toBe('step')
    const firstOfLatestPage = ui.row(entries[81]!.id)
    for (let i = 119; i >= 81; i--) {
      ui.key(ui.list, 'ArrowUp')
      expectSelected(i)
    }
    expect(ui.row(entries[81]!.id)).toBe(firstOfLatestPage)
    ui.key(ui.list, 'ArrowUp')
    expectPage(41)
    expectSelected(80)
    ui.key(ui.list, 'ArrowDown')
    expectPage(81)
    expectSelected(81)
    ui.button('earlier').click()
    expectPage(41)
    expectSelected(80)
    ui.button('later').click()
    expectPage(81)
    expectSelected(81)
    ui.key(ui.list, 'Home')
    ui.key(ui.list, 'ArrowUp')
    expectPage(0)
    expectSelected(0)
    ui.key(ui.list, 'End')
    ui.key(ui.list, 'ArrowDown')
    expectPage(81)
    expectSelected(120)
    expect(engine.getHistory().currentId).toBe(currentId)
  })

  it('英文內建字串可覆寫，切換語系保留選取及焦點，顯示純文字摘要並省略重複內容', () => {
    const engine = editor()
    engine.update('title', { content: 'Workshop title' })
    const duplicate = engine.getHistory().currentId
    engine.batch(() => engine.update('title', { content: 'Use 5 < 7 & 8 > 6' }))
    const latest = engine.getHistory().currentId
    const i18n = createI18n({ zh: {}, en: { 'history.title': 'Document revisions' } }, 'en')
    const ui = open(engine, i18n)
    expect(ui.dialog.querySelector('h2')?.textContent).toBe('Document revisions')
    expect(ui.list.getAttribute('aria-label')).toBe('History steps')
    expect(ui.row(duplicate)?.querySelector('.sigil-history-detail')).toBeNull()
    const summary = ui.row(latest)?.querySelector('.sigil-history-detail')
    expect(summary?.textContent).toBe('Use 5 < 7 & 8 > 6')
    expect(summary?.childElementCount).toBe(0)
    ui.key(ui.list, 'Home')
    const id = ui.list.getAttribute('aria-activedescendant')
    expect(ui.button('restore').textContent).toBe('Restore this step')
    i18n.setLocale('zh')
    expect(ui.button('restore').textContent).toBe('回到這一步')
    expect(ui.list.getAttribute('aria-activedescendant')).toBe(id)
    expect(document.activeElement).toBe(ui.list)
    ui.button('close').click()
    expect(engine.getHistory().currentId).toBe(latest)
  })
})
