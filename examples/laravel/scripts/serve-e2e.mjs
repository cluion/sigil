import { spawn } from 'node:child_process'
import { error as logError } from 'node:console'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
if (!existsSync(resolve(root, 'vendor/autoload.php'))) throw new Error('Run composer install first')
if (!existsSync(resolve(root, 'public/build/manifest.json')))
  throw new Error('Build the Laravel frontend first')
if (existsSync(resolve(root, 'bootstrap/cache/config.php')))
  throw new Error('Clear the Laravel config cache before E2E')

let temporary
let activeChild
let stopSignal
let forceStop
function stop(signal) {
  if (stopSignal) return
  stopSignal = signal
  activeChild?.kill(signal)
  // Finish before Playwright's five-second grace period, even if PHP ignores the signal.
  forceStop = setTimeout(() => activeChild?.kill('SIGKILL'), 1000)
  forceStop.unref()
}
const onInterrupt = () => stop('SIGINT')
const onTerminate = () => stop('SIGTERM')
process.on('SIGINT', onInterrupt)
process.on('SIGTERM', onTerminate)

function runPhp(args, { cwd = root, env, input, inherit = false }) {
  if (stopSignal) return Promise.reject(new Error('E2E startup cancelled'))
  return new Promise((done, reject) => {
    const child = spawn('php', args, { cwd, env, stdio: inherit ? 'inherit' : 'pipe' })
    activeChild = child
    let failure
    let output = ''
    child.on('error', (error) => (failure = error))
    child.stdout?.on('data', (chunk) => (output += chunk))
    child.stderr?.on('data', (chunk) => (output += chunk))
    child.stdin?.on('error', (error) => (failure = error))
    child.stdin?.end(input)
    // close also waits for the child's streams; never remove files while it is still running.
    child.once('close', (code, signal) => {
      activeChild = undefined
      clearTimeout(forceStop)
      if (stopSignal) reject(new Error('E2E startup cancelled'))
      else if (failure) reject(failure)
      else if (code !== 0 || signal) reject(new Error(output || `PHP exited (${signal ?? code})`))
      else done()
    })
  })
}

try {
  // Every run owns a fresh database and storage tree; the developer .env is never changed.
  temporary = mkdtempSync(resolve(tmpdir(), 'sigil-laravel-e2e-'))
  const storage = resolve(temporary, 'storage')
  for (const path of [
    'app/private',
    'framework/cache/data',
    'framework/sessions',
    'framework/views',
    'logs',
  ]) {
    mkdirSync(resolve(storage, path), { recursive: true })
  }
  const database = resolve(temporary, 'e2e_testing')
  writeFileSync(database, '', { flag: 'wx', mode: 0o600 })
  const env = {
    ...process.env,
    APP_ENV: 'local',
    APP_DEBUG: 'false',
    APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
    APP_URL: 'http://127.0.0.1:4185',
    APP_CONFIG_CACHE: resolve(temporary, 'config.php'),
    APP_ROUTES_CACHE: resolve(temporary, 'routes.php'),
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: database,
    DB_URL: '',
    LARAVEL_STORAGE_PATH: storage,
    VIEW_COMPILED_PATH: resolve(storage, 'framework/views'),
    SESSION_DRIVER: 'file',
    SESSION_COOKIE: 'sigil_e2e_session',
    SESSION_SECURE_COOKIE: 'false',
    CACHE_STORE: 'file',
    FILESYSTEM_DISK: 'local',
    LOG_CHANNEL: 'single',
  }
  await runPhp(['artisan', 'migrate', '--no-interaction'], { env })
  for (const email of ['editor@sigil.test', 'other@sigil.test']) {
    await runPhp(['artisan', 'sigil:user', email, '--password-stdin', '--no-interaction'], {
      env,
      input: 'Sigil-e2e-only-password-2026\n',
    })
  }
  await runPhp(
    [
      '-d',
      'upload_max_filesize=4M',
      '-d',
      'post_max_size=8M',
      '-S',
      '127.0.0.1:4185',
      resolve(root, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'),
    ],
    { cwd: resolve(root, 'public'), env, inherit: true },
  )
} catch (error) {
  if (stopSignal) process.exitCode = stopSignal === 'SIGINT' ? 130 : 143
  else {
    logError(error)
    process.exitCode = 1
  }
} finally {
  clearTimeout(forceStop)
  if (temporary) rmSync(temporary, { recursive: true, force: true })
  process.off('SIGINT', onInterrupt)
  process.off('SIGTERM', onTerminate)
}
