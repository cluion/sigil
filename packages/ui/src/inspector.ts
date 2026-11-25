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
import { createFAQFields, type FAQEditingOptions } from './faq-fields.js'
import { createColorField } from './color-field.js'
import { createTypographyFields, preserveTypographyFocus } from './typography-fields.js'
import type { AcceptsTypographyValue } from './typography.js'
import {
  bindBoxShorthand,
  createBoxSpacingField,
  preserveBoxSpacingFocus,
} from './box-spacing-field.js'
import { boxSides, readBoxSpacing, setBoxShorthand, type BoxProperty } from './box-spacing.js'
import { createAnchorField } from './anchor-field.js'
import { createGridColumns, supportsGridColumns } from './grid-columns.js'
import { createGridItem } from './grid-item.js'
import { createFlexWrapField, readFlexDirection, setFlexDirection } from './flex-wrap-field.js'
import {
  createLayoutGapField,
  gapValidationMessage,
  preserveLayoutFocus,
  readUniformGap,
} from './layout-gap-field.js'
import { setUniformGap } from './layout-gap.js'
import { bindStyleDraft } from './style-draft.js'
import { renameLayer } from './layers.js'
import { createImageFraming, supportsImageFraming } from './image-framing.js'
import { createPropForm } from './form.js'
import { subscribeLocale, uiText } from './i18n.js'
import { createImageFields, createImageReplacement } from './image-fields.js'
import { createImageLinkField } from './image-link-field.js'
import { readImageLink } from './image-link.js'
import { richTextSummary } from './rich-text.js'
import { mountTextFormat } from './text-format.js'
import { canEditPlainContent, createTextContent } from './text-content.js'
import { createLinkFields, isNativeLink } from './link-fields.js'
import { createStyleTransfer } from './style-transfer.js'
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

function hasAnchorShortcut(node: ComponentNode): boolean {
  return (
    !node.shortcode &&
    (node.type === 'section' ||
      Object.keys(node.attributes ?? {}).some((key) => key.toLowerCase() === 'id'))
  )
}

export interface InspectorOptions {
  /** 檢查文字樣式是否可在宿主儲存。 */
  acceptsTypographyValue?: AcceptsTypographyValue
  /** 檢查單邊間距是否可在宿主儲存。 */
  acceptsSpacingValue?: (value: string) => boolean
  /** 檢查色值是否可在宿主儲存。 */
  acceptsColorValue?: (value: string) => boolean
  /** 檢查通過瀏覽器語法驗證的自訂欄寬是否可在宿主儲存。 */
  acceptsCustomGridTracks?: (value: string) => boolean
  onRevealLinkTarget?: () => void
  faq?: FAQEditingOptions
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
  openImageFraming?: (id: string) => void
  openImageLink?: (id: string) => void
  openLeadingText?: (id: string) => void
  openLinkSettings?: (id: string, focus?: 'kind' | 'address') => void
  openTypography?: (id: string) => void
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
  const imageReplacement = createImageReplacement(engine, opts)
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
  const styleTransfer = createStyleTransfer(engine, opts?.i18n)
  const contentDisposers: (() => void)[] = []
  const contentLocaleRefreshers: (() => void)[] = []

  function openImageFraming(id: string): void {
    if (destroyed || engine.getSelection() !== id) return
    const node = findNode(engine.getTree(), id)
    if (!node || !supportsImageFraming(node)) return
    tabBtns.style.click()
    body.querySelector<HTMLElement>('.sigil-image-framing')?.focus()
  }

  function openLinkSettings(id: string, focus: 'kind' | 'address' = 'kind'): void {
    if (destroyed || engine.getSelection() !== id) return
    const node = findNode(engine.getTree(), id)
    if (!node || !isNativeLink(node)) return
    tabBtns.content.click()
    const selector = focus === 'address' ? '.sigil-link-address input' : '[data-link-kind]'
    const field = body.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
    if (field && !field.disabled) field.focus()
    else tabBtns.content.focus()
  }

