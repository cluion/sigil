export type CanvasTargetVisibility = 'visible' | 'offscreen' | 'unreachable'

type Axis = 'x' | 'y'
interface Port {
  start: number
  end: number
  minDelta: number
  maxDelta: number
}
interface ScrollLayer {
  x?: Port
  y?: Port
  scroll(dx: number, dy: number): void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function interior(point: number, start: number, end: number): number {
  const margin = Math.min(0.5, (end - start) / 2)
  return clamp(point, start + margin, end - margin)
}

/** Track all positions that can expose a point of the target through each enclosing scrollport. */
function axisPlan(start: number, size: number, layers: ScrollLayer[], axis: Axis) {
  let visibleStart = start
  let visibleEnd = start + size
  let min = visibleStart
  let max = visibleEnd
  const leadingHalf = Math.min(44, size) / 2
  let preferred = start + leadingHalf
  const steps: { index: number; port: Port; min: number; max: number; preferred: number }[] = []
  for (const [index, layer] of layers.entries()) {
    const port = layer[axis]
    if (!port) continue
    visibleStart = Math.max(visibleStart, port.start)
    visibleEnd = Math.min(visibleEnd, port.end)
    steps.push({ index, port, min, max, preferred })
    min = Math.max(port.start, min - port.maxDelta)
    max = Math.min(port.end, max - port.minDelta)
    if (max <= min) return
    if (preferred - leadingHalf < port.start || preferred + leadingHalf > port.end) {
      const inset = Math.min(
        axis === 'y' ? 48 : 16,
        Math.max(0, (port.end - port.start) / 2 - leadingHalf),
      )
      preferred -= clamp(preferred - leadingHalf - port.start - inset, port.minDelta, port.maxDelta)
    }
    preferred = interior(preferred, min, max)
  }

  const deltas = layers.map(() => 0)
  // Choose compatible positions from the outside in, then scroll from the inside out.
  for (const step of steps.reverse()) {
    const from = clamp(
      step.preferred,
      Math.max(step.min, preferred + step.port.minDelta),
      Math.min(step.max, preferred + step.port.maxDelta),
    )
    deltas[step.index] = from - preferred
    preferred = from
  }
  return { visible: visibleEnd > visibleStart, deltas }
}

function port(start: number, end: number, offset: number, extent: number, reverse: boolean): Port {
  const distance = Math.max(0, extent)
  return {
    start,
    end,
    minDelta: (reverse ? -distance : 0) - offset,
    maxDelta: (reverse ? 0 : distance) - offset,
  }
}

function elementPort(element: Element, style: CSSStyleDeclaration, rect: DOMRect, axis: Axis) {
  const horizontal = axis === 'x'
  const overflow = horizontal
    ? style.overflowX || style.overflow
    : style.overflowY || style.overflow
  if (!overflow || overflow === 'visible') return
  const start = horizontal ? rect.left + element.clientLeft : rect.top + element.clientTop
  const size = horizontal ? element.clientWidth : element.clientHeight
  if (overflow === 'clip') return { start, end: start + size, minDelta: 0, maxDelta: 0 }
  const offset = horizontal ? element.scrollLeft : element.scrollTop
  const extent = (horizontal ? element.scrollWidth : element.scrollHeight) - size
  const reverse = horizontal ? style.direction === 'rtl' : style.flexDirection === 'column-reverse'
  return port(start, start + size, offset, extent, reverse)
}

function locate(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  target: Element,
  reveal: boolean,
): CanvasTargetVisibility {
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!target.isConnected || !doc || !win || target.ownerDocument !== doc) return 'unreachable'
  const box = target.getBoundingClientRect()
  const display = win.getComputedStyle(target)
  if (
    !box.width ||
    !box.height ||
    display.display === 'none' ||
    /^(hidden|collapse)$/.test(display.visibility)
  )
    return 'unreachable'

  const layers: ScrollLayer[] = []
  const root = doc.scrollingElement ?? doc.documentElement
  const rootStyle = win.getComputedStyle(doc.documentElement)
  let viewportFixed = false
  function clippingParent(element: Element, style: CSSStyleDeclaration): Element | null {
    if (
      (style.position === 'absolute' || style.position === 'fixed') &&
      'offsetParent' in element
    ) {
      // Out-of-flow elements bypass the scrollports between them and their containing block.
      const block = (element as HTMLElement).offsetParent
      if (block) return block
      if (style.position === 'fixed') {
        viewportFixed = true
        return null
      }
    }
    return element.parentElement
  }
  let ancestor = clippingParent(target, display)
  while (ancestor && ancestor !== doc.documentElement) {
    const element = ancestor
    const style = win.getComputedStyle(element)
    ancestor = clippingParent(element, style)
    // The body's overflow normally propagates to the iframe viewport.
    if (
      element === root ||
      (element === doc.body && (!rootStyle.overflow || rootStyle.overflow === 'visible'))
    )
      continue
    if (style.display === 'inline' || style.display === 'contents') continue
    if (
      ![style.overflowX, style.overflowY, style.overflow].some(
        (value) => value && value !== 'visible',
      )
    )
      continue
    const rect = element.getBoundingClientRect()
    layers.push({
      x: elementPort(element, style, rect, 'x'),
      y: elementPort(element, style, rect, 'y'),
      scroll(dx, dy) {
        element.scrollBy({ left: dx, top: dy, behavior: 'instant' })
      },
    })
  }

  // Canvas-local coordinates deliberately exclude the surrounding page's viewport and scroll.
  const frameLeft = iframe.offsetLeft + iframe.clientLeft
  const frameTop = iframe.offsetTop + iframe.clientTop
  const width = doc.documentElement.clientWidth || iframe.clientWidth
  const height = doc.documentElement.clientHeight || iframe.clientHeight
  const left = container.scrollLeft - frameLeft
  const top = container.scrollTop - frameTop
  layers.push({
    x: port(
      Math.max(0, left),
      Math.min(width, left + container.clientWidth),
      viewportFixed ? 0 : win.scrollX,
      viewportFixed ? 0 : root.scrollWidth - width,
      rootStyle.direction === 'rtl',
    ),
    y: port(
      Math.max(0, top),
      Math.min(height, top + container.clientHeight),
      viewportFixed ? 0 : win.scrollY,
      viewportFixed ? 0 : root.scrollHeight - height,
      false,
    ),
    scroll(dx, dy) {
      if (rootStyle.scrollBehavior === 'smooth')
        win.scrollBy({ left: dx, top: dy, behavior: 'instant' })
      else win.scrollBy(dx, dy)
    },
  })
  const x = axisPlan(box.left, box.width, layers, 'x')
  const y = axisPlan(box.top, box.height, layers, 'y')
  if (!x || !y) return 'unreachable'
  if (reveal) {
    layers.forEach((layer, i) => {
      const dx = x.deltas[i]!
      const dy = y.deltas[i]!
      if (dx || dy) layer.scroll(dx, dy)
    })
  }
  return x.visible && y.visible ? 'visible' : 'offscreen'
}

export function getCanvasTargetVisibility(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  target: Element,
): CanvasTargetVisibility {
  return locate(container, iframe, target, false)
}

export function revealCanvasTarget(
  container: HTMLElement,
  iframe: HTMLIFrameElement,
  target: Element,
): void {
  locate(container, iframe, target, true)
}
