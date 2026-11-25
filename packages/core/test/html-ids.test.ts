import { describe, expect, it } from 'vitest'
import { cloneWithNewIds, resolveHtmlIdConflicts, type ComponentNode } from '../src/index.js'

const element = (id: string, attributes: Record<string, string>): ComponentNode => ({
  id,
  type: 'text',
  attributes,
})
const group = (...children: ComponentNode[]): ComponentNode => ({
  id: 'root',
  type: 'section',
  children,
})

describe('inserting a subtree with HTML IDs', () => {
  it('reserves names in the whole destination and incoming subtree, and resolves ambiguous IDs to the first copied target', () => {
    const documentRoot = group(
      element('existing', { id: 'ticket' }),
      element('other', { id: 'ticket-copy-2' }),
    )
    const source = group(
      element('a', { id: 'ticket' }),
      element('b', { ID: 'ticket-copy' }),
      element('c', { id: 'ticket', href: '#ticket', 'aria-controls': 'ticket-copy ticket' }),
    )
    const result = resolveHtmlIdConflicts(source, documentRoot)
    expect(result.children?.map((node) => node.attributes)).toEqual([
      { id: 'ticket-copy-3' },
      { ID: 'ticket-copy' },
      { id: 'ticket-copy-4', href: '#ticket-copy-3', 'aria-controls': 'ticket-copy ticket-copy-3' },
    ])
    expect(source.children?.[0]?.attributes?.id).toBe('ticket')
    expect(source.children?.[2]?.attributes?.href).toBe('#ticket')
    expect(result.children?.map((node) => node.id)).toEqual(['a', 'b', 'c'])
    expect(cloneWithNewIds(source).children?.[0]?.attributes?.id).toBe('ticket')
  })

  it('rewrites only local fragments and HTML/ARIA references, preserving encoded IDs, whitespace and host data', () => {
    const id = '展場/:a+&%#'
    const href = '#%E5%B1%95%E5%A0%B4%2F:a+&%25%23'
    const source = group(
      element('target', { id }),
      element('links', {
        href,
        'xlink:href': href,
        'aria-labelledby': 'outside\t' + id + '  other',
        for: id,
      }),
      element('link-away', { href: '/events#' + id, 'data-link': href, form: 'outside' }),
      element('host', { HREF: 'https://example.org/#' + id, title: id, 'aria-label': id }),
      element('shared', { href: '#outside' }),
      {
        id: 'rich',
        type: 'rich-text',
        content: '<a href="' + href + '">Host markup</a>',
        attributes: { 'data-html': href },
      },
      { id: 'short', type: 'shortcode', shortcode: { name: 'host', props: { href } } },
    )
    const result = resolveHtmlIdConflicts(source, source)
    expect(result.children?.[0]?.attributes?.id).toBe(id + '-copy')
    expect(result.children?.[1]?.attributes).toEqual({
      href: href + '-copy',
      'xlink:href': href + '-copy',
      'aria-labelledby': 'outside\t' + id + '-copy  other',
      for: id + '-copy',
    })
    expect(result.children?.slice(2)).toEqual(source.children?.slice(2))
  })

  it('respects a literal percent-encoded anchor outside the subtree and preserves fragment directives', () => {
    const source = group(
      element('slash', { id: 'a/b' }),
      element('literal', { href: '#a%2Fb' }),
      element('decoded', { href: '  #a/b:~:text=meeting' }),
      element('invalid-escape', { id: '50%', href: '#50% ' }),
    )
    const destination = group(source, element('existing', { id: 'a%2Fb' }))
    expect(
      resolveHtmlIdConflicts(source, destination).children?.map((node) => node.attributes),
    ).toEqual([
      { id: 'a/b-copy' },
      { href: '#a%2Fb' },
      { href: '  #a/b-copy:~:text=meeting' },
      { id: '50%-copy', href: '#50%-copy ' },
    ])
  })

  it('avoids a copy name whose links could select an external percent-encoded ID or shadow its decoded ID', () => {
    const source = group(element('target', { id: 'a/b', href: '#a%2Fb' }))
    const destination = group(source, element('external', { id: 'a%2Fb-copy' }))
    expect(resolveHtmlIdConflicts(source, destination).children?.[0]?.attributes).toEqual({
      id: 'a/b-copy-2',
      href: '#a%2Fb-copy-2',
    })

    const literal = group(element('literal', { id: 'a%2Fb', href: '#a%2Fb-copy' }))
    const existing = group(literal, element('external', { id: 'a/b-copy' }))
    expect(resolveHtmlIdConflicts(literal, existing).children?.[0]?.attributes).toEqual({
      id: 'a%2Fb-copy-2',
      href: '#a%2Fb-copy',
    })
  })

  it('leaves nonconflicting inserts intact and retains the first target in a malformed incoming template', () => {
    const unique = group(element('ticket', { id: 'ticket', href: '#ticket' }))
    expect(resolveHtmlIdConflicts(unique, group())).toBe(unique)
    const repeated = group(
      element('a', { id: 'ticket' }),
      element('b', { id: 'ticket', href: '#ticket' }),
    )
    expect(resolveHtmlIdConflicts(repeated, group()).children?.[1]?.attributes).toEqual({
      id: 'ticket-copy',
      href: '#ticket',
    })
  })
})
