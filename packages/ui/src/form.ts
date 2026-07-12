import {
  findNode,
  isPropVisible,
  type AssetStore,
  type Engine,
  type ComponentNode,
  type PropSchema,
} from '@cluion/sigil-core'
import { openMediaPicker } from './media-picker.js'

export interface FormOptions {
  engine: Engine
  node: ComponentNode
  schema: PropSchema[]
  assets?: AssetStore
}

/**
 * 依 PropSchema 生成屬性表單；支援 group 分組與 dependsOn 顯示條件
 */
export function createPropForm(opts: FormOptions): HTMLElement {
  const { engine, schema, assets } = opts
  const nodeId = opts.node.id
  const wrap = document.createElement('div')
  wrap.className = 'sigil-prop-form'

  /** prop name → 欄位根元素（用於 dependsOn 顯示切換） */
  const fieldRoots = new Map<string, HTMLElement>()

  function currentProps(): Record<string, unknown> {
    const n = findNode(engine.getTree(), nodeId)
    return n?.shortcode?.props ?? {}
  }

  function currentNode(): ComponentNode {
    return findNode(engine.getTree(), nodeId) ?? opts.node
  }

  function refreshVisibility(): void {
    const props = currentProps()
    for (const s of schema) {
      const el = fieldRoots.get(s.name)
      if (!el) continue
      el.hidden = !isPropVisible(s, props)
    }
  }

  let lastGroup: string | undefined
  for (const s of schema) {
    if (s.group && s.group !== lastGroup) {
      lastGroup = s.group
      const head = document.createElement('div')
      head.className = 'sigil-section-title'
      head.textContent = s.group
      head.dataset.propGroup = s.group
      wrap.appendChild(head)
    }

    let field: HTMLElement
    if (s.type === 'media') {
      field = createMediaField(engine, nodeId, s, currentProps()[s.name], assets, () => {
        refreshVisibility()
      })
    } else {
      field = createField(engine, nodeId, s, currentProps()[s.name], () => {
        refreshVisibility()
      })
    }
    field.dataset.propField = s.name
    fieldRoots.set(s.name, field)
    wrap.appendChild(field)
  }

  refreshVisibility()
  void currentNode
  return wrap
}

function createField(
  engine: Engine,
  nodeId: string,
  schema: PropSchema,
  value: unknown,
  onChanged: () => void,
): HTMLElement {
  const label = document.createElement('label')
  label.className = 'sigil-field'
  const span = document.createElement('span')
  span.className = 'sigil-field-label'
  span.textContent = schema.label ?? schema.name
  const control = createControl(schema, value)
  const evt = schema.type === 'text' || schema.type === 'number' ? 'input' : 'change'
  control.addEventListener(evt, () => {
    emit(engine, nodeId, schema, control)
    onChanged()
  })
  label.append(span, control)
  return label
}

function createMediaField(
  engine: Engine,
  nodeId: string,
  schema: PropSchema,
  value: unknown,
  assets: AssetStore | undefined,
  onChanged: () => void,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'
  const span = document.createElement('span')
  span.className = 'sigil-field-label'
  span.textContent = schema.label ?? schema.name

  const url = String(value ?? '')
  const preview = document.createElement('img')
  preview.className = 'sigil-img-preview'
  preview.alt = ''
  if (url) preview.src = url
  else preview.style.display = 'none'

  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  const input = document.createElement('input')
  input.className = 'sigil-input'
  input.type = 'text'
  input.dataset.prop = schema.name
  input.value = url
  input.placeholder = 'https://…'
  input.addEventListener('input', () => {
    const next = input.value
    setProp(engine, nodeId, schema.name, next)
    if (next) {
      preview.src = next
      preview.style.display = ''
    } else {
      preview.removeAttribute('src')
      preview.style.display = 'none'
    }
    onChanged()
  })
  row.appendChild(input)

  if (assets) {
    const pickBtn = document.createElement('button')
    pickBtn.type = 'button'
    pickBtn.className = 'sigil-btn'
    pickBtn.textContent = '選圖'
    pickBtn.addEventListener('click', () => {
      openMediaPicker({
        assets,
        currentUrl: input.value,
        onPick: (item) => {
          input.value = item.url
          setProp(engine, nodeId, schema.name, item.url)
          preview.src = item.url
          preview.style.display = ''
          onChanged()
        },
        onClose: () => {},
      })
    })
    row.appendChild(pickBtn)
  }

  wrap.append(span, preview, row)
  return wrap
}

function createControl(schema: PropSchema, value: unknown): HTMLElement {
  switch (schema.type) {
    case 'boolean': {
      const el = document.createElement('input')
      el.type = 'checkbox'
      el.checked = !!value
      return el
    }
    case 'select': {
      const el = document.createElement('select')
      el.className = 'sigil-input'
      for (const opt of schema.options ?? []) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label ?? opt.value
        el.appendChild(o)
      }
      el.value = String(value ?? '')
      return el
    }
    case 'color': {
      const el = document.createElement('input')
      el.className = 'sigil-input'
      el.type = 'color'
      el.value = String(value ?? '#000000')
      return el
    }
    case 'number': {
      const el = document.createElement('input')
      el.className = 'sigil-input'
      el.type = 'number'
      el.value = value === undefined ? '' : String(value)
      return el
    }
    case 'text':
    case 'media':
    default: {
      const el = document.createElement('input')
      el.className = 'sigil-input'
      el.type = 'text'
      el.value = String(value ?? '')
      return el
    }
  }
}

function setProp(engine: Engine, nodeId: string, name: string, v: unknown): void {
  const node = findNode(engine.getTree(), nodeId)
  const ref = node?.shortcode
  if (!ref) return
  engine.update(nodeId, {
    shortcode: { name: ref.name, props: { ...ref.props, [name]: v } },
  })
}

function emit(
  engine: Engine,
  nodeId: string,
  schema: PropSchema,
  control: HTMLElement,
): void {
  let v: unknown
  if (schema.type === 'boolean') {
    v = (control as HTMLInputElement).checked
  } else if (schema.type === 'number') {
    v = Number((control as HTMLInputElement).value)
  } else {
    v = (control as HTMLInputElement | HTMLSelectElement).value
  }
  setProp(engine, nodeId, schema.name, v)
}
