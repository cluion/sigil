import type { AssetStore, Engine, PropSchema } from '@cluion/sigil-core'
import { findNode, type ComponentNode } from '@cluion/sigil-core'
import { createPropForm } from './form.js'
import { openMediaPicker } from './media-picker.js'

export type InspectorTab = 'content' | 'style' | 'advanced'

export interface InspectorOptions {
  getShortcodeSchema?: (name: string) => PropSchema[] | undefined
  assets?: AssetStore
}

/**
 * 產品殼 Inspector：分頁「內容｜樣式｜進階」
 */
export function createInspector(
  engine: Engine,
  container: HTMLElement,
  opts?: InspectorOptions,
): { destroy: () => void } {
  container.classList.add('sigil-inspector')
  container.replaceChildren()

  const tabs = document.createElement('div')
  tabs.className = 'sigil-tabs'
  tabs.setAttribute('role', 'tablist')

  const body = document.createElement('div')
  body.className = 'sigil-inspector-body'

  let tab: InspectorTab = 'content'
  const tabBtns: Record<InspectorTab, HTMLButtonElement> = {
    content: makeTab('content', '內容'),
    style: makeTab('style', '樣式'),
    advanced: makeTab('advanced', '進階'),
  }
  for (const b of Object.values(tabBtns)) tabs.appendChild(b)
  container.append(tabs, body)

  function makeTab(id: InspectorTab, label: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sigil-tab'
    btn.textContent = label
    btn.setAttribute('role', 'tab')
    btn.addEventListener('click', () => {
      tab = id
      syncTabs()
      render()
    })
    return btn
  }

  function syncTabs(): void {
    for (const [k, btn] of Object.entries(tabBtns) as [InspectorTab, HTMLButtonElement][]) {
      const on = k === tab
      btn.classList.toggle('sigil-tab--active', on)
      btn.setAttribute('aria-selected', String(on))
    }
  }

  function render(): void {
    syncTabs()
    body.replaceChildren()
    const id = engine.getSelection()
    if (!id) {
      const empty = document.createElement('div')
      empty.className = 'sigil-empty'
      const t = document.createElement('p')
      t.className = 'sigil-muted'
      t.textContent = '尚未選取元件'
      const tip = document.createElement('p')
      tip.className = 'sigil-muted'
      tip.style.marginTop = '8px'
      tip.textContent = '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。'
      empty.append(t, tip)
      body.appendChild(empty)
      return
    }
    const node = findNode(engine.getTree(), id)
    if (!node) return

    const head = document.createElement('div')
    head.className = 'sigil-inspector-head'
    head.textContent = `${node.name?.trim() || node.type} · ${node.id}`
    body.appendChild(head)

    if (tab === 'content') renderContent(body, engine, node, opts)
    else if (tab === 'style') renderStyle(body, engine, node)
    else renderAdvanced(body, engine, node)
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
  })
  render()
  return {
    destroy() {
      unsub()
    },
  }
}

function renderContent(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  opts?: InspectorOptions,
): void {
  if (node.type === 'text' || node.type === 'button') {
    field(container, '內容', () => {
      const input = document.createElement('input')
      input.className = 'sigil-input'
      input.value = node.content ?? ''
      input.addEventListener('input', () => engine.update(node.id, { content: input.value }))
      return input
    })
  }
  if (node.type === 'image') {
    appendImageFields(container, engine, node, opts?.assets)
  }
  if (node.shortcode) {
    const h = document.createElement('h4')
    h.className = 'sigil-section-title'
    h.textContent = `shortcode · ${node.shortcode.name}`
    container.appendChild(h)
    const schema = opts?.getShortcodeSchema?.(node.shortcode.name)
    if (schema?.length) {
      container.appendChild(
        createPropForm({ engine, node, schema, assets: opts?.assets }),
      )
    } else {
      for (const [k, v] of Object.entries(node.shortcode.props)) {
        field(container, k, () => {
          const input = document.createElement('input')
          input.className = 'sigil-input'
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
          return input
        })
      }
    }
  }
  if (
    node.type !== 'text' &&
    node.type !== 'button' &&
    node.type !== 'image' &&
    !node.shortcode
  ) {
    const p = document.createElement('p')
    p.className = 'sigil-muted'
    p.textContent = '此節點無可編輯內容欄位，可切到樣式分頁'
    container.appendChild(p)
  }
}

