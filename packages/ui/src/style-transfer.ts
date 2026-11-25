import {
  createId,
  findNode,
  getEffectiveStyle,
  type ComponentNode,
  type Engine,
  type I18n,
  type ResponsiveDevice,
  type Style,
} from '@cluion/sigil-core'
import { uiText } from './i18n.js'
import { deviceLabel } from './style-device.js'

interface StyleSnapshot {
  name: string
  device: ResponsiveDevice
  values: Style
}

export function createStyleTransfer(engine: Engine, i18n?: I18n, onApplied?: () => void) {
  let destroyed = false
  let snapshot: StyleSnapshot | null = null
  let disposeView: (() => void) | undefined
  let restoreFocus: string | undefined
  let announce: ((target: string, device: ResponsiveDevice, text: string) => void) | undefined

  function detach(): void {
    restoreFocus = undefined
    disposeView?.()
    disposeView = undefined
    announce = undefined
  }

  function describe(key: string, fallback: string, name: string, device: ResponsiveDevice): string {
    return uiText(i18n, key, fallback).replace(/\{(name|device)\}/g, (_, field: string) =>
      field === 'name' ? name : deviceLabel(device, i18n),
    )
  }

  function mount(container: HTMLElement, node: ComponentNode, device: ResponsiveDevice): void {
    if (destroyed) return
    if (disposeView) detach()
    const listeners = new AbortController()
    const { signal } = listeners
    const view = document.createElement('div')
    view.className = 'sigil-style-transfer'
    const actions = document.createElement('div')
    actions.className = 'sigil-style-transfer-actions'
    function action(id: string, label: string): HTMLButtonElement {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'sigil-btn sigil-btn--ghost'
      button.dataset.styleTransfer = id
      button.textContent = label
      actions.appendChild(button)
      return button
    }
    const copy = action('copy', uiText(i18n, 'style.copy', '複製樣式'))
    const apply = action('apply', uiText(i18n, 'style.apply', '套用樣式'))
    const feedback = document.createElement('div')
    feedback.className = 'sigil-style-transfer-feedback'
    feedback.setAttribute('role', 'status')
    const source = document.createElement('p')
    source.className = 'sigil-style-transfer-source'
    source.id = `sigil-style-source-${createId()}`
    const status = document.createElement('p')
    status.className = 'sigil-style-transfer-status'
    feedback.append(source, status)
    view.append(actions, feedback)
    container.appendChild(view)
    apply.setAttribute('aria-describedby', source.id)

    function selected(): ComponentNode | null {
      return engine.getSelection() === node.id ? findNode(engine.getTree(), node.id) : null
    }
    function refresh(current: ComponentNode | null): void {
      copy.disabled = !current || !Object.keys(getEffectiveStyle(current, device)).length
      copy.title = copy.disabled ? uiText(i18n, 'style.no_styles', '目前裝置沒有可複製的樣式') : ''
      apply.disabled = !current || !!current.locked || !snapshot
      const text = snapshot
        ? describe(
            'style.copied_from',
            '已複製「{name}」的{device}樣式',
            snapshot.name,
            snapshot.device,
          )
        : copy.title
      if (source.textContent !== text) source.textContent = text
    }
    announce = (id, targetDevice, text) => {
      if (id === node.id && targetDevice === device) status.textContent = text
    }
    copy.addEventListener(
      'click',
      () => {
        const current = selected()
        if (!current) return
        const values = getEffectiveStyle(current, device)
        if (!Object.keys(values).length) return
        snapshot = { name: current.name?.trim() || current.type, device, values }
        status.textContent = ''
        refresh(current)
      },
      { signal },
    )
    apply.addEventListener(
      'click',
      () => {
        const current = selected()
        if (!snapshot || !current || current.locked) return
        const target = getEffectiveStyle(current, device)
        const changes = Object.fromEntries(
          Object.entries(snapshot.values).filter(([property, value]) => target[property] !== value),
        )
        if (!Object.keys(changes).length) {
          status.textContent = uiText(i18n, 'style.already_matches', '樣式已相同')
          return
        }
        engine.update(
          current.id,
          device === 'desktop' ? { style: changes } : { responsiveStyles: { [device]: changes } },
        )
        if (destroyed) return
        onApplied?.()
        announce?.(
          current.id,
          device,
          describe(
            'style.applied_to',
            '已套用至「{name}」的{device}樣式',
            current.name?.trim() || current.type,
            device,
          ),
        )
      },
      { signal },
    )
    const unsubscribe = engine.subscribe((event) => {
      if (event.type !== 'patch' || event.patch.type !== 'update' || event.patch.id !== node.id)
        return
      const { style, responsiveStyles, locked } = event.patch
      if (style || responsiveStyles || locked !== undefined) {
        status.textContent = ''
        refresh(selected())
      }
    })
    refresh(node)
    const focused = restoreFocus === 'copy' ? copy : restoreFocus === 'apply' ? apply : null
    if (focused) {
      const next = focused.disabled ? [copy, apply].find((button) => !button.disabled) : focused
      if (!next) view.tabIndex = -1
      ;(next ?? view).focus({ preventScroll: true })
    }
    restoreFocus = undefined
    disposeView = () => {
      if (document.activeElement === copy) restoreFocus = 'copy'
      else if (document.activeElement === apply) restoreFocus = 'apply'
      listeners.abort()
      unsubscribe()
      view.remove()
    }
  }
  return {
    mount,
    detach,
    destroy() {
      destroyed = true
      detach()
      snapshot = null
    },
  }
}
