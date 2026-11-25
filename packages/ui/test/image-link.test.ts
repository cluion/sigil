import { describe, it, expect } from 'vitest'
import {
  createEngine,
  createI18n,
  createRenderer,
  createTypeRegistry,
  findNode,
  toHTML,
  type ComponentNode,
  type Engine,
} from '@cluion/sigil-core'
import {
  isImageLinkLayout,
  readImageLink,
  removeImageLink,
  setImageLink,
} from '../src/image-link.js'
import { createLayersPanel } from '../src/layers.js'
import { createSelectionPath } from '../src/selection-path.js'

const image: ComponentNode = {
  id: 'photo',
  type: 'image',
  attributes: { src: '/media/event.jpg', alt: '春季市集' },
}
function mount(root: ComponentNode) {
  const engine = createEngine({ doc: { version: 1, root } })
  engine.select('photo')
  return engine
}
function page(child: ComponentNode, extra: Partial<ComponentNode> = {}) {
  return mount({
    id: 'page',
    type: 'section',
    ...extra,
    children: [
      { id: 'before', type: 'text', content: '前' },
      child,
      { id: 'after', type: 'text', content: '後' },
    ],
  })
}
function get(engine: Engine, id: string) {
  return findNode(engine.getTree(), id)!
}
function state(engine: Engine) {
  return readImageLink(engine.getTree(), 'photo')!
}
function anchor(extra: Partial<ComponentNode> = {}): ComponentNode {
  return {
    id: 'anchor',
    type: 'section',
    tagName: 'a',
    attributes: { href: '/old' },
    children: [image],
    ...extra,
  }
}

