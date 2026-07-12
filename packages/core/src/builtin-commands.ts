import { findNode, findParent, cloneWithNewIds } from './model/tree.js'
// findNode used by delete.when (locked)
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
      id: 'save',
      label: 'Save',
      shortcut: 'mod+s',
      toolbar: 'primary',
      toolbarGroup: 'end',
      when: (c) => typeof c.save === 'function',
      run: (c) => {
        void c.save?.()
      },
    }),
  ]
}