function appendImageFields(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  assets?: AssetStore,
): void {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'

  const label = document.createElement('span')
  label.className = 'sigil-field-label'
  label.textContent = '圖片'

  const preview = document.createElement('img')
  preview.className = 'sigil-img-preview'
  preview.alt = ''
  const src = node.attributes?.src ?? ''
  if (src) preview.src = src
  else preview.style.display = 'none'

  const input = document.createElement('input')
  input.className = 'sigil-input'
  input.value = src
  input.placeholder = 'https://…'
  input.addEventListener('input', () => {
    const next = input.value
    engine.update(node.id, { attributes: { ...node.attributes, src: next } })
    if (next) {
      preview.src = next
      preview.style.display = ''
    } else {
      preview.removeAttribute('src')
      preview.style.display = 'none'
    }
  })

  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  row.appendChild(input)

  if (assets) {
    const pickBtn = document.createElement('button')
    pickBtn.type = 'button'
    pickBtn.className = 'sigil-btn'
    pickBtn.textContent = '選圖'
    pickBtn.addEventListener('click', () => {
      openMediaPicker({
        assets,
        currentUrl: node.attributes?.src,
        onPick: (item) => {
          engine.update(node.id, {
            attributes: { ...node.attributes, src: item.url },
          })
        },
        onClose: () => {},
      })
    })
    row.appendChild(pickBtn)
  }

  wrap.append(label, preview, row)
  container.appendChild(wrap)
}

function renderStyle(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  section(container, '版面')
  for (const prop of ['margin', 'padding', 'width', 'height', 'display'] as const) {
    styleText(container, engine, node, prop)
  }

  section(container, '文字')
  styleText(container, engine, node, 'font-size')
  styleSelect(container, engine, node, 'font-weight', ['normal', 'bold', '600'])
  styleSelect(container, engine, node, 'text-align', ['left', 'center', 'right', 'justify'])
  styleColor(container, engine, node, 'color')

  section(container, '外觀')
  styleColor(container, engine, node, 'background-color')
  styleText(container, engine, node, 'border')
  styleText(container, engine, node, 'border-radius')
  styleText(container, engine, node, 'box-shadow')

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'sigil-btn'
  reset.textContent = '清除樣式'
  reset.addEventListener('click', () => engine.update(node.id, { style: {} }))
  container.appendChild(reset)
}

function section(container: HTMLElement, title: string): void {
  const h = document.createElement('h4')
  h.className = 'sigil-section-title'
  h.textContent = title
  container.appendChild(h)
}

function styleText(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  prop: string,
): void {
  field(container, prop, () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.value = node.style?.[prop] ?? ''
    input.placeholder = prop === 'display' ? 'block / flex / none' : ''
    input.addEventListener('input', () => engine.update(node.id, { style: { [prop]: input.value } }))
    return input
  })
}

function styleColor(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  prop: string,
): void {
  field(container, prop, () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.type = 'color'
    const cur = node.style?.[prop]
    input.value = cur && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cur) ? cur : '#000000'
    input.addEventListener('input', () => engine.update(node.id, { style: { [prop]: input.value } }))
    return input
  })
}

function styleSelect(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  prop: string,
  options: string[],
): void {
  field(container, prop, () => {
    const sel = document.createElement('select')
    sel.className = 'sigil-input'
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = '未設'
    sel.appendChild(empty)
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.appendChild(o)
    }
    sel.value = node.style?.[prop] ?? ''
    sel.addEventListener('change', () => engine.update(node.id, { style: { [prop]: sel.value } }))
    return sel
  })
}

function renderAdvanced(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  field(container, 'id', () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.value = node.id
    input.readOnly = true
    return input
  })
  field(container, 'type', () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.value = node.type
    input.readOnly = true
    return input
  })
  field(container, 'class', () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.value = node.className ?? ''
    input.addEventListener('input', () => engine.update(node.id, { className: input.value }))
    return input
  })
  if (node.id !== engine.getTree().id) {
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'sigil-btn sigil-btn--danger'
    del.textContent = '刪除元件'
    del.addEventListener('click', () => engine.remove(node.id))
    container.appendChild(del)
  }
}

function field(container: HTMLElement, label: string, control: () => HTMLElement): void {
  const wrap = document.createElement('label')
  wrap.className = 'sigil-field'
  const span = document.createElement('span')
  span.className = 'sigil-field-label'
  span.textContent = label
  wrap.append(span, control())
  container.appendChild(wrap)
}
