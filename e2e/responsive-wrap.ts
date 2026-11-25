import type { SigilDoc } from '@cluion/sigil-core'
import { expect, type Locator } from '@playwright/test'

export function workshopSessions(): SigilDoc {
  return {
    version: 1,
    meta: { title: '版畫工作坊場次' },
    root: {
      id: 'workshop',
      name: '工作坊',
      type: 'section',
      style: { padding: '16px', color: '#18294e', 'font-family': 'system-ui, sans-serif' },
      children: [
        {
          id: 'title',
          type: 'text',
          tagName: 'h1',
          name: '場次標題',
          content: '版畫工作坊場次',
          style: { margin: '0 0 3rem', 'font-size': '2rem', 'line-height': '1.25' },
        },
        {
          id: 'times',
          type: 'section',
          name: '場次列表',
          attributes: { id: 'sessions' },
          style: {
            display: 'flex',
            'flex-flow': 'row-reverse nowrap',
            'grid-gap': '9px 13px',
            width: '350px',
            'max-width': '100%',
            'align-content': 'flex-start',
          },
          children: ['上午 10:00', '下午 14:00', '傍晚 17:00'].map((content, i) => ({
            id: 'time-' + i,
            type: 'button',
            name: content,
            content,
            style: {
              flex: '0 0 128px',
              'box-sizing': 'border-box',
              height: '44px',
              margin: '0',
              border: '0',
              'border-radius': '6px',
              background: '#243e83',
              color: '#ffffff',
            },
          })),
        },
      ],
    },
  }
}

export async function expectSessionLayout(
  section: Locator,
  wrap: 'nowrap' | 'wrap' | 'wrap-reverse',
  rowGap: number,
  columnGap: number,
) {
  await expect(section).toHaveCSS('flex-wrap', wrap)
  await expect(section).toHaveCSS('row-gap', rowGap + 'px')
  await expect(section).toHaveCSS('column-gap', columnGap + 'px')
  const boxes = await section.evaluate((el) => {
    const origin = el.getBoundingClientRect()
    return Array.from(el.children, (child) => {
      const rect = child.getBoundingClientRect()
      return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
    })
  })
  expect(boxes).toHaveLength(3)
  const first = boxes[0]!
  const second = boxes[1]!
  const third = boxes[2]!
  expect(first.width).toBe(128)
  expect(first.height).toBe(44)
  expect(first.y).toBeCloseTo(second.y)
  const measuredColumnGap = first.x - second.x - second.width
  expect(measuredColumnGap).toBeCloseTo(columnGap)
  let measuredRowGap: number | null = null
  if (wrap === 'nowrap') {
    expect(second.y).toBeCloseTo(third.y)
    expect(second.x - third.x - third.width).toBeCloseTo(columnGap)
  } else {
    expect(third.x).toBeCloseTo(first.x)
    measuredRowGap =
      wrap === 'wrap' ? third.y - first.y - first.height : first.y - third.y - third.height
    expect(measuredRowGap).toBeCloseTo(rowGap)
  }
  return { wrap, rowGap, columnGap, measuredRowGap, measuredColumnGap, boxes }
}
