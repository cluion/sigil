import { describe, it, expect } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createCanvas } from '../src/canvas.js'

const doc = { version: 1 as const, root: { id: 'r', type: 'section', children: [] } }

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
