import type {
  AssetStore,
  Engine,
  I18n,
  PropSchema,
  ResponsiveDevice,
  RichTextResolver,
} from '@cluion/sigil-core'
import { findNode, type ComponentNode } from '@cluion/sigil-core'
import { createFAQFields, type FAQEditingOptions } from './faq-fields.js'
import { createColorField } from './color-field.js'
import { createTypographyFields, preserveTypographyFocus } from './typography-fields.js'
import type { AcceptsTypographyValue } from './typography.js'
import {
  bindBoxShorthand,
  createBoxSpacingField,
  preserveBoxSpacingFocus,
} from './box-spacing-field.js'
import { createAnchorField } from './anchor-field.js'
import { createGridColumns, supportsGridColumns } from './grid-columns.js'
import { createGridItem } from './grid-item.js'
import { createFlexWrapField } from './flex-wrap-field.js'
import { createLayoutGapField, preserveLayoutFocus } from './layout-gap-field.js'
import { createImageFraming, supportsImageFraming } from './image-framing.js'
import { createImageFields, createImageReplacement } from './image-fields.js'
import { createImageLinkField } from './image-link-field.js'
import { createLinkFields, isNativeLink } from './link-fields.js'
import { createPropForm, type PropFormHandle } from './form.js'
import { subscribeLocale, uiText } from './i18n.js'
import { richTextSummary } from './rich-text.js'
import { mountTextFormat } from './text-format.js'
import { canEditPlainContent, createTextContent } from './text-content.js'
import { createStyleTransfer } from './style-transfer.js'
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

export interface PropsPanelHandle {
  setDevice(device: ResponsiveDevice): void
  replaceImage?: (id: string, trigger: HTMLElement) => (() => void) | undefined
  destroy(): void
}

