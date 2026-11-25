import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type ComponentNode } from '@cluion/sigil-core'
import { openPageTextDialog } from '../src/index.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

const children: ComponentNode[] = [
  { id: 'lead', type: 'text', name: '題名', content: '春天・春天' },
  {
    id: 'mixed',
    type: 'text',
    name: '週末班',
    content: '春天 < 窗邊',
    children: [{ id: 'inner', type: 'text', name: '報名', content: '春天' }],
  },
  { id: 'locked', type: 'text', name: '引言', content: '春天', locked: true },
]
function fixture(
  nodes = children,
  options: Partial<Parameters<typeof openPageTextDialog>[0]> = {},
) {
  const engine = createEngine({
    doc: { version: 1, root: { id: 'root', type: 'section', children: nodes } },
  })
  const mount = document.createElement('div')
  const trigger = document.createElement('button')
  mount.append(trigger)
  document.body.append(mount)
  trigger.focus()
  const handle = openPageTextDialog({ mount, engine, initialQuery: '春天', trigger, ...options })
  cleanups.push(() => {
    handle.close()
    engine.destroy()
    mount.remove()
  })
  const dialog = mount.querySelector('dialog')!
  const list = dialog.querySelector<HTMLElement>('[role=listbox]')!
  const status = dialog.querySelector<HTMLElement>('[role=status]')!
  const query = dialog.querySelector<HTMLInputElement>('[type=search]')!
  const replacement = dialog.querySelector<HTMLInputElement>('[type=text]')!
  const matchCase = dialog.querySelector<HTMLInputElement>('[type=checkbox]')!
  const button = (action: string) =>
    dialog.querySelector<HTMLButtonElement>(`[data-find-action="${action}"]`)!
  const rows = () => Array.from(list.querySelectorAll<HTMLElement>('[role=option]'))
  const selected = () => list.querySelector<HTMLElement>('[aria-selected=true]')
  function input(field: HTMLInputElement, value: string) {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function key(field: HTMLElement, key: string, args: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...args })
    field.dispatchEvent(event)
    return event.defaultPrevented
  }
  return {
    engine,
    trigger,
    dialog,
    handle,
    list,
    status,
    query,
    replacement,
    matchCase,
    button,
    rows,
    selected,
    input,
    key,
  }
}

