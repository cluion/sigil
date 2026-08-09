import { expect, test, type Page } from '@playwright/test'

const placeholderSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
    <rect width="200" height="120" fill="#e2e8f0" />
  </svg>
`

async function prepareDemo(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.route('https://placehold.co/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: placeholderSvg,
    }),
  )
  return errors
}

test('桌面主流程：右鍵排序、Undo／Redo 與雙擊文字編輯', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')

  const layerLabels = page.locator('.sigil-layer-label')
  await expect(layerLabels.nth(1)).toHaveText('標題文字')
  await expect(layerLabels.nth(2)).toHaveText('主按鈕')

  const layerCount = await layerLabels.count()
  const textBlock = page.getByRole('button', { name: '插入 文字', exact: true })
  await textBlock.focus()
  await textBlock.press('Enter')
  await expect(layerLabels).toHaveCount(layerCount + 1)
  await expect(page.locator('.sigil-layer-row--active .sigil-layer-label')).toHaveText('text')

  await page.getByText('主按鈕', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '上移', exact: true }).click()
  await expect(layerLabels.nth(1)).toHaveText('主按鈕')
  await expect(layerLabels.nth(2)).toHaveText('標題文字')

  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(layerLabels.nth(1)).toHaveText('標題文字')
  await expect(layerLabels.nth(2)).toHaveText('主按鈕')

  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(layerLabels.nth(1)).toHaveText('主按鈕')
  await expect(layerLabels.nth(2)).toHaveText('標題文字')

  const canvasTitle = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByText('點我編輯', { exact: true })
  const titleBox = await canvasTitle.boundingBox()
  expect(titleBox).not.toBeNull()
  if (!titleBox) throw new Error('找不到畫布標題位置')

  await page.mouse.dblclick(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2)
  const inlineEditor = page
    .frameLocator('iframe[title="編輯畫布"]')
    .locator('[contenteditable="true"]')
  await expect(inlineEditor).toHaveText('點我編輯')
  await inlineEditor.fill('E2E 標題')
  await inlineEditor.press('Enter')
  await expect(
    page.frameLocator('iframe[title="編輯畫布"]').getByText('E2E 標題', { exact: true }),
  ).toBeVisible()
  await expect(inlineEditor).toHaveCount(0)

  const exportButton = page.getByRole('button', { name: '匯出', exact: true })
  await exportButton.click()
  const exportDialog = page.getByRole('dialog', { name: '匯出 HTML', exact: true })
  await expect(exportDialog).toHaveAttribute('aria-modal', 'true')
  const closeButtons = exportDialog.getByRole('button', { name: '關閉', exact: true })
  await closeButtons.first().focus()
  await page.keyboard.press('Shift+Tab')
  await expect(closeButtons.last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(exportDialog).toHaveCount(0)
  await expect(exportButton).toBeFocused()

  await expect
    .poll(() =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        app:
          document.querySelector('.sigil-app')!.scrollWidth -
          document.querySelector('.sigil-app')!.clientWidth,
      })),
    )
    .toEqual({ page: 0, app: 0 })
  expect(errors).toEqual([])
})

test('390px compact：抽屜、焦點、主題與 overflow', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const app = page.locator('.sigil-app')
  const blocksToggle = page.getByRole('button', { name: '區塊', exact: true })
  const settingsToggle = page.getByRole('button', { name: '圖層／設定', exact: true })
  const blocks = page.locator('[data-compact-panel="blocks"]')
  const settings = page.locator('[data-compact-panel="settings"]')
  const backdrop = page.locator('.sigil-panel-backdrop')

  await expect(app).toHaveAttribute('data-layout', 'compact')
  await expect(blocksToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false')

  await blocksToggle.click()
  await expect(blocks).toHaveAttribute('data-open', 'true')
  await expect(blocks).toHaveAttribute('aria-hidden', 'false')
  await expect(settings).toHaveAttribute('data-open', 'false')
  await blocks.getByRole('searchbox', { name: '搜尋區塊', exact: true }).fill('文字')
  await expect(blocks.getByRole('button', { name: '插入 文字', exact: true })).toBeVisible()

  const backdropBox = await backdrop.boundingBox()
  expect(backdropBox).not.toBeNull()
  if (!backdropBox) throw new Error('找不到面板背景')
  await backdrop.click({
    position: { x: backdropBox.width - 8, y: backdropBox.height / 2 },
  })
  await expect(blocks).toHaveAttribute('data-open', 'false')
  await expect(blocksToggle).toBeFocused()

  await settingsToggle.click()
  await expect(settings).toHaveAttribute('data-open', 'true')
  await settings.locator('.sigil-layer-label').first().click()
  await expect(settings.locator('.sigil-tab')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(settings).toHaveAttribute('data-open', 'false')
  await expect(settingsToggle).toBeFocused()

  const theme = page.locator('.sigil-topbar button[title="主題"]')
  await theme.click()
  await theme.click()
  await expect(app).toHaveClass(/sigil-theme-dark/)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector('.sigil-app')!
        const topbar = document.querySelector('.sigil-topbar')!
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          app: root.scrollWidth - root.clientWidth,
          topbar: topbar.scrollWidth - topbar.clientWidth,
        }
      }),
    )
    .toEqual({ page: 0, app: 0, topbar: 0 })
  expect(errors).toEqual([])
})