  function openImageLink(id: string): void {
    if (destroyed || engine.getSelection() !== id) return
    if (!readImageLink(engine.getTree(), id, { richText: opts?.richText })?.canEdit) return
    tabBtns.content.click()
    body.querySelector<HTMLInputElement>('input[data-image-link-address]')?.focus()
  }

  function openLeadingText(id: string): void {
    if (destroyed || engine.getSelection() !== id) return
    const node = findNode(engine.getTree(), id)
    if (!node?.children?.length || node.locked || !canEditPlainContent(node)) return
    if (opts?.richText?.supports(node)) return
    tabBtns.content.click()
    body.querySelector<HTMLInputElement>('input[data-leading-text]:enabled')?.focus()
  }

  function openTypography(id: string): void {
    if (destroyed || engine.getSelection() !== id) return
    tabBtns.style.click()
    body
      .querySelector<HTMLButtonElement>(
        `button[aria-controls="${body.id}-style-typography"][aria-expanded="false"]`,
      )
      ?.click()
    const preset = body.querySelector<HTMLSelectElement>('[data-typography-preset]:enabled')
    ;(preset ?? tabBtns.style).focus()
  }

  function disposeContent(): void {
    for (const dispose of contentDisposers.splice(0)) dispose()
    contentLocaleRefreshers.length = 0
  }

