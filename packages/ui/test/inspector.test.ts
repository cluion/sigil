import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEngine, createI18n, type AssetItem, type ComponentNode } from '@cluion/sigil-core'
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
      'inspector.embedded_image': 'Embedded image',
      'inspector.replace_image_url': 'Paste an image URL to replace it',
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

describe('createInspector — 圖層名稱', () => {
  it('本頁圖片選圖會在重新開啟時讀取最新來源，鎖定目標會取消選圖', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          children: [
            { id: 'target', type: 'image', attributes: { src: '/one.jpg', alt: '一' } },
            { id: 'source', type: 'image', attributes: { src: '/two.jpg', alt: '二' } },
          ],
        },
      },
    })
    const box = document.createElement('div')
    document.body.append(box)
    const inspector = createInspector(engine, box)
    try {
      engine.select('target')
      const pick = box.querySelector<HTMLButtonElement>('.sigil-field-row button')!
      pick.click()
      const source = document.querySelectorAll<HTMLButtonElement>('.sigil-media-card')[1]!
      engine.update('target', { locked: true })
      expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
      source.click()
      expect(engine.getTree().children?.[0]?.attributes?.src).toBe('/one.jpg')
      engine.update('source', { attributes: { src: '/three.jpg' } })
      engine.update('target', { locked: false })
      pick.click()
      document.querySelectorAll<HTMLButtonElement>('.sigil-media-card')[1]!.click()
      expect(engine.getTree().children?.[0]?.attributes).toEqual({ src: '/three.jpg', alt: '一' })
      expect(document.activeElement).toBe(pick)
    } finally {
      inspector.destroy()
      box.remove()
      engine.destroy()
    }
  })

  it('保留進階設定的焦點，只有改名時才新增復原步驟', () => {
    const { box, engine } = mediaInspector('image')
    box.querySelector<HTMLButtonElement>('[role="tab"][id$="-advanced"]')!.click()
    const rename = box.querySelector<HTMLButtonElement>('.sigil-rename-layer')!
    const prompt = vi.spyOn(window, 'prompt')
    cleanups.push(() => prompt.mockRestore())
    prompt.mockReturnValueOnce(null).mockReturnValueOnce('').mockReturnValueOnce('封面')
    rename.focus()
    rename.click()
    rename.click()
    expect(engine.canUndo()).toBe(false)
    rename.click()
    expect(document.activeElement).toBe(rename)
    expect(box.querySelector('.sigil-inspector-head')?.textContent).toBe('封面')
    expect(engine.getTree().children?.[0]).toMatchObject({
      id: 'media',
      name: '封面',
      attributes: { src: 'original.png' },
    })
    engine.undo()
    expect(engine.getSelection()).toBe('media')
    expect(box.querySelector('.sigil-inspector-head')?.textContent).toBe('image')
    expect(engine.canUndo()).toBe(false)
  })
})

