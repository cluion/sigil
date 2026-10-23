import { findNode, findParent, cloneWithNewIds } from './model/tree.js'
// findNode 用於鎖定檢查
import { defineCommand, type CommandDefinition } from './commands.js'

/**
 * 預設編輯命令：undo／redo／delete／copy／paste／save
 *
 * save 僅在 ctx.save 存在時可觸發
 */
export function createDefaultEditingCommands(): CommandDefinition[] {
  return [
    defineCommand({
      id: 'undo',
      label: 'Undo',
      shortcut: 'mod+z',
      toolbar: true,
      toolbarGroup: 'history',
      when: (c) => c.engine.canUndo(),
      run: (c) => {
        c.engine.undo()
      },
    }),
    defineCommand({
      id: 'redo',
      label: 'Redo',
      shortcut: ['mod+shift+z', 'mod+y'],
      toolbar: true,
      toolbarGroup: 'history',
      when: (c) => c.engine.canRedo(),
      run: (c) => {
        c.engine.redo()
      },
    }),
    defineCommand({
      id: 'delete',
      label: 'Delete',
      shortcut: ['Delete', 'Backspace'],
      when: (c) => {
        const id = c.engine.getSelection()
        if (!id || id === c.engine.getTree().id) return false
        const n = findNode(c.engine.getTree(), id)
        return !!n && !n.locked
      },
      run: (c) => {
        const id = c.engine.getSelection()
        if (id) c.engine.remove(id)
      },
    }),
    defineCommand({
      id: 'copy',
      label: 'Copy',
      shortcut: 'mod+c',
      when: (c) => !!c.engine.getSelection(),
      run: (c) => {
        const id = c.engine.getSelection()
        if (!id) return
        const node = findNode(c.engine.getTree(), id)
        if (node) c.clipboard.set(node)
      },
    }),
    defineCommand({
      id: 'paste',
      label: 'Paste',
      shortcut: 'mod+v',
      when: (c) => !!c.clipboard.get(),
      run: (c) => {
        const clip = c.clipboard.get()
        if (!clip) return
        const id = c.engine.getSelection()
        const parent = id ? findParent(c.engine.getTree(), id) : null
        const pid = parent ? parent.id : c.engine.getTree().id
        c.engine.insert(pid, cloneWithNewIds(clip))
      },
    }),
    defineCommand({
      id: 'move-up',
      label: 'Move Up',
      when: (c) => {
        const id = c.engine.getSelection()
        if (!id || id === c.engine.getTree().id) return false
        const node = findNode(c.engine.getTree(), id)
        if (!node || node.locked) return false
        const parent = findParent(c.engine.getTree(), id)
        if (!parent?.children) return false
        const idx = parent.children.findIndex((ch) => ch.id === id)
        return idx > 0
      },
      run: (c) => {
        const id = c.engine.getSelection()
        if (!id) return
        const parent = findParent(c.engine.getTree(), id)
        if (!parent?.children) return
        const idx = parent.children.findIndex((ch) => ch.id === id)
        if (idx <= 0) return
        c.engine.move(id, parent.id, idx - 1)
      },
    }),
    defineCommand({
      id: 'move-down',
      label: 'Move Down',
      when: (c) => {
        const id = c.engine.getSelection()
        if (!id || id === c.engine.getTree().id) return false
        const node = findNode(c.engine.getTree(), id)
        if (!node || node.locked) return false
        const parent = findParent(c.engine.getTree(), id)
        if (!parent?.children) return false
        const idx = parent.children.findIndex((ch) => ch.id === id)
        return idx >= 0 && idx < parent.children.length - 1
      },
      run: (c) => {
        const id = c.engine.getSelection()
        if (!id) return
        const parent = findParent(c.engine.getTree(), id)
        if (!parent?.children) return
        const idx = parent.children.findIndex((ch) => ch.id === id)
        if (idx < 0 || idx >= parent.children.length - 1) return
        c.engine.move(id, parent.id, idx + 1)
      },
    }),
    defineCommand({
      id: 'save',
      label: 'Save',
      shortcut: 'mod+s',
      toolbar: 'primary',
      toolbarGroup: 'end',
      when: (c) => typeof c.save === 'function',
      run: (c) => {
        return c.save?.()
      },
    }),
  ]
}