  function addShortcut(className: string, key: string, fallback: string, open: () => void): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'sigil-btn sigil-btn--ghost ' + className
    const caption = () => {
      button.textContent = uiText(opts?.i18n, key, fallback)
    }
    caption()
    button.addEventListener('click', open)
    body.append(button)
    contentLocaleRefreshers.push(caption)
    contentDisposers.push(() => button.removeEventListener('click', open))
  }

  function render(): void {
    if (destroyed) return
    const refocusStyle =
      preserveTypographyFocus(body, engine.getSelection()) ??
      preserveBoxSpacingFocus(body, engine.getSelection()) ??
      preserveLayoutFocus(body, engine.getSelection())
    const active = document.activeElement
    const restoreFormat =
      active instanceof HTMLSelectElement &&
      body.contains(active) &&
      active.dataset.textFormat === engine.getSelection()
    syncTabs()
    styleTransfer.detach()
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

    if (tab === 'content') {
      renderContent(
        body,
        engine,
        node,
        opts,
        (fn) => contentDisposers.push(fn),
        (fn) => contentLocaleRefreshers.push(fn),
        imageReplacement.replaceImageAttributes,
      )
      if (restoreFormat)
        body.querySelector<HTMLSelectElement>('[data-text-format]')?.focus({ preventScroll: true })
      if (supportsImageFraming(node)) {
        addShortcut('sigil-framing-action', 'image.framing_action', '調整圖片構圖', () =>
          openImageFraming(node.id),
        )
      }
      if (hasAnchorShortcut(node)) {
        addShortcut('sigil-anchor-action', 'anchor.edit', '編輯頁內錨點', () => {
          tabBtns.advanced.click()
          const field = body.querySelector<HTMLElement>('.sigil-anchor-field')
          ;(
            field?.querySelector<HTMLElement>('[data-anchor-name]:enabled, button:enabled') ??
            tabBtns.advanced
          ).focus()
        })
      }
    } else if (tab === 'style') {
      renderStyle(
        body,
        engine,
        node,
        device,
        openStyleSections,
        styleTransfer,
        (fn) => contentDisposers.push(fn),
        opts,
      )
      refocusStyle?.()
    } else {
      addShortcut('sigil-rename-layer', 'layers.rename', '重新命名圖層', () => {
        const current = findNode(engine.getTree(), id)
        if (current) renameLayer(engine, current, opts?.i18n)
      })
      if (!node.shortcode) {
        const anchor = createAnchorField(engine, node, opts?.i18n)
        body.append(anchor.el)
        contentDisposers.push(anchor.destroy)
        contentLocaleRefreshers.push(anchor.refreshLocale)
      }
      renderAdvanced(body, engine, node, opts?.i18n, (refresh) =>
        contentLocaleRefreshers.push(refresh),
      )
    }
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') {
      render()
    } else if (ev.type === 'patch') {
      const selection = engine.getSelection()
      if (ev.patch.type === 'replace' && selection && findNode(ev.patch.node, selection)) render()
      if (ev.patch.type === 'update' && ev.patch.name !== undefined && ev.patch.id === selection) {
        const node = findNode(engine.getTree(), ev.patch.id)
        const head = body.querySelector<HTMLElement>('.sigil-inspector-head')
        if (node && head) head.textContent = node.name?.trim() || node.type
      }
    }
  })
  const unsubLocale = subscribeLocale(opts?.i18n, () => {
    tabBtns.content.textContent = uiText(opts?.i18n, 'inspector.tab_content', '內容')
    tabBtns.style.textContent = uiText(opts?.i18n, 'inspector.tab_style', '樣式')
    tabBtns.advanced.textContent = uiText(opts?.i18n, 'inspector.tab_advanced', '進階')
    if (tab !== 'style') {
      for (const refresh of contentLocaleRefreshers) refresh()
    } else render()
  })
  render()
  return {
    replaceImage: imageReplacement.replaceImage,
    openImageFraming,
    openImageLink,
    openLeadingText,
    openLinkSettings,
    openTypography,
    setDevice(next) {
      if (destroyed || device === next) return
      device = next
      if (tab === 'style') render()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      imageReplacement.destroy()
      styleTransfer.destroy()
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
  if (!isRichText) {
    const faq = createFAQFields(container, engine, node, opts?.faq, opts?.i18n)
    if (faq) {
      registerDestroy?.(faq.destroy)
      registerLocaleRefresh?.(faq.refreshLocale)
      return
    }
  }
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
  } else if (canEditPlainContent(node)) {
    const content = createTextContent(engine, node, opts?.i18n, () =>
      uiText(opts?.i18n, 'inspector.tab_content', '內容'),
    )
    content.input.classList.add('sigil-input')
    registerDestroy?.(content.destroy)
    field(container, content.caption, () => content.input)
    registerLocaleRefresh?.(content.refreshLocale)
    const format = mountTextFormat(container, engine, node, opts?.richText, opts?.i18n)
    if (format) {
      registerDestroy?.(format.destroy)
      registerLocaleRefresh?.(format.refreshLocale)
    }
  }
  if (isNativeLink(node)) {
    const link = createLinkFields(engine, node, opts?.i18n, opts?.onRevealLinkTarget)
    container.append(link.el)
    registerDestroy?.(link.destroy)
    registerLocaleRefresh?.(link.refreshLocale)
  }
  if (node.type === 'image' && !isRichText) {
    const pick = supportsImageFraming(node) || opts?.assets ? replaceImage : undefined
    const fields = createImageFields(engine, node, pick, opts?.i18n)
    container.append(...fields.elements)
    registerDestroy?.(fields.destroy)
    registerLocaleRefresh?.(fields.refreshLocale)
    if (supportsImageFraming(node)) {
      const imageLink = createImageLinkField(engine, node, opts?.i18n, opts?.richText)
      container.append(imageLink.el)
      registerDestroy?.(imageLink.destroy)
      registerLocaleRefresh?.(imageLink.refreshLocale)
    }
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
        richText: opts?.richText,
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
    !hasAnchorShortcut(node) &&
    !isNativeLink(node) &&
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

type StyleCaption = readonly [zh: string, en: string]
type StyleChoice = readonly [value: string, zh: string, en: string]
type LayoutStyleValue = DeviceStyleValue & {
  fromFlow?: boolean
  gap?: ReturnType<typeof readUniformGap>['gap']
}

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
  styleTransfer: ReturnType<typeof createStyleTransfer>,
  registerDestroy: (dispose: () => void) => void,
  options?: InspectorOptions,
): void {
  const i18n = options?.i18n
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
  if (supportsImageFraming(node)) {
    const framing = createImageFraming(engine, node, device, i18n)
    container.appendChild(framing.el)
    registerDestroy(framing.destroy)
  }
  styleTransfer.mount(container, node, device)

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
  function writeStyle(prop: string, value: string): void {
    if (prop === 'gap') setUniformGap(engine, node.id, device, value)
    else if (prop === 'flex-direction') setFlexDirection(engine, node.id, device, value)
    else updateDeviceStyle(engine, node.id, device, prop, value)
  }
  function bind(
    prop: string,
    input: HTMLInputElement | HTMLSelectElement,
    refresh: (value: LayoutStyleValue) => void,
  ): HTMLElement {
    input.className = 'sigil-input'
    input.dataset.styleProperty = prop
    function read(current: ComponentNode): LayoutStyleValue {
      if (prop === 'flex-direction') return readFlexDirection(current, device)
      if (prop === 'gap') return readUniformGap(current, device)
      return getDeviceStyleValue(current, device, prop)
    }
    let describe!: (value: DeviceStyleValue) => void
    const control = decorateStyleControl(
      input,
      engine,
      node,
      device,
      prop,
      read(node),
      i18n,
      (refreshMetadata) => {
        describe = refreshMetadata
      },
      signal,
      () => writeStyle(prop, ''),
    )
    watch((current) => {
      const value = read(current)
      input.disabled = !!current.locked
      refresh(value)
      describe(value)
      if (value.gap) {
        const source = control.querySelector<HTMLElement>('[data-style-source-label]')
        const reset = control.querySelector<HTMLButtonElement>('[data-style-reset]')
        if (reset) {
          if (value.override === undefined && document.activeElement === reset)
            input.focus({ preventScroll: true })
          reset.hidden = value.override === undefined
          reset.textContent = value.gap.hasOwnAxis
            ? uiText(i18n, 'layout.clear_uniform_gap', '清除共用間距')
            : uiText(i18n, 'style.use_inheritance', '使用繼承')
        }
        const local = value.source === device
        if (source) {
          source.hidden = local && value.gap.mixed
          if (source.hidden) input.removeAttribute('aria-describedby')
          else input.setAttribute('aria-describedby', source.id)
        }
        if (local) {
          input.title = value.gap.mixed
            ? uiText(i18n, 'layout.mixed_gaps', '分別設定')
            : uiText(i18n, 'style.override', '覆寫')
          if (source) source.textContent = input.title
        } else if (value.gap.sources.length > 1) {
          input.title =
            uiText(i18n, 'style.inherit', '繼承') +
            ' ' +
            value.gap.sources.map((at) => deviceLabel(at, i18n)).join(' / ')
          if (source) source.textContent = input.title
        }
      }
      if (value.fromFlow && value.source === device) {
        input.title = uiText(i18n, 'layout.from_flow', '來自 flex-flow')
        const source = control.querySelector('[data-style-source-label]')
        if (source) source.textContent = input.title
      }
    })
    return control
  }

  function textField(parent: HTMLElement, prop: string): HTMLElement {
    const input = document.createElement('input')
    input.type = 'text'
    const spacing =
      prop === 'padding' || prop === 'margin'
        ? bindBoxShorthand(
            input,
            engine,
            node,
            device,
            prop,
            signal,
            i18n,
            options?.acceptsSpacingValue,
          )
        : undefined
    if (spacing) input.placeholder = '16px'
    else
      input.addEventListener(
        'input',
        () => updateDeviceStyle(engine, node.id, device, prop, input.value),
        { signal },
      )
    const row = bind(prop, input, (value) => {
      const next = value.override ?? ''
      if (spacing) spacing.sync(next, input.disabled)
      else if (input.value !== next) input.value = next
    })
    const wrap = field(parent, label(prop), () => row)
    spacing?.appendError(wrap)
    return wrap
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
    const separate = document.createElement('option')
    separate.value = '__sigil_separate__'
    separate.textContent = uiText(i18n, 'layout.mixed_gaps', '分別設定')
    separate.disabled = true
    if (prop === 'gap') select.append(separate)
    const other = document.createElement('option')
    other.value = customMode
    other.textContent = customLabel
    select.appendChild(other)
    let editing = false
    let lastOverride: string | undefined
    const gapDraft =
      prop === 'gap'
        ? bindStyleDraft(custom, signal, {
            live: true,
            editable: () => engine.getSelection() === node.id,
            errorClass: 'sigil-box-spacing-error sigil-layout-gap-error',
            validate: (value) =>
              gapValidationMessage(undefined, value, i18n, options?.acceptsSpacingValue),
            write(value) {
              lastOverride = value || undefined
              setUniformGap(engine, node.id, device, value)
            },
          })
        : undefined
    const row = bind(prop, select, (value) => {
      if (value.override !== lastOverride) editing = false
      lastOverride = value.override
      const explicit = value.override ?? ''
      let inherited = value.effective ?? ''
      let selection = explicit
      const inherits = value.inherited
      if (value.gap) {
        const common = value.effective ?? ''
        inherited = value.gap.mixed ? uiText(i18n, 'layout.mixed_gaps', '分別設定') : common
        separate.textContent = inherited
        const customAxes = !!common && common !== explicit && !captions.has(common)
        selection =
          value.source === device ? (value.gap.mixed || customAxes ? separate.value : common) : ''
        separate.hidden = selection !== separate.value
        for (const option of select.options) {
          if (captions.has(option.value))
            option.disabled = options?.acceptsSpacingValue?.(option.value) === false
        }
      }
      const caption = captions.get(inherited) ?? inherited
      empty.textContent = inherits
        ? `${uiText(i18n, 'style.inherit', '繼承')} ${caption}`
        : uiText(i18n, 'style.unset_short', '未設')
      if (prop === 'flex-direction' && value.source === device && (value.fromFlow || !explicit)) {
        selection = ''
        empty.textContent = value.fromFlow
          ? uiText(i18n, 'layout.from_flow', '來自 flex-flow') + ' · ' + caption
          : caption
      }
      const showCustom =
        editing || (!!selection && selection !== separate.value && !captions.has(selection))
      select.value = showCustom ? customMode : selection
      custom.hidden = !showCustom
      custom.disabled = select.disabled
      if (gapDraft) gapDraft.sync(explicit, custom.disabled)
      else if (custom.value !== explicit) custom.value = explicit
      custom.placeholder = inherits ? inherited : ''
    })
    const fieldBox = field(parent, label(prop), () => row)
    fieldBox.appendChild(custom)
    gapDraft?.appendError(fieldBox)
    select.addEventListener(
      'change',
      () => {
        editing = select.value === customMode
        custom.hidden = !editing
        if (editing) custom.focus()
        else if (
          !select.disabled &&
          select.value !== separate.value &&
          (prop !== 'gap' ||
            !select.value ||
            options?.acceptsSpacingValue?.(select.value) !== false)
        ) {
          gapDraft?.restore()
          writeStyle(prop, select.value)
        }
      },
      { signal },
    )
    if (!gapDraft)
      custom.addEventListener(
        'input',
        () => {
          lastOverride = custom.value || undefined
          editing = true
          writeStyle(prop, custom.value)
        },
        { signal },
      )
  }

  const layout = section('layout', '版面')
  if (node.id !== engine.getTree().id) {
    const item = createGridItem(engine, node, device, i18n, options?.richText)
    layout.appendChild(item.el)
    registerDestroy(item.destroy)
  }
  choiceField(layout, 'display')
  const layoutContainer = supportsGridColumns(node) && !options?.richText?.supports(node)
  if (layoutContainer) {
    const columns = createGridColumns(engine, node, device, i18n, options?.acceptsCustomGridTracks)
    layout.appendChild(columns.el)
    registerDestroy(columns.destroy)
  }
  const flex = document.createElement('div')
  flex.dataset.layoutNode = node.id
  for (const prop of ['flex-direction', 'justify-content', 'align-items']) choiceField(flex, prop)
  const gaps = document.createElement('div')
  choiceField(gaps, 'gap')
  if (layoutContainer) {
    const wrapping = createFlexWrapField(engine, node, device, i18n)
    wrapping.el.dataset.layoutNode = node.id
    flex.append(wrapping.el)
    registerDestroy(wrapping.destroy)
    const separate = createLayoutGapField(
      engine,
      node,
      device,
      expanded,
      i18n,
      options?.acceptsSpacingValue,
    )
    gaps.append(separate.el)
    registerDestroy(separate.destroy)
  }
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
      () => setBoxShorthand(engine, node.id, device, 'padding', value),
      { signal },
    )
    presets.appendChild(button)
  }
  padding.insertBefore(presets, padding.children[1]!)
  watch((current) => {
    const values = readBoxSpacing(current, device, 'padding')
    for (const button of presets.querySelectorAll('button')) {
      button.setAttribute(
        'aria-pressed',
        String(
          boxSides.every(
            (side) => values[side].source === device && values[side].value === button.value,
          ),
        ),
      )
      button.disabled = !!current.locked || options?.acceptsSpacingValue?.(button.value) === false
    }
  })
  function addSides(prop: BoxProperty): void {
    const spacing = createBoxSpacingField(
      engine,
      node,
      device,
      prop,
      expanded,
      i18n,
      options?.acceptsSpacingValue,
    )
    layout.append(spacing.el)
    watch(spacing.refresh)
    registerDestroy(spacing.destroy)
  }
  addSides('padding')
  textField(layout, 'margin')
  addSides('margin')
  for (const prop of ['width', 'height']) textField(layout, prop)

  function colorField(parent: HTMLElement, property: 'color' | 'background-color'): void {
    const control = createColorField(
      engine,
      node,
      device,
      property,
      label(property),
      i18n,
      options?.acceptsColorValue,
    )
    parent.append(control.el)
    registerDestroy(control.destroy)
  }
  const typography = section('typography', '文字')
  const typeFields = createTypographyFields(
    engine,
    node,
    device,
    signal,
    i18n,
    options?.acceptsTypographyValue,
  )
  typography.append(typeFields.el)
  watch(typeFields.refresh)
  choiceField(typography, 'text-align')
  colorField(typography, 'color')
  const appearance = section('appearance', '外觀')
  colorField(appearance, 'background-color')
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
  i18n: I18n | undefined,
  registerLocaleRefresh: (refresh: () => void) => void,
): void {
  const internalId = field(container, uiText(i18n, 'inspector.component_id', '元件內部 ID'), () => {
    const input = document.createElement('input')
    input.className = 'sigil-input'
    input.value = node.id
    input.readOnly = true
    return input
  })
  registerLocaleRefresh(() => {
    internalId.querySelector('label')!.textContent = uiText(
      i18n,
      'inspector.component_id',
      '元件內部 ID',
    )
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
    registerLocaleRefresh(() => {
      del.textContent = uiText(i18n, 'inspector.delete_component', '刪除元件')
    })
    del.addEventListener('click', () => engine.remove(node.id))
    container.appendChild(del)
  }
}

function field(
  container: HTMLElement,
  label: string | Text,
  control: () => HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'sigil-field'
  const caption = document.createElement('label')
  caption.className = 'sigil-field-label'
  caption.append(label)
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
