import { describe, it, expect } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createCanvas } from '../src/canvas.js'

const doc = { version: 1 as const, root: { id: 'r', type: 'section', children: [] } }
const docWithText = {
  version: 1 as const,
  root: {
    id: 'r',
    type: 'section',
    children: [{ id: 't1', type: 'text', content: 'hello' }],
  },
}

function waitIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    if (iframe.contentDocument?.body?.childNodes.length) {
      resolve()
      return
    }
    iframe.addEventListener('load', () => resolve(), { once: true })
  })
}

describe('createCanvas — preview mode', () => {
  it('預設 edit:iframe pointerEvents none', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.style.pointerEvents).toBe('none')
  })

  it('setMode preview:iframe pointerEvents auto', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setMode } = createCanvas(engine, container)
    setMode('preview')
    expect(iframe.style.pointerEvents).toBe('auto')
  })

  it('setMode preview → edit:回到 none', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setMode } = createCanvas(engine, container)
    setMode('preview')
    setMode('edit')
    expect(iframe.style.pointerEvents).toBe('none')
  })
})

describe('createCanvas — device', () => {
  it('預設 desktop:width 100%', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.style.width).toBe('100%')
  })

  it('iframe 有 title(無障礙名稱)', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe } = createCanvas(engine, container)
    expect(iframe.title).toBeTruthy()
  })

  it('setDevice tablet:width 768px', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setDevice } = createCanvas(engine, container)
    setDevice('tablet')
    expect(iframe.style.width).toBe('768px')
  })

  it('setDevice mobile:width 375px', () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    const { iframe, setDevice } = createCanvas(engine, container)
    setDevice('mobile')
    expect(iframe.style.width).toBe('375px')
  })
})

describe('createCanvas — selection chrome', () => {
  it('選取後標記 data-sigil-selected 與類型 badge', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    // 給 srcdoc 一點時間 mount
    await new Promise((r) => setTimeout(r, 30))
    engine.select('t1')
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    const el = d?.querySelector('[data-sigil-id="t1"]')
    expect(el?.getAttribute('data-sigil-selected')).toBe('1')
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge).toBeTruthy()
    expect(badge.style.display).not.toBe('none')
    expect(badge.textContent).toBe('text')
    engine.update('t1', { name: '標題' })
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect((d?.querySelector('[data-sigil-type-badge]') as HTMLElement).textContent).toBe(
      '標題',
    )
    destroy()
    container.remove()
  })

  it('選取 image 也顯示類型 badge（iframe 內 fixed）', async () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'r',
          type: 'section',
          children: [
            {
              id: 'img1',
              type: 'image',
              tagName: 'img',
              attributes: { src: 'https://example.com/a.png', alt: 'a' },
            },
          ],
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    engine.select('img1')
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    const el = d?.querySelector('[data-sigil-id="img1"]')
    expect(el?.tagName.toLowerCase()).toBe('img')
    expect(el?.getAttribute('data-sigil-selected')).toBe('1')
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement
    expect(badge.style.display).not.toBe('none')
    expect(badge.textContent).toBe('image')
    destroy()
    container.remove()
  })

  it('取消選取清除標記與 badge', async () => {
    const engine = createEngine({ doc: docWithText })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    engine.select('t1')
    engine.select(null)
    await new Promise((r) => setTimeout(r, 0))
    const d = iframe.contentDocument
    expect(d?.querySelector('[data-sigil-selected]')).toBeNull()
    const badge = d?.querySelector('[data-sigil-type-badge]') as HTMLElement | null
    // 可能尚未建立，或已隱藏
    if (badge) expect(badge.style.display).toBe('none')
    destroy()
    container.remove()
  })

  it('inject 含 hover／selected 樣式', async () => {
    const engine = createEngine({ doc })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { iframe, destroy } = createCanvas(engine, container)
    await waitIframeLoad(iframe)
    await new Promise((r) => setTimeout(r, 30))
    const css = iframe.contentDocument?.head.querySelector('style')?.textContent ?? ''
    expect(css).toContain('data-sigil-selected')
    expect(css).toContain('data-sigil-hover')
    expect(css).not.toContain('::after')
    destroy()
    container.remove()
  })
})

