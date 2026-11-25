import { afterEach, describe, expect, it } from 'vitest'
import {
  createEngine,
  createI18n,
  type ComponentNode,
  type RichTextResolver,
} from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createPropsPanel } from '../src/props.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose()
})

function setup(
  panel: 'inspector' | 'props',
  children: ComponentNode[],
  richText?: RichTextResolver,
) {
  const engine = createEngine({
    doc: { version: 1, root: { id: 'page', type: 'section', children } },
  })
  const i18n = createI18n({
    zh: {},
    en: {
      'text_format.label': 'Text format',
      'text_format.heading': 'Heading {level} (H{level})',
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  const handle = (panel === 'inspector' ? createInspector : createPropsPanel)(engine, box, {
    i18n,
    richText,
  })
  cleanups.push(() => {
    handle.destroy()
    engine.destroy()
    box.remove()
  })
  engine.select('text')
  const select = () => box.querySelector<HTMLSelectElement>('[data-text-format]')
  function change(value: string) {
    const control = select()!
    control.value = value
    control.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return { box, engine, i18n, select, change }
}

describe.each(['inspector', 'props'] as const)('%s 文字格式', (panel) => {
  it('舊文字預設行內；改為標題會保留內容與焦點，單次復原可恢復省略的 tagName', () => {
    const node = {
      id: 'text',
      type: 'text',
      content: '活動簡介',
      className: 'lead',
      style: { color: '#123456' },
      attributes: { id: 'intro' },
    }
    const { box, engine, select, change, i18n } = setup(panel, [node])
    const control = select()!
    expect(control.labels?.[0]?.textContent).toBe('文字格式')
    expect([...control.options].map((option) => option.value)).toEqual([
      'p',
      'span',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ])
    expect(control.value).toBe('span')
    expect(box.querySelector('input, select')).not.toBe(control)
    control.focus()
    change('span')
    expect(engine.canUndo()).toBe(false)
    change('h3')
    expect(engine.getTree().children?.[0]).toEqual({ ...node, tagName: 'h3' })
    expect(control.value).toBe('h3')
    expect(select()).toBe(control)
    expect(document.activeElement).toBe(control)
    change('h3')
    i18n.setLocale('en')
    expect(select()!.labels?.[0]?.textContent).toBe('Text format')
    expect(select()!.selectedOptions[0]?.textContent).toBe('Heading 3 (H3)')
    expect(document.activeElement).toBe(select())
    engine.undo()
    expect(engine.getTree().children?.[0]).toEqual(node)
    expect(engine.canUndo()).toBe(false)
    expect(select()!.value).toBe('span')
    expect(document.activeElement).toBe(select())
    engine.redo()
    expect(select()!.value).toBe('h3')
    expect(engine.getSelection()).toBe('text')
  })

  it('鎖定和父層結構改變會即時同步，外部控制項不能改寫已移出或鎖定的文字', () => {
    const { engine, select, change } = setup(panel, [
      { id: 'text', type: 'text', tagName: 'P', content: '正文' },
      { id: 'other', type: 'section', tagName: 'span' },
    ])
    expect(select()!.value).toBe('p')
    engine.update('text', { locked: true })
    expect(select()!.disabled).toBe(true)
    change('h6')
    expect(engine.getTree().children?.[0]?.tagName).toBe('P')
    engine.update('text', { locked: false })
    expect(select()!.disabled).toBe(false)
    const stale = select()!
    engine.move('text', 'other', 0)
    expect(select()).toBeNull()
    stale.value = 'h1'
    stale.dispatchEvent(new Event('change'))
    expect(engine.getTree().children?.[0]?.children?.[0]?.tagName).toBe('P')
    engine.move('text', 'page', 0)
    expect(select()!.value).toBe('p')
    engine.update('text', { attributes: { role: 'button' } })
    expect(select()).toBeNull()
    engine.update('text', { removeAttributes: ['role'] })
    expect(select()!.value).toBe('p')
    engine.update('text', { tagName: 'h6' })
    expect(select()!.value).toBe('h6')
  })

  it('保留連結、其他語意標籤、巢狀內容、shortcode 與自訂富文字的原始語意', () => {
    const nodes: ComponentNode[] = [
      { id: 'a', type: 'text', tagName: 'a', content: '連結', attributes: { href: '/' } },
      { id: 'summary', type: 'text', tagName: 'summary' },
      { id: 'nested', type: 'text', children: [{ id: 'child', type: 'text' }] },
      { id: 'short', type: 'text', shortcode: { name: 'custom', props: {} } },
      { id: 'rich', type: 'text' },
      { id: 'widget', type: 'text', attributes: { ROLE: 'heading', 'aria-level': '2' } },
      { id: 'role', type: 'text', attributes: { 'ARIA-LEVEL': '2' } },
      { id: 'container', type: 'section', tagName: 'h3' },
      {
        id: 'action',
        type: 'section',
        attributes: { role: 'button' },
        children: [{ id: 'button-label', type: 'text' }],
      },
      {
        id: 'list',
        type: 'section',
        tagName: 'ul',
        children: [
          { id: 'li', type: 'section', tagName: 'li', children: [{ id: 'item', type: 'text' }] },
        ],
      },
    ]
    const { engine, select } = setup(panel, nodes, {
      supports: (node) => node.id === 'rich' || node.tagName === 'h4',
      read: () => '',
    })
    for (const id of [
      'a',
      'summary',
      'nested',
      'child',
      'short',
      'rich',
      'role',
      'widget',
      'container',
      'button-label',
    ]) {
      engine.select(id)
      expect(select(), id).toBeNull()
    }
    engine.select('item')
    expect(select()!.value).toBe('span')
    expect(select()!.querySelector<HTMLOptionElement>('[value="h4"]')?.disabled).toBe(true)
    expect(engine.canUndo()).toBe(false)
  })
})
