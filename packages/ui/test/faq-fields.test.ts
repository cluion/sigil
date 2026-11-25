import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, findNode, type ComponentNode } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.()
})

function pair(id: string, question: string, answer: string): ComponentNode {
  return {
    id,
    type: 'section',
    tagName: 'details',
    children: [
      { id: id + '-q', type: 'text', tagName: 'summary', content: question },
      { id: id + '-a', type: 'text', tagName: 'p', content: answer },
    ],
  }
}

describe.each([
  ['Inspector', createInspector],
  ['Props', createPropsPanel],
] as const)('%s 折疊式 FAQ', (_name, mount) => {
  function setup() {
    const group: ComponentNode = {
      id: 'group',
      type: 'section',
      attributes: { 'data-faq-accordion': 'true' },
      children: [pair('first', '幾點開始？', '上午十點。')],
    }
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'root',
          type: 'section',
          children: [group, { id: 'other', type: 'text' }],
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const createItem = vi.fn(({ question, answer }: { question: string; answer: string }) =>
      pair('new', question, answer),
    )
    const revealSelection = vi.fn()
    const i18n = createI18n({
      zh: {},
      en: { 'faq.add': 'Add question', 'faq.question': 'Question', 'faq.answer': 'Answer' },
    })
    const panel = mount(engine, box, { faq: { createItem, revealSelection }, i18n })
    const button = (text: string) =>
      [...box.querySelectorAll('button')].find((el) => el.textContent === text)!
    const field = (key: string) =>
      box.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-faq-field="' + key + '"]')!
    const input = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    engine.select(group.id)
    cleanup.push(() => {
      panel.destroy()
      engine.destroy()
      box.remove()
    })
    return { engine, group, button, field, input, i18n, createItem, revealSelection }
  }

  it('題目清單隨修改、排序及語系更新，返回後恢復焦點', () => {
    const { engine, button, field, input, i18n, revealSelection } = setup()
    button('幾點開始？').click()
    expect(field('question')).toBe(document.activeElement)
    input(field('question'), '幾點報到？')
    input(field('answer'), '九點半開門。\n十點開始。')
    engine.undo()
    expect(field('answer').value).toBe('上午十點。')
    engine.redo()
    expect(field('answer').value).toContain('\n')
    button('返回問答清單').click()
    expect(button('幾點報到？')).toBe(document.activeElement)
    engine.insert('group', pair('extra', '要報名嗎？', '請先報名。'), 0)
    expect(button('要報名嗎？').nextElementSibling).toBe(button('幾點報到？'))
    const row = button('幾點報到？')
    engine.update('other', { content: '其他區塊' })
    expect(button('幾點報到？')).toBe(row)
    expect(document.activeElement).toBe(row)
    i18n.setLocale('en')
    expect(button('Add question')).toBeDefined()
    expect(revealSelection).toHaveBeenCalledTimes(2)
  })

  it('鎖定控制新增或修改，舊選取的欄位與按鈕無法寫入文件', () => {
    const { engine, button, field, input, createItem } = setup()
    engine.update('group', { locked: true })
    const add = button('新增問答')
    expect(add.disabled).toBe(true)
    add.click()
    expect(createItem).not.toHaveBeenCalled()
    engine.update('group', { locked: false })
    add.click()
    expect(engine.getSelection()).toBe('new')
    const q = field('question')
    expect(q.selectionStart).toBe(0)
    expect(q.selectionEnd).toBe(q.value.length)
    engine.update('new-a', { locked: true })
    expect(field('answer').disabled).toBe(true)
    input(field('answer'), 'ignored')
    expect(findNode(engine.getTree(), 'new-a')?.content).toBe('請填寫答案。')
    expect(q.disabled).toBe(false)
    engine.update('new', { locked: true })
    expect(q.disabled).toBe(true)
    engine.update('new', { locked: false })
    engine.select('other')
    const snapshot = engine.getTree()
    input(q, 'outdated')
    add.click()
    expect(createItem).toHaveBeenCalledTimes(1)
    expect(engine.getTree()).toBe(snapshot)
  })
})
