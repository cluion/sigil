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

interface DemoNode {
  id: string
  content?: string
  children?: DemoNode[]
}

interface DemoApp {
  engine: {
    update(id: string, patch: { content: string }): void
  }
  toJSON(): { root: DemoNode }
}

test('桌面主流程：右鍵排序、Undo／Redo 與雙擊文字編輯', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')

  const layerLabels = page.locator('.sigil-layer-label')
  await expect(layerLabels.nth(1)).toHaveText('標題文字')
  await expect(layerLabels.nth(2)).toHaveText('主按鈕')

  const layerTree = page.getByRole('tree', { name: '圖層', exact: true })
  const layerRows = layerTree.getByRole('treeitem')
  await layerRows.first().focus()
  await layerRows.first().press('ArrowRight')
  await expect(layerRows.nth(1)).toBeFocused()
  await layerRows.nth(1).press('Space')
  await expect(layerRows.nth(1)).toHaveAttribute('aria-selected', 'true')
  await layerRows.nth(1).press('Shift+F10')
  await expect(page.getByRole('menu', { name: '節點操作', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(layerRows.nth(1)).toBeFocused()

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

test('範本流程：另存、重命名、再插入與刪除', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Hero 組合 範本操作', exact: true })).toBeVisible()
  await page.getByRole('treeitem', { name: '主按鈕', exact: true }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept('E2E 範本')
  })
  await page.getByRole('button', { name: '存為範本', exact: true }).click()
  await expect(page.getByRole('button', { name: 'E2E 範本 範本操作', exact: true })).toBeVisible()

  const search = page.getByRole('searchbox', { name: '搜尋區塊', exact: true })
  await search.fill('E2E')
  await page.getByRole('button', { name: 'E2E 範本 範本操作', exact: true }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept('E2E 已改名')
  })
  await page.getByRole('menuitem', { name: '重新命名', exact: true }).click()
  await expect(page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true })).toBeVisible()
  await expect(search).toHaveValue('E2E')

  const layerRows = page.getByRole('tree', { name: '圖層', exact: true }).getByRole('treeitem')
  const layerCount = await layerRows.count()
  await page.getByRole('button', { name: '插入 E2E 已改名', exact: true }).press('Enter')
  await expect(layerRows).toHaveCount(layerCount + 1)

  await page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  await page.getByRole('menuitem', { name: '刪除', exact: true }).click()
  await expect(page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true })).toHaveCount(
    0,
  )
  await expect(layerRows).toHaveCount(layerCount + 1)
  expect(errors).toEqual([])
})

