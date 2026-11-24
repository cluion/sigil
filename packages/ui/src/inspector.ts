import type {
  AssetStore,
  Engine,
  I18n,
  PropSchema,
  ReactiveI18n,
  ResponsiveDevice,
  RichTextResolver,
} from '@cluion/sigil-core'
import { createId, findNode, type ComponentNode } from '@cluion/sigil-core'
import { createPropForm } from './form.js'
import { subscribeLocale, uiText } from './i18n.js'
import { openMediaPicker } from './media-picker.js'
import { richTextSummary } from './rich-text.js'
import { createLinkFields } from './link-fields.js'
import {
  clearDeviceStyles,
  decorateStyleControl,
  deviceLabel,
  getDeviceStyleValue,
  inheritanceLabel,
  updateDeviceStyle,
  type DeviceStyleValue,
} from './style-device.js'

export type InspectorTab = 'content' | 'style' | 'advanced'

export interface InspectorOptions {
  getShortcodeSchema?: (name: string) => PropSchema[] | undefined
  richText?: RichTextResolver
  assets?: AssetStore
  i18n?: I18n
  device?: ResponsiveDevice
  /** select optionsFrom 用的非同步能力 */
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
}

export interface InspectorHandle {
  setDevice(device: ResponsiveDevice): void
  /** Open the asset picker for the selected image and return its close callback. */
  replaceImage?: (id: string, trigger: HTMLElement) => (() => void) | undefined
  destroy(): void
}

/**
 * 產品殼 Inspector：分頁「內容｜樣式｜進階」
 */
