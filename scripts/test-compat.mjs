import { spawn } from 'node:child_process'
import { log } from 'node:console'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform, release } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { chromium, firefox, webkit } from '@playwright/test'

const root = fileURLToPath(new URL('../', import.meta.url))
const browserTypes = { chromium, firefox, webkit }
const requested = process.argv.slice(2)
const engines = requested.length ? [...new Set(requested)] : Object.keys(browserTypes)
if (engines.some((engine) => !Object.hasOwn(browserTypes, engine))) {
  throw new Error('Usage: node scripts/test-compat.mjs [chromium firefox webkit]')
}
const output = resolve(root, 'test-results/compat')
mkdirSync(output, { recursive: true })
const require = createRequire(import.meta.url)
const summary = {
  startedAt: new Date().toISOString(),
  platform: platform(),
  arch: arch(),
  osRelease: release(),
  node: process.version,
  playwright: require('@playwright/test/package.json').version,
  results: [],
}
let activeChild
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true
    activeChild?.kill('SIGTERM')
  })
}

function run(args, options = {}) {
  return new Promise((resolveRun, reject) => {
    activeChild = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', ...options })
    activeChild.once('error', reject)
    activeChild.once('exit', (code) => {
      activeChild = undefined
      resolveRun(code ?? 1)
    })
  })
}

const buildStatus = await run([resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: resolve(root, 'examples/laravel'),
})
if (buildStatus !== 0) throw new Error('Laravel frontend build failed')

for (const engine of engines) {
  if (interrupted) break
  let browserVersion
  try {
    const browser = await browserTypes[engine].launch()
    try {
      browserVersion = browser.version()
    } finally {
      await browser.close()
    }
  } catch (error) {
    summary.results.push({ engine, status: 'unavailable', error: String(error) })
    continue
  }
  for (const scope of ['demo', 'laravel']) {
    if (interrupted) break
    const args = [
      resolve(root, 'node_modules/@playwright/test/cli.js'),
      'test',
      '--config',
      scope === 'demo' ? 'playwright.compat.config.ts' : 'playwright.laravel.config.ts',
    ]
    if (scope === 'laravel') args.push('examples/laravel/e2e/activity.spec.ts')
    // Each Laravel invocation owns a new PHP server, database, storage, and login rate limiter.
    const exitCode = await run(args, {
      env: { ...process.env, SIGIL_COMPAT_BROWSER: engine },
    })
    const reportFile = `test-results/compat/${scope}/${engine}/report.json`
    let report
    try {
      report = JSON.parse(readFileSync(resolve(root, reportFile), 'utf8'))
    } catch {
      // A launch/configuration failure may happen before Playwright can write a report.
    }
    const stats = report?.stats
    const passed =
      exitCode === 0 &&
      stats?.expected > 0 &&
      stats.unexpected === 0 &&
      stats.skipped === 0 &&
      stats.flaky === 0
    summary.results.push({
      engine,
      browserVersion,
      scope,
      status: passed ? 'passed' : 'failed',
      exitCode,
      reportFile,
      stats,
    })
    writeFileSync(resolve(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  }
}
summary.finishedAt = new Date().toISOString()
summary.interrupted = interrupted
writeFileSync(resolve(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
log(JSON.stringify(summary, null, 2))
process.exitCode = interrupted
  ? 130
  : summary.results.every((result) => result.status === 'passed')
    ? 0
    : 1
