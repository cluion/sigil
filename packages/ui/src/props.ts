import type { Engine, PropSchema } from '@cluion/sigil-core'
import { findNode, type ComponentNode } from '@cluion/sigil-core'
import { createPropForm } from './form.js'

/**
 * 建立 props 面板 — 顯示並編輯選取節點的屬性
 *
 * 僅在 selection／tree 重建（不在 patch 重建，避免 input 打字失焦）
 */
export interface PropsPanelOptions {
  getShortcodeSchema?: (name: string) => PropSchema[] | undefined
}

export function createPropsPanel(
  engine: Engine,
  container: HTMLElement,
  opts?: PropsPanelOptions,
): {
  destroy: () => void
} {
  function render(): void {
    const id = engine.getSelection()
    container.replaceChildren()
    if (!id) {
      const p = document.createElement('p')
      p.textContent = '未選取節點'
      container.appendChild(p)
      return
    }
    const node = findNode(engine.getTree(), id)
    if (!node) return

    const title = document.createElement('h3')
    title.textContent = `${node.name?.trim() || node.type}（${node.id}）`
    container.appendChild(title)

    appendContentField(container, engine, node)
    appendClassField(container, engine, node)
    appendShortcodePropsField(container, engine, node, opts?.getShortcodeSchema)
    appendStyleField(container, engine, node)
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
  })
  render()
  return { destroy() { unsub() } }
}

/**
 * content 編輯欄位（text／button 等有內容的節點）
 */
function appendContentField(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  if (node.type !== 'text' && node.type !== 'button') return
  const label = document.createElement('label')
  label.textContent = '內容：'
  const input = document.createElement('input')
  input.value = node.content ?? ''
  input.addEventListener('input', () => {
    engine.update(node.id, { content: input.value })
  })
  label.appendChild(input)
  container.appendChild(label)
  container.appendChild(document.createElement('br'))
}

/**
 * className 編輯欄位
 */
function appendClassField(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  const label = document.createElement('label')
  label.textContent = 'class：'
  const input = document.createElement('input')
  input.value = node.className ?? ''
  input.addEventListener('input', () => {
    engine.update(node.id, { className: input.value })
  })
  label.appendChild(input)
  container.appendChild(label)
}

/**
 * shortcode props 編輯欄位
 *
 * 有 PropSchema → 用 createPropForm 生成型別控制項;
 * 無 schema → fallback 通用 key/value
 */
function appendShortcodePropsField(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  getShortcodeSchema?: (name: string) => PropSchema[] | undefined,
): void {
  if (!node.shortcode) return
  const heading = document.createElement('h4')
  heading.textContent = 'shortcode props'
  container.appendChild(heading)

  const schema = getShortcodeSchema?.(node.shortcode.name)
  if (schema && schema.length > 0) {
    container.appendChild(createPropForm({ engine, node, schema }))
    return
  }

  // fallback:通用 key/value(無 schema)
  for (const [k, v] of Object.entries(node.shortcode.props)) {
    const label = document.createElement('label')
    label.textContent = `${k}：`
    const input = document.createElement('input')
    input.type = typeof v === 'number' ? 'number' : 'text'
    input.value = String(v ?? '')
    input.addEventListener('input', () => {
      const next = input.type === 'number' ? Number(input.value) : input.value
      engine.update(node.id, {
        shortcode: {
          name: node.shortcode!.name,
          props: { ...node.shortcode!.props, [k]: next },
        },
      })
    })
    label.appendChild(input)
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }
}

/**
 * 樣式編輯欄位(核心 CSS):margin/padding/font-size(文字)、color(color);font-weight/text-align(select)
 *
 * 值取 node.style[prop];改 → engine.update(id, { style: { [prop]: value } })(updateNode style 合併)
 */
function appendStyleField(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
): void {
  const heading = document.createElement('h4')
  heading.textContent = '樣式'
  container.appendChild(heading)

  const textFields = ['margin', 'padding', 'font-size']
  for (const prop of textFields) {
    const label = document.createElement('label')
    label.textContent = `${prop}：`
    const input = document.createElement('input')
    input.type = 'text'
    input.value = node.style?.[prop] ?? ''
    input.addEventListener('input', () => {
      engine.update(node.id, { style: { [prop]: input.value } })
    })
    label.appendChild(input)
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }

  const colorLabel = document.createElement('label')
  colorLabel.textContent = 'color：'
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.value = node.style?.color ?? '#000000'
  colorInput.addEventListener('input', () => {
    engine.update(node.id, { style: { color: colorInput.value } })
  })
  colorLabel.appendChild(colorInput)
  container.appendChild(colorLabel)
  container.appendChild(document.createElement('br'))

  const selectFields: Record<string, string[]> = {
    'font-weight': ['normal', 'bold'],
    'text-align': ['left', 'center', 'right'],
  }
  for (const [prop, options] of Object.entries(selectFields)) {
    const label = document.createElement('label')
    label.textContent = `${prop}：`
    const sel = document.createElement('select')
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = '(未設)'
    sel.appendChild(empty)
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.appendChild(o)
    }
    sel.value = node.style?.[prop] ?? ''
    sel.addEventListener('change', () => {
      engine.update(node.id, { style: { [prop]: sel.value } })
    })
    label.appendChild(sel)
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }
}
