import { defineConfig, devices } from '@playwright/test'

const engine = process.env.SIGIL_COMPAT_BROWSER
if (engine && !['chromium', 'firefox', 'webkit'].includes(engine)) {
  throw new Error(`Unsupported SIGIL_COMPAT_BROWSER: ${engine}`)
}
const reportName = engine ?? 'all'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['editor.spec.ts', 'persistence.spec.ts', 'security.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  outputDir: `test-results/compat/demo/${reportName}/artifacts`,
  reporter: [
    ['list'],
    ['json', { outputFile: `test-results/compat/demo/${reportName}/report.json` }],
    ['html', { open: 'never', outputFolder: `playwright-report/compat/demo/${reportName}` }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ].filter((project) => !engine || project.name === engine),
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js demo --host 127.0.0.1 --port 4173 --strictPort --mode csp-e2e',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
