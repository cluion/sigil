import { describe, it, expect, vi } from 'vitest'
import {
  createEngine,
  defineCommand,
  createCommandRegistry,
  matchShortcut,
  createDefaultEditingCommands,
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

describe('move-up / move-down 命令', () => {
  function setup() {
    const engine = createEngine({
      doc: {
        version: 1 as const,
        root: {
          id: 'r',
          type: 'section',
          children: [
            { id: 'a', type: 'text', content: 'A' },
            { id: 'b', type: 'text', content: 'B' },
            { id: 'c', type: 'text', content: 'C' },
          ],
        },
      },
    })
    const cmds = createDefaultEditingCommands()
    const up = cmds.find((c) => c.id === 'move-up')!
    const down = cmds.find((c) => c.id === 'move-down')!
    return { engine, up, down, ctx: ctxOf(engine) }
  }

  it('move-up when：第一個子節點不能上移', () => {
    const { engine, up, ctx } = setup()
    engine.select('a')
    expect(up.when!(ctx)).toBe(false)
  })

  it('move-up when：非第一個可上移', () => {
    const { engine, up, ctx } = setup()
    engine.select('b')
    expect(up.when!(ctx)).toBe(true)
  })

  it('move-up run：b 上移到第一位', () => {
    const { engine, up, ctx } = setup()
    engine.select('b')
    up.run(ctx)
    expect(engine.getTree().children?.map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('move-down when：最後一個不能下移', () => {
    const { engine, down, ctx } = setup()
    engine.select('c')
    expect(down.when!(ctx)).toBe(false)
  })

  it('move-down run：b 下移到最後', () => {
    const { engine, down, ctx } = setup()
    engine.select('b')
    down.run(ctx)
    expect(engine.getTree().children?.map((c) => c.id)).toEqual(['a', 'c', 'b'])
  })

  it('root 不能移動', () => {
    const { engine, up, down, ctx } = setup()
    engine.select('r')
    expect(up.when!(ctx)).toBe(false)
    expect(down.when!(ctx)).toBe(false)
  })

  it('鎖定節點不能移動', () => {
    const { engine, up, down, ctx } = setup()
    engine.update('b', { locked: true })
    engine.select('b')
    expect(up.when!(ctx)).toBe(false)
    expect(down.when!(ctx)).toBe(false)
  })
})
