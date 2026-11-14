import {
  createApp,
  type AppOptions,
  type SigilApp,
  type EditorHooks as AppHooks,
} from '@cluion/sigil-app'
import { createEditor, type EditorOptions, type SigilEditor } from '@cluion/sigil'
import {
  createEngine,
  createProjectPersistence,
  createDefaultPolicy,
  createRenderer,
  createCommandRegistry,
  defineCommand,
  runBeforeSave,
  runAfterSave,
  runOnSaveError,
  toHTML,
  SCHEMA_VERSION,
  type ComponentNode,
  type SigilDoc,
  type Engine,
  type EngineEvent,
  type ProjectStore,
  type AssetStore,
  type AssetItem,
  type TemplateStore,
  type TemplateDef,
  type EditorHooks,
  type SanitizeFn,
  type RichTextResolver,
  type ShortcodeResolver,
  type CommandContext,
} from '@cluion/sigil-core'
import {
  createCanvas,
  createTemplateLibraryController,
  type CanvasHandle,
  type RichTextAdapter,
  type RichTextSession,
  type BlocksInput as UIBlocksInput,
} from '@cluion/sigil-ui'
import {
  defineBlock,
  basicBlocks,
  basicBlockDefs,
  marketingBlockDefs,
  blockSection,
  blockShortcode,
  templateToBlockDef,
  type BlocksInput,
} from '@cluion/sigil-blocks'
import {
  defineShortcode,
  createShortcodeRegistry,
  createShortcodeResolver,
  type ShortcodeDefinition,
} from '@cluion/sigil-shortcode'
import {
  JsonProjectStore,
  MemoryAssetStore,
  MemoryTemplateStore,
  JsonTemplateStore,
} from '@cluion/sigil-store-json'
import '@cluion/sigil-app/tokens.css'

// Package exports must reject these paths even when the distribution contains the files.
// @ts-expect-error Source files are not public package subpaths.
import { createEngine as sourceEngine } from '@cluion/sigil-core/src/index.js'
// @ts-expect-error The package root is the public distribution entry point.
import { createEngine as deepEngine } from '@cluion/sigil-core/dist/index.js'
void sourceEngine
void deepEngine

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

export type ReturnContracts = [
  Assert<Equal<SigilDoc['version'], 1>>,
  Assert<Equal<typeof SCHEMA_VERSION, 1>>,
  Assert<Equal<ReturnType<SigilApp['toJSON']>, SigilDoc>>,
  Assert<Equal<ReturnType<SigilEditor['toJSON']>, SigilDoc>>,
  Assert<Equal<ReturnType<SigilApp['save']>, Promise<SigilDoc>>>,
  Assert<Equal<ReturnType<SigilEditor['save']>, Promise<SigilDoc>>>,
  Assert<Equal<ReturnType<SigilApp['runCommand']>, Promise<boolean>>>,
  Assert<Equal<ReturnType<SigilEditor['runCommand']>, Promise<boolean>>>,
  Assert<Equal<ReturnType<SigilApp['isDirty']>, boolean>>,
  Assert<Equal<ReturnType<SigilEditor['isSaving']>, boolean>>,
  Assert<Equal<ReturnType<Engine['insert']>, string>>,
  Assert<Equal<ReturnType<Engine['subscribe']>, () => void>>,
  Assert<Equal<ReturnType<RichTextAdapter['start']>, RichTextSession>>,
  Assert<Equal<ReturnType<SanitizeFn>, string>>,
]

export const doc: SigilDoc = {
  version: 1,
  root: {
    id: 'root',
    type: 'section',
    attributes: {},
    style: {},
    responsiveStyles: { mobile: { padding: '8px' } },
    children: [],
  },
  meta: { title: 'API contract', device: 'mobile', updatedAt: '2026-10-23T00:00:00Z' },
  stylesheets: [{ id: 'theme', rules: '.title { color: blue; }' }],
}

export const synchronousProjectStore: ProjectStore = {
  load: () => doc,
  save: (value) => {
    void value
  },
}
export const asynchronousProjectStore: ProjectStore = {
  load: async () => null,
  save: async (value) => {
    void value
  },
}
export const synchronousAssets: AssetStore = {
  list: () => [],
  upload: (file) => ({ id: file.name, url: '/public/image.png' }),
}
export const asynchronousAssets: AssetStore = {
  list: async () => [],
  upload: async (file) => ({ id: file.name, url: '/public/image.png' }),
}
export const readOnlyAssets: AssetStore = { list: () => [] }
export const synchronousTemplates: TemplateStore = {
  list: () => [],
  save: (value) => {
    void value
  },
}
export const asynchronousTemplates: TemplateStore = {
  list: async () => [],
  save: async (value) => {
    void value
  },
  remove: async (id) => {
    void id
  },
}

export const memoryAdapters: [ProjectStore, AssetStore, TemplateStore, TemplateStore] = [
  new JsonProjectStore(),
  new MemoryAssetStore(),
  new MemoryTemplateStore(),
  new JsonTemplateStore(),
]
export const asset: AssetItem = { id: 'image', url: '/image.png', name: 'Image' }
export const template: TemplateDef = { id: 'template', label: 'Template', node: blockSection() }
export const recordBlocks: BlocksInput = basicBlocks
export const definitionBlocks: UIBlocksInput = [
  ...basicBlockDefs,
  ...marketingBlockDefs,
  defineBlock({ id: 'custom', label: 'Custom', create: () => blockShortcode('counter') }),
  templateToBlockDef(template),
]

