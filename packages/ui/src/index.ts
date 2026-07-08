import type { Engine, EngineEvent } from '@cluion/sigil-core'
import { createRenderer, findNode, type ComponentNode } from '@cluion/sigil-core'

/**
 * 建立 canvas — 把 engine 樹渲染到 same-origin iframe
 *
 * 監聽 patch／tree 即時更新；點選元素反查 data-sigil-id 觸發 select
 */
export function createCanvas(engine: Engine, container: HTMLElement): { destroy: () => void } {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'border:1px solid #ccc;width:100%;height:420px'
  container.appendChild(iframe)

  const renderer = createRenderer()

  function onClick(e: Event): void {
    const target = e.target as Element | null
    const el = target?.closest('[data-sigil-id]')
    if (el) engine.select(el.getAttribute('data-sigil-id') ?? '')
  }

  // srcdoc 同源，load 後 contentDocument 可用
  iframe.srcdoc = '<!doctype html><html><body></body></html>'
  iframe.addEventListener('load', () => {
    const d = iframe.contentDocument
    if (!d) return
    renderer.mount(engine.getTree(), d.body)
    d.addEventListener('click', onClick)
  })

  const unsub = engine.subscribe((ev: EngineEvent) => {
    const d = iframe.contentDocument
    if (!d) return
    if (ev.type === 'patch') renderer.applyPatch(ev.patch)
    else if (ev.type === 'tree') renderer.reconcile(ev.tree)
  })

  return {
    destroy() {
      unsub()
      renderer.destroy()
      iframe.remove()
    },
  }
}

/**
 * 建立 props 面板 — 顯示並編輯選取節點的屬性
 *
 * 僅在 selection／tree 重建（不在 patch 重建，避免 input 打字失焦）
 */
export function createPropsPanel(engine: Engine, container: HTMLElement): { destroy: () => void } {
  function render(): void {
    const id = engine.getSelection()
    container.replaceChildren()
    if (!id) {
      const p = document.createElement('p')
      p.textContent = '未選取節點'
      container.appendChild(p)
      return
    }
    const node = findNode(engine.getTree(), id)
    if (!node) return

    const title = document.createElement('h3')
    title.textContent = `${node.type}（${node.id}）`
    container.appendChild(title)

    appendContentField(container, engine, node)
    appendClassField(container, engine, node)
  }

  const unsub = engine.subscribe((ev: EngineEvent) => {
    if (ev.type === 'selection' || ev.type === 'tree') render()
  })
  render()
  return { destroy() { unsub() } }
}

// content 編輯欄位（text／button 等有內容的節點）
function appendContentField(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  if (node.type !== 'text' && node.type !== 'button') return
  const label = document.createElement('label')
  label.textContent = '內容：'
  const input = document.createElement('input')
  input.value = node.content ?? ''
  input.addEventListener('input', () => {
    if (node.id) engine.update(node.id, { content: input.value })
  })
  label.appendChild(input)
  container.appendChild(label)
  container.appendChild(document.createElement('br'))
}

// className 編輯欄位
function appendClassField(container: HTMLElement, engine: Engine, node: ComponentNode): void {
  const label = document.createElement('label')
  label.textContent = 'class：'
  const input = document.createElement('input')
  input.value = node.className ?? ''
  input.addEventListener('input', () => {
    engine.update(node.id, { className: input.value })
  })
  label.appendChild(input)
  container.appendChild(label)
}
