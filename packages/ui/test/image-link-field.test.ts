import { afterEach, describe, expect, it } from 'vitest'
import {
  createEngine,
  createI18n,
  findNode,
  findParent,
  type ComponentNode,
  type I18n,
} from '@cluion/sigil-core'
import { createImageLinkField } from '../src/image-link-field.js'

const photo: ComponentNode = {
  id: 'photo',
  type: 'image',
  attributes: { src: '/photo.webp', alt: '花園' },
}
const cleanup: (() => void)[] = []
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.()
})
function setup(children: ComponentNode[] = [photo], i18n?: I18n) {
  const engine = createEngine({
    doc: { version: 1, root: { id: 'root', type: 'section', children } },
  })
  engine.select(photo.id)
  const field = createImageLinkField(engine, photo, i18n)
  document.body.append(field.el)
  cleanup.push(() => {
    field.destroy()
    engine.destroy()
    field.el.remove()
  })
  const address = field.el.querySelector<HTMLInputElement>('[data-image-link-address]')!
  const apply = field.el.querySelector<HTMLButtonElement>('[data-image-link-apply]')!
  const section = field.el.querySelector<HTMLSelectElement>('[data-image-link-section]')!
  const remove = field.el.querySelector<HTMLButtonElement>('[data-image-link-remove]')!
  function draft(value: string) {
    address.value = value
    address.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function key(key: string, isComposing = false) {
    address.dispatchEvent(
      new KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true }),
    )
  }
  return {
    engine,
    field,
    address,
    apply,
    section,
    remove,
    draft,
    key,
    parent: () => findParent(engine.getTree(), photo.id)!,
    node: (id: string) => findNode(engine.getTree(), id)!,
  }
}