export function createInspector(
  engine: Engine,
  container: HTMLElement,
  opts?: InspectorOptions,
): InspectorHandle {
  container.classList.add('sigil-inspector')
  container.replaceChildren()

  const tabs = document.createElement('div')
  tabs.className = 'sigil-tabs'
  tabs.setAttribute('role', 'tablist')

  const body = document.createElement('div')
  body.className = 'sigil-inspector-body'
  body.id = `sigil-inspector-${createId()}`
  body.setAttribute('role', 'tabpanel')

  let tab: InspectorTab = 'content'
  let device: ResponsiveDevice = opts?.device ?? 'desktop'
  let destroyed = false
  let imagePicker: { id: string; close: () => void } | null = null

  function replaceImage(id: string, trigger: HTMLElement): (() => void) | undefined {
    if (destroyed || !opts?.assets || engine.getSelection() !== id) return
    const node = findNode(engine.getTree(), id)
    if (node?.type !== 'image' || node.locked) return
    if (imagePicker) return imagePicker.close
    trigger.focus({ preventScroll: true })
    const close = openMediaPicker({
      assets: opts.assets,
      i18n: opts.i18n,
      currentUrl: node.attributes?.src,
      onPick: (item) => {
        const current = findNode(engine.getTree(), id)
        if (
          engine.getSelection() === id &&
          current?.type === 'image' &&
          !current.locked &&
          current.attributes?.src !== item.url
        )
          engine.update(id, { attributes: { src: item.url } })
      },
      onClose: () => {
        imagePicker = null
      },
    })
    imagePicker = { id, close }
    return close
  }
  const tabBtns: Record<InspectorTab, HTMLButtonElement> = {
    content: makeTab('content', uiText(opts?.i18n, 'inspector.tab_content', '內容')),
    style: makeTab('style', uiText(opts?.i18n, 'inspector.tab_style', '樣式')),
    advanced: makeTab('advanced', uiText(opts?.i18n, 'inspector.tab_advanced', '進階')),
  }
  for (const b of Object.values(tabBtns)) tabs.appendChild(b)
  tabs.addEventListener('keydown', (event) => {
    if (destroyed) return
    const buttons = Object.values(tabBtns)
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index === -1) return
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % buttons.length
        break
      case 'ArrowLeft':
        next = (index + buttons.length - 1) % buttons.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = buttons.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    buttons[next]!.focus()
    buttons[next]!.click()
  })
  container.append(tabs, body)

  function makeTab(id: InspectorTab, label: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sigil-tab'
    btn.textContent = label
    btn.setAttribute('role', 'tab')
    btn.id = `${body.id}-${id}`
    btn.setAttribute('aria-controls', body.id)
    btn.addEventListener('click', () => {
      if (destroyed || tab === id) return
      tab = id
      render()
    })
    return btn
  }

  function syncTabs(): void {
    for (const [k, btn] of Object.entries(tabBtns) as [InspectorTab, HTMLButtonElement][]) {
      const on = k === tab
      btn.tabIndex = on ? 0 : -1
      btn.classList.toggle('sigil-tab--active', on)
      btn.setAttribute('aria-selected', String(on))
    }
    body.setAttribute('aria-labelledby', tabBtns[tab].id)
  }

  const openStyleSections = new Set(['layout'])
  const contentDisposers: (() => void)[] = []
  const contentLocaleRefreshers: (() => void)[] = []

  function disposeContent(): void {
    for (const dispose of contentDisposers.splice(0)) dispose()
    contentLocaleRefreshers.length = 0
  }

  function render(): void {
    if (destroyed) return
    syncTabs()
    disposeContent()
    body.replaceChildren()
    const id = engine.getSelection()
    if (!id) {
      const empty = document.createElement('div')
      empty.className = 'sigil-empty'
      const t = document.createElement('p')
      t.className = 'sigil-muted'
      t.textContent = uiText(opts?.i18n, 'inspector.empty', '尚未選取元件')
      const tip = document.createElement('p')
      tip.className = 'sigil-muted'
      tip.style.marginTop = '8px'
      tip.textContent = uiText(
        opts?.i18n,
        'inspector.empty_hint',
        '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。',
      )
      empty.append(t, tip)
      body.appendChild(empty)
      contentLocaleRefreshers.push(() => {
        t.textContent = uiText(opts?.i18n, 'inspector.empty', '尚未選取元件')
        tip.textContent = uiText(
          opts?.i18n,
          'inspector.empty_hint',
          '在畫布點一下區塊，即可編輯內容、樣式與進階屬性。',
        )
      })
      return
    }
    const node = findNode(engine.getTree(), id)
    if (!node) return

    const head = document.createElement('div')
    head.className = 'sigil-inspector-head'
    head.textContent = node.name?.trim() || node.type
    body.appendChild(head)

    if (tab === 'content')
      renderContent(
        body,
        engine,
        node,
        opts,
        (fn) => contentDisposers.push(fn),
        (fn) => contentLocaleRefreshers.push(fn),
        opts?.assets ? replaceImage : undefined,
      )
    else if (tab === 'style')
      renderStyle(
        body,
        engine,
        node,
        device,
        openStyleSections,
        (fn) => contentDisposers.push(fn),
        opts?.i18n,
      )
    else renderAdvanced(body, engine, node, opts?.i18n)
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') {
      imagePicker?.close()
      render()
    } else if (imagePicker && ev.type === 'patch') {
      const node = findNode(engine.getTree(), imagePicker.id)
      if (node?.type !== 'image' || node.locked) imagePicker.close()
    }
  })
  const unsubLocale = subscribeLocale(opts?.i18n, () => {
    tabBtns.content.textContent = uiText(opts?.i18n, 'inspector.tab_content', '內容')
    tabBtns.style.textContent = uiText(opts?.i18n, 'inspector.tab_style', '樣式')
    tabBtns.advanced.textContent = uiText(opts?.i18n, 'inspector.tab_advanced', '進階')
    // Content controls (including an open media picker) retain their current operation.
    if (tab === 'content') {
      for (const refresh of contentLocaleRefreshers) refresh()
    } else render()
  })
  render()
  return {
    replaceImage,
    setDevice(next) {
      if (destroyed || device === next) return
      device = next
      if (tab === 'style') render()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      imagePicker?.close()
      disposeContent()
      unsub()
      unsubLocale()
    },
  }
}

