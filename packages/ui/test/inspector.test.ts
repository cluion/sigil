import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type AssetItem } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'
import { createEnglishUiI18n } from './i18n.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function mediaInspector(kind: 'image' | 'shortcode' | 'both') {
  const gate = deferred<AssetItem>()
  const engine = createEngine({
    doc: {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        children: [
          {
            id: 'media',
            type: kind === 'shortcode' ? 'shortcode' : 'image',
            attributes: { src: 'original.png' },
            ...(kind !== 'image'
              ? { shortcode: { name: 'hero', props: { src: 'original.png' } } }
              : {}),
          },
          { id: 'other', type: 'text', content: 'Other' },
        ],
      },
    },
  })
  const i18n = createI18n({
    zh: {},
    en: {
      'inspector.image': 'Image',
      'form.pick_image': 'Choose image',
      'media.title': 'Media library',
      'media.uploading': 'Uploading…',
    },
  })
  const box = document.createElement('div')
  document.body.append(box)
  const assets = { list: vi.fn(() => []), upload: vi.fn(() => gate.promise) }
  const inspector = createInspector(engine, box, {
    assets,
    i18n,
    getShortcodeSchema: () => [{ name: 'src', type: 'media' }],
  })
  engine.select('media')
  cleanups.push(() => {
    inspector.destroy()
    engine.destroy()
    box.remove()
  })
  return { gate, engine, box, assets, inspector, i18n }
}

function startUpload(dialog: HTMLElement): void {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'image.png')],
  })
  input.dispatchEvent(new Event('change'))
}

describe('createInspector — responsive style', () => {
  it('runtime locale 切換更新分頁與內容並保留 tab／device', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [{ id: 't', type: 'text', content: 'Hello', style: { margin: '16px' } }],
        },
      },
    })
    const box = document.createElement('div')
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const inspector = createInspector(engine, box, { i18n })

    expect([...box.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      '內容',
      '樣式',
      '進階',
    ])
    expect(box.textContent).toContain('尚未選取元件')
    engine.select('t')
    expect(box.querySelector('.sigil-field-label')?.textContent).toBe('內容')

    ;(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
        (tab) => tab.textContent === '樣式',
      ) as HTMLButtonElement
    ).click()
    inspector.setDevice('tablet')
    const tree = engine.getTree()

    i18n.setLocale('en')

    expect(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')]
        .find((tab) => tab.textContent === 'Style')
        ?.getAttribute('aria-selected'),
    ).toBe('true')
    expect(engine.getTree()).toBe(tree)
    expect(
      [...box.querySelectorAll('.sigil-section-title')].map((title) => title.textContent),
    ).toEqual(['Layout', 'Typography', 'Appearance'])
    expect(box.querySelector('.sigil-responsive-style-context')?.textContent).toContain(
      'Inherits Desktop when not overridden',
    )
    expect(box.textContent).toContain('Use inherited')
    expect(box.textContent).toContain('Clear Tablet Override')

    ;(
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
        (tab) => tab.textContent === 'Advanced',
      ) as HTMLButtonElement
    ).click()
    expect(box.textContent).toContain('Delete component')
    inspector.destroy()
    i18n.setLocale('zh')
    expect([...box.querySelectorAll('.sigil-tab')].map((tab) => tab.textContent)).toEqual([
      'Content',
      'Style',
      'Advanced',
    ])
  })

  it('裝置切換後顯示繼承來源，清除只影響目前 breakpoint', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'n',
          type: 'section',
          style: { margin: '16px' },
          responsiveStyles: { tablet: { margin: '8px', color: '#ff0000' } },
        },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box)
    const styleTab = [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
      (button) => button.textContent === '樣式',
    )!
    styleTab.click()
    inspector.setDevice('tablet')

    const context = box.querySelector('.sigil-responsive-style-context') as HTMLElement
    expect(context.dataset.styleDevice).toBe('tablet')
    expect(context.textContent).toContain('繼承 Desktop')

    const clear = [...box.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('清除 Tablet 覆寫'),
    )!
    clear.click()
    expect(engine.getTree().style?.margin).toBe('16px')
    expect(engine.getTree().responsiveStyles?.tablet).toBeUndefined()

    const marginReset = box.querySelector('button[data-style-reset="margin"]') as HTMLButtonElement
    const margin = marginReset.parentElement?.querySelector('input') as HTMLInputElement
    expect(margin.value).toBe('')
    expect(margin.placeholder).toBe('繼承：16px')
    inspector.destroy()
  })

  it('resolver 支援既有文字型別時改為富文字唯讀摘要', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'n', type: 'text', content: '<p><em>Hello</em> inspector</p>' },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, {
      richText: {
        supports: (node) => node.id === 'n',
        read: (node) => node.content ?? '',
      },
    })

    expect(box.querySelector('.sigil-rich-text-summary')?.textContent).toBe('Hello inspector')
    expect(box.querySelector('.sigil-rich-text-hint')?.textContent).toBe('請在畫布編輯富文字')
    expect(box.querySelector('.sigil-field input')).toBeNull()
    expect(box.textContent).not.toContain('此節點無可編輯內容欄位')
    inspector.destroy()
  })
})

