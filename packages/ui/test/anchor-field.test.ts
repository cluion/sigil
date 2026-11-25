import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, findNode } from '@cluion/sigil-core'
import { createAnchorField } from '../src/anchor-field.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})

function setup() {
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        children: [
          { id: 'details', type: 'section', attributes: { id: 'event-info' } },
          { id: 'cta', type: 'text', tagName: 'a', attributes: { href: '#event-info' } },
          { id: 'faq', type: 'section', attributes: { id: 'faq' } },
        ],
      },
    },
  })
  engine.select('details')
  const field = createAnchorField(engine, findNode(engine.getTree(), 'details')!)
  document.body.append(field.el)
  cleanups.push(() => {
    field.destroy()
    field.el.remove()
    engine.destroy()
  })
  const { el } = field
  const name = el.querySelector<HTMLInputElement>('[data-anchor-name]')!
  const [apply, copy] = el.querySelectorAll<HTMLButtonElement>('button')
  const fragment = el.querySelector<HTMLInputElement>('input[readonly]')!
  const status = el.querySelector<HTMLElement>('[role="status"]')!
  function edit(value: string) {
    name.value = value
    name.dispatchEvent(new Event('input'))
  }
  return { engine, field, name, fragment, status, edit, apply: apply!, copy: copy! }
}

describe('頁內錨點欄位', () => {
  it('輸入草稿與 IME 確認不改文件，Enter 提交後可以一次復原', async () => {
    const { engine, field, name, edit, apply, copy, status } = setup()
    expect(field.el.querySelector('.sigil-anchor-references')?.textContent).toContain('1 處')
    const readTree = vi.spyOn(engine, 'getTree')
    edit('活動')
    edit('活動資訊')
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }))
    expect(readTree).not.toHaveBeenCalled()
    expect(engine.canUndo()).toBe(false)
    expect(copy.disabled).toBe(true)
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(findNode(engine.getTree(), 'cta')?.attributes?.href).toBe(
      '#' + encodeURIComponent('活動資訊'),
    )
    expect(status.textContent).toBe('已更新頁內錨點。')
    expect(apply.disabled).toBe(true)
    engine.undo()
    await Promise.resolve()
    expect(name.value).toBe('event-info')
    expect(copy.disabled).toBe(false)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    await Promise.resolve()
    expect(name.value).toBe('活動資訊')
  })

  it('拒絕衝突、空白及移除使用中的名稱，並保留使用者輸入', () => {
    const { engine, name, edit, apply, status } = setup()
    for (const [value, message] of [
      ['faq', '名稱已被使用'],
      ['event info', '有效的錨點名稱'],
      ['', '先移除或重新指定'],
    ] as const) {
      edit(value)
      apply.click()
      expect(status.textContent).toContain(message)
      expect(name.getAttribute('aria-invalid')).toBe('true')
      expect(name.value).toBe(value)
      expect(document.activeElement).toBe(name)
    }
    expect(engine.canUndo()).toBe(false)
    edit('new-event')
    expect(name.hasAttribute('aria-invalid')).toBe(false)
  })

  it('其他節點更新時保留草稿，元件鎖定或選取改變時禁止舊操作', async () => {
    const { engine, name, edit, apply, copy } = setup()
    edit('draft')
    engine.update('cta', { attributes: { href: '#faq' } })
    await Promise.resolve()
    expect(name.value).toBe('draft')
    engine.update('details', { locked: true })
    apply.click()
    expect(name.disabled).toBe(true)
    expect(name.value).toBe('event-info')
    expect(copy.disabled).toBe(false)
    engine.update('details', { locked: false })
    await Promise.resolve()
    edit('stale')
    engine.select('faq')
    apply.click()
    expect(findNode(engine.getTree(), 'details')?.attributes?.id).toBe('event-info')
  })

  it('清除無參照錨點後停用複製，且復原時重建網址', async () => {
    const { engine, name, edit, apply, copy, fragment } = setup()
    engine.update('cta', { attributes: { href: '/registration' } })
    await Promise.resolve()
    edit('')
    apply.click()
    expect(name.value).toBe('')
    expect(copy.disabled).toBe(true)
    expect(fragment.value).toBe('')
    engine.undo()
    await Promise.resolve()
    expect(copy.disabled).toBe(false)
    expect(fragment.value).toBe('#event-info')
  })

  it('成功複製已儲存的頁內連結，剪貼簿被拒時提供選取好的文字', async () => {
    const { engine, copy, fragment, status } = setup()
    const write = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('unavailable'))
    copy.focus()
    copy.click()
    await Promise.resolve()
    expect(write).toHaveBeenCalledWith('#event-info')
    expect(status.textContent).toBe('已複製頁內連結。')
    expect(document.activeElement).toBe(copy)
    copy.click()
    await Promise.resolve()
    expect(status.textContent).toContain('手動複製')
    expect(document.activeElement).toBe(fragment)
    expect(fragment.value.slice(fragment.selectionStart!, fragment.selectionEnd!)).toBe(
      '#event-info',
    )
    expect(engine.canUndo()).toBe(false)
  })

  it('剪貼簿作業晚於切換選取、改輸入或卸載時不會搶焦點', async () => {
    const { field, copy, fragment, name, edit, status } = setup()
    let reject!: () => void
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = () => fail(new Error('denied'))
        }),
    )
    copy.click()
    name.focus()
    edit('draft')
    reject()
    await Promise.resolve()
    expect(status.textContent).toBe('')
    expect(document.activeElement).toBe(name)
    edit('event-info')
    copy.click()
    field.destroy()
    reject()
    await Promise.resolve()
    expect(document.activeElement).not.toBe(fragment)
  })
})
