import { createEngine, type Engine, type SigilDoc } from '@cluion/sigil-core'
import { createCanvas, createPropsPanel } from '@cluion/sigil-ui'
import { JsonProjectStore } from '@cluion/sigil-store-json'

export interface EditorOptions {
  mount: string | HTMLElement
  doc?: SigilDoc
  store?: JsonProjectStore
}

export interface SigilEditor {
  engine: Engine
  toJSON(): SigilDoc
  destroy(): void
}

/**
 * 建立 editor — 一站式組合 engine + canvas + props 面板
 */
export function createEditor(opts: EditorOptions): SigilEditor {
  const mountEl =
    typeof opts.mount === 'string'
      ? document.querySelector<HTMLElement>(opts.mount)
      : opts.mount
  if (!mountEl) throw new Error('createEditor：mount 目標不存在')

  const engine = createEngine({ doc: opts.doc })
  const store = opts.store ?? new JsonProjectStore()

  mountEl.replaceChildren()
  const layout = document.createElement('div')
  layout.style.display = 'flex'
  layout.style.gap = '12px'
  const canvasBox = document.createElement('div')
  canvasBox.style.flex = '1'
  const propsBox = document.createElement('div')
  propsBox.style.width = '280px'
  layout.append(canvasBox, propsBox)
  mountEl.appendChild(layout)

  const canvas = createCanvas(engine, canvasBox)
  const props = createPropsPanel(engine, propsBox)

  return {
    engine,
    toJSON() {
      const doc = engine.toJSON()
      store.save(doc)
      return doc
    },
    destroy() {
      canvas.destroy()
      props.destroy()
      engine.destroy()
    },
  }
}
