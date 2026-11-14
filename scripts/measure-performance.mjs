import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'
import { assessBudgetStatus, matchesReferenceProtocol } from './performance-budget.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const options = {
  nodes: [100, 1000, 5000],
  mounts: 5,
  samples: 6,
  history: 100,
  timeout: 900,
  label: 'baseline',
}
let enforceBudgets = false
for (const argument of process.argv.slice(2)) {
  if (argument === '--enforce-budgets') {
    enforceBudgets = true
    continue
  }
  const match = argument.match(/^--(nodes|mounts|samples|history|timeout|label)=(.+)$/)
  if (!match) throw new Error(`Unknown option: ${argument}`)
  const [, key, value] = match
  if (key === 'nodes') {
    options.nodes = value.split(',').map(Number)
    if (options.nodes.some((n) => ![100, 1000, 5000].includes(n)))
      throw new Error('Use node counts 100,1000,5000')
  } else if (key === 'label') {
    if (!/^[a-z0-9-]{1,40}$/.test(value)) throw new Error('Use a short lowercase label')
    options.label = value
  } else {
    const maximum = { mounts: 20, samples: 30, history: 100, timeout: 1800 }[key]
    options[key] = Number(value)
    if (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > maximum)
      throw new Error(`Invalid ${key}`)
  }
}
if (enforceBudgets && !matchesReferenceProtocol(options)) {
  throw new Error(
    '--enforce-budgets requires the complete reference protocol: nodes=100,1000,5000, mounts=5, samples=6, history=100',
  )
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const output = path.join(root, 'test-results/performance', `${timestamp}-${options.label}`)
await mkdir(output, { recursive: true })
const resultPath = path.join(output, 'results.json')
const viewport = { width: 1440, height: 900 }
const operations = ['selection', 'update', 'undo', 'redo', 'save', 'export']
const budget = {
  100: {
    mountReadyMs: 1000,
    interactionReadyMs: 100,
    historyReadyMs: 200,
    serializationWorkMs: 100,
    historyHeapMiB: 20,
  },
  1000: {
    mountReadyMs: 2000,
    interactionReadyMs: 150,
    historyReadyMs: 350,
    serializationWorkMs: 250,
    historyHeapMiB: 50,
  },
  5000: {
    mountReadyMs: 5000,
    interactionReadyMs: 250,
    historyReadyMs: 500,
    serializationWorkMs: 500,
    historyHeapMiB: 150,
  },
}

function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null
  return {
    n: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
  }
}

async function runtimeHash() {
  const hash = createHash('sha256')
  let files = 0
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(filename)
      else if (/\.(ts|css)$/.test(entry.name)) {
        hash.update(path.relative(root, filename))
        hash.update(await readFile(filename))
        files++
      }
    }
  }
  for (const name of ['core', 'app', 'ui', 'blocks', 'store-json', 'shortcode'])
    await walk(path.join(root, 'packages', name, 'src'))
  for (const name of [
    'demo/fixtures/performance.ts',
    'demo/fixtures/performance.html',
    'demo/vite.config.ts',
    'scripts/sigil-version-defines.mjs',
  ]) {
    hash.update(name)
    hash.update(await readFile(path.join(root, name)))
    files++
  }
  return { sha256: hash.digest('hex'), files }
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const result = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  status: 'running',
  budgetStatus: 'incomplete',
  enforceBudgets,
  environment: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    ramBytes: os.totalmem(),
    initialLoadAverage: os.loadavg(),
    node: process.version,
    vite: JSON.parse(await readFile(path.join(root, 'node_modules/vite/package.json'), 'utf8'))
      .version,
    playwright: JSON.parse(
      await readFile(path.join(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
    ).version,
    gitHead: git('rev-parse', 'HEAD'),
    runtimeWorktreeDirty:
      git('status', '--porcelain', '--', 'packages', 'demo/fixtures/performance.ts') !== '',
    source: await runtimeHash(),
    build: 'Vite production, minified source aliases; no prebuilt npm package',
    viewport,
    deviceScaleFactor: 1,
    headless: true,
    cpuThrottleRate: 1,
    reducedMotion: 'reduce',
  },
  protocol: {
    ...options,
    warmupPagesPerSize: 1,
    warmupCycles: 1,
    ready: 'operation completion + two requestAnimationFrame boundaries; paint opportunity proxy',
    mountExcludes:
      'navigation, module load, fixture generation; includes iframe ready, canvas and layers',
    workload:
      'exact node count including root, depth 3, section + up to 20 text nodes, first/middle/last targets',
    save: 'app.save() with synchronous JSON.stringify in-memory adapter; excludes network/disk',
    export: 'app.toHTML() static string generation; excludes dialog/download',
    memory:
      'Chromium CDP Runtime.getHeapUsage + Memory.getDOMCounters; forced GC outside timed operations; not process RSS or DOM native bytes',
    historyMethod:
      'Alternating target edits prevent 500ms merge; count undo/redo publicly after detaching UI and after memory samples',
    percentile:
      'nearest rank; mount p95 with 5 samples equals observed maximum, not a confident population tail estimate',
  },
  budgets: budget,
  workloads: [],
}