test('富文字：編輯、undo／redo、範本、save／load 與安全匯出', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const rich = frame.locator('[data-sigil-id="rich-demo"]')
  await expect(rich.locator('strong')).toHaveText('粗體')
  await expect(rich.locator('em')).toHaveText('斜體')
  await expect(rich.locator('a')).toHaveAttribute('href', 'https://example.com/')

  const richBox = await rich.boundingBox()
  expect(richBox).not.toBeNull()
  if (!richBox) throw new Error('找不到富文字位置')
  await page.mouse.dblclick(richBox.x + richBox.width / 2, richBox.y + richBox.height / 2)

  await expect(rich).toHaveAttribute('contenteditable', 'true')
  await expect(rich).toHaveAttribute('aria-label', '富文字內容')
  await rich.fill('富文字 E2E')
  await rich.locator('p').selectText()
  await frame.getByRole('button', { name: '粗體', exact: true }).click()
  await frame.getByRole('button', { name: '斜體', exact: true }).click()
  await frame.getByRole('button', { name: '安全連結', exact: true }).click()
  await frame.getByRole('button', { name: '完成', exact: true }).click()

  await expect(rich).not.toHaveAttribute('contenteditable', 'true')
  await expect(rich.locator('strong em a[href="https://example.com/"]')).toHaveText('富文字 E2E')
  await expect(rich).toBeFocused()

  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  await undo.click()
  await expect(rich).toContainText('這是 粗體、斜體與安全連結')
  await redo.click()
  await expect(rich.locator('strong em a')).toHaveText('富文字 E2E')

  page.once('dialog', async (dialog) => dialog.accept('富文字範本'))
  await page.getByRole('button', { name: '存為範本', exact: true }).click()
  await expect(page.getByRole('button', { name: '富文字範本 範本操作', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '插入 富文字範本', exact: true }).press('Enter')
  await expect(frame.getByText('富文字 E2E', { exact: true })).toHaveCount(2)

  await page.getByRole('button', { name: '寫入 localStorage', exact: true }).click()
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  await expect(frame.locator('[data-sigil-id="rich-demo"] strong em a')).toHaveText('富文字 E2E')
  await expect(frame.getByText('富文字 E2E', { exact: true })).toHaveCount(2)

  await page.evaluate(() => {
    const app = (window as unknown as { __sigil: DemoApp }).__sigil
    const richNode = app.toJSON().root.children?.find((node) => node.id === 'rich-demo')
    app.engine.update('rich-demo', {
      content: `${richNode?.content ?? ''}<script>window.__sigilRichTextXss = true</script>`,
    })
  })
  await expect(frame.locator('[data-sigil-id="rich-demo"] script')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, '__sigilRichTextXss'))).toBeUndefined()

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const exported = page.getByRole('dialog', { name: '匯出 HTML', exact: true }).locator('textarea')
  await expect(exported).toHaveValue(
    /<p><strong><em><a href="https:\/\/example\.com\/">富文字 E2E<\/a><\/em><\/strong><\/p>/,
  )
  await expect(exported).not.toHaveValue(/<script/)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'compact')
  await page.getByRole('button', { name: '圖層／設定', exact: true }).click()
  const settings = page.locator('[data-compact-panel="settings"]')
  await settings.getByRole('treeitem', { name: '富文字', exact: true }).first().click()
  await expect(settings.locator('.sigil-rich-text-hint')).toHaveText('請在畫布編輯富文字')
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

test('英文 locale：Blocks、Layers、Media 與 compact 介面', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '中/EN', exact: true }).click()

  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')
  const layerTree = page.getByRole('tree', { name: 'Layers', exact: true })
  await expect(layerTree).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search blocks', exact: true })).toHaveAttribute(
    'placeholder',
    'Search blocks…',
  )
  await expect(page.getByRole('button', { name: 'Insert 文字', exact: true })).toBeVisible()
  await expect(layerTree.getByRole('button', { name: 'Hide', exact: true }).first()).toBeVisible()
  await expect(layerTree.getByRole('button', { name: 'Lock', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(page.locator('.sigil-help-panel li')).toHaveText([
    'Delete / Backspace — Delete',
    'Ctrl/Cmd+Z — Undo',
    'Ctrl/Cmd+Shift+Z / Y — Redo',
    'Ctrl/Cmd+C / V — Copy / Paste',
    'Ctrl/Cmd+S — Save',
  ])
  await page.getByRole('button', { name: 'Keys', exact: true }).click()

  await layerTree.getByRole('treeitem', { name: '主圖', exact: true }).click()
  await expect(page.locator('.sigil-tab')).toHaveText(['Content', 'Style', 'Advanced'])
  await expect(page.locator('.sigil-inspector .sigil-field-label')).toHaveText('Image')
  await page.getByRole('button', { name: 'Choose image', exact: true }).click()
  const media = page.getByRole('dialog', { name: 'Media library', exact: true })
  await expect(media).toBeVisible()
  await expect(media.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await media.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(media).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(app).toHaveAttribute('data-layout', 'compact')
  const blocksToggle = page.getByRole('button', { name: 'Blocks', exact: true })
  await blocksToggle.click()
  const blocks = page.locator('[data-compact-panel="blocks"]')
  await expect(blocks).toHaveAttribute('data-open', 'true')
  await expect(blocks.getByRole('searchbox', { name: 'Search blocks', exact: true })).toBeVisible()

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
