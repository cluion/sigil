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
  /** select optionsFrom 用的非同步能力；未注入時動態 select 顯示「無法載入」 */
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
}

export interface PropFormHandle {
  el: HTMLElement
  destroy: () => void
}

/**
 * 依 schema 建立分組表單
 *
 * optionsFrom select 會訂閱 engine，dependsOn prop 變動時重載
 */
export function createPropForm(opts: FormOptions): PropFormHandle {
  const { engine, schema, assets, fetchJSON } = opts
  const nodeId = opts.node.id
  const wrap = document.createElement('div')
  wrap.className = 'sigil-prop-form'

  /** dependsOn 欄位索引 */
  const fieldRoots = new Map<string, HTMLElement>()
  /** optionsFrom select 的重載器，鍵為 prop name */
  const reloaders = new Map<string, () => void>()
  const disposers: (() => void)[] = []

  function currentProps(): Record<string, unknown> {
    const n = findNode(engine.getTree(), nodeId)
    return n?.shortcode?.props ?? {}
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

    // select + optionsFrom：掛載載入/重載
    if (s.type === 'select' && s.optionsFrom) {
      const sel = field.querySelector('select') as HTMLSelectElement | null
      if (sel) {
        const setup = setupOptionsFrom(
          sel,
          s,
          () => currentProps(),
          fetchJSON,
        )
        reloaders.set(s.name, setup.reload)
        disposers.push(setup.destroy)
      }
    }
  }

  refreshVisibility()

  // 訂閱 engine：dependsOn prop 變動時重載對應 optionsFrom select
  let lastProps = currentProps()
  const unsub = engine.subscribe((ev) => {
    if (ev.type !== 'patch' && ev.type !== 'tree') return
    const next = currentProps()
    for (const [name, reload] of reloaders) {
      const s = schema.find((x) => x.name === name)
      const dep = s?.dependsOn?.prop
      if (!dep) continue
      if (lastProps[dep] !== next[dep]) reload()
    }
    lastProps = next
    refreshVisibility()
  })
  disposers.push(unsub)

  return {
    el: wrap,
    destroy() {
      for (const d of disposers) d()
      disposers.length = 0
    },
  }
}

