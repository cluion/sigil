import type { Engine, ComponentNode, PropSchema } from '@cluion/sigil-core'

export interface FormOptions {
  engine: Engine
  node: ComponentNode
  schema: PropSchema[]
}

/**
 * 依 PropSchema 生成屬性表單控制項;值變動走 engine.update
 *
 * text/number 用 input 事件(即時);select/color/boolean 用 change(定稿)
 */
export function createPropForm(opts: FormOptions): HTMLElement {
  const { engine, node, schema } = opts
  const props = node.shortcode?.props ?? {}
  const wrap = document.createElement('div')

  for (const s of schema) {
    const label = document.createElement('label')
    label.textContent = `${s.label ?? s.name}：`
    label.style.display = 'block'
    const control = createControl(s, props[s.name])
    const evt = s.type === 'text' || s.type === 'number' ? 'input' : 'change'
    control.addEventListener(evt, () => emit(engine, node, s, control))
    label.appendChild(control)
    wrap.appendChild(label)
  }
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
      el.type = 'color'
      el.value = String(value ?? '#000000')
      return el
    }
    case 'number': {
      const el = document.createElement('input')
      el.type = 'number'
      el.value = value === undefined ? '' : String(value)
      return el
    }
    case 'text':
    default: {
      const el = document.createElement('input')
      el.type = 'text'
      el.value = String(value ?? '')
      return el
    }
  }
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
    v = (control as HTMLInputElement).value
  }
  engine.update(node.id, {
    shortcode: { name: ref.name, props: { ...ref.props, [schema.name]: v } },
  })
}
