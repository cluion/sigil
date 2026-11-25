import { describe, expect, it } from 'vitest'
import {
  createEngine,
  createRenderer,
  findNode,
  getHtmlAnchorInfo,
  renameHtmlAnchor,
  toHTML,
  type ComponentNode,
} from '../src/index.js'

const node = (
  id: string,
  attributes: Record<string, string>,
  other?: Partial<ComponentNode>,
): ComponentNode => ({
  id,
  type: 'section',
  attributes,
  ...other,
})
function setup(...children: ComponentNode[]) {
  const root: ComponentNode = { id: 'page', type: 'section', children }
  const engine = createEngine({ doc: { version: 1, root } })
  const attrs = (id: string) => findNode(engine.getTree(), id)?.attributes
  return { root, engine, attrs }
}

describe('authored HTML anchors', () => {
  it('renames local references and ordered IDREF tokens in one undo step', () => {
    const { root, engine, attrs } = setup(
      node('place', { ID: 'venue', role: 'region', 'aria-labelledby': 'venue extra' }),
      node('link', {
        HREF: '  #venue:~:text=tickets',
        'aria-describedby': 'a\tvenue  venue',
        rel: 'external',
      }),
      node('svg', { 'xlink:href': '#venue', for: 'venue' }),
      node('outside', { href: '/tickets#venue', 'data-config': '#venue', 'aria-label': 'venue' }),
      node(
        'host',
        {},
        { type: 'shortcode', shortcode: { name: 'event', props: { href: '#venue' } } },
      ),
      node('rich', {}, { type: 'rich-text', content: '<a href="#venue">Visit</a>' }),
    )
    expect(getHtmlAnchorInfo(root, 'place')).toEqual({
      name: 'venue',
      fragment: '#venue',
      referenceCount: 5,
      duplicate: false,
      locked: false,
    })
    const nextName = "報名/門票'區"
    const fragment = '#' + encodeURIComponent(nextName).replaceAll("'", '%27')
    expect(renameHtmlAnchor(engine, 'place', nextName)).toEqual({ ok: true })
    expect(attrs('place')).toEqual({
      ID: nextName,
      role: 'region',
      'aria-labelledby': nextName + ' extra',
    })
    expect(attrs('link')).toEqual({
      HREF: '  ' + fragment + ':~:text=tickets',
      'aria-describedby': 'a\t' + nextName + '  ' + nextName,
      rel: 'external',
    })
    expect(attrs('svg')).toEqual({ 'xlink:href': fragment, for: nextName })
    expect(engine.getTree().children?.slice(3)).toEqual(root.children!.slice(3))
    expect(getHtmlAnchorInfo(engine.getTree(), 'place')?.fragment).toBe(fragment)
    engine.undo()
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expect(attrs('link')?.HREF).toBe('  ' + fragment + ':~:text=tickets')
  })

  it('detects a fragment that the proposed literal percent spelling would steal', () => {
    const { root, engine } = setup(
      node('place', { id: 'place' }),
      node('slash', { id: 'a/b' }),
      node('link', { href: '#a%2Fb' }),
      node('old-link', { href: '#place' }),
    )
    expect(renameHtmlAnchor(engine, 'place', 'a%2Fb')).toEqual({ ok: false, reason: 'conflict' })
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
    const other = setup(
      node('a', { id: 'old' }),
      node('literal', { id: 'a%2Fb' }),
      node('go', { href: '#old' }),
    )
    expect(renameHtmlAnchor(other.engine, 'a', 'a/b')).toEqual({ ok: true })
    expect(other.attrs('go')?.href).toBe('#a/b')
  })

  it('repairs a duplicate without guessing which occurrence a reference meant', () => {
    const { engine, root, attrs } = setup(
      node('a', { id: 'shared' }),
      node('b', { id: 'shared' }),
      node('link', { href: '#shared' }),
    )
    expect(getHtmlAnchorInfo(root, 'a')).toMatchObject({
      duplicate: true,
      fragment: null,
      referenceCount: 1,
    })
    expect(renameHtmlAnchor(engine, 'a', 'private')).toEqual({ ok: true })
    expect(attrs('a')?.id).toBe('private')
    expect(attrs('link')?.href).toBe('#shared')
    expect(getHtmlAnchorInfo(engine.getTree(), 'b')).toMatchObject({
      duplicate: false,
      fragment: '#shared',
      referenceCount: 1,
    })
  })

  it('keeps all nodes unchanged on invalid input, collision, or a locked reference', () => {
    const { root, engine } = setup(
      node('target', { id: 'old' }),
      node('link', { href: '#old' }),
      node('locked', { id: 'fixed', 'aria-owns': 'old' }, { locked: true }),
    )
    for (const name of ['a b', 'a\nb', 'a\\b', String.fromCharCode(0xd800)]) {
      expect(renameHtmlAnchor(engine, 'target', name)).toEqual({ ok: false, reason: 'invalid' })
    }
    expect(renameHtmlAnchor(engine, 'locked', 'other')).toEqual({ ok: false, reason: 'locked' })
    expect(renameHtmlAnchor(engine, 'target', 'fixed')).toEqual({ ok: false, reason: 'conflict' })
    expect(renameHtmlAnchor(engine, 'target', '')).toEqual({ ok: false, reason: 'referenced' })
    expect(renameHtmlAnchor(engine, 'target', 'ready')).toEqual({
      ok: false,
      reason: 'locked-reference',
    })
    expect(renameHtmlAnchor(engine, 'missing', 'new')).toEqual({ ok: false, reason: 'missing' })
    expect(renameHtmlAnchor(engine, 'target', 'old')).toEqual({ ok: true })
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
  })

  it('removes an unused ID from the model, renderer and HTML while preserving other attributes', () => {
    const { root, engine, attrs } = setup(
      node('unused', { ID: 'extra', title: 'Keep me' }),
      node('only', { id: 'alone' }),
    )
    const renderer = createRenderer()
    const host = document.createElement('div')
    renderer.mount(root, host)
    engine.subscribe((ev) => {
      if (ev.type === 'patch') renderer.applyPatch(ev.patch)
      if (ev.type === 'tree') renderer.reconcile(ev.tree)
    })
    expect(renameHtmlAnchor(engine, 'unused', '')).toEqual({ ok: true })
    expect(attrs('unused')).toEqual({ title: 'Keep me' })
    expect(host.querySelector('[title]')?.hasAttribute('id')).toBe(false)
    expect(toHTML(engine.toJSON())).not.toContain('id="extra"')
    expect(renameHtmlAnchor(engine, 'only', '')).toEqual({ ok: true })
    expect(attrs('only')).toBeUndefined()
    engine.undo()
    expect(host.querySelector('#alone')).toBeTruthy()
    engine.undo()
    expect(host.querySelector('#extra')).toBeTruthy()
    renderer.destroy()
  })

  it('keeps the active anchor spelling consistent after a host updates mixed-case attributes', () => {
    const { engine, attrs } = setup(
      node('target', { ID: 'old' }),
      node('link', { HREF: '#old' }, { tagName: 'a' }),
    )
    engine.update('target', { attributes: { id: 'new' } })
    engine.update('link', { attributes: { href: '#new' } })
    expect(attrs('target')).toEqual({ id: 'new' })
    expect(attrs('link')).toEqual({ href: '#new' })
    expect(getHtmlAnchorInfo(engine.getTree(), 'target')?.referenceCount).toBe(1)
    expect(renameHtmlAnchor(engine, 'target', 'final')).toEqual({ ok: true })
    expect(toHTML(engine.toJSON())).toContain('href="#final"')
    expect(toHTML(engine.toJSON())).not.toContain('#old')
  })

  it('preserves the outer batch for a host wrapping anchor edits in a larger operation', () => {
    const { root, engine, attrs } = setup(node('target', {}), node('link', { href: '#new' }))
    engine.batch(() => {
      engine.update('link', { content: 'Details' })
      expect(renameHtmlAnchor(engine, 'target', 'new')).toEqual({ ok: true })
      engine.update('target', { name: 'My section' })
    })
    expect(getHtmlAnchorInfo(engine.getTree(), 'target')?.referenceCount).toBe(1)
    engine.undo()
    expect(engine.getTree()).toBe(root)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    expect(attrs('target')?.id).toBe('new')
  })

  it('removes only authored attributes, preserving the rendering of component classes and styles', () => {
    const { engine, attrs } = setup(
      node(
        'box',
        { ID: 'box', class: 'before', style: 'opacity:0.5', 'data-note': 'important' },
        { className: 'card', style: { color: 'red' } },
      ),
    )
    const root = document.createElement('div')
    const renderer = createRenderer()
    renderer.mount(engine.getTree(), root)
    engine.subscribe((ev) => {
      if (ev.type === 'patch') renderer.applyPatch(ev.patch)
    })
    const el = root.querySelector<HTMLElement>('#box')!
    engine.update('box', {
      attributes: { title: 'temporary' },
      removeAttributes: ['id', 'class', 'style', 'TITLE', 'data-sigil-id'],
    })
    expect(attrs('box')).toEqual({ 'data-note': 'important' })
    expect(el.hasAttribute('id')).toBe(false)
    expect(el.hasAttribute('title')).toBe(false)
    expect(el.className).toBe('card')
    expect(el.style.color).toBe('red')
    expect(el.style.opacity).toBe('')
    expect(el.dataset.sigilId).toBe('box')
    renderer.destroy()
  })
})
