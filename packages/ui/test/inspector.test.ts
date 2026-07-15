import { describe, expect, it } from 'vitest'
import { createEngine } from '@cluion/sigil-core'
import { createInspector } from '../src/inspector.js'

describe('createInspector — responsive style', () => {
  it('裝置切換後顯示繼承來源，清除只影響目前 breakpoint', () => {
    const engine = createEngine({
      doc: {
        version: 1,
        root: {
          id: 'n',
          type: 'section',
          style: { margin: '16px' },
          responsiveStyles: { tablet: { margin: '8px', color: '#ff0000' } },
        },
      },
    })
    engine.select('n')
    const box = document.createElement('div')
    const inspector = createInspector(engine, box)
    const styleTab = [...box.querySelectorAll<HTMLButtonElement>('.sigil-tab')].find(
      (button) => button.textContent === '樣式',
    )!
    styleTab.click()
    inspector.setDevice('tablet')

    const context = box.querySelector('.sigil-responsive-style-context') as HTMLElement
    expect(context.dataset.styleDevice).toBe('tablet')
    expect(context.textContent).toContain('繼承 Desktop')

    const clear = [...box.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('清除 Tablet 覆寫'),
    )!
    clear.click()
    expect(engine.getTree().style?.margin).toBe('16px')
    expect(engine.getTree().responsiveStyles?.tablet).toBeUndefined()

    const marginReset = box.querySelector('button[data-style-reset="margin"]') as HTMLButtonElement
    const margin = marginReset.parentElement?.querySelector('input') as HTMLInputElement
    expect(margin.value).toBe('')
    expect(margin.placeholder).toBe('繼承：16px')
    inspector.destroy()
  })
})
