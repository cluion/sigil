// @cluion/sigil-core — 零依賴引擎地基

export * from './policy/index.js'
export * from './model/index.js'
export * from './engine/index.js'
export * from './renderer/index.js'
export * from './serialize/index.js'
export * from './signal/index.js'
export * from './hydrate.js'
export * from './i18n.js'
export * from './commands.js'
export * from './builtin-commands.js'
export * from './hooks.js'
export type { ProjectStore, AssetStore, AssetItem, TemplateStore, TemplateDef } from './adapters.js'

export { SIGIL_CORE_VERSION } from './version.js'
