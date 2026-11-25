import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type ComponentNode, type I18n } from '@cluion/sigil-core'
import { canMoveComponent, openMoveDialog } from '../src/move-dialog.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function container(id: string, children?: ComponentNode[]): ComponentNode {
  return { id, type: 'section', name: id, children }
}

function setup(children: ComponentNode[], id = 'source', i18n?: I18n) {
  const root = container('頁面', children)
  const engine = createEngine({ doc: { version: 1, root } })
  engine.select(id)
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const onClose = vi.fn()
  const close = openMoveDialog({ engine, id, trigger, i18n, onClose })
  cleanups.push(() => {
    close()
    trigger.remove()
    engine.destroy()
  })
  const dialog = document.querySelector<HTMLDialogElement>('.sigil-move-dialog')!
  const search = dialog.querySelector<HTMLInputElement>('input')!
  const destination = dialog.querySelector<HTMLSelectElement>('.sigil-move-destination')!
  const position = dialog.querySelector<HTMLSelectElement>('.sigil-move-position')!
  const before = dialog.querySelector<HTMLSelectElement>('.sigil-move-before')!
  const confirm = dialog.querySelector<HTMLButtonElement>('.sigil-move-confirm')!
  const preview = dialog.querySelector<HTMLElement>('[role=status]')!
  return {
    engine,
    dialog,
    search,
    destination,
    position,
    before,
    confirm,
    preview,
    trigger,
    close,
    onClose,
  }
}

function change(el: HTMLSelectElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('change'))
}

function query(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}

