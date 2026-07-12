import type { AssetStore, Engine, ComponentNode, PropSchema } from '@cluion/sigil-core'
import { openMediaPicker } from './media-picker.js'

export interface FormOptions {
  engine: Engine
  node: ComponentNode
  schema: PropSchema[]
  assets?: AssetStore
}

/**
 * 依 PropSchema 生成屬性表單控制項;值變動走 engine.update
 */
export function createPropForm(opts: FormOptions): HTMLElement {
  const { engine, node, schema, assets } = opts
  const props = node.shortcode?.props ?? {}
  const wrap = document.createElement('div')
  wrap.className = 'sigil-prop-form'

  for (const s of schema) {
    if (s.type === 'media') {
      wrap.appendChild(createMediaField(engine, node, s, props[s.name], assets))
      continue
    }

    const label = document.createElement('label')
    label.className = 'sigil-field'
    const span = document.createElement('span')
    span.className = 'sigil-field-label'
    span.textContent = s.label ?? s.name
    const control = createControl(s, props[s.name])
    const evt = s.type === 'text' || s.type === 'number' ? 'input' : 'change'
    control.addEventListener(evt, () => emit(engine, node, s, control))
    label.append(span, control)
    wrap.appendChild(label)
  }
  return wrap
}

function createMediaField(
  engine: Engine,
  node: ComponentNode,
  schema: PropSchema,
  value: unknown,
  assets?: AssetStore,
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
    setProp(engine, node, schema.name, next)
    if (next) {
      preview.src = next
      preview.style.display = ''
    } else {
      preview.removeAttribute('src')
      preview.style.display = 'none'
    }
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
          setProp(engine, node, schema.name, item.url)
          preview.src = item.url
          preview.style.display = ''
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

function setProp(engine: Engine, node: ComponentNode, name: string, v: unknown): void {
  const ref = node.shortcode
  if (!ref) return
  engine.update(node.id, {
    shortcode: { name: ref.name, props: { ...ref.props, [name]: v } },
  })
}

function emit(engine: Engine, node: ComponentNode, schema: PropSchema, control: HTMLElement): void {
  const ref = node.shortcode
  if (!ref) return
  let v: unknown
  if (schema.type === 'boolean') {
    v = (control as HTMLInputElement).checked
  } else if (schema.type === 'number') {
    v = Number((control as HTMLInputElement).value)
  } else {
    v = (control as HTMLInputElement | HTMLSelectElement).value
  }
  setProp(engine, node, schema.name, v)
}
