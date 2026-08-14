import type {
  Engine,
  I18n,
  PropSchema,
  ResponsiveDevice,
  RichTextResolver,
} from '@cluion/sigil-core'
import { findNode, type ComponentNode } from '@cluion/sigil-core'
import { createPropForm } from './form.js'
import { subscribeLocale, uiText } from './i18n.js'
import { richTextSummary } from './rich-text.js'
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
  richText?: RichTextResolver
  i18n?: I18n
  device?: ResponsiveDevice
  /** select optionsFrom 用的非同步能力 */
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
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

  let currentFormDestroy: (() => void) | null = null

  function render(): void {
    currentFormDestroy?.()
    currentFormDestroy = null
    const id = engine.getSelection()
    container.replaceChildren()
    if (!id) {
      const p = document.createElement('p')
      p.textContent = uiText(opts?.i18n, 'props.empty', '未選取節點')
      container.appendChild(p)
      return
    }
    const node = findNode(engine.getTree(), id)
    if (!node) return

    const title = document.createElement('h3')
    title.textContent = `${node.name?.trim() || node.type}${uiText(opts?.i18n, 'props.node_id_open', '（')}${node.id}${uiText(opts?.i18n, 'props.node_id_close', '）')}`
    container.appendChild(title)

    appendContentField(container, engine, node, opts?.richText, opts?.i18n)
    appendClassField(container, engine, node, opts?.i18n)
    appendShortcodePropsField(
      container,
      engine,
      node,
      opts?.getShortcodeSchema,
      opts?.fetchJSON,
      opts?.i18n,
      (fn) => {
        currentFormDestroy = fn
      },
    )
    appendStyleField(container, engine, node, device, render, opts?.i18n)
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
  })
  const unsubLocale = subscribeLocale(opts?.i18n, render)
  render()
  return {
    setDevice(next) {
      if (device === next) return
      device = next
      render()
    },
    destroy() {
      currentFormDestroy?.()
      currentFormDestroy = null
      unsub()
      unsubLocale()
    },
  }
}

/**
 * content 編輯欄位
 */
function appendContentField(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  richText?: RichTextResolver,
  i18n?: I18n,
): void {
  if (richText?.supports(node)) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-rich-text-field'
    const label = document.createElement('strong')
    label.textContent = uiText(i18n, 'rich_text.summary', '富文字摘要')
    const summary = document.createElement('p')
    summary.className = 'sigil-rich-text-summary'
    summary.textContent =
      richTextSummary(richText.read(node)) || uiText(i18n, 'rich_text.empty', '空白富文字')
    const hint = document.createElement('p')
    hint.className = 'sigil-muted sigil-rich-text-hint'
    hint.textContent = uiText(i18n, 'rich_text.canvas_hint', '請在畫布編輯富文字')
    wrap.append(label, summary, hint)
    container.appendChild(wrap)
    return
  }
  if (node.type !== 'text' && node.type !== 'button') return
  const label = document.createElement('label')
  label.textContent = `${uiText(i18n, 'props.content', '內容')}${uiText(i18n, 'form.label_separator', '：')}`
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
function appendClassField(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  i18n?: I18n,
): void {
  const label = document.createElement('label')
  label.textContent = `class${uiText(i18n, 'form.label_separator', '：')}`
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
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>,
  i18n?: I18n,
  registerDestroy?: (fn: () => void) => void,
): void {
  if (!node.shortcode) return
  const heading = document.createElement('h4')
  heading.textContent = 'shortcode props'
  container.appendChild(heading)

  const schema = getShortcodeSchema?.(node.shortcode.name)
  if (schema && schema.length > 0) {
    const handle = createPropForm({ engine, node, schema, fetchJSON, i18n })
    registerDestroy?.(handle.destroy)
    container.appendChild(handle.el)
    return
  }

  // 無 schema 時使用 key value 欄位
  for (const [k, v] of Object.entries(node.shortcode.props)) {
    const label = document.createElement('label')
    label.textContent = `${k}${uiText(i18n, 'form.label_separator', '：')}`
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
  i18n?: I18n,
): void {
  const heading = document.createElement('h4')
  heading.textContent = `${uiText(i18n, 'style.title', '樣式')} · ${deviceLabel(device)}`
  container.appendChild(heading)

  const context = document.createElement('p')
  context.className = 'sigil-responsive-style-context'
  context.dataset.styleDevice = device
  context.textContent = inheritanceLabel(device, i18n)
  container.appendChild(context)

  const textFields = ['margin', 'padding', 'font-size']
  for (const prop of textFields) {
    const label = document.createElement('label')
    label.textContent = `${prop}${uiText(i18n, 'form.label_separator', '：')}`
    const input = document.createElement('input')
    input.type = 'text'
    const value = getDeviceStyleValue(node, device, prop)
    input.value = value.override ?? ''
    input.addEventListener('input', () => {
      updateDeviceStyle(engine, node.id, device, prop, input.value)
    })
    label.appendChild(decorateStyleControl(input, engine, node, device, prop, value, i18n))
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }

  const colorLabel = document.createElement('label')
  colorLabel.textContent = `color${uiText(i18n, 'form.label_separator', '：')}`
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  const colorValue = getDeviceStyleValue(node, device, 'color')
  const color = colorValue.override ?? colorValue.effective
  colorInput.value = color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#000000'
  colorInput.addEventListener('input', () => {
    updateDeviceStyle(engine, node.id, device, 'color', colorInput.value)
  })
  colorLabel.appendChild(
    decorateStyleControl(colorInput, engine, node, device, 'color', colorValue, i18n),
  )
  container.appendChild(colorLabel)
  container.appendChild(document.createElement('br'))

  const selectFields: Record<string, string[]> = {
    'font-weight': ['normal', 'bold'],
    'text-align': ['left', 'center', 'right'],
  }
  for (const [prop, options] of Object.entries(selectFields)) {
    const label = document.createElement('label')
    label.textContent = `${prop}${uiText(i18n, 'form.label_separator', '：')}`
    const sel = document.createElement('select')
    const empty = document.createElement('option')
    empty.value = ''
    const value = getDeviceStyleValue(node, device, prop)
    empty.textContent =
      value.inherited && value.effective
        ? `(${uiText(i18n, 'style.inherit', '繼承')} ${value.effective})`
        : `(${uiText(i18n, 'style.unset_short', '未設')})`
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
    label.appendChild(decorateStyleControl(sel, engine, node, device, prop, value, i18n))
    container.appendChild(label)
    container.appendChild(document.createElement('br'))
  }

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent =
    device === 'desktop'
      ? uiText(i18n, 'style.clear_desktop', '清除 Desktop 樣式')
      : `${uiText(i18n, 'style.clear', '清除')} ${deviceLabel(device)} ${uiText(i18n, 'style.override', '覆寫')}`
  reset.addEventListener('click', () => {
    clearDeviceStyles(engine, node.id, device)
    rerender()
  })
  container.appendChild(reset)
}
