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
    title.textContent = `${node.type}（${node.id}）`
    container.appendChild(title)

    appendContentField(container, engine, node)
    appendClassField(container, engine, node)
    appendShortcodePropsField(container, engine, node, opts?.getShortcodeSchema)
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
