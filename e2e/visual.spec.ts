import { expect, test, type Page } from '@playwright/test'
import type { SigilDoc } from '@cluion/sigil-core'
import { prepareDemo } from './demo-fixture'

// Load through the demo's public import flow; stable IDs also appear in the Inspector.
const visualDoc: SigilDoc = {
  version: 1,
  root: {
    id: 'visual-root',
    type: 'section',
    name: '視覺測試頁',
    children: [
      { id: 'visual-title', type: 'text', name: '標題文字', content: '建立你的下一個頁面' },
      { id: 'visual-button', type: 'button', name: '主按鈕', content: '開始編輯' },
      {
        id: 'visual-image',
        type: 'image',
        name: '主圖',
        attributes: { src: 'https://placehold.co/200x120', alt: '固定測試圖片' },
      },
    ],
  },
}

async function openVisualDemo(page: Page): Promise<string[]> {
  const errors = await prepareDemo(page)
  await page.addInitScript((doc) => {
    localStorage.setItem('sigil-demo', JSON.stringify(doc))
    localStorage.setItem('sigil-theme', 'light')
  }, visualDoc)
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain(
    "require-trusted-types-for 'script'",
  )
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  await expect(frame.getByText('建立你的下一個頁面', { exact: true })).toBeVisible()
  await expect(frame.getByRole('img', { name: '固定測試圖片' })).toBeVisible()
  await expect
    .poll(() =>
      frame.getByRole('img', { name: '固定測試圖片' }).evaluate((element) => {
        const img = element as HTMLImageElement
        return img.complete && img.naturalWidth > 0
      }),
    )
    .toBe(true)
  await page.evaluate(() => document.fonts.ready)
  await frame.locator('body').evaluate(() => document.fonts.ready)
  return errors
}

async function expectNoOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = document.querySelector('.sigil-app')!
        const topbar = document.querySelector('.sigil-topbar')!
        return [document.documentElement, app, topbar].map((el) =>
          Math.max(0, el.scrollWidth - el.clientWidth),
        )
      }),
    )
    .toEqual([0, 0, 0])
}

test('桌面中文亮色', async ({ page }) => {
  const errors = await openVisualDemo(page)
  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')
  await page.getByRole('treeitem', { name: '標題文字', exact: true }).click()
  await expect(page.locator('.sigil-tab')).toHaveText(['內容', '樣式', '進階'])
  await expect(page.getByRole('button', { name: '主題: 亮色', exact: true })).toBeVisible()
  await expectNoOverflow(page)
  await page.mouse.move(0, 0)
  await expect(app).toHaveScreenshot('desktop-zh-light.png')
  expect(errors).toEqual([])
})

test('桌面英文暗色', async ({ page }) => {
  const errors = await openVisualDemo(page)
  const app = page.locator('.sigil-app')
  await page.getByRole('treeitem', { name: '標題文字', exact: true }).click()
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
  await expect(app).toHaveClass(/sigil-theme-dark/)
  await expect(page.locator('.sigil-tab')).toHaveText(['Content', 'Style', 'Advanced'])
  await expect(page.getByRole('button', { name: 'Theme: Dark', exact: true })).toBeVisible()
  await expect(
    page.frameLocator('iframe[title="Canvas"]').getByText('建立你的下一個頁面'),
  ).toBeVisible()
  await expectNoOverflow(page)
  await page.mouse.move(0, 0)
  await expect(app).toHaveScreenshot('desktop-en-dark.png')
  expect(errors).toEqual([])
})

test('390px 中文亮色設定抽屜', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await openVisualDemo(page)
  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'compact')
  await page.getByRole('button', { name: '圖層／設定', exact: true }).click()
  const settings = page.locator('[data-compact-panel="settings"]')
  await expect(settings).toHaveAttribute('data-open', 'true')
  await expect(settings).toHaveAttribute('aria-hidden', 'false')
  await settings.getByRole('treeitem', { name: '標題文字', exact: true }).click()
  await expect(settings.locator('.sigil-tab')).toHaveText(['內容', '樣式', '進階'])
  await expectNoOverflow(page)
  await page.mouse.move(0, 0)
  await expect(app).toHaveScreenshot('compact-390-zh-light-settings.png')
  expect(errors).toEqual([])
})
