# `@cluion/sigil`

`createEditor` SDK。

```bash
pnpm add @cluion/sigil @cluion/sigil-blocks
```

```ts
import { createEditor, defineCommand } from '@cluion/sigil'
import { basicBlocks } from '@cluion/sigil-blocks'

const editor = createEditor({
  mount: '#app',
  blocks: basicBlocks,
  commands: [
    defineCommand({
      id: 'log-tree',
      shortcut: 'mod+shift+l',
      run: ({ engine }) => console.log(engine.getTree()),
    }),
  ],
  hooks: {
    onSelect: (id) => console.log('select', id),
    beforeSave: (doc) => doc,
  },
})
await editor.runCommand('undo')
editor.toJSON()
editor.toHTML()
editor.destroy()
```

預設命令：`undo`／`redo`／`delete`／`copy`／`paste`／`save`。  
產品殼：`@cluion/sigil-app`（同樣支援 `commands`／`hooks`）。

## License

MIT
