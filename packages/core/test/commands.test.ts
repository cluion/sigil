import { describe, it, expect, vi } from 'vitest'
import {
  createEngine,
  defineCommand,
  createCommandRegistry,
  matchShortcut,
} from '../src/index.js'
import type { CommandContext } from '../src/index.js'

function ctxOf(engine = createEngine({ doc: { version: 1, root: { id: 'r', type: 'section', children: [] } } })): CommandContext {
  let clip = null as null | { id: string; type: string }
  return {
    engine,
    getDoc: () => engine.toJSON(),
    clipboard: {
      get: () => clip as never,
      set: (n) => {
        clip = n as never
      },
    },
  }
}

describe('matchShortcut', () => {
  it('mod+s 匹配 ctrl/meta + s', () => {
    expect(
      matchShortcut('mod+s', new KeyboardEvent('keydown', { key: 's', ctrlKey: true })),
    ).toBe(true)
    expect(
      matchShortcut('mod+s', new KeyboardEvent('keydown', { key: 's', metaKey: true })),
    ).toBe(true)
    expect(matchShortcut('mod+s', new KeyboardEvent('keydown', { key: 's' }))).toBe(false)
  })

  it('mod+shift+z 需 shift', () => {
    expect(
      matchShortcut(
        'mod+shift+z',
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }),
      ),
    ).toBe(true)
    expect(
      matchShortcut('mod+shift+z', new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })),
    ).toBe(false)
  })

  it('Delete 不吃 mod', () => {
    expect(matchShortcut('Delete', new KeyboardEvent('keydown', { key: 'Delete' }))).toBe(true)
    expect(
      matchShortcut('Delete', new KeyboardEvent('keydown', { key: 'Delete', ctrlKey: true })),
    ).toBe(false)
  })
})

describe('createCommandRegistry', () => {
  it('defineCommand + run', async () => {
    const run = vi.fn()
    const reg = createCommandRegistry([
      defineCommand({ id: 'ping', label: 'Ping', run }),
    ])
    const ctx = ctxOf()
    expect(await reg.run('ping', ctx)).toBe(true)
    expect(run).toHaveBeenCalledOnce()
    expect(await reg.run('missing', ctx)).toBe(false)
  })

  it('match 快捷鍵並尊重 when', () => {
    const run = vi.fn()
    const reg = createCommandRegistry([
      defineCommand({
        id: 'save',
        shortcut: 'mod+s',
        when: (c) => c.engine.canUndo() === false,
        run,
      }),
    ])
    const ctx = ctxOf()
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    const hit = reg.match(e, ctx)
    expect(hit?.id).toBe('save')
  })

  it('when false 則 match 略過', () => {
    const reg = createCommandRegistry([
      defineCommand({
        id: 'x',
        shortcut: 'mod+s',
        when: () => false,
        run: () => {},
      }),
    ])
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    expect(reg.match(e, ctxOf())).toBeUndefined()
  })
})