export const hooks: EditorHooks & AppHooks = {
  onSelect(id, context) {
    context.engine.select(id)
  },
  beforeSave: async (snapshot, context) => {
    const engine: Engine = context.engine
    void engine
    return { ...snapshot, meta: { ...snapshot.meta, title: 'Saved title' } }
  },
  afterSave: async (snapshot, context) => {
    void snapshot
    void context.engine
  },
  onSaveError: async (error, context) => {
    const unknownError: unknown = error
    const captured: SigilDoc = context.doc
    void unknownError
    void captured
  },
  afterLoad: async (snapshot) => {
    void snapshot
  },
  beforeDestroy(context) {
    void context.engine
  },
}

export const richTextResolver: RichTextResolver = {
  supports: (node) => node.type === 'rich-text',
  read: (node) => node.content ?? '',
}
export const richText: RichTextAdapter = {
  resolver: richTextResolver,
  start(context) {
    const node: ComponentNode = context.node
    const document: Document = context.document
    const commit: () => void = context.requestCommit
    const cancel: () => void = context.requestCancel
    void node
    void document
    void commit
    void cancel
    return { focus: () => context.element.focus(), getValue: () => context.value, destroy() {} }
  },
}

export const shortcode: ShortcodeDefinition = defineShortcode<{ count: number }>({
  name: 'counter',
  props: { count: 0 },
  template: '<span></span>',
  render: (props, context) => context.escape(String(props.count)),
  bind(element, context) {
    const count: number = context.props.count
    const signal: AbortSignal = context.abort
    const request: Promise<unknown> = context.fetchJSON('/data', signal)
    void count
    void request
    return context.effect(() => {
      element.textContent = String(context.props.count)
    })
  },
})

// Compile-only consumer: these declarations are never executed by the contract runner.
export function composePublicAPIs(mount: HTMLElement, sanitize: SanitizeFn): void {
  const options: AppOptions = {
    mount,
    doc,
    store: asynchronousProjectStore,
    assets: asynchronousAssets,
    templates: asynchronousTemplates,
    blocks: definitionBlocks,
    shortcodes: [shortcode],
    richText,
    sanitize,
    hooks,
    locale: 'zh',
    theme: 'auto',
    fetchJSON: async (_url, signal) => ({ aborted: signal?.aborted }),
  }
  const editorOptions: EditorOptions = {
    mount,
    doc,
    store: synchronousProjectStore,
    templates: synchronousTemplates,
    blocks: recordBlocks,
    shortcodes: [shortcode],
    richText,
    sanitize,
    hooks,
  }
  const app: SigilApp = createApp(options)
  const editor: SigilEditor = createEditor(editorOptions)
  const engine = createEngine({ doc })
  const eventListener = (event: EngineEvent): void => {
    void event.type
  }
  const unsubscribe = engine.subscribe(eventListener)
  const policy = createDefaultPolicy({ sanitize, trustedTypesPolicyName: 'host' })
  const resolver: ShortcodeResolver = createShortcodeResolver({
    registry: createShortcodeRegistry([shortcode]),
    policy,
  })
  const renderer = createRenderer({ htmlPolicy: policy, shortcodeResolver: resolver })
  const canvas: CanvasHandle = createCanvas(engine, mount, {
    rendererOptions: { htmlPolicy: policy },
    richText,
  })
  const frame: HTMLIFrameElement = canvas.iframe
  void frame
  canvas.setDevice('mobile')
  canvas.setMode('preview')
  const persistence = createProjectPersistence({ engine, store: synchronousProjectStore, hooks })
  const save: Promise<SigilDoc> = persistence.save()
  const transformed: Promise<SigilDoc> = runBeforeSave(hooks, doc, engine)
  const notification: Promise<void> = runAfterSave(hooks, doc, engine)
  const errorNotification: Promise<void> = runOnSaveError(hooks, new Error('failure'), doc, engine)
  const command = defineCommand({ id: 'host-save', run: (context) => context.save?.() })
  const context: CommandContext = {
    engine,
    getDoc: () => doc,
    save: async () => {
      await app.save()
    },
    clipboard: {
      get: () => null,
      set: (value) => {
        void value
      },
    },
  }
  const executed: Promise<boolean> = createCommandRegistry([command]).run(command.id, context)
  const html: string = toHTML(doc, { mode: 'static', richTextResolver, sanitize })
  void save
  void transformed
  void notification
  void errorNotification
  void executed
  void html
  const library = createTemplateLibraryController({
    store: asynchronousTemplates,
    panel: { destroy() {}, reload() {}, setStatus() {} },
    mapTemplate: templateToBlockDef,
  })
  const reloaded: Promise<boolean> = library.reload()
  void reloaded

  // @ts-expect-error Remote loading belongs to the host/ProjectStore, not App.
  app.load()
  // @ts-expect-error Engine does not own a persistence adapter.
  engine.save()
  // @ts-expect-error EditorOptions does not expose App's assets option.
  createEditor({ mount, assets: asynchronousAssets })
  // @ts-expect-error The currently supported document version is exactly 1.
  const unsupported: SigilDoc = { ...doc, version: 2 }
  void unsupported
  unsubscribe()
  library.destroy()
  persistence.destroy()
  canvas.destroy()
  renderer.destroy()
  app.destroy()
  editor.destroy()
  engine.destroy()
}
