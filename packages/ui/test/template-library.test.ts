import { describe, expect, it, vi, type Mock } from 'vitest'
import { createI18n, type TemplateDef, type TemplateStore } from '@cluion/sigil-core'
import {
  createTemplateLibraryController,
  type BlockDef,
  type BlocksPanelHandle,
  type BlocksPanelStatus,
} from '../src/index.js'

function template(id: string, label: string): TemplateDef {
  return { id, label, node: { id: `node-${id}`, type: 'section', children: [] } }
}

function mapTemplate(value: TemplateDef): BlockDef {
  return {
    id: `template:${value.id}`,
    label: value.label,
    create: () => value.node,
  }
}

function panelStub(): BlocksPanelHandle & {
  reload: Mock<BlocksPanelHandle['reload']>
  setStatus: Mock<BlocksPanelHandle['setStatus']>
} {
  return {
    destroy: vi.fn(),
    reload: vi.fn<BlocksPanelHandle['reload']>(),
    setStatus: vi.fn<BlocksPanelHandle['setStatus']>(),
  }
}

function lastStatus(panel: ReturnType<typeof panelStub>): BlocksPanelStatus | null {
  return panel.setStatus.mock.calls.at(-1)?.[0] as BlocksPanelStatus | null
}

describe('createTemplateLibraryController', () => {
  it('runtime locale 切換更新進行中與失敗狀態，destroy 後停止更新', async () => {
    let rejectList!: (reason?: unknown) => void
    const request = new Promise<TemplateDef[]>((_resolve, reject) => {
      rejectList = reject
    })
    const i18n = createI18n({
      zh: {},
      en: {
        'blocks.templates_loading': 'Loading templates…',
        'blocks.templates_load_failed': 'Failed to load templates',
        'blocks.retry': 'Retry',
      },
    })
    const panel = panelStub()
    const controller = createTemplateLibraryController({
      store: { list: () => request, save: vi.fn() },
      panel,
      mapTemplate,
      i18n,
    })

    const loading = controller.reload()
    expect(lastStatus(panel)?.message).toBe('正在載入範本…')

    i18n.setLocale('en')
    expect(lastStatus(panel)?.message).toBe('Loading templates…')

    rejectList(new Error('failed'))
    expect(await loading).toBe(false)
    expect(lastStatus(panel)).toMatchObject({
      message: 'Failed to load templates',
      retryLabel: 'Retry',
    })

    controller.destroy()
    i18n.setLocale('zh')
    expect(lastStatus(panel)?.message).toBe('Failed to load templates')
  })

  it('載入範本並與 Record blocks 正確合併', async () => {
    let resolveList!: (templates: TemplateDef[]) => void
    const store: TemplateStore = {
      list: () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
      save: vi.fn(),
    }
    const panel = panelStub()
    const controller = createTemplateLibraryController({
      store,
      blocks: { Text: () => ({ id: 'text', type: 'text' }) },
      panel,
      mapTemplate,
    })

    const loading = controller.reload()
    expect(lastStatus(panel)).toEqual({ kind: 'loading', message: '正在載入範本…' })
    resolveList([template('hero', 'Hero')])
    expect(await loading).toBe(true)

    const merged = panel.reload.mock.calls[0]![0] as BlockDef[]
    expect(merged.map(({ id }) => id)).toEqual(['Text', 'template:hero'])
    expect(lastStatus(panel)).toBeNull()
  })

  it('rename 以相同 id save，remove capability 存在時刪除並 reload', async () => {
    let templates = [template('hero', 'Hero')]
    const save = vi.fn((next: TemplateDef) => {
      templates = templates.map((value) => (value.id === next.id ? next : value))
    })
    const remove = vi.fn((id: string) => {
      templates = templates.filter((value) => value.id !== id)
    })
    const panel = panelStub()
    const controller = createTemplateLibraryController({
      store: { list: () => templates, save, remove },
      panel,
      mapTemplate,
    })
    await controller.reload()

    const actions = controller.itemActions(mapTemplate(templates[0]!))!
    await actions.rename?.('新名稱')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'hero', label: '新名稱' }))
    expect((panel.reload.mock.calls.at(-1)?.[0] as BlockDef[]).map(({ label }) => label)).toEqual([
      '新名稱',
    ])

    await actions.remove?.()
    expect(remove).toHaveBeenCalledWith('hero')
    expect(panel.reload.mock.calls.at(-1)?.[0]).toEqual([])
  })

  it('沒有 remove capability 時不提供刪除動作', async () => {
    const value = template('hero', 'Hero')
    const controller = createTemplateLibraryController({
      store: { list: () => [value], save: vi.fn() },
      panel: panelStub(),
      mapTemplate,
    })
    await controller.reload()

    const actions = controller.itemActions(mapTemplate(value))!
    expect(actions.rename).toBeTypeOf('function')
    expect(actions.remove).toBeUndefined()
  })

  it('list 失敗顯示 retry，重試成功後清除狀態', async () => {
    let attempts = 0
    const panel = panelStub()
    const controller = createTemplateLibraryController({
      store: {
        list: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('list failed')
          return [template('hero', 'Hero')]
        },
        save: vi.fn(),
      },
      panel,
      mapTemplate,
    })

    expect(await controller.reload()).toBe(false)
    const failed = lastStatus(panel)!
    expect(failed).toMatchObject({ kind: 'error', message: '範本載入失敗' })
    failed.retry?.()

    await vi.waitFor(() => expect(panel.reload).toHaveBeenCalledOnce())
    expect(attempts).toBe(2)
    expect(lastStatus(panel)).toBeNull()
  })

  it('save 與 remove 失敗保留重試上下文', async () => {
    let templates = [template('hero', 'Hero')]
    let saveAttempts = 0
    let removeAttempts = 0
    const save = vi.fn((next: TemplateDef) => {
      saveAttempts += 1
      if (saveAttempts === 1) throw new Error('save failed')
      templates = [next]
    })
    const remove = vi.fn(() => {
      removeAttempts += 1
      if (removeAttempts === 1) throw new Error('remove failed')
      templates = []
    })
    const panel = panelStub()
    const controller = createTemplateLibraryController({
      store: { list: () => templates, save, remove },
      panel,
      mapTemplate,
    })
    await controller.reload()

    const actions = controller.itemActions(mapTemplate(templates[0]!))!
    await actions.rename?.('重試名稱')
    expect(lastStatus(panel)).toMatchObject({ kind: 'error', message: '範本儲存失敗' })
    lastStatus(panel)?.retry?.()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ label: '重試名稱' }))

    const refreshedActions = controller.itemActions(mapTemplate(templates[0]!))!
    await refreshedActions.remove?.()
    expect(lastStatus(panel)).toMatchObject({ kind: 'error', message: '範本刪除失敗' })
    lastStatus(panel)?.retry?.()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    expect(templates).toEqual([])
    await vi.waitFor(() => expect(lastStatus(panel)).toBeNull())
  })
})
