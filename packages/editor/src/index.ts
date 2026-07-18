import {
  createEngine,
  createDefaultPolicy,
  toHTML,
  createEventBus,
  createStore,
  findNode,
  createId,
  createI18n,
  createCommandRegistry,
  createDefaultEditingCommands,
  defineCommand,
  runBeforeSave,
  runAfterSave,
  runOnSelect,
  runAfterLoad,
  runBeforeDestroy,
  type Engine,
  type SigilDoc,
  type SanitizeFn,
  type HtmlMode,
  type ComponentNode,
  type Locale,
  type ProjectStore,
  type TemplateStore,
  type CommandDefinition,
  type CommandContext,
  type EditorHooks,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createPropsPanel,
  createBlocksPanel,
  createLayersPanel,
  applyTheme,
  type BlocksInput,
  type ThemeChoice,
} from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'
import {
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'
import { templateToBlockDef } from '@cluion/sigil-blocks'

const i18nMessages = {
  zh: { 'canvas.title': '編輯畫布', 'canvas.edit': '✏ 編輯', 'canvas.preview': '👁 預覽' },
  en: { 'canvas.title': 'Canvas', 'canvas.edit': '✏ Edit', 'canvas.preview': '👁 Preview' },
}

export interface EditorOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  /** 頁面存取 adapter */
  store?: ProjectStore
  blocks?: BlocksInput
  /** 範本庫 adapter，傳入後啟用「另存為範本」命令 */
  templates?: TemplateStore
  shortcodes?: ShortcodeDefinition[]
  trustedTypesPolicyName?: string
  sanitize?: SanitizeFn
  fetchJSON?: (url: string, signal?: AbortSignal) => Promise<unknown>
  locale?: Locale
  /** 主題：light／dark／auto；預設 auto。SDK 無切換按鈕，宿主自理 */
  theme?: ThemeChoice
  /** 額外命令可覆寫同 id 預設 */
  commands?: CommandDefinition[]
  /** 生命週期 hooks */
  hooks?: EditorHooks
}

export interface SigilEditor {
  engine: Engine
  toJSON(): SigilDoc
  toHTML(mode?: HtmlMode): string
  /** 執行已註冊命令 */
  runCommand(id: string): Promise<boolean>
  destroy(): void
}

export { defineCommand, createDefaultEditingCommands }
export type { CommandDefinition, CommandContext, EditorHooks }

/**
 * 建立 editor — SDK 級組合
 * 開箱產品殼請用 `@cluion/sigil-app` 的 createApp
 */
export function createEditor(opts: EditorOptions): SigilEditor {
  const mountEl =
    typeof opts.mount === 'string' ? document.querySelector<HTMLElement>(opts.mount) : opts.mount
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
  const i18n = createI18n(i18nMessages, opts.locale ?? 'zh')
  const sharedStore = createStore()
  const shortcodeResolver = createShortcodeResolver({
    registry: shortcodeRegistry,
    policy,
    bus,
    fetchJSON,
    store: sharedStore,
  })
  const hooks = opts.hooks

  let clipboard: ComponentNode | null = null

  async function persist(): Promise<SigilDoc> {
    let doc = engine.toJSON()
    doc = await runBeforeSave(hooks, doc, engine)
    await Promise.resolve(store.save(doc))
    await runAfterSave(hooks, doc, engine)
    return doc
  }

  const commandMap = new Map<string, CommandDefinition>()
  for (const c of createDefaultEditingCommands()) commandMap.set(c.id, c)
  // 範本：另存為範本命令（閉包捕獲 templateStore 與 blocksPanel）
  if (opts.templates) {
    commandMap.set(
      'save-as-template',
      defineCommand({
        id: 'save-as-template',
        label: 'Save as Template',
        when: (c) => {
          const id = c.engine.getSelection()
          return !!id && id !== c.engine.getTree().id
        },
        run: async (c) => {
          const id = c.engine.getSelection()
          if (!id) return
          const node = findNode(c.engine.getTree(), id)
          if (!node) return
          const label = window.prompt('Template name', node.name?.trim() || node.type)
          if (!label) return
          await Promise.resolve(opts.templates!.save({ id: createId(), label, node }))
          reloadTemplates()
        },
      }),
    )
  }
  for (const c of opts.commands ?? []) commandMap.set(c.id, c)
  const commands = createCommandRegistry([...commandMap.values()])

  function makeCtx(): CommandContext {
    return {
      engine,
      getDoc: () => engine.toJSON(),
      save: () => {
        void persist()
      },
      clipboard: {
        get: () => clipboard,
        set: (n) => {
          clipboard = n
        },
      },
    }
  }

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

  // 主題：套到 layout；SDK 無 toggle，宿主可 destroy+remount 切換
  const cleanupTheme = applyTheme(layout, opts.theme ?? 'auto')

  const canvas = createCanvas(engine, canvasBox, {
    rendererOptions: { shortcodeResolver },
    i18n,
  })
  const props = createPropsPanel(engine, propsBox, {
    getShortcodeSchema: (name) => shortcodeRegistry.get(name)?.schema,
  })
  const unsubDevice = canvas.subscribeDevice((device) => props.setDevice(device))
  const layers = createLayersPanel(engine, layersBox)
  // 合併靜態區塊與範本；有任一來源即建立面板
  const templateStore = opts.templates
  const hasTemplates = !!templateStore
  const mergedBlocks: BlocksInput | null = opts.blocks
    ? Array.isArray(opts.blocks)
      ? [...opts.blocks]
      : { ...opts.blocks }
    : hasTemplates
      ? []
      : null

  const blocksPanel = mergedBlocks
    ? createBlocksPanel(engine, blocksBox, canvas.iframe, mergedBlocks)
    : null

  function reloadTemplates(): void {
    if (!templateStore || !blocksPanel) return
    void Promise.resolve(templateStore.list()).then((templates) => {
      const tplBlocks = templates.map(templateToBlockDef)
      const base = opts.blocks
        ? Array.isArray(opts.blocks)
          ? [...opts.blocks]
          : { ...opts.blocks }
        : []
      const merged = Array.isArray(base) ? [...base, ...tplBlocks] : { ...base }
      blocksPanel.reload(merged)
    })
  }
  if (hasTemplates) reloadTemplates()

  const unsubSel = engine.subscribe((ev) => {
    if (ev.type === 'selection') runOnSelect(hooks, ev.id, engine)
  })

  function onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const cmd = commands.match(e, makeCtx())
    if (!cmd) return
    e.preventDefault()
    void commands.run(cmd.id, makeCtx())
  }
  document.addEventListener('keydown', onKeyDown)

  runAfterLoad(hooks, engine.toJSON(), engine)

  return {
    engine,
    toJSON() {
      // 同步匯出並寫入 store
      const doc = engine.toJSON()
      void store.save(doc)
      return doc
    },
    toHTML(mode?: HtmlMode) {
      return toHTML(engine.toJSON(), { shortcodeResolver, mode })
    },
    runCommand(id: string) {
      return commands.run(id, makeCtx())
    },
    destroy() {
      runBeforeDestroy(hooks, engine)
      cleanupTheme()
      document.removeEventListener('keydown', onKeyDown)
      unsubSel()
      unsubDevice()
      blocksPanel?.destroy()
      layers.destroy()
      props.destroy()
      canvas.destroy()
      engine.destroy()
    },
  }
}