describe('圖片連結欄位', () => {
  it('草稿與無效網址不改文件；Enter 套用、移除與復原都同步顯示', () => {
    const h = setup()
    const original = h.engine.getTree()
    expect(h.section.closest('.sigil-field')?.hasAttribute('hidden')).toBe(true)
    expect(h.remove.hidden).toBe(true)
    h.draft('invalid address')
    h.key('Enter')
    expect(h.engine.getTree()).toBe(original)
    expect(h.address.getAttribute('aria-invalid')).toBe('true')
    expect(h.field.el.querySelector('[role="status"]')?.textContent).toContain('有效的網址')
    h.draft(' /tickets ')
    h.key('Enter', true)
    h.address.dispatchEvent(new Event('blur'))
    expect(h.engine.canUndo()).toBe(false)
    h.key('Enter')
    expect(h.parent().attributes?.href).toBe('/tickets')
    expect(h.node('photo').attributes).toEqual(photo.attributes)
    expect(h.address.value).toBe('/tickets')
    expect(h.remove.hidden).toBe(false)
    expect(h.apply.disabled).toBe(true)
    h.remove.click()
    expect(h.parent().id).toBe('root')
    expect(h.address.value).toBe('')
    expect(document.activeElement).toBe(h.address)
    h.engine.undo()
    expect(h.address.value).toBe('/tickets')
    h.engine.undo()
    expect(h.engine.getTree()).toBe(original)
    expect(h.address.value).toBe('')
    h.engine.redo()
    expect(h.address.value).toBe('/tickets')
  })

  it('區段可產生可復原的錨點；名稱、隱藏與重複 ID 隨文件更新', () => {
    const h = setup([
      photo,
      { id: 'schedule', type: 'section', name: '行程' },
      { id: 'existing', type: 'section', attributes: { ID: 'agenda' } },
    ])
    const original = h.engine.getTree()
    const labels = () => Array.from(h.section.options, (o) => o.textContent)
    expect(labels()).toEqual(['選擇區段…', '行程', 'agenda'])
    h.section.value = 'schedule'
    h.section.dispatchEvent(new Event('change'))
    const created = h.node('schedule').attributes!.id
    expect(created).toMatch(/^section-/)
    expect(h.address.value).toBe('#' + created)
    expect(h.section.value).toBe('schedule')
    h.engine.undo()
    expect(h.engine.getTree()).toBe(original)
    expect(h.engine.canUndo()).toBe(false)
    expect(h.address.value).toBe('')
    expect(h.section.value).toBe('')
    h.section.value = 'existing'
    h.section.dispatchEvent(new Event('change'))
    expect(h.address.value).toBe('#agenda')
    h.draft('/unapplied')
    h.engine.update('schedule', { name: '場次' })
    expect(labels()).toContain('場次')
    expect(h.address.value).toBe('/unapplied')
    h.engine.update('schedule', { hidden: true })
    expect(labels()).not.toContain('場次')
    h.engine.insert('root', { id: 'duplicate', type: 'section', attributes: { id: 'agenda' } })
    expect(h.section.closest('.sigil-field')?.hasAttribute('hidden')).toBe(true)
    expect(h.address.value).toBe('/unapplied')
  })

  it('共用連結提示同一連結內的其他內容，鎖定禁寫且保留原網址', () => {
    const caption = { id: 'caption', type: 'text', content: '說明' }
    const h = setup([
      {
        id: 'link',
        type: 'text',
        tagName: 'a',
        content: '活動',
        attributes: { HREF: '/before', TARGET: '_blank', REL: 'author noopener' },
        children: [photo, caption],
      },
    ])
    const shared = h.field.el.querySelector<HTMLElement>('.sigil-link-status')!
    expect(shared.hidden).toBe(false)
    expect(h.address.getAttribute('aria-describedby')).toContain(shared.id)
    expect(h.remove.hidden).toBe(true)
    h.draft('/after')
    h.apply.click()
    expect(h.node('link')).toMatchObject({
      content: '活動',
      attributes: { HREF: '/after', TARGET: '_blank', REL: 'author noopener' },
      children: [photo, caption],
    })
    h.draft('/pending')
    h.engine.update('link', { locked: true })
    expect(h.address.disabled).toBe(true)
    expect(h.address.value).toBe('/after')
    h.draft('/blocked')
    h.key('Enter')
    expect(h.node('link').attributes?.HREF).toBe('/after')
    h.engine.update('link', { locked: false })
    h.engine.select('caption')
    h.key('Enter')
    expect(h.node('link').attributes?.HREF).toBe('/after')
  })

  it('專用連結若有作者 ID 和樣式，移除網址保留原連結容器與圖片', () => {
    const link: ComponentNode = {
      id: 'link',
      type: 'section',
      tagName: 'a',
      attributes: { id: 'poster', HREF: '/before' },
      style: { padding: '12px' },
      children: [photo],
    }
    const h = setup([link])
    expect(h.remove.hidden).toBe(false)
    h.remove.click()
    expect(h.parent()).toMatchObject({
      id: link.id,
      tagName: 'a',
      attributes: { id: 'poster' },
      style: link.style,
      children: [photo],
    })
    expect(h.address.value).toBe('')
    expect(h.remove.hidden).toBe(true)
    h.engine.undo()
    expect(h.address.value).toBe('/before')
    expect(h.remove.hidden).toBe(false)
  })

  it('新分頁只作用於已套用的網址；頁內或聯絡連結沿用同一分頁', () => {
    const h = setup([photo, { id: 'section', type: 'section', attributes: { id: 'agenda' } }])
    const newTab = h.field.el.querySelector<HTMLInputElement>('[data-image-link-new-tab]')!
    const wrapper = newTab.closest('label')!
    expect(wrapper.hidden).toBe(true)
    for (const href of ['#agenda', 'mailto:team@example.com', 'tel:+8861234']) {
      h.draft('https://example.com/tickets')
      h.key('Enter')
      expect(wrapper.hidden).toBe(false)
      newTab.click()
      expect(h.parent().attributes?.target).toBe('_blank')
      expect(h.parent().attributes?.rel).toContain('noopener')
      h.draft(href)
      expect(newTab.disabled).toBe(true)
      expect(h.parent().attributes?.href).toBe('https://example.com/tickets')
      if (href === '#agenda') {
        h.section.value = 'section'
        h.section.dispatchEvent(new Event('change'))
      } else h.key('Enter')
      expect(wrapper.hidden).toBe(true)
      expect(h.parent().attributes?.href).toBe(href)
      expect(h.parent().attributes?.target).toBeUndefined()
    }
  })

  it('切換語系保留網址草稿與焦點，Escape 還原；卸載不再接收事件', () => {
    const i18n = createI18n({
      en: {
        'image.link': 'Image link',
        'image.remove_link': 'Remove image link',
        'link.apply': 'Apply',
        'link.section': 'Link to section',
        'link.choose': 'Choose a section…',
        'link.invalid': 'Enter a valid address.',
      },
      zh: {},
    })
    const h = setup([photo, { id: 'section', type: 'section', name: '場次' }], i18n)
    h.address.focus()
    h.draft('bad')
    h.key('Enter')
    i18n.setLocale('en')
    h.field.refreshLocale()
    expect(h.address.labels?.[0]?.textContent).toBe('Image link')
    expect(h.field.el.querySelector('[role="status"]')?.textContent).toBe('Enter a valid address.')
    expect(h.apply.textContent).toBe('Apply')
    expect(h.section.options[0]?.textContent).toBe('Choose a section…')
    expect(h.remove.textContent).toBe('Remove image link')
    expect(h.address.value).toBe('bad')
    expect(document.activeElement).toBe(h.address)
    h.key('Escape')
    expect(h.address.value).toBe('')
    expect(h.address.hasAttribute('aria-invalid')).toBe(false)
    h.draft('/later')
    h.field.destroy()
    h.apply.click()
    expect(h.engine.canUndo()).toBe(false)
  })
})
