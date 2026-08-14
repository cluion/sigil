import { afterEach, describe, it, expect, vi } from 'vitest'
import { createEngine, createI18n, type I18n } from '@cluion/sigil-core'
import { createBlocksPanel } from '../src/blocks-panel.js'

describe('createBlocksPanel', () => {
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('BlockDef 陣列顯示分類與圖示', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    createBlocksPanel(engine, box, iframe, [
      {
        id: 't',
        label: '文字',
        category: '內容',
        icon: 'T',
        create: () => ({ id: 'x', type: 'text', content: 'a' }),
      },
      {
        id: 's',
        label: '容器',
        category: '版面',
        icon: '▦',
        create: () => ({ id: 'y', type: 'section', children: [] }),
      },
    ])
    const cats = [...box.querySelectorAll('.sigil-blocks-category')].map((el) => el.textContent)
    expect(cats).toContain('內容')
    expect(cats).toContain('版面')
    expect(box.querySelector('.sigil-block-icon')?.textContent).toBeTruthy()
  })

  it('搜尋過濾 keywords', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    createBlocksPanel(engine, box, iframe, [
      {
        id: 'hero',
        label: '主視覺',
        category: '媒體',
        keywords: ['banner'],
        create: () => ({ id: 'h', type: 'image', attributes: { src: '' } }),
      },
      {
        id: 'txt',
        label: '文字',
        category: '內容',
        create: () => ({ id: 't', type: 'text', content: '' }),
      },
    ])
    const search = box.querySelector('input') as HTMLInputElement
    search.value = 'banner'
    search.dispatchEvent(new Event('input'))
    const labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toEqual(['主視覺'])
  })

  it('reload 後新項目出現', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    const panel = createBlocksPanel(engine, box, iframe, [
      { id: 'a', label: 'A', create: () => ({ id: 'a', type: 'text', content: '' }) },
    ])
    let labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toEqual(['A'])

    // 另存後注入新範本
    panel.reload([
      { id: 'a', label: 'A', create: () => ({ id: 'a', type: 'text', content: '' }) },
      {
        id: 'b',
        label: 'B',
        category: '範本',
        create: () => ({ id: 'b', type: 'text', content: '' }),
      },
    ])
    labels = [...box.querySelectorAll('.sigil-block-label')].map((el) => el.textContent)
    expect(labels).toContain('B')
  })

  it('Enter／Space 將區塊插入 root 並選取新節點', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const iframe = document.createElement('iframe')
    let nextId = 0
    createBlocksPanel(engine, box, iframe, [
      {
        id: 'text',
        label: '文字',
        create: () => ({ id: `text-${++nextId}`, type: 'text', content: '' }),
      },
    ])
    const item = box.querySelector('[role="button"]') as HTMLElement
    expect(item.getAttribute('aria-label')).toBe('插入 文字')

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(engine.getTree().children?.map((node) => node.id)).toEqual(['text-1'])
    expect(engine.getSelection()).toBe('text-1')

    item.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(engine.getTree().children?.map((node) => node.id)).toEqual(['text-1', 'text-2'])
    expect(engine.getSelection()).toBe('text-2')
  })

  it('只為有 actions 的項目顯示操作入口並執行重命名', async () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    const rename = vi.fn()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(' 新名稱 ')
    createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      [
        { id: 'static', label: '靜態', create: () => ({ id: 's', type: 'text' }) },
        {
          id: 'template:hero',
          label: 'Hero',
          create: () => ({ id: 'h', type: 'section', children: [] }),
        },
      ],
      {
        itemActions: (block) =>
          block.id.startsWith('template:') ? { rename, remove: vi.fn() } : undefined,
      },
    )

    const triggers = box.querySelectorAll<HTMLButtonElement>('.sigil-block-actions-trigger')
    expect(triggers).toHaveLength(1)
    const trigger = triggers[0]!
    expect(trigger.closest('.sigil-block-row')?.getAttribute('data-block-id')).toBe('template:hero')
    trigger.focus()
    trigger.click()

    const menu = document.querySelector('.sigil-context-menu') as HTMLElement
    expect(menu.getAttribute('aria-label')).toBe('Hero 範本操作')
    const actions = menu.querySelectorAll<HTMLButtonElement>('.sigil-context-menu-item')
    expect([...actions].map((button) => button.textContent)).toEqual(['重新命名', '刪除'])
    actions[0]!.click()

    expect(prompt).toHaveBeenCalledWith('範本名稱', 'Hero')
    expect(rename).toHaveBeenCalledWith('新名稱')
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    await Promise.resolve()
    expect(trigger.getAttribute('aria-busy')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('刪除先確認名稱，pending 時避免重複開啟', async () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    let resolveRemove!: () => void
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve
        }),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      [
        {
          id: 'template:hero',
          label: 'Hero',
          create: () => ({ id: 'h', type: 'section', children: [] }),
        },
      ],
      { itemActions: () => ({ remove }) },
    )

    const trigger = box.querySelector('.sigil-block-actions-trigger') as HTMLButtonElement
    trigger.click()
    ;(document.querySelector('[data-menu-item-id="remove"]') as HTMLButtonElement).click()
    expect(confirm).toHaveBeenLastCalledWith('確定刪除範本「Hero」？')
    expect(remove).not.toHaveBeenCalled()

    trigger.click()
    ;(document.querySelector('[data-menu-item-id="remove"]') as HTMLButtonElement).click()
    expect(remove).toHaveBeenCalledOnce()
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    expect(trigger.getAttribute('aria-disabled')).toBe('true')

    trigger.click()
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    expect(remove).toHaveBeenCalledOnce()

    resolveRemove()
    await Promise.resolve()
    await Promise.resolve()
    expect(trigger.getAttribute('aria-busy')).toBe('false')
    expect(trigger.getAttribute('aria-disabled')).toBe('false')
  })

  it('鍵盤開啟操作選單，Escape 關閉後還原焦點', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    document.body.appendChild(box)
    createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      [
        {
          id: 'template:hero',
          label: 'Hero',
          create: () => ({ id: 'h', type: 'section', children: [] }),
        },
      ],
      { itemActions: () => ({ rename: vi.fn() }) },
    )

    const item = box.querySelector('.sigil-block-item') as HTMLElement
    item.focus()
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }))
    expect(document.querySelector('.sigil-context-menu')).toBeTruthy()
    expect(document.activeElement).toBe(
      document.querySelector<HTMLButtonElement>('[data-menu-item-id="rename"]'),
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.sigil-context-menu')).toBeNull()
    expect(document.activeElement).toBe(item)
  })

  it('action rejection 回報宿主並解除 pending', async () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const error = new Error('remove failed')
    const onItemActionError = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      [
        {
          id: 'template:hero',
          label: 'Hero',
          create: () => ({ id: 'h', type: 'section', children: [] }),
        },
      ],
      {
        itemActions: () => ({
          remove: async () => {
            throw error
          },
        }),
        onItemActionError,
      },
    )

    const trigger = box.querySelector('.sigil-block-actions-trigger') as HTMLButtonElement
    trigger.click()
    ;(document.querySelector('[data-menu-item-id="remove"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()

    expect(onItemActionError).toHaveBeenCalledWith(
      error,
      'remove',
      expect.objectContaining({ id: 'template:hero' }),
    )
    expect(trigger.getAttribute('aria-busy')).toBe('false')
  })

  it('setStatus 顯示 loading 與可重試 error', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const panel = createBlocksPanel(engine, box, document.createElement('iframe'), {
      Text: () => ({ id: 't', type: 'text', content: '' }),
    })

    panel.setStatus({ kind: 'loading', message: '正在載入範本…' })
    const status = box.querySelector('.sigil-blocks-status') as HTMLElement
    expect(status.hidden).toBe(false)
    expect(status.getAttribute('role')).toBe('status')
    expect(status.textContent).toBe('正在載入範本…')

    const retry = vi.fn()
    panel.setStatus({ kind: 'error', message: '範本載入失敗', retryLabel: '重試', retry })
    expect(status.getAttribute('role')).toBe('alert')
    expect(status.dataset.kind).toBe('error')
    ;(status.querySelector('button') as HTMLButtonElement).click()
    expect(retry).toHaveBeenCalledOnce()

    panel.setStatus(null)
    expect(status.hidden).toBe(true)
  })

  it('runtime locale 切換更新文字並保留搜尋，destroy 後停止更新', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const box = document.createElement('div')
    const i18n = createI18n({
      zh: {},
      en: {
        'blocks.search_placeholder': 'Search blocks…',
        'blocks.search_label': 'Search blocks',
        'blocks.insert': 'Insert',
        'blocks.default_category': 'General',
        'blocks.empty': 'No matching blocks',
        'blocks.actions': 'Template actions',
        'blocks.rename': 'Rename',
        'blocks.rename_prompt': 'Template name',
        'blocks.remove': 'Delete',
        'blocks.remove_confirm_before': 'Delete template “',
        'blocks.remove_confirm_after': '”?',
        'blocks.pending': 'Working on',
        'blocks.retry': 'Retry',
      },
    })
    const panel = createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      { Text: () => ({ id: 't', type: 'text', content: '' }) },
      { i18n, itemActions: () => ({ rename: vi.fn(), remove: vi.fn() }) },
    )

    const search = box.querySelector('input[type="search"]') as HTMLInputElement
    search.value = 'text'
    search.dispatchEvent(new Event('input'))
    const tree = engine.getTree()
    const retry = vi.fn()
    panel.setStatus({ kind: 'error', message: 'Host error', retry })

    expect(search.placeholder).toBe('搜尋區塊…')
    expect(box.querySelector('.sigil-blocks-category')?.textContent).toBe('一般')
    expect(box.querySelector('.sigil-blocks-retry')?.textContent).toBe('重試')

    i18n.setLocale('en')

    expect(search.placeholder).toBe('Search blocks…')
    expect(search.getAttribute('aria-label')).toBe('Search blocks')
    expect(search.value).toBe('text')
    expect(engine.getTree()).toBe(tree)
    expect(box.querySelector('.sigil-blocks-category')?.textContent).toBe('General')
    expect(box.querySelector('.sigil-blocks-retry')?.textContent).toBe('Retry')
    expect(box.querySelector('[role="button"]')?.getAttribute('aria-label')).toBe('Insert Text')
    const trigger = box.querySelector('.sigil-block-actions-trigger') as HTMLButtonElement
    expect(trigger.getAttribute('aria-label')).toBe('Text Template actions')
    trigger.click()
    expect(document.querySelector('.sigil-context-menu')?.getAttribute('aria-label')).toBe(
      'Text Template actions',
    )
    expect(
      [...document.querySelectorAll('.sigil-context-menu-item')].map((item) => item.textContent),
    ).toEqual(['Rename', 'Delete'])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    i18n.setLocale('zh')
    expect(search.placeholder).toBe('搜尋區塊…')
    expect(box.querySelector('.sigil-blocks-category')?.textContent).toBe('一般')
    expect(box.querySelector('.sigil-blocks-retry')?.textContent).toBe('重試')

    i18n.setLocale('en')
    search.value = 'missing'
    search.dispatchEvent(new Event('input'))
    expect(box.querySelector('.sigil-muted')?.textContent).toBe('No matching blocks')

    panel.destroy()
    i18n.setLocale('zh')
    expect(search.placeholder).toBe('Search blocks…')
  })

  it('只有基礎 I18n contract 的 adapter 維持 mount-time 翻譯', () => {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'r', type: 'section', children: [] } },
    })
    const messages: Record<string, string> = {
      'blocks.search_placeholder': 'Host search',
      'blocks.default_category': 'Host category',
    }
    const i18n: I18n = {
      t: (key) => messages[key] ?? key,
      setLocale: vi.fn(),
    }
    const box = document.createElement('div')

    const panel = createBlocksPanel(
      engine,
      box,
      document.createElement('iframe'),
      { Text: () => ({ id: 't', type: 'text', content: '' }) },
      { i18n },
    )

    expect((box.querySelector('input') as HTMLInputElement).placeholder).toBe('Host search')
    expect(box.querySelector('.sigil-blocks-category')?.textContent).toBe('Host category')
    panel.destroy()
  })
})
