import { defineConfig, devices } from '@playwright/test'

const compatEngine = process.env.SIGIL_COMPAT_BROWSER
const engine = compatEngine ?? 'chromium'
const presets: Record<string, string> = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
}
if (!Object.hasOwn(presets, engine)) throw new Error(`Unsupported SIGIL_COMPAT_BROWSER: ${engine}`)
const device = presets[engine]!
const reportName = compatEngine ? `compat/laravel/${engine}` : 'laravel'

export default defineConfig({
  testDir: './examples/laravel/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  outputDir: compatEngine ? `test-results/${reportName}/artifacts` : 'test-results/laravel',
  reporter: [
    ['list'],
    ['json', { outputFile: `test-results/${reportName}/report.json` }],
    ['html', { open: 'never', outputFolder: `playwright-report/${reportName}` }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4185',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: engine, use: { ...devices[device] } }],
  webServer: {
    command: 'node examples/laravel/scripts/serve-e2e.mjs',
    url: 'http://127.0.0.1:4185/login',
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
