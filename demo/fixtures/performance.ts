import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlockDefs } from '@cluion/sigil-blocks'
import { findNode, type ComponentNode, type SigilDoc } from '@cluion/sigil-core'

type Operation = 'selection' | 'update' | 'undo' | 'redo' | 'save' | 'export'
interface Sample {
  operation: Operation
  target: string
  workMs: number
  readyMs: number
}

let app: SigilApp | null = null
let targets: string[] = []
let serialized = ''
let sequence = 0

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function current(): SigilApp {
  assert(app, 'Mount the performance fixture first')
  return app
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

// Two animation-frame boundaries are a paint opportunity proxy, not an optical paint timestamp.
async function ready(): Promise<void> {
  await frame()
  await frame()
}

function canvas(): Document {
  const doc = document.querySelector('iframe')?.contentDocument
  assert(doc, 'Canvas document is unavailable')
  return doc
}

function makeDocument(count: number): SigilDoc {
  assert(Number.isInteger(count) && count >= 3, 'Expected at least three nodes')
  const children: ComponentNode[] = []
  const textIds: string[] = []
  let id = 1
  while (id < count) {
    const section: ComponentNode = {
      id: `node-${id++}`,
      type: 'section',
      name: '內容區段',
      style: { padding: '8px', 'margin-bottom': '8px' },
      children: [],
    }
    while (id < count && section.children!.length < 20) {
      const textId = `node-${id++}`
      textIds.push(textId)
      section.children!.push({
        id: textId,
        type: 'text',
        tagName: 'p',
        name: textId,
        content: `活動內容 ${textId}：固定文字樣本，包含可預測的段落與響應式樣式。`,
        style: { margin: '4px 0', 'font-size': '16px', color: '#243047' },
        responsiveStyles: { mobile: { 'font-size': '14px' } },
      })
    }
    children.push(section)
  }
  targets = [textIds[0]!, textIds[Math.floor(textIds.length / 2)]!, textIds.at(-1)!]
  return {
    version: 1,
    root: { id: 'node-0', type: 'section', style: { padding: '16px' }, children },
    meta: { title: '固定效能文件', device: 'desktop' },
    stylesheets: [],
  }
}

async function mount(count: number) {
  app?.destroy()
  app = null
  serialized = ''
  sequence = 0
  const doc = makeDocument(count)
  const documentBytes = new TextEncoder().encode(JSON.stringify(doc)).length
  const start = performance.now()
  app = createApp({
    mount: '#app',
    doc,
    blocks: basicBlockDefs,
    locale: 'zh',
    theme: 'light',
    store: {
      load: () => null,
      save: (snapshot) => {
        serialized = JSON.stringify(snapshot)
      },
    },
  })
  const workMs = performance.now() - start
  while (
    document.querySelector('iframe')?.contentDocument?.querySelectorAll('[data-sigil-id]')
      .length !== count
  ) {
    assert(performance.now() - start < 60_000, 'Canvas did not mount every node within 60s')
    await frame()
  }
  assert(document.querySelectorAll('[role="treeitem"]').length === count, 'Layer count mismatch')
  canvas().body.getBoundingClientRect()
  await ready()
  return { workMs, readyMs: performance.now() - start, documentBytes, count, targets }
}

async function measure(
  operation: Operation,
  target: string,
  action: () => unknown,
): Promise<Sample> {
  const start = performance.now()
  await action()
  const workMs = performance.now() - start
  await ready()
  return { operation, target, workMs, readyMs: performance.now() - start }
}

async function cycle(index: number): Promise<Sample[]> {
  const editor = current()
  const target = targets[index % targets.length]!
  const original = findNode(editor.engine.getTree(), target)?.content
  const updated = `效能修改 ${++sequence}：${target}`
  const samples: Sample[] = []
  samples.push(await measure('selection', target, () => editor.engine.select(target)))
  assert(editor.engine.getSelection() === target, 'Selection did not apply')
  samples.push(
    await measure('update', target, () => editor.engine.update(target, { content: updated })),
  )
  assert(
    canvas().querySelector(`[data-sigil-id="${target}"]`)?.textContent === updated,
    'Update did not render',
  )
  samples.push(await measure('undo', target, () => editor.engine.undo()))
  assert(
    canvas().querySelector(`[data-sigil-id="${target}"]`)?.textContent === original,
    'Undo did not restore content',
  )
  samples.push(await measure('redo', target, () => editor.engine.redo()))
  assert(
    canvas().querySelector(`[data-sigil-id="${target}"]`)?.textContent === updated,
    'Redo did not restore content',
  )
  samples.push(await measure('save', target, () => editor.save()))
  assert(!editor.isDirty() && serialized.includes(updated), 'Save did not acknowledge the update')
  let html = ''
  samples.push(
    await measure('export', target, () => {
      html = editor.toHTML()
    }),
  )
  assert(html.includes(updated), 'Export did not contain the update')
  return samples
}

async function addHistory(steps: number): Promise<void> {
  const editor = current()
  assert(!editor.engine.canUndo(), 'History measurement needs a fresh mount')
  for (let index = 0; index < steps; index++) {
    // Different target ids prevent the engine's 500ms same-field merge without artificial sleeps.
    editor.engine.update(targets[index % targets.length]!, { content: `歷史 ${index}` })
    await ready()
  }
}

function inspectHistory() {
  const editor = current()
  const engine = editor.engine
  // Count through the public API after the heap samples. Detached UI avoids timing 100 renders.
  editor.destroy()
  app = null
  const nodes = new WeakSet<ComponentNode>()
  const childArrays = new WeakSet<ComponentNode[]>()
  let uniqueNodes = 0
  let uniqueChildArrays = 0
  let childReferences = 0
  function visit(node: ComponentNode): void {
    if (nodes.has(node)) return
    nodes.add(node)
    uniqueNodes++
    if (node.children && !childArrays.has(node.children)) {
      childArrays.add(node.children)
      uniqueChildArrays++
      childReferences += node.children.length
    }
    node.children?.forEach(visit)
  }
  visit(engine.getTree())
  let undoSteps = 0
  while (engine.canUndo()) {
    assert(++undoSteps <= 1000, 'Unexpected unbounded history')
    engine.undo()
    visit(engine.getTree())
  }
  let redoSteps = 0
  while (engine.canRedo()) {
    assert(++redoSteps <= 1000, 'Unexpected unbounded redo history')
    engine.redo()
  }
  return {
    undoSteps,
    redoSteps,
    roots: undoSteps + 1,
    uniqueNodes,
    uniqueChildArrays,
    childReferences,
  }
}

const api = { mount, cycle, addHistory, inspectHistory }
;(window as unknown as { __sigilPerformance: typeof api }).__sigilPerformance = api