describe('圖片原生連結', () => {
  it('圖層及元件路徑以中英文命名，能從圖片選取整個連結，保留作者名稱或無障礙標籤', () => {
    const engine = page(image)
    setImageLink(engine, 'photo', '/event')
    const id = state(engine).link!.id
    const i18n = createI18n({
      zh: { 'image.link': '圖片連結' },
      en: { 'image.link': 'Image link' },
    })
    const tree = document.createElement('div'),
      trail = document.createElement('div')
    document.body.append(tree, trail)
    const layers = createLayersPanel(engine, tree, { i18n }),
      path = createSelectionPath(engine, trail, { i18n })
    const row = () => tree.querySelector<HTMLElement>(`[role=treeitem][data-layer-id="${id}"]`)!
    const crumb = () => trail.querySelector<HTMLElement>(`[data-path-id="${id}"]`)!
    try {
      const initial = engine.getTree()
      expect(row().getAttribute('aria-label')).toBe('圖片連結')
      expect(crumb().textContent).toBe('圖片連結')
      i18n.setLocale('en')
      expect(row().getAttribute('aria-label')).toBe('Image link')
      expect(crumb().textContent).toBe('Image link')
      crumb().click()
      expect(engine.getSelection()).toBe(id)
      expect(row().getAttribute('aria-selected')).toBe('true')
      engine.select('photo')
      row().click()
      expect(crumb().getAttribute('aria-current')).toBe('location')
      expect(engine.getTree()).toBe(initial)
      engine.update(id, { attributes: { 'ARIA-LABEL': 'View event' } })
      expect(crumb().textContent).toBe('View event')
      expect(row().getAttribute('aria-label')).toBe('View event')
      engine.update(id, { name: 'Artwork' })
      expect(crumb().textContent).toBe('Artwork')
      expect(row().getAttribute('aria-label')).toBe('Artwork')
      engine.update(id, { name: '', removeAttributes: ['aria-label', 'href'] })
      expect(crumb().textContent).not.toBe('Image link')
      expect(row().getAttribute('aria-label')).not.toBe('Image link')
    } finally {
      path.destroy()
      layers.destroy()
      tree.remove()
      trail.remove()
    }
  })

  it.each(['block grid', 'inline flex', 'flex inline'])(
    '雙詞 display %s 保留排列，零高度限制能原樣還原',
    (display) => {
      const engine = page({ ...image, style: { 'min-height': '0px' } }, { style: { display } })
      const original = engine.getTree()
      setImageLink(engine, 'photo', '#tickets')
      expect(isImageLinkLayout(state(engine).link!, get(engine, 'photo'))).toBe(true)
      expect(get(engine, 'photo').style?.['min-height']).toBe('0px')
      removeImageLink(engine, 'photo')
      expect(engine.getTree()).toEqual(original)
    },
  )
  it('一般文流仍區分圖片雙詞 display 的 block 和 inline 外盒', () => {
    for (const [value, block] of [
      ['block grid', true],
      ['flex block', true],
      ['inline flex', false],
    ] as const) {
      const engine = page({ ...image, style: { display: value, width: '80px' } })
      setImageLink(engine, 'photo', '/event')
      expect(isImageLinkLayout(state(engine).link!, get(engine, 'photo'))).toBe(block)
    }
  })

  it('畫布增量更新時移動同一 img；新增和簡單解除皆不重建圖片', () => {
    const engine = page(image)
    const renderer = createRenderer()
    const container = document.createElement('div')
    renderer.mount(engine.getTree(), container)
    const stop = engine.subscribe((e) => {
      if (e.type === 'patch') renderer.applyPatch(e.patch)
    })
    try {
      const img = container.querySelector('img')!
      setImageLink(engine, 'photo', '#tickets')
      expect(container.querySelector('a')?.firstElementChild).toBe(img)
      removeImageLink(engine, 'photo')
      expect(container.querySelector('a')).toBeNull()
      expect(container.querySelector('img')).toBe(img)
    } finally {
      stop()
      renderer.destroy()
    }
  })

  it('文內圖可建立、更新、移除真實連結，操作保持原位置與選取且各只需一次復原', () => {
    const engine = page(image, { tagName: 'p' })
    const original = engine.toJSON()
    const before = engine.getTree().children![0]
    expect(state(engine)).toEqual({ link: null, canRemove: false, shared: false, canEdit: true })
    expect(setImageLink(engine, 'photo', '/activity', true)).toBe(true)
    const link = state(engine).link!
    expect(engine.getTree().children?.map((n) => n.id)).toEqual(['before', link.id, 'after'])
    expect(link.children?.[0]).toBe(image)
    expect(link.style).toBeUndefined()
    expect(toHTML(engine.toJSON())).toContain(
      '<a href="/activity" target="_blank" rel="noopener"><img src="/media/event.jpg" alt="春季市集"></a>',
    )
    expect(engine.getSelection()).toBe('photo')
    const linked = engine.toJSON()
    expect(setImageLink(engine, 'photo', '/activity', true)).toBe(true)
    expect(engine.toJSON()).toEqual(linked)
    engine.undo()
    expect(engine.toJSON()).toEqual(original)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expect(engine.toJSON()).toEqual(linked)
    expect(setImageLink(engine, 'photo', 'mailto:registration@example.com')).toBe(true)
    expect(state(engine).link?.attributes).toEqual({
      href: 'mailto:registration@example.com',
      rel: 'noopener',
    })
    engine.undo()
    expect(engine.toJSON()).toEqual(linked)
    expect(removeImageLink(engine, 'photo')).toBe(true)
    expect(engine.getTree().children).toEqual([
      before,
      image,
      { id: 'after', type: 'text', content: '後' },
    ])
    expect(engine.getSelection()).toBe('photo')
    engine.undo()
    expect(engine.toJSON()).toEqual(linked)
    expect(engine.getSelection()).toBe('photo')
  })

  it('flex 與 grid 圖片的 responsive 放置、尺寸與裁切能存檔／重開／解除', () => {
    const photo: ComponentNode = {
      ...image,
      style: {
        display: 'block',
        width: '65%',
        height: '160px',
        'object-fit': 'cover',
        'object-position': '25% 50%',
        margin: '4px',
        'flex-grow': '1',
      },
      responsiveStyles: {
        tablet: { 'grid-column': '2 / 4', width: '100%', height: '120px' },
        mobile: { 'grid-column': '1', width: '90%', 'margin-left': 'auto' },
      },
    }
    const engine = page(photo, {
      style: { display: 'flex' },
      responsiveStyles: { tablet: { display: 'grid' } },
    })
    const original = engine.toJSON()
    expect(setImageLink(engine, 'photo', 'https://example.com/tickets')).toBe(true)
    const linked = engine.toJSON()
    const wrapper = state(engine).link!
    expect(wrapper.style).toMatchObject({
      display: 'grid',
      width: '65%',
      height: '160px',
      margin: '4px',
      'flex-grow': '1',
    })
    expect(wrapper.responsiveStyles).toEqual({
      tablet: { width: '100%', height: '120px', 'grid-column': '2 / 4' },
      mobile: { width: '90%', 'grid-column': '1', 'margin-left': 'auto' },
    })
    expect(get(engine, 'photo').style).toEqual({
      display: 'block',
      width: '100%',
      height: '100%',
      'object-fit': 'cover',
      'object-position': '25% 50%',
    })
    expect(get(engine, 'photo').attributes).toEqual(image.attributes)
    expect(toHTML(linked)).toContain('<a href="https://example.com/tickets"')
    const reopened = createEngine({ doc: JSON.parse(JSON.stringify(linked)) })
    reopened.select('photo')
    expect(removeImageLink(reopened, 'photo')).toBe(true)
    expect(reopened.toJSON()).toEqual(original)
    reopened.undo()
    expect(reopened.toJSON()).toEqual(linked)
    expect(reopened.getSelection()).toBe('photo')
    expect(reopened.canUndo()).toBe(false)
  })

  it.each(['#activity', 'mailto:staff@example.com', 'tel:+8861234567'])(
    '編輯已匯入的 %s 目的地沿用大小寫、屬性及 rel 並關閉新分頁',
    (href) => {
      const engine = page(
        anchor({ attributes: { HREF: '/old', TARGET: '_blank', REL: 'nofollow sponsored' } }),
      )
      setImageLink(engine, 'photo', href)
      expect(state(engine).link?.attributes).toEqual({ HREF: href, REL: 'nofollow sponsored' })
      expect(engine.getSelection()).toBe('photo')
      engine.undo()
      expect(state(engine).link?.attributes).toEqual({
        HREF: '/old',
        TARGET: '_blank',
        REL: 'nofollow sponsored',
      })
      expect(engine.canUndo()).toBe(false)
    },
  )

  it('開啟新分頁保留原有 rel token、去掉 opener，未改狀態時不產生額外 history', () => {
    const engine = page(
      anchor({ attributes: { HREF: '/old', REL: 'nofollow OPENER sponsored', TARGET: 'details' } }),
    )
    setImageLink(engine, 'photo', '/new')
    expect(state(engine).link?.attributes?.TARGET).toBe('details')
    setImageLink(engine, 'photo', '/new', true)
    expect(state(engine).link?.attributes).toEqual({
      HREF: '/new',
      TARGET: '_blank',
      REL: 'nofollow sponsored noopener',
    })
    setImageLink(engine, 'photo', '/new', true)
    engine.undo()
    expect(state(engine).link?.attributes?.TARGET).toBe('details')
  })

  it('有 ID、樣式、名稱或多層結構的單圖連結僅移除 href，重新輸入沿用同一個 a', () => {
    const engine = page(
      anchor({
        name: '主圖',
        className: 'hero',
        style: { color: 'blue' },
        attributes: { HREF: '/old', id: 'hero', title: '說明', TARGET: '_blank' },
        children: [{ id: 'wrapper', type: 'section', children: [image] }],
      }),
    )
    const original = engine.toJSON()
    expect(state(engine)).toMatchObject({ shared: false, canRemove: true })
    expect(removeImageLink(engine, 'photo')).toBe(true)
    expect(get(engine, 'anchor').attributes).toEqual({
      id: 'hero',
      title: '說明',
      TARGET: '_blank',
    })
    expect(get(engine, 'anchor').children).toEqual(original.root.children![1]!.children)
    expect(state(engine).canRemove).toBe(false)
    expect(removeImageLink(engine, 'photo')).toBe(false)
    engine.undo()
    expect(engine.toJSON()).toEqual(original)
    expect(engine.canUndo()).toBe(false)
    removeImageLink(engine, 'photo')
    expect(setImageLink(engine, 'photo', '/again')).toBe(true)
    expect(state(engine).link?.id).toBe('anchor')
    expect(get(engine, 'anchor').attributes?.href).toBe('/again')
  })

  it('包裝後若作者變更圖寬或連結樣式，解除時保留現有外框與圖', () => {
    const engine = page({ ...image, style: { width: '80%' } }, { style: { display: 'grid' } })
    setImageLink(engine, 'photo', '/event')
    const wrapper = state(engine).link!.id
    engine.update('photo', { style: { width: '70%' } })
    const changed = engine.toJSON()
    expect(removeImageLink(engine, 'photo')).toBe(true)
    expect(get(engine, wrapper).attributes?.href).toBeUndefined()
    expect(get(engine, 'photo').style?.width).toBe('70%')
    expect(get(engine, wrapper).style?.width).toBe('80%')
    engine.undo()
    expect(engine.toJSON()).toEqual(changed)
    engine.update(wrapper, { style: { background: 'red' } })
    removeImageLink(engine, 'photo')
    expect(get(engine, wrapper).style?.background).toBe('red')
    expect(isImageLinkLayout(get(engine, wrapper), get(engine, 'photo'))).toBe(true)
  })

  it('辨識排版包裝會核對結構；匯入的標記本身不能讓程式拆掉現有版面', () => {
    const imported = anchor({
      attributes: { href: '/info', 'data-image-link': 'layout-v1' },
      style: { display: 'none' },
    })
    const engine = page(imported, { style: { display: 'grid' } })
    expect(isImageLinkLayout(imported, image)).toBe(false)
    expect(removeImageLink(engine, 'photo')).toBe(true)
    expect(get(engine, 'anchor').style).toEqual({ display: 'none' })
    const generated = page(image, { style: { display: 'grid' } })
    setImageLink(generated, 'photo', '/event')
    const link = state(generated).link!
    expect(isImageLinkLayout(link, image)).toBe(true)
    expect(isImageLinkLayout({ ...link, tagName: 'button' }, image)).toBe(false)
    expect(isImageLinkLayout({ ...link, content: '其他' }, image)).toBe(false)
    expect(
      isImageLinkLayout({ ...link, children: [image, { id: 'extra', type: 'text' }] }, image),
    ).toBe(false)
  })

  it('文件根即使是獨佔圖片的原生連結，也只清除 href 並保留根節點', () => {
    const engine = mount(anchor())
    expect(removeImageLink(engine, 'photo')).toBe(true)
    expect(engine.getTree().id).toBe('anchor')
    expect(get(engine, 'photo')).toBe(image)
    expect(state(engine)).toMatchObject({ link: { id: 'anchor' }, canRemove: false })
  })

  it('共用祖先連結明確標示影響範圍，可修改同一 href、不可從圖上移除', () => {
    const engine = page(
      anchor({
        content: '活動介紹',
        children: [{ id: 'other', type: 'section', children: [image] }],
      }),
    )
    expect(state(engine)).toMatchObject({ shared: true, canRemove: false })
    expect(removeImageLink(engine, 'photo')).toBe(false)
    expect(engine.canUndo()).toBe(false)
    expect(setImageLink(engine, 'photo', '#section')).toBe(true)
    expect(get(engine, 'anchor').attributes).toEqual({ href: '#section' })
    expect(get(engine, 'anchor').content).toBe('活動介紹')
    expect(get(engine, 'other').children?.[0]).toBe(image)
  })

  it('任何上鎖祖先都保留可讀目的地，拒絕寫入或解除', () => {
    const engine = page(anchor(), { locked: true })
    expect(state(engine)).toMatchObject({
      link: { id: 'anchor' },
      canEdit: false,
      canRemove: false,
    })
    expect(setImageLink(engine, 'photo', '/new')).toBe(false)
    expect(removeImageLink(engine, 'photo')).toBe(false)
    expect(engine.canUndo()).toBe(false)
  })

  it('無效目的地、原生互動／替換容器、嵌套連結、宿主管理的圖片及過期選取均不修改文件', () => {
    const ordinary = page(image)
    for (const href of ['//spoof.test', 'https://name@host.test/', 'invalid', ''])
      expect(setImageLink(ordinary, 'photo', href)).toBe(false)
    expect(ordinary.canUndo()).toBe(false)
    for (const tagName of [
      'button',
      'picture',
      'svg',
      'template',
      'summary',
      'select',
      'img',
      'ul',
    ]) {
      const engine = page({ id: 'container', type: 'section', tagName, children: [image] })
      expect(readImageLink(engine.getTree(), 'photo')).toBeNull()
      expect(setImageLink(engine, 'photo', '/event')).toBe(false)
      expect(engine.canUndo()).toBe(false)
    }
    const nested = page(
      anchor({ children: [{ id: 'other', type: 'text', tagName: 'a', children: [image] }] }),
    )
    expect(state(nested)).toBeNull()
    const options = { richText: { supports: (n: ComponentNode) => n.id === 'page' } }
    expect(readImageLink(ordinary.getTree(), 'photo', options)).toBeNull()
    expect(setImageLink(ordinary, 'photo', '/event', undefined, options)).toBe(false)
    expect(
      readImageLink(ordinary.getTree(), 'photo', {
        registry: createTypeRegistry({ image: { tagName: 'video' } }),
      }),
    ).toBeNull()
    expect(setImageLink(ordinary, 'missing', '/event')).toBe(false)
    expect(readImageLink(image, 'photo')).toBeNull()
  })
})
