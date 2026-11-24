const timelineNames = new Set([
  'UpdateLayoutTree',
  'Layout',
  'PrePaint',
  'Paint',
  'FireAnimationFrame',
  'LayerTreeHost::WaitForCommitCompletion',
  'RasterTask',
])
const markPrefix = 'sigil-update:'

function milliseconds(microseconds) {
  return Math.round(microseconds) / 1000
}

// Inclusive trace intervals can nest. Count the union for each event type and frame.
function coveredTime(intervals) {
  let total = 0
  let end = -Infinity
  for (const [left, right] of intervals.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, right - Math.max(end, left))
    end = Math.max(end, right)
  }
  return milliseconds(total)
}

export function summarizeUpdate(events, sample, index, frameTree) {
  const marks = ['start', 'work-end', 'frame-one', 'ready'].map((phase) => {
    const matches = events.filter((event) => event.name === `${markPrefix}${index}:${phase}`)
    if (matches.length !== 1)
      throw new Error(`Missing or duplicate update trace mark: ${index}:${phase}`)
    return matches[0]
  })
  const [start, workEnd, firstFrame, ready] = marks
  const bounds = marks.map((mark) => mark.ts)
  const intervals = new Map()
  for (const event of events) {
    if (event.pid !== start.pid || !timelineNames.has(event.name)) continue
    const raster = event.name === 'RasterTask'
    if (!raster && event.tid !== start.tid) continue
    const left = Math.max(event.ts, start.ts)
    const right = Math.min(event.ts + event.dur, ready.ts)
    if (right <= left) continue
    const frame = event.args?.beginData?.frame ?? event.args?.data?.frame
    const owner =
      frame === frameTree.frame.id
        ? 'host'
        : frame && frameTree.childFrames?.some((child) => child.frame.id === frame)
          ? 'canvas'
          : 'unattributed'
    const key = raster ? 'renderer.RasterTask' : `${owner}.${event.name}`
    if (!intervals.has(key)) intervals.set(key, [])
    intervals.get(key).push([left, right])
  }
  if (!bounds.every((value, i) => i === 0 || value >= bounds[i - 1])) {
    throw new Error('Non-monotonic update trace marks')
  }
  return {
    index,
    target: sample.target,
    readyMs: milliseconds(ready.ts - start.ts),
    workMs: milliseconds(workEnd.ts - start.ts),
    workEndToFirstFrameMs: milliseconds(firstFrame.ts - workEnd.ts),
    firstToSecondFrameMs: milliseconds(ready.ts - firstFrame.ts),
    timelineMs: Object.fromEntries(
      [...intervals].map(([key, ranges]) => [key, coveredTime(ranges)]),
    ),
  }
}

// Profile fresh pages separately so tracing overhead never enters product budget samples.
export async function profileUpdates(context, page, samples) {
  const chrome = await page.evaluate(() => {
    const app = document.querySelector('.sigil-app')
    const doc = document.querySelector('iframe')?.contentDocument
    const root = doc?.body.firstElementChild
    const section = root?.firstElementChild
    if (
      !app ||
      !document.getElementById('sigil-tokens') ||
      !getComputedStyle(app).getPropertyValue('--sigil-color-accent') ||
      !root ||
      !section
    ) {
      throw new Error('Expected a styled production app and nested canvas containers')
    }
    return {
      rootOutline: getComputedStyle(root).outlineStyle,
      sectionOutline: getComputedStyle(section).outlineStyle,
    }
  })
  const cdp = await context.newCDPSession(page)
  const { frameTree } = await cdp.send('Page.getFrameTree')
  if (frameTree.childFrames?.length !== 1) throw new Error('Expected one canvas frame')
  const events = []
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      if (
        event.name.startsWith(markPrefix) ||
        (event.ph === 'X' && timelineNames.has(event.name))
      ) {
        events.push(event)
      }
    }
  })
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,cc',
    transferMode: 'ReportEvents',
  })
  const updates = []
  for (let index = 0; index < samples; index++) {
    const cycle = await page.evaluate((i) => window.__sigilPerformance.cycle(i, true), index)
    updates.push(cycle.find((sample) => sample.operation === 'update'))
  }
  const complete = new Promise((resolve, reject) => {
    cdp.once('Tracing.tracingComplete', ({ dataLossOccurred }) => {
      if (dataLossOccurred) reject(new Error('Incomplete Chromium timeline trace'))
      else resolve()
    })
    page.once('close', () => reject(new Error('Page closed during timeline trace')))
  })
  await Promise.all([complete, cdp.send('Tracing.end')])
  await cdp.detach()
  return {
    chrome,
    updates: updates.map((update, index) => summarizeUpdate(events, update, index, frameTree)),
  }
}