async function persist() {
  result.budgetStatus = assessBudgetStatus(result)
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`)
}

let browser
let server
let watchdog
const runtimeErrors = []
async function pageFor() {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(new URL('/fixtures/performance.html', server.resolvedUrls.local[0]).href)
  await page.waitForFunction(() => Boolean(window.__sigilPerformance))
  return { context, page }
}

async function heap(cdp, collect) {
  if (collect) await cdp.send('HeapProfiler.collectGarbage')
  return {
    collected: collect,
    ...(await cdp.send('Runtime.getHeapUsage')),
    ...(await cdp.send('Memory.getDOMCounters')),
  }
}

function summarize(workload) {
  const summary = {
    mount: {
      workMs: percentiles(workload.mounts.map((m) => m.workMs)),
      readyMs: percentiles(workload.mounts.map((m) => m.readyMs)),
    },
    operations: {},
    budgetExceedances: [],
  }
  const limit = budget[workload.nodes]
  function check(metric, actual, threshold) {
    if (actual > threshold) summary.budgetExceedances.push({ metric, actual, threshold })
  }
  check('mount.readyMs.p95', summary.mount.readyMs.p95, limit.mountReadyMs)
  for (const name of operations) {
    const samples = workload.samples.filter((s) => s.operation === name)
    summary.operations[name] = {
      workMs: percentiles(samples.map((s) => s.workMs)),
      readyMs: percentiles(samples.map((s) => s.readyMs)),
    }
    const serialization = name === 'save' || name === 'export'
    const field = serialization ? 'workMs' : 'readyMs'
    const threshold = serialization
      ? limit.serializationWorkMs
      : name === 'undo' || name === 'redo'
        ? limit.historyReadyMs
        : limit.interactionReadyMs
    check(`${name}.${field}.p95`, summary.operations[name][field].p95, threshold)
  }
  if (workload.memory) {
    summary.historyHeapDeltaMiB =
      (workload.memory.afterGC.usedSize - workload.memory.beforeGC.usedSize) / 1024 ** 2
    check('history.heapDeltaMiB', summary.historyHeapDeltaMiB, limit.historyHeapMiB)
  }
  return summary
}

try {
  await persist()
  await build({
    root: path.join(root, 'demo'),
    configFile: path.join(root, 'demo/vite.config.ts'),
    mode: 'production',
    build: {
      outDir: path.join(output, 'build'),
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: { input: path.join(root, 'demo/fixtures/performance.html') },
    },
  })
  server = await preview({
    root: path.join(root, 'demo'),
    configFile: path.join(root, 'demo/vite.config.ts'),
    build: { outDir: path.join(output, 'build') },
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  browser = await chromium.launch({ headless: true })
  result.environment.browser = browser.version()
  watchdog = setTimeout(() => {
    result.timedOut = true
    void browser.close()
  }, options.timeout * 1000)
  for (const nodes of options.nodes) {
    const workload = { nodes, mounts: [], samples: [] }
    result.workloads.push(workload)
    console.log(`[performance] ${nodes} nodes: warmup`)
    {
      const { context, page } = await pageFor()
      workload.warmup = await page.evaluate(
        (count) => window.__sigilPerformance.mount(count),
        nodes,
      )
      await page.evaluate(() => window.__sigilPerformance.cycle(0))
      await context.close()
    }
    for (let run = 0; run < options.mounts; run++) {
      const { context, page } = await pageFor()
      workload.mounts.push({
        run,
        ...(await page.evaluate((count) => window.__sigilPerformance.mount(count), nodes)),
      })
      for (let index = 0; index < options.samples; index++) {
        const samples = await page.evaluate(
          (index) => window.__sigilPerformance.cycle(index),
          index,
        )
        workload.samples.push(...samples.map((sample) => ({ run, index, ...sample })))
      }
      await context.close()
      workload.summary = summarize(workload)
      await persist()
      console.log(`[performance] ${nodes} nodes: measured page ${run + 1}/${options.mounts}`)
    }
    console.log(`[performance] ${nodes} nodes: ${options.history} history steps and GC snapshots`)
    {
      const { context, page } = await pageFor()
      await page.evaluate((count) => window.__sigilPerformance.mount(count), nodes)
      const cdp = await context.newCDPSession(page)
      const beforeGC = await heap(cdp, true)
      await page.evaluate((steps) => window.__sigilPerformance.addHistory(steps), options.history)
      const afterUncollected = await heap(cdp, false)
      const afterGC = await heap(cdp, true)
      workload.memory = { beforeGC, afterUncollected, afterGC }
      workload.history = await page.evaluate(() => window.__sigilPerformance.inspectHistory())
      if (
        workload.history.undoSteps !== options.history ||
        workload.history.redoSteps !== options.history
      )
        throw new Error('History step count mismatch')
      await context.close()
    }
    workload.summary = summarize(workload)
    await persist()
    for (const exceeded of workload.summary.budgetExceedances) {
      console.warn(
        `[performance] BUDGET EXCEEDED (${nodes} nodes): ${exceeded.metric} = ${exceeded.actual}, limit = ${exceeded.threshold}`,
      )
    }
    console.log(`[performance] ${nodes} nodes: ${JSON.stringify(workload.summary)}`)
  }
  result.environment.finalSource = await runtimeHash()
  result.environment.runtimeStable =
    result.environment.source.sha256 === result.environment.finalSource.sha256
  if (!result.environment.runtimeStable)
    throw new Error(
      'Runtime sources changed during measurement; rerun against a stable source tree',
    )
  if (runtimeErrors.length) throw new Error(`Browser runtime errors: ${runtimeErrors.join('; ')}`)
  result.status = 'completed'
} catch (error) {
  result.status = 'failed'
  result.error = error.stack ?? String(error)
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  result.finishedAt = new Date().toISOString()
  result.environment.finalLoadAverage = os.loadavg()
  result.runtimeErrors = runtimeErrors
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await persist()
  if (enforceBudgets && result.budgetStatus !== 'within-budget') process.exitCode = 1
  console.log(`[performance] ${result.status}, budgetStatus=${result.budgetStatus}: ${resultPath}`)
}
