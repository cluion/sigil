import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// A single Linux/amd64 baseline avoids comparing different system fonts and rasterizers.
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('Visual baselines require Linux/amd64. Run pnpm test:visual:docker.')
}

export default defineConfig({
  ...base,
  testMatch: '**/visual.spec.ts',
  testIgnore: [],
  retries: 0,
  workers: 1,
  updateSnapshots: 'none',
  outputDir: 'test-results/visual',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/visual' }]],
  snapshotPathTemplate: '{testDir}/visual.spec.ts-snapshots/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 0,
    },
  },
  projects: [
    {
      name: 'visual-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
})
