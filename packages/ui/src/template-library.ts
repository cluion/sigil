import type { I18n, TemplateDef, TemplateStore } from '@cluion/sigil-core'
import type { BlockDef, BlockItemActions, BlocksInput, BlocksPanelHandle } from './blocks-panel.js'
import { uiText } from './i18n.js'

export interface TemplateLibraryOptions {
  store: TemplateStore
  blocks?: BlocksInput
  panel: BlocksPanelHandle
  mapTemplate: (template: TemplateDef) => BlockDef
  i18n?: I18n
}

export interface TemplateLibraryController {
  reload: () => Promise<boolean>
  save: (template: TemplateDef) => Promise<boolean>
  itemActions: (block: BlockDef) => BlockItemActions | undefined
  destroy: () => void
}

type TemplateOperation = 'list' | 'save' | 'remove'

function mergeBlocks(base: BlocksInput | undefined, templates: BlockDef[]): BlocksInput {
  if (!base) return templates
  if (Array.isArray(base)) return [...base, ...templates]
  return [
    ...Object.entries(base).map(([label, create]) => ({ id: label, label, create })),
    ...templates,
  ]
}

function pendingText(i18n: I18n | undefined, operation: TemplateOperation): string {
  const values: Record<TemplateOperation, [string, string]> = {
    list: ['blocks.templates_loading', '正在載入範本…'],
    save: ['blocks.template_saving', '正在儲存範本…'],
    remove: ['blocks.template_removing', '正在刪除範本…'],
  }
  const [key, fallback] = values[operation]
  return uiText(i18n, key, fallback)
}

function errorText(i18n: I18n | undefined, operation: TemplateOperation): string {
  const values: Record<TemplateOperation, [string, string]> = {
    list: ['blocks.templates_load_failed', '範本載入失敗'],
    save: ['blocks.template_save_failed', '範本儲存失敗'],
    remove: ['blocks.template_remove_failed', '範本刪除失敗'],
  }
  const [key, fallback] = values[operation]
  return uiText(i18n, key, fallback)
}

/**
 * 將 TemplateStore 的非同步操作、面板 reload 與錯誤重試收斂成單一路徑
 */
export function createTemplateLibraryController(
  options: TemplateLibraryOptions,
): TemplateLibraryController {
  let destroyed = false
  let requestId = 0
  let templatesByBlockId = new Map<string, TemplateDef>()

  function isActive(id: number): boolean {
    return !destroyed && id === requestId
  }

  function showPending(operation: TemplateOperation): void {
    options.panel.setStatus({ kind: 'loading', message: pendingText(options.i18n, operation) })
  }

  function showError(operation: TemplateOperation, retry: () => Promise<boolean>): void {
    options.panel.setStatus({
      kind: 'error',
      message: errorText(options.i18n, operation),
      retryLabel: uiText(options.i18n, 'blocks.retry', '重試'),
      retry: () => {
        void retry()
      },
    })
  }

  function applyTemplates(templates: TemplateDef[]): void {
    const nextByBlockId = new Map<string, TemplateDef>()
    const templateBlocks = templates.map((template) => {
      const block = options.mapTemplate(template)
      nextByBlockId.set(block.id, template)
      return block
    })
    templatesByBlockId = nextByBlockId
    options.panel.reload(mergeBlocks(options.blocks, templateBlocks))
    options.panel.setStatus(null)
  }

  async function loadTemplates(id: number): Promise<boolean> {
    try {
      const templates = await Promise.resolve(options.store.list())
      if (!isActive(id)) return false
      applyTemplates(templates)
      return true
    } catch {
      if (isActive(id)) showError('list', reload)
      return false
    }
  }

  async function reload(): Promise<boolean> {
    if (destroyed) return false
    const id = ++requestId
    showPending('list')
    return loadTemplates(id)
  }

  async function mutate(
    operation: 'save' | 'remove',
    run: () => void | Promise<void>,
    retry: () => Promise<boolean>,
  ): Promise<boolean> {
    if (destroyed) return false
    const id = ++requestId
    showPending(operation)
    try {
      await run()
    } catch {
      if (isActive(id)) showError(operation, retry)
      return false
    }
    if (!isActive(id)) return false
    return loadTemplates(id)
  }

  function save(template: TemplateDef): Promise<boolean> {
    return mutate(
      'save',
      () => options.store.save(template),
      () => save(template),
    )
  }

  function remove(template: TemplateDef): Promise<boolean> {
    if (!options.store.remove) return Promise.resolve(false)
    return mutate(
      'remove',
      () => options.store.remove!(template.id),
      () => remove(template),
    )
  }

  return {
    reload,
    save,
    itemActions(block) {
      if (destroyed) return undefined
      const template = templatesByBlockId.get(block.id)
      if (!template) return undefined
      return {
        rename: async (label) => {
          await save({ ...template, label })
        },
        ...(options.store.remove
          ? {
              remove: async () => {
                await remove(template)
              },
            }
          : {}),
      }
    },
    destroy() {
      destroyed = true
      requestId += 1
      templatesByBlockId.clear()
    },
  }
}
