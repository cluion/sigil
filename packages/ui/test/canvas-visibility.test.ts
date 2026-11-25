import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCanvasTargetVisibility, revealCanvasTarget } from '../src/canvas-visibility.js'

function dimensions(
  element: Element,
  values: Partial<
    Record<'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight' | 'offsetTop', number>
  >,
) {
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(element, key, { configurable: true, value })
}

function canvas() {
  const host = document.createElement('div')
  const frame = document.createElement('iframe')
  host.append(frame)
  document.body.append(host)
  const doc = frame.contentDocument!
  const win = frame.contentWindow!
  const outer = doc.createElement('div')
  const inner = doc.createElement('div')
  const target = doc.createElement('button')
  doc.body.append(outer)
  outer.append(inner)
  inner.append(target)
  dimensions(host, { clientWidth: 400, clientHeight: 320 })
  dimensions(frame, { clientWidth: 400, clientHeight: 320 })
  const root = doc.scrollingElement ?? doc.documentElement
  dimensions(root, { scrollWidth: 400, scrollHeight: 1800 })
  const scroll = vi.spyOn(win, 'scrollBy').mockImplementation(() => {})
  const bounds = vi.spyOn(target, 'getBoundingClientRect')
  const visible = () => getCanvasTargetVisibility(host, frame, target)
  const reveal = () => revealCanvasTarget(host, frame, target)
  return { host, frame, root, outer, inner, target, scroll, bounds, visible, reveal }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('canvas visibility and reveal', () => {
  it('intersects with the canvas host rather than the surrounding page and only scrolls on explicit reveal', () => {
    const h = canvas()
    vi.spyOn(h.host, 'getBoundingClientRect').mockReturnValue(new DOMRect(4000, 2000, 400, 320))
    h.bounds.mockReturnValue(new DOMRect(12, 600, 90, 40))
    expect(h.visible()).toBe('offscreen')
    expect(h.scroll).not.toHaveBeenCalled()
    h.reveal()
    expect(h.scroll).toHaveBeenCalledExactlyOnceWith(0, 552)
    h.bounds.mockReturnValue(new DOMRect(12, 310, 90, 40))
    expect(h.visible()).toBe('visible')
    h.bounds.mockReturnValue(new DOMRect(12, 48, 90, 40))
    h.reveal()
    expect(h.scroll).toHaveBeenCalledOnce()
    dimensions(h.frame, { offsetTop: 330 })
    expect(h.visible()).toBe('unreachable')
  })

  it('reveals both axes in a nested scrollable region and the iframe window without touching the host', () => {
    const h = canvas()
    h.inner.style.overflow = 'auto'
    h.outer.style.overflow = 'hidden'
    dimensions(h.inner, { clientWidth: 160, clientHeight: 80, scrollWidth: 600, scrollHeight: 480 })
    dimensions(h.outer, {
      clientWidth: 310,
      clientHeight: 110,
      scrollWidth: 800,
      scrollHeight: 500,
    })
    vi.spyOn(h.outer, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 750, 310, 110))
    vi.spyOn(h.inner, 'getBoundingClientRect').mockReturnValue(new DOMRect(410, 1010, 160, 80))
    h.bounds.mockReturnValue(new DOMRect(710, 1310, 80, 30))
    const inner = vi.spyOn(h.inner, 'scrollBy').mockImplementation(() => {})
    const outer = vi.spyOn(h.outer, 'scrollBy').mockImplementation(() => {})
    const host = vi.spyOn(window, 'scrollBy')
    expect(h.visible()).toBe('offscreen')
    expect(inner).not.toHaveBeenCalled()
    h.reveal()
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }),
    )
    expect(outer).toHaveBeenCalledOnce()
    expect(h.scroll).toHaveBeenCalledOnce()
    expect(host).not.toHaveBeenCalled()
  })

  it('can scroll an inner region to expose a point through a non-scrollable clipping ancestor', () => {
    const h = canvas()
    h.inner.style.overflow = 'auto'
    h.outer.style.overflow = 'clip'
    dimensions(h.inner, {
      clientWidth: 220,
      clientHeight: 200,
      scrollWidth: 220,
      scrollHeight: 700,
    })
    dimensions(h.outer, { clientWidth: 220, clientHeight: 50, scrollWidth: 220, scrollHeight: 200 })
    vi.spyOn(h.inner, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 200))
    vi.spyOn(h.outer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 50))
    h.bounds.mockReturnValue(new DOMRect(4, 110, 40, 16))
    const scroll = vi.spyOn(h.inner, 'scrollBy').mockImplementation(() => {})
    const clip = vi.spyOn(h.outer, 'scrollBy')
    expect(h.visible()).toBe('offscreen')
    h.reveal()
    expect(scroll).toHaveBeenCalledOnce()
    expect((scroll.mock.calls[0]![0] as ScrollToOptions).top).toBeGreaterThan(60)
    expect(clip).not.toHaveBeenCalled()
    expect(h.scroll).not.toHaveBeenCalled()
  })

  it('uses positioned containing blocks and cannot reveal a viewport-fixed target by scrolling the document', () => {
    const h = canvas()
    h.inner.style.overflow = 'clip'
    dimensions(h.inner, { clientWidth: 16, clientHeight: 16 })
    vi.spyOn(h.inner, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 16, 16))
    Object.defineProperty(h.target, 'offsetParent', { configurable: true, value: null })
    h.target.style.position = 'fixed'
    h.bounds.mockReturnValue(new DOMRect(30, 100, 90, 32))
    expect(h.visible()).toBe('visible')
    h.bounds.mockReturnValue(new DOMRect(30, 900, 90, 32))
    expect(h.visible()).toBe('unreachable')
    h.reveal()
    expect(h.scroll).not.toHaveBeenCalled()
    h.target.style.position = 'absolute'
    Object.defineProperty(h.target, 'offsetParent', { value: h.frame.contentDocument!.body })
    expect(h.visible()).toBe('offscreen')
    h.reveal()
    expect(h.scroll).toHaveBeenCalledWith(0, 852)
  })

  it('reports an unreachable clipped, hidden or disconnected selection without scrolling', () => {
    const h = canvas()
    h.outer.style.overflow = 'clip'
    dimensions(h.outer, { clientWidth: 120, clientHeight: 60, scrollWidth: 520, scrollHeight: 700 })
    vi.spyOn(h.outer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 600, 120, 60))
    h.bounds.mockReturnValue(new DOMRect(130, 610, 60, 20))
    expect(h.visible()).toBe('unreachable')
    h.reveal()
    expect(h.scroll).not.toHaveBeenCalled()
    h.outer.style.overflow = 'visible'
    h.target.style.display = 'none'
    expect(h.visible()).toBe('unreachable')
    h.target.style.display = ''
    h.bounds.mockReturnValue(new DOMRect(11, 10, 0, 0))
    expect(h.visible()).toBe('unreachable')
    h.target.remove()
    expect(h.visible()).toBe('unreachable')
  })
})
