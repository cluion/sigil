import {
  createApp,
  type AppOptions,
  type SigilApp,
  type EditorHooks as AppHooks,
} from '@cluion/sigil-app'
import { createEditor, type EditorOptions, type SigilEditor } from '@cluion/sigil'
import {
  createEngine,
  resolveHtmlIdConflicts,
  getHtmlAnchorInfo,
  renameHtmlAnchor,
  type HtmlAnchorInfo,
  type HtmlAnchorResult,
  type ComponentUpdate,
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
  type HistoryEngine,
  type HistoryState,
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
  collectPageImages,
  type PageImage,
  createBlocksPanel,
  createCanvas,
  createInspector,
  createLayersPanel,
  createPageLinksPanel,
  createPropsPanel,
  createSelectionPath,
  createTemplateLibraryController,
  openMediaPicker,
  openHistoryDialog,
  openPageTextDialog,
  type AcceptsTypographyValue,
  type TypographyProperty,
  type HistoryDialogOptions,
  type PageLinksPanelOptions,
  type PageTextDialogOptions,
  type CanvasHandle,
  type CanvasSelectionCommands,
  type FAQEditingOptions,
  type SelectionPathHandle,
  type SelectionPathOptions,
  type RichTextAdapter,
  type RichTextSession,
  type BlocksInput as UIBlocksInput,
} from '@cluion/sigil-ui'
import {
  defineBlock,
  basicBlocks,
  basicBlockDefs,
  marketingBlockDefs,
  accordionFAQBlockDef,
  blockAccordionFAQ,
  blockFAQItem,
  blockHeading,
  blockSection,
  blockShortcode,
  templateToBlockDef,
  type BlocksInput,
  type FAQItemOptions,
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
  Assert<Equal<ReturnType<HistoryEngine['goToHistory']>, boolean>>,
  Assert<Equal<ReturnType<HistoryEngine['getHistory']>, HistoryState>>,
  Assert<Equal<ReturnType<typeof createApp>['engine'], HistoryEngine>>,
  Assert<Equal<ReturnType<typeof createEditor>['engine'], HistoryEngine>>,
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
  uploadAccept: 'image/png',
  describeUploadError: (error) =>
    error instanceof RangeError
      ? { message: 'Choose a smaller image.', retryable: false }
      : undefined,
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
export const insertable: ComponentNode = resolveHtmlIdConflicts(template.node, doc.root)
export const recordBlocks: BlocksInput = basicBlocks
export const sectionHeading: ComponentNode = blockHeading('Workshop details', 2)
const faqItem: FAQItemOptions = { question: '何時報到？', answer: '下午兩點。' }
export const faqEntry: ComponentNode = blockFAQItem(faqItem)
export const faqEditing: FAQEditingOptions = { createItem: blockFAQItem }
export const faqSection: ComponentNode = blockAccordionFAQ({ items: [faqItem] })
export const faqBlocks: BlocksInput = [accordionFAQBlockDef]
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
  const acceptsCustomGridTracks = (value: string) => value.length <= 256
  const acceptsColorValue = (value: string) => !value.includes('var(')
  const acceptsSpacingValue = (value: string) => value.length <= 256
  const acceptsTypographyValue: AcceptsTypographyValue = (property: TypographyProperty, value) =>
    property !== 'letter-spacing' || !value.includes('var(')
  const options: AppOptions = {
    mount,
    doc,
    store: asynchronousProjectStore,
    getExportTitle: (snapshot) => snapshot.meta?.title,
    prepareDownload: async (snapshot, signal) => {
      signal.throwIfAborted()
      return snapshot
    },
    renderPageNavigation: () => document.createElement('nav'),
    assets: asynchronousAssets,
    acceptsImageAttribute: (name, value) => name === 'alt' || value.startsWith('/'),
    templates: asynchronousTemplates,
    blocks: definitionBlocks,
    blockPinStorageKey: 'workshop-editor',
    acceptsTypographyValue,
    acceptsSpacingValue,
    acceptsColorValue,
    acceptsCustomGridTracks,
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
    assets: synchronousAssets,
    store: synchronousProjectStore,
    templates: synchronousTemplates,
    blocks: recordBlocks,
    blockPinStorageKey: false,
    acceptsTypographyValue,
    acceptsSpacingValue,
    acceptsColorValue,
    acceptsCustomGridTracks,
    shortcodes: [shortcode],
    richText,
    sanitize,
    hooks,
  }
  const app: SigilApp = createApp(options)
  app.setDocumentTitle('Workshop')
  const editor: SigilEditor = createEditor(editorOptions)
  const engine = createEngine({ doc })
  const history = engine.getHistory()
  engine.goToHistory(history.currentId)
  const historyOptions: HistoryDialogOptions = { mount: document.body, engine }
  const historyDialog = openHistoryDialog(historyOptions)
  historyDialog.close()
  engine.updateTextContents(new Map([['title', 'Winter workshop']]))
  const unsubscribeText = engine.subscribe((event) => {
    if (event.type === 'tree') event.textChanges?.patches.forEach((patch) => void patch.content)
  })
  unsubscribeText()
  const findOptions: PageTextDialogOptions = {
    mount: document.body,
    engine,
    richText: richTextResolver,
    device: 'mobile',
    initialQuery: 'workshop',
    onReveal: (id) => engine.select(id),
  }
  openPageTextDialog(findOptions).close()
  const closeMedia = openMediaPicker({
    pageImages: (): readonly PageImage[] => collectPageImages(engine.getTree(), richTextResolver),
    onPick: (item: AssetItem) => void item.url,
    acceptsImageAttribute: options.acceptsImageAttribute,
    onInsertUrl: (url: string, alt: string) =>
      engine.insert(doc.root.id, {
        id: 'new-image',
        type: 'image',
        attributes: { src: url, alt },
      }),
    onClose() {},
  })
  closeMedia()
  const linkOptions: PageLinksPanelOptions = {
    richText: richTextResolver,
    onEdit(id) {
      if (links.hasSource(engine.getTree(), id)) engine.select(id)
    },
  }
  const links = createPageLinksPanel(doc.root, linkOptions)
  mount.append(links.el)
  links.refreshLocale()
  links.destroy()
  const anchor: HtmlAnchorInfo | undefined = getHtmlAnchorInfo(engine.getTree(), doc.root.id)
  if (anchor && !anchor.name) {
    const result: HtmlAnchorResult = renameHtmlAnchor(engine, doc.root.id, 'workshop')
    if (result.ok) {
      const change: ComponentUpdate = { removeAttributes: ['title'] }
      engine.update(doc.root.id, change)
    }
  }
  const inspector = createInspector(engine, mount, {
    acceptsTypographyValue,
    acceptsSpacingValue,
    acceptsColorValue,
    acceptsCustomGridTracks,
    faq: faqEditing,
    onRevealLinkTarget: () => canvas.revealSelection?.({ focusToolbar: true }),
  })
  const layers = createLayersPanel(engine, mount, {
    searchable: true,
    headingOutline: true,
    preserveSearchOnActivate: () => true,
  })
  layers.setSearchVisible(false)
  layers.setSearchVisible(true)
  layers.focus()
  layers.focus('search')
  layers.destroy()
  createPropsPanel(engine, mount, {
    acceptsTypographyValue,
    faq: faqEditing,
    acceptsSpacingValue,
    acceptsCustomGridTracks,
    acceptsColorValue,
  }).destroy()
  const eventListener = (event: EngineEvent): void => {
    if (event.type === 'patch' && event.patch.type === 'update') {
      const tag: string | undefined = event.patch.tagName
      void tag
    }
  }
  const unsubscribe = engine.subscribe(eventListener)
  const policy = createDefaultPolicy({ sanitize, trustedTypesPolicyName: 'host' })
  const resolver: ShortcodeResolver = createShortcodeResolver({
    registry: createShortcodeRegistry([shortcode]),
    policy,
  })
  const renderer = createRenderer({ htmlPolicy: policy, shortcodeResolver: resolver })
  const selectionCommands: CanvasSelectionCommands = {
    registry: createCommandRegistry(),
    context: () => context,
  }
  const pathOptions: SelectionPathOptions = {
    compact: false,
    onActivate: () => canvas.revealSelection?.(),
  }
  const selectionPath: SelectionPathHandle = createSelectionPath(engine, mount, pathOptions)
  const canvas: CanvasHandle = createCanvas(engine, mount, {
    onModeChange: (mode) => selectionPath.setVisible(mode === 'edit'),
    selectionToolbarContainer: document.createElement('div'),
    rendererOptions: { htmlPolicy: policy },
    richText,
    selectionCommands,
    onEditLink: (id) => inspector.openLinkSettings?.(id),
    onEditImageLink: (id) => inspector.openImageLink?.(id),
    onEditTypography: (id) => inspector.openTypography?.(id),
    onEditLeadingText: (id) => inspector.openLeadingText?.(id),
    onEditingDirtyChange: (dirty) => {
      void dirty
    },
  })
  const frame: HTMLIFrameElement = canvas.iframe
  createBlocksPanel(engine, mount, frame, definitionBlocks, {
    blockPinStorageKey: 'custom-library',
  }).destroy()
  void frame
  canvas.setDevice('mobile')
  selectionPath.setCompact(true)
  if (canvas.canMoveSelection?.()) canvas.moveSelection?.(mount)
  canvas.commitEditing({ forSave: true })
  canvas.setMode('preview')
  inspector.destroy()
  selectionPath.destroy()
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