function renderContent(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  opts?: InspectorOptions,
  registerDestroy?: (fn: () => void) => void,
  registerLocaleRefresh?: (fn: () => void) => void,
  replaceImage?: InspectorHandle['replaceImage'],
): void {
  const isRichText = opts?.richText?.supports(node) ?? false
  if (isRichText && opts?.richText) {
    const wrap = document.createElement('div')
    wrap.className = 'sigil-field sigil-rich-text-field'
    const label = document.createElement('span')
    label.className = 'sigil-field-label'
    label.textContent = uiText(opts.i18n, 'rich_text.summary', '富文字摘要')
    const summary = document.createElement('p')
    summary.className = 'sigil-rich-text-summary'
    summary.textContent =
      richTextSummary(opts.richText.read(node)) ||
      uiText(opts.i18n, 'rich_text.empty', '空白富文字')
    const hint = document.createElement('p')
    hint.className = 'sigil-muted sigil-rich-text-hint'
    hint.textContent = uiText(opts.i18n, 'rich_text.canvas_hint', '請在畫布編輯富文字')
    wrap.append(label, summary, hint)
    container.appendChild(wrap)
    registerLocaleRefresh?.(() => {
      const currentNode = findNode(engine.getTree(), node.id) ?? node
      label.textContent = uiText(opts.i18n, 'rich_text.summary', '富文字摘要')
      summary.textContent =
        richTextSummary(opts.richText!.read(currentNode)) ||
        uiText(opts.i18n, 'rich_text.empty', '空白富文字')
      hint.textContent = uiText(opts.i18n, 'rich_text.canvas_hint', '請在畫布編輯富文字')
    })
  } else if (node.type === 'text' || node.type === 'button') {
    const contentField = field(
      container,
      uiText(opts?.i18n, 'inspector.tab_content', '內容'),
      () => {
        const input = document.createElement('input')
        input.className = 'sigil-input'
        input.value = node.content ?? ''
        input.addEventListener('input', () => engine.update(node.id, { content: input.value }))
        return input
      },
    )
    registerLocaleRefresh?.(() => {
      contentField.querySelector('.sigil-field-label')!.textContent = uiText(
        opts?.i18n,
        'inspector.tab_content',
        '內容',
      )
    })
  }
  if (node.tagName?.toLowerCase() === 'a' && !node.shortcode) {
    const link = createLinkFields(engine, node, opts?.i18n)
    container.append(link.el)
    registerDestroy?.(link.destroy)
    registerLocaleRefresh?.(link.refreshLocale)
  }
  if (node.type === 'image') {
    appendImageFields(
      container,
      engine,
      node,
      replaceImage,
      opts?.i18n,
      registerDestroy,
      registerLocaleRefresh,
    )
  }
  if (node.shortcode) {
    const h = document.createElement('h4')
    h.className = 'sigil-section-title'
    h.textContent = `shortcode · ${node.shortcode.name}`
    container.appendChild(h)
    const schema = opts?.getShortcodeSchema?.(node.shortcode.name)
    if (schema?.length) {
      const formHandle = createPropForm({
        engine,
        node,
        schema,
        assets: opts?.assets,
        i18n: opts?.i18n,
        fetchJSON: opts?.fetchJSON,
      })
      registerDestroy?.(formHandle.destroy)
      container.appendChild(formHandle.el)
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
    !isRichText &&
    node.type !== 'text' &&
    node.type !== 'button' &&
    node.type !== 'image' &&
    node.tagName?.toLowerCase() !== 'a' &&
    !node.shortcode
  ) {
    const p = document.createElement('p')
    p.className = 'sigil-muted'
    p.textContent = uiText(
      opts?.i18n,
      'inspector.no_content',
      '此節點無可編輯內容欄位，可切到樣式分頁',
    )
    container.appendChild(p)
    registerLocaleRefresh?.(() => {
      p.textContent = uiText(
        opts?.i18n,
        'inspector.no_content',
        '此節點無可編輯內容欄位，可切到樣式分頁',
      )
    })
  }
}

function appendImageFields(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  replaceImage?: InspectorHandle['replaceImage'],
  i18n?: I18n,
  registerDestroy?: (fn: () => void) => void,
  registerLocaleRefresh?: (fn: () => void) => void,
): void {
  let disposed = false
  let closePicker: (() => void) | null = null
  registerDestroy?.(() => {
    disposed = true
    closePicker?.()
    closePicker = null
  })
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'

  const label = document.createElement('label')
  label.className = 'sigil-field-label'
  label.textContent = uiText(i18n, 'inspector.image', '圖片')

  const preview = document.createElement('img')
  preview.className = 'sigil-img-preview'
  preview.alt = ''

  const input = document.createElement('input')
  input.id = `sigil-image-url-${createId()}`
  label.htmlFor = input.id
  input.className = 'sigil-input'
  const sourceNote = document.createElement('span')
  sourceNote.id = input.id + '-source'
  sourceNote.className = 'sigil-muted'

  function syncSource(src: string): void {
    const embedded = /^\s*data:/i.test(src)
    const value = embedded ? '' : src
    if (input.value !== value) input.value = value
    input.placeholder = embedded
      ? uiText(i18n, 'inspector.replace_image_url', '貼上圖片網址以更換')
      : 'https://…'
    sourceNote.hidden = !embedded
    if (embedded) {
      const format = /^\s*data:image\/([a-z0-9-]{1,32})(?:\+xml)?[;,]/i.exec(src)?.[1]
      const caption = uiText(i18n, 'inspector.embedded_image', '已嵌入圖片')
      sourceNote.textContent = format ? caption + ' · ' + format.toUpperCase() : caption
      input.setAttribute('aria-describedby', sourceNote.id)
    } else {
      sourceNote.textContent = ''
      input.removeAttribute('aria-describedby')
    }
    if ((preview.getAttribute('src') ?? '') !== src) {
      if (src) preview.src = src
      else preview.removeAttribute('src')
    }
    preview.style.display = src ? '' : 'none'
  }
  syncSource(node.attributes?.src ?? '')
  function updateSource(next: string): void {
    if (disposed) return
    const current = findNode(engine.getTree(), node.id)
    if (!current) return
    engine.update(node.id, { attributes: { ...current.attributes, src: next } })
  }
  input.addEventListener('input', () => updateSource(input.value))

  const row = document.createElement('div')
  row.className = 'sigil-field-row'
  row.appendChild(input)

  if (replaceImage) {
    const pickBtn = document.createElement('button')
    pickBtn.type = 'button'
    pickBtn.className = 'sigil-btn'
    pickBtn.textContent = uiText(i18n, 'form.pick_image', '選圖')
    pickBtn.addEventListener('click', () => {
      if (!disposed) closePicker = replaceImage(node.id, pickBtn) ?? null
    })
    registerLocaleRefresh?.(() => {
      pickBtn.textContent = uiText(i18n, 'form.pick_image', '選圖')
    })
    row.appendChild(pickBtn)
  }

  wrap.append(label, preview, sourceNote, row)
  container.appendChild(wrap)
  const altField = field(container, uiText(i18n, 'inspector.image_alt', '替代文字'), () => {
    const alt = document.createElement('input')
    alt.className = 'sigil-input'
    alt.value = node.attributes?.alt ?? ''
    alt.addEventListener('input', () => {
      const current = findNode(engine.getTree(), node.id)
      if (!disposed && current)
        engine.update(node.id, { attributes: { ...current.attributes, alt: alt.value } })
    })
    return alt
  })
  const altInput = altField.querySelector('input')!
  registerDestroy?.(
    engine.subscribe((event) => {
      if (
        event.type !== 'patch' ||
        event.patch.type !== 'update' ||
        event.patch.id !== node.id ||
        !event.patch.attrs
      )
        return
      const attrs = event.patch.attrs
      if (attrs.alt !== undefined && altInput.value !== attrs.alt) altInput.value = attrs.alt
      if (attrs.src !== undefined) syncSource(attrs.src)
    }),
  )
  registerLocaleRefresh?.(() => {
    label.textContent = uiText(i18n, 'inspector.image', '圖片')
    syncSource(preview.getAttribute('src') ?? '')
    altField.querySelector('.sigil-field-label')!.textContent = uiText(
      i18n,
      'inspector.image_alt',
      '替代文字',
    )
  })
}

type StyleCaption = readonly [zh: string, en: string]
type StyleChoice = readonly [value: string, zh: string, en: string]

const styleLabels: Record<string, StyleCaption> = {
  display: ['顯示方式', 'Display'],
  'flex-direction': ['排列方向', 'Direction'],
  'justify-content': ['排列對齊', 'Main axis alignment'],
  'align-items': ['項目對齊', 'Item alignment'],
  gap: ['項目間距', 'Item gap'],
  margin: ['外距', 'Margin'],
  padding: ['內距', 'Padding'],
  width: ['寬度', 'Width'],
  height: ['高度', 'Height'],
  'font-size': ['字級', 'Font size'],
  'font-weight': ['字重', 'Font weight'],
  'text-align': ['文字對齊', 'Text alignment'],
  color: ['文字顏色', 'Text color'],
  'background-color': ['背景顏色', 'Background color'],
  border: ['邊框', 'Border'],
  'border-radius': ['圓角', 'Corner radius'],
  'box-shadow': ['陰影', 'Shadow'],
}

const alignChoices: readonly StyleChoice[] = [
  ['flex-start', '起點', 'Start'],
  ['center', '置中', 'Center'],
  ['flex-end', '終點', 'End'],
]

const styleChoices: Record<string, readonly StyleChoice[]> = {
  display: [
    ['block', '區塊', 'Block'],
    ['inline', '行內', 'Inline'],
    ['inline-block', '行內區塊', 'Inline block'],
    ['flex', '彈性排列', 'Flex'],
    ['inline-flex', '行內彈性排列', 'Inline flex'],
    ['grid', '格線', 'Grid'],
    ['none', '隱藏', 'Hidden'],
  ],
  'flex-direction': [
    ['row', '橫向', 'Row'],
    ['column', '直向', 'Column'],
    ['row-reverse', '反向橫排', 'Reverse row'],
    ['column-reverse', '反向直排', 'Reverse column'],
  ],
  'justify-content': [
    ...alignChoices,
    ['space-between', '兩端對齊', 'Space between'],
    ['space-around', '項目兩側均分', 'Space around'],
    ['space-evenly', '全部間距相等', 'Space evenly'],
  ],
  'align-items': [
    ['stretch', '拉伸', 'Stretch'],
    ...alignChoices,
    ['baseline', '文字基線', 'Text baseline'],
  ],
  gap: [
    ['0', '無間距', 'None'],
    ['0.5rem', '緊湊', 'Compact'],
    ['1rem', '標準', 'Standard'],
    ['2rem', '寬鬆', 'Spacious'],
  ],
  'font-weight': [
    ['normal', '一般', 'Regular'],
    ['600', '半粗體', 'Semibold'],
    ['bold', '粗體', 'Bold'],
  ],
  'text-align': [
    ['left', '靠左', 'Left'],
    ['center', '置中', 'Center'],
    ['right', '靠右', 'Right'],
    ['justify', '左右對齊', 'Justify'],
  ],
}

function styleCaption(i18n: I18n | undefined, key: string, [zh, en]: StyleCaption): string {
  return uiText(i18n, key, (i18n as Partial<ReactiveI18n>)?.getLocale?.() === 'en' ? en : zh)
}

function renderStyle(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  device: ResponsiveDevice,
  expanded: Set<string>,
  registerDestroy: (dispose: () => void) => void,
  i18n?: I18n,
): void {
  const listeners = new AbortController()
  const { signal } = listeners
  registerDestroy(() => listeners.abort())
  const refreshers: ((current: ComponentNode) => void)[] = []
  function watch(refresh: (current: ComponentNode) => void): void {
    refresh(node)
    refreshers.push(refresh)
  }
  registerDestroy(
    engine.subscribe((event) => {
      if (event.type !== 'patch' || event.patch.type !== 'update' || event.patch.id !== node.id)
        return
      const { style, responsiveStyles, locked } = event.patch
      if (!style && !responsiveStyles && locked === undefined) return
      const current = findNode(engine.getTree(), node.id)
      if (current) for (const refresh of refreshers) refresh(current)
    }),
  )

  const context = document.createElement('div')
  context.className = 'sigil-responsive-style-context'
  context.dataset.styleDevice = device
  const contextTitle = document.createElement('strong')
  contextTitle.textContent = deviceLabel(device, i18n)
  const contextHint = document.createElement('span')
  contextHint.textContent = inheritanceLabel(device, i18n)
  context.append(contextTitle, contextHint)
  container.appendChild(context)

  function section(key: string, title: string): HTMLElement {
    const heading = document.createElement('h4')
    heading.className = 'sigil-section-title sigil-style-section-title'
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.textContent = uiText(i18n, `inspector.${key}`, title)
    const body = document.createElement('div')
    body.id = `${container.id}-style-${key}`
    body.className = 'sigil-style-section'
    toggle.setAttribute('aria-controls', body.id)
    function show(open: boolean): void {
      body.hidden = !open
      toggle.setAttribute('aria-expanded', String(open))
    }
    show(expanded.has(key))
    toggle.addEventListener(
      'click',
      () => {
        if (expanded.has(key)) expanded.delete(key)
        else expanded.add(key)
        show(expanded.has(key))
      },
      { signal },
    )
    heading.appendChild(toggle)
    container.append(heading, body)
    return body
  }

  function label(prop: string): string {
    return styleCaption(i18n, `style.property.${prop}`, styleLabels[prop]!)
  }
  function bind(
    prop: string,
    input: HTMLInputElement | HTMLSelectElement,
    refresh: (value: DeviceStyleValue) => void,
  ): HTMLElement {
    input.className = 'sigil-input'
    input.dataset.styleProperty = prop
    return decorateStyleControl(
      input,
      engine,
      node,
      device,
      prop,
      getDeviceStyleValue(node, device, prop),
      i18n,
      (describe) =>
        watch((current) => {
          const value = getDeviceStyleValue(current, device, prop)
          input.disabled = !!current.locked
          refresh(value)
          describe(value)
        }),
      signal,
    )
  }

  function textField(parent: HTMLElement, prop: string, color = false): HTMLElement {
    const input = document.createElement('input')
    input.type = color ? 'color' : 'text'
    if (prop === 'padding' || prop === 'margin') input.placeholder = '16px'
    input.addEventListener(
      'input',
      () => updateDeviceStyle(engine, node.id, device, prop, input.value),
      { signal },
    )
    const row = bind(prop, input, (value) => {
      let next = value.override ?? ''
      if (color) {
        const hex = value.effective ?? ''
        next = /^#[\da-f]{6}$/i.test(hex)
          ? hex
          : /^#[\da-f]{3}$/i.test(hex)
            ? '#' + [...hex.slice(1)].map((digit) => digit + digit).join('')
            : '#000000'
      }
      if (input.value !== next) input.value = next
    })
    return field(parent, label(prop), () => row)
  }

  function choiceField(parent: HTMLElement, prop: string): void {
    const select = document.createElement('select')
    const custom = document.createElement('input')
    custom.className = 'sigil-input sigil-style-custom'
    const customLabel = styleCaption(i18n, 'style.custom_value', [
      '自訂 CSS 值',
      'Custom CSS value',
    ])
    custom.setAttribute('aria-label', `${customLabel} · ${label(prop)}`)
    const customMode = '__sigil_custom__'
    const empty = document.createElement('option')
    empty.value = ''
    select.appendChild(empty)
    const captions = new Map<string, string>()
    for (const [value, zh, en] of styleChoices[prop]!) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = styleCaption(i18n, `style.option.${prop}.${value}`, [zh, en])
      captions.set(value, option.textContent)
      select.appendChild(option)
    }
    const other = document.createElement('option')
    other.value = customMode
    other.textContent = customLabel
    select.appendChild(other)
    let editing = false
    let lastOverride: string | undefined
    const row = bind(prop, select, (value) => {
      if (value.override !== lastOverride) editing = false
      lastOverride = value.override
      const explicit = value.override ?? ''
      const inherited = value.effective ?? ''
      empty.textContent = value.inherited
        ? `${uiText(i18n, 'style.inherit', '繼承')} ${captions.get(inherited) ?? inherited}`
        : uiText(i18n, 'style.unset_short', '未設')
      const showCustom = editing || (!!explicit && !captions.has(explicit))
      select.value = showCustom ? customMode : explicit
      custom.hidden = !showCustom
      custom.disabled = select.disabled
      if (custom.value !== explicit) custom.value = explicit
      custom.placeholder = value.inherited ? inherited : ''
    })
    const fieldBox = field(parent, label(prop), () => row)
    fieldBox.appendChild(custom)
    select.addEventListener(
      'change',
      () => {
        editing = select.value === customMode
        custom.hidden = !editing
        if (editing) custom.focus()
        else updateDeviceStyle(engine, node.id, device, prop, select.value)
      },
      { signal },
    )
    custom.addEventListener(
      'input',
      () => {
        lastOverride = custom.value || undefined
        editing = true
        updateDeviceStyle(engine, node.id, device, prop, custom.value)
      },
      { signal },
    )
  }

  const layout = section('layout', '版面')
  choiceField(layout, 'display')
  const flex = document.createElement('div')
  for (const prop of ['flex-direction', 'justify-content', 'align-items']) choiceField(flex, prop)
  const gaps = document.createElement('div')
  choiceField(gaps, 'gap')
  layout.append(flex, gaps)
  watch((current) => {
    const tokens = (getDeviceStyleValue(current, device, 'display').effective ?? '')
      .toLowerCase()
      .split(/\s+/)
    flex.hidden = !tokens.some((token) => token === 'flex' || token === 'inline-flex')
    gaps.hidden =
      flex.hidden && !tokens.some((token) => token === 'grid' || token === 'inline-grid')
  })

  const padding = textField(layout, 'padding')
  const presets = document.createElement('div')
  presets.className = 'sigil-padding-presets'
  presets.setAttribute('role', 'group')
  presets.setAttribute('aria-label', label('padding'))
  for (const [key, value, zh, en] of [
    ['compact', '0.5rem', '緊湊', 'Compact'],
    ['standard', '1rem', '標準', 'Standard'],
    ['spacious', '2rem', '寬鬆', 'Spacious'],
  ] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sigil-btn sigil-btn--ghost'
    button.value = value
    button.textContent = styleCaption(i18n, `style.spacing.${key}`, [zh, en])
    button.title = `${button.textContent} (${value})`
    button.addEventListener(
      'click',
      () => updateDeviceStyle(engine, node.id, device, 'padding', value),
      { signal },
    )
    presets.appendChild(button)
  }
  padding.insertBefore(presets, padding.lastElementChild)
  watch((current) => {
    const value = getDeviceStyleValue(current, device, 'padding')
    for (const button of presets.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.value === value.override))
      button.disabled = !!current.locked
    }
  })
  for (const prop of ['margin', 'width', 'height']) textField(layout, prop)

  const typography = section('typography', '文字')
  textField(typography, 'font-size')
  choiceField(typography, 'font-weight')
  choiceField(typography, 'text-align')
  textField(typography, 'color', true)
  const appearance = section('appearance', '外觀')
  textField(appearance, 'background-color', true)
  for (const prop of ['border', 'border-radius', 'box-shadow']) textField(appearance, prop)

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'sigil-btn'
  reset.textContent =
    device === 'desktop'
      ? uiText(i18n, 'style.clear_desktop', '清除桌面樣式')
      : `${uiText(i18n, 'style.clear', '清除')} ${deviceLabel(device, i18n)} ${uiText(i18n, 'style.override', '覆寫')}`
  reset.addEventListener('click', () => clearDeviceStyles(engine, node.id, device), { signal })
  watch((current) => {
    const styles = device === 'desktop' ? current.style : current.responsiveStyles?.[device]
    reset.disabled = !!current.locked || !styles || !Object.keys(styles).length
  })
  container.appendChild(reset)
}

function renderAdvanced(
  container: HTMLElement,
  engine: Engine,
  node: ComponentNode,
  i18n?: I18n,
): void {
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
    del.textContent = uiText(i18n, 'inspector.delete_component', '刪除元件')
    del.addEventListener('click', () => engine.remove(node.id))
    container.appendChild(del)
  }
}

function field(container: HTMLElement, label: string, control: () => HTMLElement): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'
  const caption = document.createElement('label')
  caption.className = 'sigil-field-label'
  caption.textContent = label
  const content = control()
  const input = content.matches('input,select') ? content : content.querySelector('input,select')
  if (input) {
    input.id = `sigil-field-${createId()}`
    caption.htmlFor = input.id
  }
  wrap.append(caption, content)
  container.appendChild(wrap)
  return wrap
}