export function createPropsPanel(
  engine: Engine,
  container: HTMLElement,
  opts?: PropsPanelOptions,
): PropsPanelHandle {
  let device: ResponsiveDevice = opts?.device ?? 'desktop'

  let form: PropFormHandle | undefined
  let imageFields: ReturnType<typeof createImageFields> | undefined
  let imageLink: ReturnType<typeof createImageLinkField> | undefined
  const imageReplacement = createImageReplacement(engine, opts)
  let faq: ReturnType<typeof createFAQFields>
  let format: ReturnType<typeof mountTextFormat>
  let disposeText: (() => void) | undefined
  let framing: ReturnType<typeof createImageFraming> | undefined
  let disposeStyles: (() => void) | undefined
  const expandedSpacing = new Set<string>()
  const gridControls: { el: HTMLElement; destroy(): void }[] = []
  let link: ReturnType<typeof createLinkFields> | undefined
  let anchor: ReturnType<typeof createAnchorField> | undefined
  const transfer = createStyleTransfer(engine, opts?.i18n, render)

  function render(keepMedia = false): void {
    const refocusStyle =
      preserveTypographyFocus(container, engine.getSelection()) ??
      preserveBoxSpacingFocus(container, engine.getSelection()) ??
      preserveLayoutFocus(container, engine.getSelection())
    const active = document.activeElement
    const focusedImageLink =
      keepMedia && active instanceof HTMLElement && imageLink?.el.contains(active) ? active : null
    const restoreFormat =
      active instanceof HTMLSelectElement &&
      container.contains(active) &&
      active.dataset.textFormat === engine.getSelection()
    format?.destroy()
    format = undefined
    disposeText?.()
    disposeText = undefined
    disposeStyles?.()
    disposeStyles = undefined
    for (const control of gridControls.splice(0)) control.destroy()
    anchor?.destroy()
    anchor = undefined
    link?.destroy()
    link = undefined
    framing?.destroy()
    framing = undefined
    faq?.destroy()
    faq = undefined
    transfer.detach()
    if (!keepMedia) {
      form?.destroy()
      form = undefined
      imageFields?.destroy()
      imageFields = undefined
      imageLink?.destroy()
      imageLink = undefined
    }
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

    const richText = opts?.richText?.supports(node) ? opts.richText : undefined
    if (!richText) faq = createFAQFields(container, engine, node, opts?.faq, opts?.i18n)
    if (!faq) {
      disposeText = appendContentField(container, engine, node, richText, opts?.i18n)
      format = mountTextFormat(container, engine, node, opts?.richText, opts?.i18n)
      if (restoreFormat)
        container
          .querySelector<HTMLSelectElement>('[data-text-format]')
          ?.focus({ preventScroll: true })
    }
    if (isNativeLink(node)) {
      link = createLinkFields(engine, node, opts?.i18n, opts?.onRevealLinkTarget)
      container.append(link.el)
    }
    if (supportsImageFraming(node) && !richText) {
      imageFields ??= createImageFields(engine, node, imageReplacement.replaceImage, opts?.i18n)
      imageLink ??= createImageLinkField(engine, node, opts?.i18n, opts?.richText)
      container.append(...imageFields.elements, imageLink.el)
      if (keepMedia) {
        imageFields.refreshLocale()
        imageLink.refreshLocale()
        focusedImageLink?.focus({ preventScroll: true })
      }
    }
    if (supportsImageFraming(node)) {
      framing = createImageFraming(engine, node, device, opts?.i18n)
      container.appendChild(framing.el)
    }
    appendClassField(container, engine, node, opts?.i18n)
    if (!node.shortcode) {
      anchor = createAnchorField(engine, node, opts?.i18n)
      container.append(anchor.el)
    }
    form = appendShortcodePropsField(container, engine, node, opts, form)
    if (node.id !== engine.getTree().id)
      gridControls.push(createGridItem(engine, node, device, opts?.i18n, opts?.richText))
    if (!richText && supportsGridColumns(node)) {
      const wrapping = createFlexWrapField(engine, node, device, opts?.i18n)
      wrapping.el.dataset.layoutNode = node.id
      gridControls.push(
        createGridColumns(engine, node, device, opts?.i18n, opts?.acceptsCustomGridTracks),
        wrapping,
        createLayoutGapField(
          engine,
          node,
          device,
          expandedSpacing,
          opts?.i18n,
          opts?.acceptsSpacingValue,
        ),
      )
    }
    disposeStyles = appendStyleField(
      container,
      engine,
      node,
      device,
      transfer,
      render,
      gridControls.map((control) => control.el),
      expandedSpacing,
      opts?.i18n,
      opts?.acceptsColorValue,
      opts?.acceptsSpacingValue,
      opts?.acceptsTypographyValue,
    )
    refocusStyle?.()
  }

  const unsub = engine.subscribe((ev) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
    else if (ev.type === 'patch' && ev.patch.type === 'replace') {
      const selection = engine.getSelection()
      if (selection && findNode(ev.patch.node, selection)) render()
    }
  })
  const unsubLocale = subscribeLocale(opts?.i18n, () => render(true))
  render()
  return {
    replaceImage: imageReplacement.replaceImage,
    setDevice(next) {
      if (device === next) return
      device = next
      render()
    },
    destroy() {
      disposeText?.()
      format?.destroy()
      disposeStyles?.()
      for (const control of gridControls.splice(0)) control.destroy()
      anchor?.destroy()
      link?.destroy()
      framing?.destroy()
      faq?.destroy()
      transfer.destroy()
      form?.destroy()
      imageFields?.destroy()
      imageLink?.destroy()
      imageReplacement.destroy()
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
): (() => void) | undefined {
  if (richText) {
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
  if (!canEditPlainContent(node)) return
  const label = document.createElement('label')
  const content = createTextContent(
    engine,
    node,
    i18n,
    () => uiText(i18n, 'props.content', '內容') + uiText(i18n, 'form.label_separator', '：'),
  )
  label.append(content.caption, content.input)
  container.appendChild(label)
  container.appendChild(document.createElement('br'))
  return content.destroy
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
  opts?: PropsPanelOptions,
  form?: PropFormHandle,
): PropFormHandle | undefined {
  if (!node.shortcode) return
  const heading = document.createElement('h4')
  heading.textContent = 'shortcode props'
  container.appendChild(heading)

  const schema = opts?.getShortcodeSchema?.(node.shortcode.name)
  if (schema && schema.length > 0) {
    const handle =
      form ??
      createPropForm({
        engine,
        node,
        schema,
        assets: opts?.assets,
        richText: opts?.richText,
        fetchJSON: opts?.fetchJSON,
        i18n: opts?.i18n,
      })
    container.appendChild(handle.el)
    return handle
  }

  // 無 schema 時使用 key value 欄位
  for (const [k, v] of Object.entries(node.shortcode.props)) {
    const label = document.createElement('label')
    label.textContent = `${k}${uiText(opts?.i18n, 'form.label_separator', '：')}`
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
  transfer: ReturnType<typeof createStyleTransfer>,
  rerender: () => void,
  gridControls: HTMLElement[],
  expandedSpacing: Set<string>,
  i18n?: I18n,
  acceptsColorValue?: (value: string) => boolean,
  acceptsSpacingValue?: (value: string) => boolean,
  acceptsTypographyValue?: AcceptsTypographyValue,
) {
  const events = new AbortController()
  const { signal } = events
  const fields: ReturnType<typeof createBoxSpacingField>[] = []
  const refreshers: ((current: ComponentNode) => void)[] = []
  const heading = document.createElement('h4')
  heading.textContent = `${uiText(i18n, 'style.title', '樣式')} · ${deviceLabel(device, i18n)}`
  container.appendChild(heading)

  const context = document.createElement('p')
  context.className = 'sigil-responsive-style-context'
  context.dataset.styleDevice = device
  context.textContent = inheritanceLabel(device, i18n)
  container.appendChild(context)
  transfer.mount(container, node, device)
  container.append(...gridControls)

  const textFields = ['margin', 'padding'] as const
  for (const prop of textFields) {
    const label = document.createElement('label')
    label.textContent = `${prop}${uiText(i18n, 'form.label_separator', '：')}`
    const input = document.createElement('input')
    input.type = 'text'
    input.dataset.styleProperty = prop
    const value = getDeviceStyleValue(node, device, prop)
    input.value = value.override ?? ''
    const spacing = bindBoxShorthand(
      input,
      engine,
      node,
      device,
      prop,
      signal,
      i18n,
      acceptsSpacingValue,
    )
    label.appendChild(
      decorateStyleControl(
        input,
        engine,
        node,
        device,
        prop,
        value,
        i18n,
        (describe) => {
          function refresh(current: ComponentNode) {
            const latest = getDeviceStyleValue(current, device, prop)
            input.disabled = !!current.locked
            spacing.sync(latest.override ?? '', input.disabled)
            describe(latest)
          }
          refresh(node)
          refreshers.push(refresh)
        },
        signal,
      ),
    )
    container.appendChild(label)
    spacing.appendError(container)
    container.appendChild(document.createElement('br'))
    const field = createBoxSpacingField(
      engine,
      node,
      device,
      prop,
      expandedSpacing,
      i18n,
      acceptsSpacingValue,
    )
    container.append(field.el)
    fields.push(field)
    refreshers.push(field.refresh)
  }

  const typeFields = createTypographyFields(
    engine,
    node,
    device,
    signal,
    i18n,
    acceptsTypographyValue,
  )
  container.append(typeFields.el)
  refreshers.push(typeFields.refresh)

  const colors = (['color', 'background-color'] as const).map((property) => {
    const label = uiText(
      i18n,
      'style.property.' + property,
      property === 'color' ? '文字顏色' : '背景顏色',
    )
    return createColorField(engine, node, device, property, label, i18n, acceptsColorValue)
  })
  container.append(...colors.map((color) => color.el))

  const selectFields: Record<string, string[]> = {
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
      ? uiText(i18n, 'style.clear_desktop', '清除桌面樣式')
      : `${uiText(i18n, 'style.clear', '清除')} ${deviceLabel(device, i18n)} ${uiText(i18n, 'style.override', '覆寫')}`
  reset.addEventListener('click', () => {
    clearDeviceStyles(engine, node.id, device)
    rerender()
  })
  container.appendChild(reset)
  const unsubscribe = engine.subscribe((event) => {
    if (event.type !== 'patch' || event.patch.type !== 'update' || event.patch.id !== node.id)
      return
    if (!event.patch.style && !event.patch.responsiveStyles && event.patch.locked === undefined)
      return
    const latest = findNode(engine.getTree(), node.id)
    if (latest) for (const refresh of refreshers) refresh(latest)
  })
  return () => {
    events.abort()
    unsubscribe()
    for (const field of fields) field.destroy()
    for (const color of colors) color.destroy()
  }
}