describe('元件搬移', () => {
  it('辨別可移動的完整元件與受保護的內容', () => {
    const body = container('body', [
      { id: 'source', type: 'text', content: '貓' },
      { ...container('locked', [container('nested', [container('grandchild')])]), locked: true },
      {
        ...container('details', [{ id: 'q', type: 'text', tagName: 'summary' }, container('a')]),
        tagName: 'details',
      },
      {
        ...container('slot', [container('slot-child')]),
        shortcode: { name: 'gallery', props: {} },
      },
      { ...container('rich', [container('rich-child')]), attributes: { 'data-rich': 'true' } },
      { ...container('list', [container('li')]), tagName: 'ul' },
    ])
    const richText = {
      supports: (node: ComponentNode) => node.attributes?.['data-rich'] === 'true',
    }
    for (const id of ['source', 'details', 'slot', 'rich', 'list'])
      expect(canMoveComponent(body, id, richText), id).toBe(true)
    for (const id of [
      'body',
      'q',
      'a',
      'slot-child',
      'rich-child',
      'li',
      'locked',
      'nested',
      'grandchild',
      'unknown',
    ])
      expect(canMoveComponent(body, id, richText), id).toBe(false)
  })

  it('目標有完整路徑；排除來源子樹、鎖定與特殊結構，搜尋到舊文件內省略 children 的空欄', () => {
    const { search, destination, dialog } = setup([
      container('source', [container('child')]),
      container('section', [{ id: 'col', type: 'column', name: 'empty' }]),
      { ...container('locked', [container('inside')]), locked: true },
      { ...container('faq', [container('q')]), tagName: 'DETAILS' },
      { ...container('slot'), type: 'shortcode' },
      { ...container('rich'), type: 'rich-text' },
    ])
    expect([...destination.options].map((o) => o.value)).toEqual(['頁面', 'section', 'col'])
    query(search, 'SECTION Ｅｍｐｔｙ')
    expect(destination.value).toBe('col')
    expect(destination.selectedOptions[0]?.textContent).toBe('頁面 › section › empty')
    expect(dialog.querySelector('.sigil-move-source')?.textContent).toContain('頁面 › source')
  })

  it('同名路徑可區辨；匿名空欄與未命名區段有可讀名稱', () => {
    const { destination } = setup([
      container('source'),
      { id: 'a', type: 'section', children: [{ id: 'c1', type: 'column' }] },
      { id: 'b', type: 'section', children: [{ id: 'c2', type: 'column' }] },
    ])
    const names = [...destination.options].map((entry) => entry.textContent)
    expect(names).toContain('頁面 › 區段 › 欄')
    expect(names).toContain('頁面 › 區段 · 2 › 欄')
  })

  it('預覽與搜尋不寫入文件，確認寫入一次且可復原', () => {
    const { engine, destination, position, before, preview, confirm, onClose, trigger } = setup([
      container('source'),
      container('target', [container('a'), container('b')]),
    ])
    const original = engine.getTree()
    change(destination, 'target')
    change(position, 'before')
    expect(confirm.disabled).toBe(true)
    change(before, 'b')
    expect(preview.textContent).toContain('頁面 › target · 在「b」之前')
    expect(engine.getTree()).toBe(original)
    expect(engine.canUndo()).toBe(false)
    confirm.click()
    expect(engine.getTree().children?.[0]?.children?.map((node) => node.id)).toEqual([
      'a',
      'source',
      'b',
    ])
    expect(onClose).toHaveBeenCalledExactlyOnceWith(true)
    expect(document.activeElement).toBe(trigger)
    engine.undo()
    expect(engine.getTree()).toBe(original)
    expect(engine.canUndo()).toBe(false)
  })

  it('同一容器的指定位置使用排除來源後的順序，原位置不能送出', () => {
    const { engine, position, before, confirm } = setup([
      container('a'),
      container('source'),
      container('b'),
      container('c'),
    ])
    change(position, 'before')
    expect([...before.options].map((opt) => opt.value)).not.toContain('source')
    change(before, 'b')
    expect(confirm.disabled).toBe(true)
    change(before, 'c')
    expect(confirm.disabled).toBe(false)
    confirm.click()
    expect(engine.getTree().children?.map((node) => node.id)).toEqual(['a', 'b', 'source', 'c'])
  })

  it('重新讀取目標與同層元件，外部鎖定或刪除後不會改移到別處', () => {
    const { engine, destination, position, before, confirm, preview } = setup([
      container('source'),
      container('target', [container('a'), container('b')]),
      container('other'),
    ])
    const move = vi.spyOn(engine, 'move')
    change(destination, 'target')
    change(position, 'before')
    change(before, 'b')
    engine.remove('b')
    expect(before.value).toBe('')
    expect(confirm.disabled).toBe(true)
    change(before, 'a')
    engine.update('target', { locked: true })
    expect(destination.value).toBe('')
    expect(preview.textContent).toContain('選擇目的地')
    confirm.click()
    expect(move).not.toHaveBeenCalled()
  })

  it('分頁顯示目的地，搜尋可直接抵達結果上限之外，沒有符合時停用提交', () => {
    const { search, destination, confirm, dialog } = setup([
      container('source'),
      ...Array.from({ length: 300 }, (_, i) => container('page-' + i)),
    ])
    expect(destination.options.length).toBeLessThan(100)
    const more = dialog.querySelector<HTMLButtonElement>('.sigil-move-more')!
    const count = destination.options.length
    more.click()
    expect(destination.options.length).toBeGreaterThan(count)
    query(search, 'page-299')
    expect(destination.value).toBe('page-299')
    expect(more.hidden).toBe(true)
    query(search, 'missing')
    expect(destination.disabled).toBe(true)
    expect(confirm.disabled).toBe(true)
  })

  it('Esc、取消、外部切換選取與銷毀都回復焦點且只通知一次', () => {
    for (const kind of ['esc', 'cancel', 'selection', 'lock', 'destroy']) {
      const { engine, dialog, search, trigger, onClose, close } = setup([
        container('source'),
        container('other'),
      ])
      expect(document.activeElement).toBe(search)
      if (kind === 'esc')
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      if (kind === 'cancel')
        dialog.querySelector<HTMLButtonElement>('.sigil-move-actions .sigil-btn--ghost')!.click()
      if (kind === 'selection') engine.select('other')
      if (kind === 'lock') engine.update('source', { locked: true })
      if (kind === 'destroy') close()
      close()
      expect(dialog.isConnected, kind).toBe(false)
      expect(onClose, kind).toHaveBeenCalledExactlyOnceWith(false)
      expect(document.activeElement, kind).toBe(trigger)
      expect(engine.canUndo(), kind).toBe(kind === 'lock')
    }
  })

  it('語系切換會更新對話框文字並保留搜尋和選取', () => {
    const i18n = createI18n({
      zh: {},
      en: { 'move.title': 'Move component', 'move.first': 'Beginning' },
    })
    const { dialog, search, position, destination, preview } = setup(
      [container('source'), container('target')],
      'source',
      i18n,
    )
    query(search, 'target')
    change(position, 'first')
    i18n.setLocale('en')
    expect(dialog.querySelector('h2')?.textContent).toBe('Move component')
    expect(search.value).toBe('target')
    expect(destination.value).toBe('target')
    expect(preview.textContent).toContain('Beginning')
  })
})
