import type { Engine, PropSchema, ResponsiveDevice } from '@cluion/sigil-core'
import { findNode, type ComponentNode } from '@cluion/sigil-core'
import { createPropForm } from './form.js'
import {
  clearDeviceStyles,
  decorateStyleControl,
  deviceLabel,
  getDeviceStyleValue,
  inheritanceLabel,
  updateDeviceStyle,
} from './style-device.js'

/**
 * 建立 props 面板 — 顯示並編輯選取節點的屬性
 *
 * selection 或 tree 事件才重建 避免輸入失焦
 */
export interface PropsPanelOptions {
  getShortcodeSchema?: (name: string) => PropSchema[] | undefined
  device?: ResponsiveDevice
}

export interface PropsPanelHandle {
  setDevice(device: ResponsiveDevice): void
  destroy(): void
}

export function createPropsPanel(
  engine: Engine,
  container: HTMLElement,
  opts?: PropsPanelOptions,
): PropsPanelHandle {
  let device: ResponsiveDevice = opts?.device ?? 'desktop'

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
    appendStyleField(container, engine, node, device, render)
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
  })
  render()
  return {
    setDevice(next) {
      if (device === next) return
      device = next
      render()
    },
    destroy() {
      unsub()
    },
  }
}

/**
 * content 編輯欄位
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

  // 無 schema 時使用 key value 欄位
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
 * 裝置感知樣式欄位
 */
function appendStyleField(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  rerender: () => void,
): void {
  const heading = document.createElement('h4')
  heading.textContent = `樣式 · ${deviceLabel(device)}`
  container.appendChild(heading)

  const context = document.createElement('p')
  context.className = 'sigil-responsive-style-context'
  context.dataset.styleDevice = device
  context.textContent = inheritanceLabel(device)
  container.appendChild(context)

  const textFields = ['margin', 'padding', 'font-size']
  for (const prop of textFields) {
    const label = document.createElement('label')
    label.textContent = `${prop}：`
    const input = document.createElement('input')
    input.type = 'text'
    const value = getDeviceStyleValue(node, device, prop)
    input.value = value.override ?? ''
    input.addEventListener('input', () => {
      updateDeviceStyle(engine, node.id, device, prop, input.value)
    })
    label.appendChild(decorateStyleControl(input, engine, node, device, prop, value))
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }

  const colorLabel = document.createElement('label')
  colorLabel.textContent = 'color：'
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  const colorValue = getDeviceStyleValue(node, device, 'color')
  const color = colorValue.override ?? colorValue.effective
  colorInput.value = color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#000000'
  colorInput.addEventListener('input', () => {
    updateDeviceStyle(engine, node.id, device, 'color', colorInput.value)
  })
  colorLabel.appendChild(
    decorateStyleControl(colorInput, engine, node, device, 'color', colorValue),
  )
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
    const value = getDeviceStyleValue(node, device, prop)
    empty.textContent = value.inherited && value.effective ? `(繼承 ${value.effective})` : '(未設)'
    sel.appendChild(empty)
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.appendChild(o)
    }
    sel.value = value.override ?? ''
    sel.addEventListener('change', () => {
      updateDeviceStyle(engine, node.id, device, prop, sel.value)
    })
    label.appendChild(decorateStyleControl(sel, engine, node, device, prop, value))
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent =
    device === 'desktop' ? '清除 Desktop 樣式' : `清除 ${deviceLabel(device)} 覆寫`
  reset.addEventListener('click', () => {
    clearDeviceStyles(engine, node.id, device)
    rerender()
  })
  container.appendChild(reset)
}