describe('createInspector — media lifecycle', () => {
  it('延遲上傳與手動輸入圖片 URL 都保留其他最新 attributes', async () => {
    const { gate, engine, box } = mediaInspector('image')
    ;(box.querySelector('.sigil-field-row button') as HTMLButtonElement).click()
    startUpload(document.querySelector('.sigil-media-backdrop') as HTMLElement)
    engine.update('media', { attributes: { src: 'original.png', alt: 'Updated alt' } })

    gate.resolve({ id: 'new', url: 'uploaded.png' })
    await gate.promise
    expect(engine.getTree().children?.[0]?.attributes).toEqual({
      src: 'uploaded.png',
      alt: 'Updated alt',
    })
    const input = box.querySelector('.sigil-field-row input') as HTMLInputElement
    expect(input.value).toBe('uploaded.png')
    engine.update('media', {
      attributes: { src: 'uploaded.png', alt: 'Latest alt', title: 'Host title' },
    })
    input.value = 'manual.png'
    input.dispatchEvent(new Event('input'))
    expect(engine.getTree().children?.[0]?.attributes).toEqual({
      src: 'manual.png',
      alt: 'Latest alt',
      title: 'Host title',
    })
  })

  it.each([
    ['image', 'destroy'],
    ['image', 'selection'],
    ['shortcode', 'destroy'],
    ['shortcode', 'selection'],
  ] as const)('%s picker 在 %s 後關閉，延遲上傳不更新舊節點', async (kind, teardown) => {
    const { gate, engine, box, assets, inspector } = mediaInspector(kind)
    const pick = box.querySelector('.sigil-field-row button') as HTMLButtonElement
    const input = box.querySelector('.sigil-field-row input') as HTMLInputElement
    pick.click()
    pick.click()
    expect(document.querySelectorAll('.sigil-media-backdrop')).toHaveLength(1)
    expect(assets.list).toHaveBeenCalledOnce()
    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    startUpload(dialog)
    expect(assets.upload).toHaveBeenCalledOnce()

    if (teardown === 'destroy') inspector.destroy()
    else engine.select('other')
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    const snapshot = structuredClone(engine.toJSON())
    pick.click()
    input.value = 'stale-input.png'
    input.dispatchEvent(new Event('input'))
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    gate.resolve({ id: 'new', url: 'late-upload.png' })
    await gate.promise
    expect(engine.toJSON()).toEqual(snapshot)
    expect(dialog.isConnected).toBe(false)
  })

  it('切換 Inspector 分頁會關閉舊媒體控制項的 picker', async () => {
    const { gate, engine, box } = mediaInspector('image')
    ;(box.querySelector('.sigil-field-row button') as HTMLButtonElement).click()
    startUpload(document.querySelector('.sigil-media-backdrop') as HTMLElement)
    ;(box.querySelectorAll('.sigil-tab')[1] as HTMLButtonElement).click()
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    gate.resolve({ id: 'new', url: 'late-upload.png' })
    await gate.promise
    expect(engine.getTree().children?.[0]?.attributes?.src).toBe('original.png')
  })

  it('同一節點的 image 與 shortcode media 控制項都會釋放', () => {
    const { box, inspector } = mediaInspector('both')
    const picks = [...box.querySelectorAll<HTMLButtonElement>('.sigil-field-row button')]
    expect(picks).toHaveLength(2)
    for (const pick of picks) pick.click()
    expect(document.querySelectorAll('.sigil-media-backdrop')).toHaveLength(2)
    inspector.destroy()
    expect(document.querySelectorAll('.sigil-media-backdrop')).toHaveLength(0)
    for (const pick of picks) pick.click()
    expect(document.querySelectorAll('.sigil-media-backdrop')).toHaveLength(0)
  })

  it.each(['image', 'shortcode'] as const)(
    '%s picker 在 runtime locale 更新時保留上傳與原控制項',
    async (kind) => {
      const { gate, engine, box, i18n } = mediaInspector(kind)
      const pick = box.querySelector('.sigil-field-row button') as HTMLButtonElement
      pick.click()
      const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
      startUpload(dialog)
      i18n.setLocale('en')
      expect(document.querySelector('.sigil-media-backdrop')).toBe(dialog)
      expect(box.querySelector('.sigil-field-row button')).toBe(pick)
      expect(pick.textContent).toBe('Choose image')
      expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
      expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Uploading…')
      gate.resolve({ id: 'new', url: 'uploaded.png' })
      await gate.promise
      const node = engine.getTree().children?.[0]
      expect(kind === 'image' ? node?.attributes?.src : node?.shortcode?.props.src).toBe(
        'uploaded.png',
      )
      expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    },
  )

  it('rich text locale refresh 讀取目前編輯內容而非建立時快照', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'text', type: 'text', content: '<p>Before</p>' },
      },
    })
    const i18n = createEnglishUiI18n()
    i18n.setLocale('zh')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, {
      i18n,
      richText: {
        supports: () => true,
        read: (node) => node.content ?? '',
      },
    })
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('text')
    engine.update('text', { content: '<p>After</p>' })
    i18n.setLocale('en')
    expect(box.querySelector('.sigil-rich-text-summary')?.textContent).toBe('After')
  })
})