function createField(
  engine: Engine,
  nodeId: string,
  schema: PropSchema,
  value: unknown,
  onChanged: () => void,
): HTMLElement {
  // repeater 自行管理寫入，分流到專屬渲染
  if (schema.type === 'repeater') {
    return createRepeaterField(engine, nodeId, schema, value, onChanged)
  }
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

/**
 * repeater 欄位 — 可增刪的重複群組
 *
 * 每筆是一個 group，子欄位用 createControl 渲染；
 * 變動／增／刪一律從 engine 樹取最新陣列後重組整段寫入
 */
function createRepeaterField(
  engine: Engine,
  nodeId: string,
  schema: PropSchema,
  value: unknown,
  onChanged: () => void,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field sigil-repeater'
  const span = document.createElement('span')
  span.className = 'sigil-field-label'
  span.textContent = schema.label ?? schema.name
  const list = document.createElement('div')
  list.className = 'sigil-repeater-list'
  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'sigil-btn'
  addBtn.textContent = '+ 新增'

  /** 取得目前陣列（同步讀 engine 樹，保證最新） */
  function currentArray(): Record<string, unknown>[] {
    const node = findNode(engine.getTree(), nodeId)
    const v = node?.shortcode?.props?.[schema.name]
    return Array.isArray(v) ? (v as Record<string, unknown>[]).map((x) => ({ ...x })) : []
  }

  /** 寫回整個陣列 */
  function write(arr: Record<string, unknown>[]): void {
    setProp(engine, nodeId, schema.name, arr)
    onChanged()
  }

  function renderList(): void {
    list.replaceChildren()
    const arr = currentArray()
    arr.forEach((item, index) => {
      const itemWrap = document.createElement('div')
      itemWrap.className = 'sigil-repeater-item'
      const fields = document.createElement('div')
      fields.className = 'sigil-repeater-fields'
      for (const sub of schema.schema ?? []) {
        const label = document.createElement('label')
        label.className = 'sigil-field'
        const subSpan = document.createElement('span')
        subSpan.className = 'sigil-field-label'
        subSpan.textContent = sub.label ?? sub.name
        const control = createControl(sub, item[sub.name])
        const evt = sub.type === 'text' || sub.type === 'number' ? 'input' : 'change'
        control.addEventListener(evt, () => {
          const next = currentArray()
          next[index] = { ...next[index], ...readControl(sub, control) }
          write(next)
        })
        label.append(subSpan, control)
        fields.appendChild(label)
      }
      const actions = document.createElement('div')
      actions.className = 'sigil-repeater-actions'
      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'sigil-btn sigil-btn--ghost'
      delBtn.textContent = '刪除'
      delBtn.addEventListener('click', () => {
        const next = currentArray()
        next.splice(index, 1)
        write(next)
        renderList()
      })
      actions.appendChild(delBtn)
      itemWrap.append(fields, actions)
      list.appendChild(itemWrap)
    })
  }

  addBtn.addEventListener('click', () => {
    const next = currentArray()
    next.push({})
    write(next)
    renderList()
  })

  // 首次渲染：value 即 engine 樹內的 props，currentArray() 會取到同值
  void value
  renderList()
  wrap.append(span, list, addBtn)
  return wrap
}

/** 從 control 讀出 { name: value } */
function readControl(schema: PropSchema, control: HTMLElement): Record<string, unknown> {
  let v: unknown
  if (schema.type === 'boolean') {
    v = (control as HTMLInputElement).checked
  } else if (schema.type === 'number') {
    v = Number((control as HTMLInputElement).value)
  } else {
    v = (control as HTMLInputElement | HTMLSelectElement).value
  }
  return { [schema.name]: v }
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

/**
 * select + optionsFrom 的載入／重載管理
 *
 * - 每次載入用新 AbortController，舊的 abort（race 安全）
 * - 載入中顯示 placeholder；失敗顯示「載入失敗」；無 fetchJSON 顯示「無法載入」
 * - 重載後保留已選值（若新選項仍含），否則清空
 */
function setupOptionsFrom(
  sel: HTMLSelectElement,
  schema: PropSchema,
  getProps: () => Record<string, unknown>,
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>,
): { reload: () => void; destroy: () => void } {
  const fn = schema.optionsFrom!
  let ac: AbortController | null = null

  function fill(options: { value: string; label?: string }[]): void {
    // 保留已選值：優先取 props（select 空時 sel.value 不可靠）
    const keep = String(getProps()[schema.name] ?? sel.value ?? '')
    sel.replaceChildren()
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.label ?? opt.value
      sel.appendChild(o)
    }
    sel.value = options.some((o) => o.value === keep) ? keep : (options[0]?.value ?? '')
  }

  function placeholder(text: string): void {
    sel.replaceChildren()
    const o = document.createElement('option')
    o.value = ''
    o.textContent = text
    o.disabled = true
    sel.appendChild(o)
    sel.value = ''
  }

  async function load(): Promise<void> {
    ac?.abort()
    ac = new AbortController()
    const current = ac
    if (!fetchJSON) {
      placeholder('無法載入')
      return
    }
    placeholder('載入中…')
    try {
      const options = await fn({
        props: getProps(),
        fetchJSON,
        signal: current.signal,
      })
      // race 防護：只接受仍為當前的 controller 結果
      if (current !== ac) return
      fill(options)
    } catch (err) {
      if (current === ac && err instanceof DOMException && err.name === 'AbortError') return
      if (current !== ac) return
      placeholder('載入失敗')
    }
  }

  load()
  return {
    reload: load,
    destroy() {
      ac?.abort()
      ac = null
    },
  }
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
    case 'date': {
      const el = document.createElement('input')
      el.className = 'sigil-input'
      el.type = 'date'
      el.value = String(value ?? '')
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
