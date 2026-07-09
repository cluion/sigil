import {
  createEngine,
  createDefaultPolicy,
  toHTML,
  createEventBus,
  createStore,
  type Engine,
  type SigilDoc,
  type SanitizeFn,
  type HtmlMode,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createPropsPanel,
  createBlocksPanel,
  createLayersPanel,
  type BlockFactory,
} from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import {
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'

export interface EditorOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  store?: JsonProjectStore
  blocks?: Record<string, BlockFactory>
  shortcodes?: ShortcodeDefinition[]
  trustedTypesPolicyName?: string
  sanitize?: SanitizeFn
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
}

export interface SigilEditor {
  engine: Engine
  toJSON(): SigilDoc
  toHTML(mode?: HtmlMode): string
  destroy(): void
}

/**
 * 建立 editor — 一站式組合區塊面板 + canvas + 圖層 + props 面板
 */
export function createEditor(opts: EditorOptions): SigilEditor {
  const mountEl =
    typeof opts.mount === 'string'
      ? document.querySelector<HTMLElement>(opts.mount)
      : opts.mount
  if (!mountEl) throw new Error('createEditor：mount 目標不存在')

  const engine = createEngine({ doc: opts.doc })
  const store = opts.store ?? new JsonProjectStore()
  const policy = createDefaultPolicy({
    trustedTypesPolicyName: opts.trustedTypesPolicyName,
    sanitize: opts.sanitize,
  })
  const shortcodeRegistry = createShortcodeRegistry(opts.shortcodes)
  const defaultFetch =
    typeof fetch !== 'undefined'
      ? (url: string, signal?: AbortSignal) => fetch(url, { signal }).then((r) => r.json())
      : undefined
  const fetchJSON = opts.fetchJSON ?? defaultFetch
  const bus = createEventBus()
  const sharedStore = createStore()
  const shortcodeResolver = createShortcodeResolver({ registry: shortcodeRegistry, policy, bus, fetchJSON, store: sharedStore })

  mountEl.replaceChildren()
  const layout = document.createElement('div')
  layout.style.display = 'flex'
  layout.style.gap = '12px'
  const blocksBox = document.createElement('div')
  blocksBox.style.width = '140px'
  const canvasBox = document.createElement('div')
  canvasBox.style.flex = '1'
  const rightBox = document.createElement('div')
  rightBox.style.width = '260px'
  rightBox.style.display = 'flex'
  rightBox.style.flexDirection = 'column'
  rightBox.style.gap = '8px'
  const layersTitle = document.createElement('h4')
  layersTitle.textContent = '圖層'
  const layersBox = document.createElement('div')
  layersBox.style.height = '200px'
  layersBox.style.overflow = 'auto'
  layersBox.style.border = '1px solid #eee'
  const propsTitle = document.createElement('h4')
  propsTitle.textContent = '屬性'
  const propsBox = document.createElement('div')
  rightBox.append(layersTitle, layersBox, propsTitle, propsBox)
  layout.append(blocksBox, canvasBox, rightBox)
  mountEl.appendChild(layout)

  const canvas = createCanvas(engine, canvasBox, {
    rendererOptions: { shortcodeResolver },
  })
  const props = createPropsPanel(engine, propsBox, {
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
  })
  const layers = createLayersPanel(engine, layersBox)
  const blocksPanel = opts.blocks
    ? createBlocksPanel(engine, blocksBox, canvas.iframe, opts.blocks)
    : null

  function onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const id = engine.getSelection()
    if ((e.key === 'Delete' || e.key === 'Backspace') && id && id !== engine.getTree().id) {
      e.preventDefault()
      engine.remove(id)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      engine.undo()
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
    ) {
      e.preventDefault()
      engine.redo()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  return {
    engine,
    toJSON() {
      const doc = engine.toJSON()
      store.save(doc)
      return doc
    },
    toHTML(mode?: HtmlMode) {
      return toHTML(engine.toJSON(), { shortcodeResolver, mode })
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown)
      blocksPanel?.destroy()
      layers.destroy()
      props.destroy()
      canvas.destroy()
      engine.destroy()
    },
  }
}