describe('createInspector — 圖片構圖', () => {
  it('從內容跳到樣式，舊選取的入口不會打開新選取的面板', () => {
    const { box, engine, inspector } = mediaInspector('image')
    const content = box.querySelector<HTMLButtonElement>('[role="tab"][id$="-content"]')!
    const style = box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')!
    const open = box.querySelector<HTMLButtonElement>('.sigil-framing-action')!
    open.click()
    expect(style.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(box.querySelector('.sigil-image-framing'))
    expect(engine.canUndo()).toBe(false)
    content.click()
    engine.select('other')
    open.click()
    inspector.openImageFraming?.('media')
    expect(content.getAttribute('aria-selected')).toBe('true')
    expect(box.querySelector('.sigil-framing-action')).toBeNull()
  })

  it('有 shortcode 的圖片只顯示它自己的元件控制項', () => {
    const { box, inspector } = mediaInspector('both')
    expect(box.querySelector('.sigil-framing-action')).toBeNull()
    inspector.openImageFraming?.('media')
    box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')!.click()
    expect(box.querySelector('.sigil-image-framing')).toBeNull()
  })
})

describe('createInspector — 複製與套用樣式', () => {
  function setup(children: ComponentNode[]) {
    const engine = createEngine({
      doc: { version: 1, root: { id: 'page', type: 'section', children } },
    })
    cleanups.push(() => engine.destroy())
    function mountInspector() {
      const box = document.createElement('div')
      document.body.append(box)
      const inspector = createInspector(engine, box)
      box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')!.click()
      cleanups.push(() => {
        inspector.destroy()
        box.remove()
      })
      const button = (label: string) => {
        const match = [...box.querySelectorAll('button')].find((el) => el.textContent === label)
        expect(match, label).toBeDefined()
        return match!
      }
      return { inspector, copy: () => button('複製樣式'), apply: () => button('套用樣式') }
    }
    return { engine, mountInspector }
  }

  it('跨裝置套用來源快照，只覆寫不同的值，一次復原及重做整批樣式', () => {
    const target: ComponentNode = {
      id: 'target',
      type: 'text',
      content: '保留這段內容',
      attributes: { id: 'intro' },
      className: 'lead',
      style: { display: 'block', color: 'black' },
      responsiveStyles: { tablet: { width: '75%' }, mobile: { padding: '3px' } },
    }
    const { engine, mountInspector } = setup([
      {
        id: 'source',
        type: 'text',
        style: { display: 'block', color: 'navy', padding: '2px' },
        responsiveStyles: {
          tablet: { padding: '12px', gap: '8px' },
          mobile: { gap: '16px' },
        },
      },
      target,
    ])
    const { inspector, copy, apply } = mountInspector()
    engine.select('source')
    inspector.setDevice('mobile')
    copy().focus()
    copy().click()
    expect(document.activeElement).toBe(copy())
    expect(engine.canUndo()).toBe(false)
    engine.update('source', { style: { color: 'red' } })
    engine.select('target')
    inspector.setDevice('tablet')
    const before = engine.getTree()
    const update = vi.spyOn(engine, 'update')
    apply().focus()
    apply().click()
    expect(document.activeElement).toBe(apply())
    expect(engine.getTree().children![1]).toEqual({
      ...target,
      responsiveStyles: {
        tablet: { width: '75%', padding: '12px', color: 'navy', gap: '16px' },
        mobile: { padding: '3px' },
      },
    })
    const applied = engine.getTree()
    apply().click()
    expect(update).toHaveBeenCalledTimes(1)
    engine.undo()
    expect(engine.getTree()).toEqual(before)
    expect(document.activeElement).toBe(apply())
    engine.redo()
    expect(engine.getTree()).toEqual(applied)
  })

  it('可讀取鎖定來源，空樣式與鎖定目標不產生寫入', () => {
    const { engine, mountInspector } = setup([
      { id: 'source', type: 'text', locked: true, style: { color: 'navy' } },
      { id: 'empty', type: 'text', className: 'external-style' },
      { id: 'target', type: 'text', locked: true, responsiveStyles: { mobile: { gap: '8px' } } },
    ])
    const { copy, apply } = mountInspector()
    engine.select('empty')
    expect(copy().disabled).toBe(true)
    expect(apply().disabled).toBe(true)
    engine.select('source')
    expect(copy().disabled).toBe(false)
    copy().click()
    engine.select('target')
    expect(apply().disabled).toBe(true)
    apply().click()
    expect(engine.canUndo()).toBe(false)
    engine.update('target', { locked: false })
    apply().click()
    expect(engine.getTree().children![2]).toMatchObject({
      style: { color: 'navy' },
      responsiveStyles: { mobile: { gap: '8px' } },
    })
  })

  it('共用同份文件的 Inspector 各自保留樣式，改選後舊按鈕無法寫入', () => {
    const { engine, mountInspector } = setup([
      { id: 'blue', type: 'text', style: { color: 'blue' } },
      { id: 'red', type: 'text', style: { color: 'red' } },
      { id: 'target', type: 'button' },
    ])
    const first = mountInspector()
    const second = mountInspector()
    engine.select('blue')
    first.copy().click()
    engine.select('red')
    expect(second.apply().disabled).toBe(true)
    second.copy().click()
    const staleApply = first.apply()
    engine.select('target')
    staleApply.click()
    expect(engine.canUndo()).toBe(false)
    first.apply().click()
    expect(engine.getTree().children![2]!.style).toEqual({ color: 'blue' })
    second.apply().click()
    expect(engine.getTree().children![2]!.style).toEqual({ color: 'red' })
  })
})

describe('createInspector — responsive style', () => {
  it('選取標題後，版面會隨父層排列與裝置顯示跨欄操作', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'cards',
          type: 'section',
          style: { display: 'flex' },
          responsiveStyles: { mobile: { display: 'flex' } },
          children: [{ id: 'headline', type: 'text', tagName: 'h2', content: '活動資訊' }],
        },
      },
    })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box)
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('headline')
    box.querySelector<HTMLButtonElement>('[role="tab"][id$="-style"]')!.click()
    const group = () => box.querySelector<HTMLElement>('.sigil-style-section .sigil-grid-item')!
    const full = () => group().querySelector<HTMLButtonElement>('[data-grid-item="full"]')!
    expect(group().hidden).toBe(true)
    engine.update('cards', { style: { display: 'inline-grid' } })
    expect(group().hidden).toBe(false)
    const old = full()
    old.click()
    expect(engine.getTree().children?.[0]?.style?.['grid-column']).toBe('1 / -1')
    inspector.setDevice('mobile')
    expect(group().hidden).toBe(true)
    inspector.setDevice('desktop')
    expect(full().getAttribute('aria-pressed')).toBe('true')
    engine.undo()
    expect(full().getAttribute('aria-pressed')).toBe('false')
    engine.select('cards')
    expect(box.querySelector('.sigil-grid-item')).toBeNull()
    const tree = engine.getTree()
    old.click()
    expect(engine.getTree()).toBe(tree)
  })

  it('容器版面可直接選欄數，切裝置和復原時會同步顯示方式與間距欄位', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'cards',
          type: 'section',
          tagName: 'article',
          style: { display: 'flex', gap: '12px' },
          children: [
            { id: 'headline', type: 'text', tagName: 'h2', content: '活動' },
            { id: 'rich', type: 'section', tagName: 'div' },
          ],
        },
      },
    })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, {
      richText: { supports: (node) => node.id === 'rich', read: () => '' },
    })
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('cards')
    box.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    inspector.setDevice('mobile')
    const button = (n: number) =>
      box.querySelector<HTMLButtonElement>(`[data-grid-columns="${n}"]`)!
    const mobileTwo = button(2)
    expect(mobileTwo.closest('.sigil-style-section')?.previousElementSibling?.textContent).toBe(
      '版面',
    )
    mobileTwo.click()
    const display = () => box.querySelector<HTMLSelectElement>('[data-style-property="display"]')!
    expect(display().value).toBe('grid')
    expect(box.querySelector('[data-style-property="gap"]')?.closest('[hidden]')).toBeNull()
    expect(
      box.querySelector('[data-style-property="flex-direction"]')?.closest('[hidden]'),
    ).toBeTruthy()
    expect(mobileTwo.getAttribute('aria-pressed')).toBe('true')
    engine.undo()
    expect(display().dataset.styleSource).toBe('desktop')
    expect(button(2).getAttribute('aria-pressed')).toBe('false')
    engine.redo()
    inspector.setDevice('desktop')
    expect(display().value).toBe('flex')
    expect(button(2).getAttribute('aria-pressed')).toBe('false')
    const tree = engine.getTree()
    mobileTwo.click()
    expect(engine.getTree()).toBe(tree)
    for (const id of ['headline', 'rich']) {
      engine.select(id)
      expect(box.querySelector('.sigil-grid-columns')).toBeNull()
    }
  })

  it('版面、文字與外觀維持各自的展開狀態，切換元件、裝置與復原皆可繼續編輯', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: { id: 'page', type: 'section', children: [{ id: 'other', type: 'section' }] },
      },
    })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box)
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('page')
    box.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    const section = (name: string) =>
      [...box.querySelectorAll<HTMLButtonElement>('.sigil-section-title button')].find(
        (button) => button.textContent === name,
      )!
    const expanded = (name: string) => section(name).getAttribute('aria-expanded')
    expect(expanded('版面')).toBe('true')
    expect(expanded('文字')).toBe('false')
    section('文字').click()
    section('版面').click()
    engine.select('other')
    inspector.setDevice('tablet')
    engine.update('other', { style: { color: 'blue' } })
    engine.undo()
    engine.redo()
    expect(expanded('版面')).toBe('false')
    expect(expanded('文字')).toBe('true')
    const textPanel = box.querySelector<HTMLElement>(
      `#${section('文字').getAttribute('aria-controls')}`,
    )!
    expect(textPanel.hidden).toBe(false)
    expect(textPanel.querySelector('[data-style-property="color"]')).toBeTruthy()
    expect(expanded('外觀')).toBe('false')
    expect(engine.getSelection()).toBe('other')
  })

  it('依目前裝置顯示可用的 Flex 控制，保存自訂 CSS、繼承、其他樣式與歷程', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          style: { display: 'flow-root', gap: '3px' },
          responsiveStyles: { tablet: { display: 'inline flex', 'flex-direction': 'row-reverse' } },
        },
      },
    })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, { device: 'mobile' })
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('page')
    box.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    const select = (prop: string) =>
      box.querySelector<HTMLSelectElement>(`select[data-style-property="${prop}"]`)!
    const choose = (prop: string, value: string) => {
      const control = select(prop)
      control.value = value
      control.dispatchEvent(new Event('change'))
    }
    const custom = () =>
      box.querySelector<HTMLInputElement>('[aria-label="自訂 CSS 值 · 顯示方式"]')!
    const visible = (prop: string) => !select(prop).closest('[hidden]')
    expect(select('display').selectedOptions[0]?.textContent).toContain('inline flex')
    expect(visible('flex-direction')).toBe(true)
    choose('flex-direction', 'column')
    choose('justify-content', 'space-between')
    choose('align-items', 'center')
    choose('gap', '1rem')
    choose('display', 'flex')
    expect(engine.toJSON().root.responsiveStyles?.mobile).toEqual({
      'flex-direction': 'column',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: '1rem',
      display: 'flex',
    })
    expect(select('display').selectedOptions[0]?.textContent).toBe('彈性排列')
    choose(
      'display',
      [...select('display').options].find((option) => option.textContent === '自訂 CSS 值')!.value,
    )
    expect(custom().hidden).toBe(false)
    expect(engine.getTree().responsiveStyles?.mobile?.display).toBe('flex')
    custom().value = 'inline-grid'
    custom().dispatchEvent(new Event('input'))
    expect(select('display').selectedOptions[0]?.textContent).toBe('自訂 CSS 值')
    expect(visible('flex-direction')).toBe(false)
    expect(visible('gap')).toBe(true)
    engine.undo()
    expect(select('display').value).toBe('flex')
    engine.redo()
    expect(custom().value).toBe('inline-grid')
    box.querySelector<HTMLButtonElement>('[data-style-reset="display"]')!.click()
    expect(select('display').value).toBe('')
    expect(custom().hidden).toBe(true)
    expect(visible('flex-direction')).toBe(true)
    expect(engine.getTree().responsiveStyles?.mobile?.['flex-direction']).toBe('column')
    engine.update('page', {
      style: { width: '11rem' },
      responsiveStyles: { tablet: { display: 'block' } },
    })
    expect(visible('gap')).toBe(false)
    engine.update('page', { locked: true })
    expect(select('display').disabled).toBe(true)
    expect(custom().disabled).toBe(true)
    expect(box.querySelector<HTMLButtonElement>('[data-style-reset="gap"]')?.disabled).toBe(true)
    engine.update('page', { locked: false })
    const detached = select('display')
    inspector.setDevice('desktop')
    detached.value = 'none'
    detached.dispatchEvent(new Event('change'))
    expect(custom().value).toBe('flow-root')
    expect(engine.getTree().style).toEqual({ display: 'flow-root', gap: '3px', width: '11rem' })
    expect(engine.getTree().responsiveStyles?.mobile?.display).toBeUndefined()
  })

  it('內距快速選項保留其他裝置、自訂值與復原歷程', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'page',
          type: 'section',
          style: { padding: '2rem' },
          responsiveStyles: { tablet: { padding: '0.75rem' }, mobile: { gap: '0.5rem' } },
        },
      },
    })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, { device: 'mobile' })
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('page')
    box.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    const button = (value: string) =>
      box.querySelector<HTMLButtonElement>(
        `[role="group"][aria-label="內距"] button[value="${value}"]`,
      )!
    const input = () => {
      const label = [...box.querySelectorAll('label')].find(
        (element) => element.textContent === '內距',
      )!
      return box.querySelector<HTMLInputElement>(`#${label.htmlFor}`)!
    }
    const inherit = () => box.querySelector<HTMLButtonElement>('[data-style-reset="padding"]')!
    expect(input().placeholder).toBe('繼承：0.75rem')
    expect(inherit().disabled).toBe(true)
    expect(button('1rem').textContent).toBe('標準')
    button('1rem').click()
    button('1rem').click()
    expect(engine.getTree().style?.padding).toBe('2rem')
    expect(engine.getTree().responsiveStyles).toEqual({
      tablet: { padding: '0.75rem' },
      mobile: { gap: '0.5rem', padding: '1rem' },
    })
    expect(input().value).toBe('1rem')
    expect(button('1rem').getAttribute('aria-pressed')).toBe('true')
    expect(inherit().disabled).toBe(false)
    engine.undo()
    expect(engine.canUndo()).toBe(false)
    expect(input().value).toBe('')
    expect(inherit().disabled).toBe(true)
    engine.redo()
    expect(button('1rem').getAttribute('aria-pressed')).toBe('true')
    input().value = 'clamp(1rem, 2vw, 3rem) 12px'
    input().dispatchEvent(new Event('input'))
    expect(engine.getTree().responsiveStyles?.mobile?.padding).toBe('clamp(1rem, 2vw, 3rem) 12px')
    expect(box.querySelector('[role="group"] [aria-pressed="true"]')).toBeNull()
    inherit().click()
    expect(input().value).toBe('')
    expect(input().placeholder).toBe('繼承：0.75rem')
    expect(engine.getTree().responsiveStyles?.mobile).toEqual({ gap: '0.5rem' })
    inspector.setDevice('desktop')
    expect(button('2rem').getAttribute('aria-pressed')).toBe('true')
    button('0.5rem').click()
    expect(engine.getTree().style?.padding).toBe('0.5rem')
    inspector.setDevice('tablet')
    expect(input().value).toBe('0.75rem')
  })

  it('其他控制項修改內距或鎖定元件時就地更新快速選項', () => {
    const engine = createEngine({ doc: { version: 1, root: { id: 'page', type: 'section' } } })
    const box = document.createElement('div')
    const inspector = createInspector(engine, box, { device: 'mobile' })
    cleanups.push(() => {
      inspector.destroy()
      engine.destroy()
    })
    engine.select('page')
    box.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    const standard = box.querySelector<HTMLButtonElement>(
      '.sigil-padding-presets button[value="1rem"]',
    )!
    const inherit = box.querySelector<HTMLButtonElement>('[data-style-reset="padding"]')!
    engine.update('page', { responsiveStyles: { mobile: { padding: '1rem' } } })
    expect(standard.getAttribute('aria-pressed')).toBe('true')
    expect(inherit.disabled).toBe(false)
    engine.update('page', { locked: true })
    expect(standard.disabled).toBe(true)
    expect(inherit.disabled).toBe(true)
    engine.update('page', { locked: false })
    expect(standard.disabled).toBe(false)
    expect(inherit.disabled).toBe(false)
    const previousCompact = box.querySelector<HTMLButtonElement>(
      '.sigil-padding-presets button[value="0.5rem"]',
    )!
    inspector.setDevice('desktop')
    previousCompact.click()
    expect(engine.getTree().style?.padding).toBeUndefined()
    expect(engine.getTree().responsiveStyles?.mobile?.padding).toBe('1rem')
  })

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
    expect(context.textContent).toContain('沿用桌面樣式')

    const clear = [...box.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('清除 平板 覆寫'),
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
  it('嵌入圖片只顯示格式及預覽，換網址、復原、重做和切換語系時同步', async () => {
    const { gate, engine, box, i18n } = mediaInspector('image')
    const input = () => box.querySelector<HTMLInputElement>('.sigil-field-row input')!
    const preview = () => box.querySelector<HTMLImageElement>('.sigil-img-preview')!
    const data = 'data:image/webp;base64,UklGRg=='
    expect(input().value).toBe('original.png')
    box.querySelector<HTMLButtonElement>('.sigil-field-row button')!.click()
    startUpload(document.querySelector<HTMLElement>('.sigil-media-backdrop')!)
    gate.resolve({ id: 'embedded', url: data })
    await vi.waitFor(() => expect(preview().getAttribute('src')).toBe(data))
    expect(input().value).toBe('')
    expect(box.textContent).toContain('已嵌入圖片 · WEBP')
    expect(box.textContent).not.toContain('UklGRg==')
    expect(input().placeholder).toBe('貼上圖片網址以更換')
    i18n.setLocale('en')
    expect(box.textContent).toContain('Embedded image · WEBP')
    expect(input().placeholder).toBe('Paste an image URL to replace it')

    const url = 'https://example.org/workshop.webp'
    input().value = url
    input().dispatchEvent(new Event('input'))
    expect(preview().getAttribute('src')).toBe(url)
    expect(input().getAttribute('aria-describedby')).toBeNull()
    expect(box.textContent).not.toContain('Embedded image')
    engine.undo()
    expect(preview().getAttribute('src')).toBe(data)
    expect(input().value).toBe('')
    expect(document.getElementById(input().getAttribute('aria-describedby')!)?.textContent).toBe(
      'Embedded image · WEBP',
    )
    engine.redo()
    expect(input().value).toBe(url)
    expect(preview().getAttribute('src')).toBe(url)
  })

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
    const label = [...box.querySelectorAll('label')].find(
      (item) => item.textContent === '替代文字',
    )!
    const alt = box.querySelector<HTMLInputElement>(`#${label.htmlFor}`)!
    alt.value = '窗邊的攝影器材'
    alt.dispatchEvent(new Event('input'))
    expect(engine.getTree().children?.[0]?.attributes).toEqual({
      src: 'manual.png',
      alt: '窗邊的攝影器材',
      title: 'Host title',
    })
    alt.value = ''
    alt.dispatchEvent(new Event('input'))
    expect(engine.getTree().children?.[0]?.attributes?.alt).toBe('')
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
