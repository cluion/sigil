import { expect, test } from 'vitest'
import { summarizeUpdate } from './measure-performance-profile.mjs'

const frameTree = { frame: { id: 'host-id' }, childFrames: [{ frame: { id: 'canvas-id' } }] }
const sample = { target: 'first-text' }
const marks = ['start', 'work-end', 'frame-one', 'ready'].map((phase, index) => ({
  name: `sigil-update:0:${phase}`,
  ts: [1000, 2000, 4000, 9000][index],
  pid: 1,
  tid: 10,
}))

test('attributes layout to its frame and clips overlapping raster workers to the update interval', () => {
  const events = [
    ...marks,
    {
      name: 'Layout',
      ts: 1000,
      dur: 750,
      pid: 1,
      tid: 10,
      args: { beginData: { frame: 'canvas-id' } },
    },
    { name: 'Paint', ts: 4000, dur: 250, pid: 1, tid: 10, args: { data: { frame: 'host-id' } } },
    { name: 'RasterTask', ts: 500, dur: 4500, pid: 1, tid: 21 },
    { name: 'RasterTask', ts: 3500, dur: 2500, pid: 1, tid: 22 },
    { name: 'RasterTask', ts: 8000, dur: 1800, pid: 1, tid: 21 },
    { name: 'RasterTask', ts: 1000, dur: 8000, pid: 99, tid: 21 },
  ]
  expect(summarizeUpdate(events, sample, 0, frameTree)).toEqual({
    index: 0,
    target: 'first-text',
    workMs: 1,
    workEndToFirstFrameMs: 2,
    firstToSecondFrameMs: 5,
    readyMs: 8,
    timelineMs: { 'canvas.Layout': 0.75, 'host.Paint': 0.25, 'renderer.RasterTask': 6 },
  })
})

test('rejects a trace with a missing boundary or two different updates sharing one mark', () => {
  for (const events of [marks.slice(1), [...marks, marks[0]]]) {
    expect(() => summarizeUpdate(events, sample, 0, frameTree)).toThrow('Missing or duplicate')
  }
})
