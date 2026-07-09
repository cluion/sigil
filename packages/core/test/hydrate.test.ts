import { describe, it, expect } from 'vitest'
import { hydrate } from '../src/index.js'
import type { ShortcodeResolver, ComponentNode } from '../src/index.js'

describe('hydrate', () => {
  it('找 [data-shortcode] host,清空 + resolve(live)填入', () => {
    const resolved: string[] = []
    const resolver: ShortcodeResolver = {
      resolve: (node: ComponentNode, host) => {
        resolved.push(node.shortcode!.name)
        const b = document.createElement('b')
        b.textContent = 'live'
        host.append(b)
        return { el: host, setProps() {}, destroy() {} }
      },
    }
    const root = document.createElement('div')
    const host = document.createElement('div')
    host.setAttribute('data-sigil-id', 's')
    host.setAttribute('data-shortcode', 'card')
    host.setAttribute('data-props', '{"a":1}')
    host.textContent = 'static'
    root.append(host)

    hydrate(root, { shortcodeResolver: resolver })

    expect(resolved).toEqual(['card'])
    expect(host.textContent).toBe('live')
  })
})
