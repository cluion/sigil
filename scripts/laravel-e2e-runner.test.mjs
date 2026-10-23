// @vitest-environment node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath, URL } from 'node:url'
import { expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../examples/laravel/scripts/serve-e2e.mjs', import.meta.url)),
  'utf8',
)

async function fixture({ stage, fail = false, missingPhp = false, ignoreSignal = false }) {
  const root = mkdtempSync(join(tmpdir(), 'sigil-runner-test-'))
  const temporary = join(root, 'temporary')
  const bin = join(root, 'bin')
  const events = join(root, 'events.jsonl')
  for (const directory of ['scripts', 'vendor', 'public/build', 'database', 'temporary', 'bin']) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  writeFileSync(join(root, 'scripts/serve-e2e.mjs'), source)
  writeFileSync(join(root, 'vendor/autoload.php'), '')
  writeFileSync(join(root, 'public/build/manifest.json'), '{}')
  writeFileSync(join(root, '.env'), 'DEVELOPMENT_ENV_UNCHANGED')
  writeFileSync(join(root, 'database/development.sqlite'), 'DEVELOPMENT_DB_UNCHANGED')
  const php = join(bin, 'php')
  writeFileSync(
    php,
    `#!${process.execPath}
const { appendFileSync, existsSync } = require('node:fs')
const { dirname } = require('node:path')
const stage = process.argv.includes('-S') ? 'server' : process.argv[3] === 'migrate' ? 'migrate' : 'seed'
const temporary = dirname(process.env.DB_DATABASE)
const record = (event) => appendFileSync(process.env.PROBE_EVENTS, JSON.stringify({ stage, pid: process.pid, temporary, ...event }) + '\\n')
if (stage === process.env.PROBE_STAGE) {
  if (process.env.PROBE_FAIL === '1') {
    record({ event: 'start' })
    process.stderr.write('Expected PHP failure\\n')
    process.exit(23)
  }
  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (stopping) return
    stopping = true
    record({ event: 'signal', signal })
    if (process.env.PROBE_IGNORE_SIGNAL === '1') return
    setTimeout(() => {
      record({ event: 'exit', temporaryStillExists: existsSync(temporary) })
      process.exit(0)
    }, 80)
  })
  record({ event: 'start' })
  setInterval(() => {}, 1000)
} else {
  record({ event: 'start' })
  process.stdin.resume()
  process.stdin.on('end', () => process.exit(0))
}
`,
  )
  chmodSync(php, 0o700)
  const runner = spawn(process.execPath, [join(root, 'scripts/serve-e2e.mjs')], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      PATH: missingPhp ? temporary : bin,
      TMPDIR: temporary,
      PROBE_EVENTS: events,
      PROBE_STAGE: stage,
      PROBE_FAIL: fail ? '1' : '0',
      PROBE_IGNORE_SIGNAL: ignoreSignal ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = Promise.race([
    once(runner, 'exit').then(([code, signal]) => ({ code, signal })),
    setTimeout(4000, undefined, { ref: false }).then(() => {
      throw new Error('Runner did not terminate within four seconds')
    }),
  ])
  const drained = once(runner, 'close')
  let output = ''
  runner.stdout.on('data', (chunk) => (output += chunk))
  runner.stderr.on('data', (chunk) => (output += chunk))
  const readEvents = () =>
    existsSync(events)
      ? readFileSync(events, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : []
  return {
    runner,
    closed,
    readEvents,
    output: () => output,
    async waitForStart() {
      for (let attempt = 0; attempt < 100; attempt++) {
        const event = readEvents().find((event) => event.stage === stage && event.event === 'start')
        if (event) return event
        await setTimeout(20)
      }
      throw new Error(`PHP did not reach ${stage}: ${output}`)
    },
    expectClean() {
      expect(readdirSync(temporary)).toEqual([])
      expect(readFileSync(join(root, '.env'), 'utf8')).toBe('DEVELOPMENT_ENV_UNCHANGED')
      expect(readFileSync(join(root, 'database/development.sqlite'), 'utf8')).toBe(
        'DEVELOPMENT_DB_UNCHANGED',
      )
    },
    async dispose() {
      try {
        process.kill(-runner.pid, 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
      await drained
      rmSync(root, { recursive: true, force: true })
    },
  }
}

it.each([
  { stage: 'migrate', signal: 'SIGTERM', group: false },
  { stage: 'migrate', signal: 'SIGTERM', group: true },
  { stage: 'seed', signal: 'SIGINT', group: false },
  { stage: 'server', signal: 'SIGTERM', group: false },
  { stage: 'server', signal: 'SIGTERM', group: true },
])(
  'cancels $stage with $signal (group=$group) before removing its temporary files',
  async (options) => {
    const probe = await fixture(options)
    try {
      const started = await probe.waitForStart()
      if (options.group) process.kill(-probe.runner.pid, options.signal)
      else probe.runner.kill(options.signal)
      expect(await probe.closed).toEqual({
        code: options.signal === 'SIGINT' ? 130 : 143,
        signal: null,
      })
      expect(probe.readEvents()).toContainEqual({
        ...started,
        event: 'exit',
        temporaryStillExists: true,
      })
      expect(() => process.kill(started.pid, 0)).toThrow()
      probe.expectClean()
    } finally {
      await probe.dispose()
    }
  },
)

it('terminates a PHP child that ignores cancellation before cleaning its files', async () => {
  const probe = await fixture({ stage: 'server', ignoreSignal: true })
  try {
    const started = await probe.waitForStart()
    probe.runner.kill('SIGTERM')
    expect(await probe.closed).toEqual({ code: 143, signal: null })
    expect(probe.readEvents()).toContainEqual({ ...started, event: 'signal', signal: 'SIGTERM' })
    expect(() => process.kill(started.pid, 0)).toThrow()
    probe.expectClean()
  } finally {
    await probe.dispose()
  }
})

it.each(['migrate', 'server'])('cleans only this run after a %s failure', async (stage) => {
  const probe = await fixture({ stage, fail: true })
  try {
    expect(await probe.closed).toEqual({ code: 1, signal: null })
    expect(probe.output()).toContain('Expected PHP failure')
    probe.expectClean()
  } finally {
    await probe.dispose()
  }
})

it('cleans this run when PHP cannot be spawned', async () => {
  const probe = await fixture({ stage: 'migrate', missingPhp: true })
  try {
    expect(await probe.closed).toEqual({ code: 1, signal: null })
    expect(probe.output()).toContain('ENOENT')
    probe.expectClean()
  } finally {
    await probe.dispose()
  }
})