describe('尋找與取代對話框', () => {
  it('為每次命中標出實際內文，可單獨取代同元件的第二處並繼續到下一處', () => {
    const ui = fixture()
    expect(document.activeElement).toBe(ui.query)
    expect(ui.rows()).toHaveLength(5)
    expect(ui.rows().map((row) => row.querySelector('mark')?.textContent)).toEqual(
      Array(5).fill('春天'),
    )
    expect(ui.rows()[2]?.textContent).toContain('春天 < 窗邊')
    expect(ui.rows()[2]?.querySelector('mark')?.childElementCount).toBe(0)
    expect(ui.status.textContent).toContain('已鎖定 1 處')
    ui.rows()[1]!.click()
    ui.input(ui.replacement, '夏')
    ui.key(ui.replacement, 'Enter')
    expect(ui.engine.getTree().children?.[0]?.content).toBe('春天・夏')
    expect(ui.selected()?.textContent).toContain('週末班')
    expect(ui.status.textContent).toContain('已取代 1 處')
    ui.rows().at(-1)!.click()
    expect(ui.button('replace_one').disabled).toBe(true)
    expect(ui.button('reveal').disabled).toBe(false)
  })

  it('確認顯示可寫筆數，空取代可刪除全部命中並一次復原，外層與鎖定內容保留', async () => {
    const ui = fixture()
    const tree = ui.engine.getTree()
    const originalHistory = ui.engine.getHistory().entries.length
    ui.button('replace_all').click()
    expect(ui.button('confirm').textContent).toBe('確認刪除 4 處')
    expect(document.activeElement).toBe(ui.button('back'))
    expect(ui.engine.getTree()).toBe(tree)
    ui.button('back').click()
    expect(document.activeElement).toBe(ui.button('replace_all'))
    ui.button('replace_all').click()
    ui.button('confirm').focus()
    ui.button('confirm').click()
    expect(ui.dialog.open).toBe(true)
    expect(ui.rows()).toHaveLength(1)
    expect(ui.status.textContent).toContain('已刪除 4 處')
    expect(ui.rows()[0]!.textContent).toContain('引言')
    expect(ui.engine.getTree().children?.[1]?.children?.[0]?.id).toBe('inner')
    expect(ui.engine.getHistory().entries.length).toBe(originalHistory + 1)
    expect(document.activeElement).toBe(ui.replacement)
    ui.engine.undo()
    await Promise.resolve()
    expect(ui.rows()).toHaveLength(5)
    expect(ui.engine.getTree()).toEqual(tree)
    ui.engine.redo()
    await Promise.resolve()
    expect(ui.rows()).toHaveLength(1)
    expect(ui.button('replace_all').disabled).toBe(true)
  })

  it('外部文件或未送出的輸入改變時重新確認，不會把新結果納入舊的批次授權', async () => {
    const ui = fixture()
    ui.input(ui.replacement, '春天')
    expect(ui.button('replace_all').disabled).toBe(true)
    ui.input(ui.replacement, '夏天')
    ui.button('replace_all').click()
    expect(ui.button('confirm').textContent).toBe('確認取代 4 處')
    ui.engine.update('locked', { locked: false })
    ui.button('confirm').click()
    expect(ui.engine.getTree().children?.[0]?.content).toBe('春天・春天')
    await Promise.resolve()
    expect(ui.button('confirm').hidden).toBe(true)
    ui.button('replace_all').click()
    expect(ui.button('confirm').textContent).toBe('確認取代 5 處')
    ui.input(ui.replacement, '')
    expect(ui.button('confirm').hidden).toBe(true)
    ui.input(ui.query, '潮汐')
    expect(ui.status.textContent).toBe('找不到相符文字')
    ui.engine.update('inner', { content: '潮汐' })
    await Promise.resolve()
    expect(ui.selected()?.textContent).toContain('潮汐')
  })

  it('組字時不查詢、關閉或取代，完成時只通知一次並保留大小寫與語系切換中的輸入', () => {
    const changed = vi.fn()
    const i18n = createI18n({ zh: {}, en: { 'page_text.query': 'Find phrase' } }, 'en')
    const ui = fixture([{ id: 'lead', type: 'text', content: 'Tea tea 茶' }], {
      initialQuery: 'Tea',
      initialMatchCase: true,
      onQueryChange: changed,
      i18n,
    })
    expect(ui.rows()).toHaveLength(1)
    expect(ui.query.labels?.[0]?.textContent).toBe('Find phrase')
    ui.query.dispatchEvent(new Event('compositionstart'))
    ui.input(ui.query, '茶')
    expect(changed).not.toHaveBeenCalled()
    ui.key(ui.query, 'Escape')
    expect(ui.dialog.open).toBe(true)
    expect(ui.rows()[0]?.querySelector('mark')?.textContent).toBe('Tea')
    ui.query.dispatchEvent(new Event('compositionend'))
    ui.input(ui.query, '茶')
    expect(changed).toHaveBeenCalledExactlyOnceWith('茶', true)
    expect(ui.rows()[0]?.querySelector('mark')?.textContent).toBe('茶')
    ui.matchCase.click()
    expect(changed).toHaveBeenLastCalledWith('茶', false)
    ui.replacement.dispatchEvent(new Event('compositionstart'))
    ui.input(ui.replacement, '花')
    ui.key(ui.replacement, 'Enter')
    expect(ui.engine.getTree().children?.[0]?.content).toBe('Tea tea 茶')
    ui.replacement.dispatchEvent(new Event('compositionend'))
    ui.replacement.focus()
    i18n.setLocale('zh')
    expect(ui.query.labels?.[0]?.textContent).toBe('尋找文字')
    expect(document.activeElement).toBe(ui.replacement)
    expect(ui.replacement.value).toBe('花')
    ui.key(ui.replacement, 'Escape')
    expect(document.activeElement).toBe(ui.trigger)
    expect(ui.engine.getTree().children?.[0]?.content).toBe('Tea tea 茶')
  })

  it('大量結果分批且可用鍵盤定位最後一筆，切回上一批與焦點循環不改文件', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => ({
      id: 'p' + i,
      type: 'text',
      name: '名稱 ' + i,
      content: '春天',
    }))
    const closed = vi.fn()
    let focusAtReveal: Element | null = null
    const reveal = vi.fn(() => {
      focusAtReveal = document.activeElement
    })
    const ui = fixture(nodes, { onClose: closed, onReveal: reveal })
    expect(ui.rows()).toHaveLength(30)
    expect(ui.status.textContent).toBe('找到 5000 處')
    ui.key(ui.query, 'ArrowDown')
    expect(document.activeElement).toBe(ui.list)
    ui.key(ui.list, 'End')
    expect(ui.rows()).toHaveLength(30)
    expect(ui.selected()?.getAttribute('aria-posinset')).toBe('5000')
    ui.button('previous').click()
    expect(ui.selected()?.getAttribute('aria-posinset')).toBe('4970')
    ui.button('next').click()
    expect(ui.selected()?.getAttribute('aria-posinset')).toBe('4971')
    ui.button('replace_all').focus()
    ui.key(ui.button('replace_all'), 'Tab')
    expect(document.activeElement).toBe(ui.button('cancel'))
    ui.key(ui.button('cancel'), 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(ui.button('replace_all'))
    ui.key(ui.list, 'End')
    ui.key(ui.list, 'Enter')
    expect(reveal).toHaveBeenCalledExactlyOnceWith('p4999')
    expect(focusAtReveal).toBe(ui.trigger)
    expect(closed).toHaveBeenCalledOnce()
    expect(ui.engine.canUndo()).toBe(false)
  })
})
