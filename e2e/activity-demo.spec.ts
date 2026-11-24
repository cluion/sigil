import { expect, test, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { prepareDemo } from './demo-fixture'

const canvas = (page: Page) => page.frameLocator('iframe[title="編輯畫布"]')

// An opaque raspberry-red 3 × 2 PNG with a known pixel value for the offline export.
const photoFile = {
  name: '我的版畫.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGO4oxEKQQxwFgBUGggXKr8ekwAAAABJRU5ErkJggg==',
    'base64',
  ),
}

async function coverCenter(page: Page): Promise<[number, number]> {
  const cover = canvas(page).getByRole('img')
  await cover.scrollIntoViewIfNeeded()
  const image = (await cover.boundingBox())!
  const frame = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
  const x =
    (Math.max(image.x, frame.x) + Math.min(image.x + image.width, frame.x + frame.width)) / 2
  const y =
    (Math.max(image.y, frame.y) + Math.min(image.y + image.height, frame.y + frame.height)) / 2
  return [x, y]
}

async function choosePhotoFile(page: Page, file: typeof photoFile): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('dialog').getByRole('button', { name: '加入裝置照片', exact: true }).click()
  await (await chooser).setFiles(file)
}

async function editTitle(page: Page, value: string): Promise<void> {
  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  for (const ancestor of ['活動頁', '主視覺', '活動簡介']) {
    const row = tree.getByRole('treeitem', { name: ancestor, exact: true })
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.press('ArrowRight')
  }
  await tree.getByRole('treeitem', { name: '活動標題', exact: true }).click()
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
    .fill(value)
  await expect(canvas(page).getByRole('heading', { name: value })).toBeVisible()
}

test('從工程示例開啟工作坊，直接在畫布以快捷鍵存檔並重開本機草稿', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '寫入 localStorage' }).click()
  await expect(page.getByText('已寫入 LS', { exact: true })).toBeVisible()
  const original = await page.evaluate(() => localStorage.getItem('sigil-demo'))
  expect(original).toBeTruthy()

  const origin = new URL(page.url()).origin
  const unexpectedRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.protocol.startsWith('http') &&
      (url.origin !== origin || url.pathname.startsWith('/sigil/'))
    ) {
      unexpectedRequests.push(request.url())
    }
  })
  const response = page.waitForResponse((res) => res.url() === origin + '/activity/')
  await page.getByRole('link', { name: '活動頁範例' }).click()
  expect((await response).headers()['content-security-policy']).toContain("script-src 'self'")
  await expect(canvas(page).getByRole('heading', { name: '秋日設計工作坊' })).toBeVisible()
  const photo = canvas(page).getByRole('img')
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  await expect(photo).toHaveJSProperty('naturalHeight', 800)
  await page.getByText('本機草稿', { exact: true }).click()
  await expect(page.locator('#storage-guide').filter({ hasText: '存在此瀏覽器' })).toBeVisible()
  await page.getByText('本機草稿', { exact: true }).click()

  const title = '週末版畫小聚'
  const heading = canvas(page).getByRole('heading', { level: 1 })
  const box = (await heading.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(heading).toBeFocused()
  await page.keyboard.insertText(title)
  await expect(heading).toHaveText(title)
  await expect(heading).toBeFocused()
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
  const saveShortcut = await page.evaluate(() =>
    /Mac/i.test(navigator.platform) ? 'Meta+s' : 'Control+s',
  )
  await page.keyboard.press(saveShortcut)
  await expect(page).toHaveTitle(`${title} — Sigil`)
  const content = page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
  await expect(content).toHaveValue(title)
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(heading).toHaveText('秋日設計工作坊')
  await expect(content).toHaveValue('秋日設計工作坊')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(heading).toHaveText(title)
  await expect(content).toHaveValue(title)
  await page.getByText('本機草稿', { exact: true }).click()
  await page.getByRole('button', { name: '重新載入' }).click()
  await expect(canvas(page).getByRole('heading', { name: title })).toBeVisible()
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo'))).toBe(original)
  expect(unexpectedRequests).toEqual([])

  await page.getByRole('link', { name: '工程示例' }).click()
  await page.getByRole('button', { name: '讀 localStorage' }).click()
  await expect(canvas(page).getByText('點我編輯', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const unavailable of ['拒絕存取', '草稿格式損壞'] as const) {
  test(`本機${unavailable}仍可編輯和匯出，並保留已有資料`, async ({ page, browser }, testInfo) => {
    const key = 'sigil-demo-activity-v1'
    const original = '{"version":1,"root":{"id":"missing-type"}}'
    await page.addInitScript(
      ({ unavailable, key, original }) => {
        localStorage.setItem(key, original)
        if (unavailable === '拒絕存取') {
          const read = Storage.prototype.getItem
          Storage.prototype.getItem = function (name) {
            if (name === key) throw new DOMException('Storage disabled', 'SecurityError')
            return read.call(this, name)
          }
        }
      },
      { unavailable, key, original },
    )
    await page.goto('/activity/')
    await expect(page.locator('#page-status')).toContainText('本次修改無法存檔')
    await editTitle(page, '試作中的海報課')
    await page.getByRole('button', { name: '存檔', exact: true }).click()
    await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
    await page.getByRole('button', { name: '匯出', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
    const downloaded = await downloading
    const file = testInfo.outputPath(downloaded.suggestedFilename())
    await downloaded.saveAs(file)
    const reader = await browser.newContext({ serviceWorkers: 'block' })
    try {
      const requests: string[] = []
      await reader.route(/^https?:/, (route) => {
        requests.push(route.request().url())
        return route.abort()
      })
      const exported = await reader.newPage()
      await exported.goto(pathToFileURL(file).href)
      await expect(exported).toHaveTitle('試作中的海報課')
      const photo = exported.getByRole('img')
      await expect(photo).toHaveAttribute('src', /^data:image\/webp;base64,/)
      await photo.evaluate((element: HTMLImageElement) => element.decode())
      await expect(photo).toHaveJSProperty('naturalWidth', 1200)
      await expect(photo).toHaveJSProperty('naturalHeight', 800)
      expect(requests).toEqual([])
    } finally {
      await reader.close()
    }
    expect(await page.evaluate((key) => localStorage[key], key)).toBe(original)
  })
}

test('畫布更換照片可復原重做，重開草稿與離線下載檔都保留選圖及替代文字', async ({
  page,
  browser,
}, testInfo) => {
  await page.goto('/activity/')
  const photo = canvas(page).getByRole('img')
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  const originalURL = (await photo.getAttribute('src'))!
  const originalAlt = (await photo.getAttribute('alt'))!
  await page.mouse.click(...(await coverCenter(page)))
  const replace = page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '更換圖片', exact: true })
  await replace.click()
  await choosePhotoFile(page, photoFile)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(photo).toHaveJSProperty('naturalWidth', 3)
  await expect(photo).toHaveAttribute('alt', originalAlt)
  const customURL = (await photo.getAttribute('src'))!
  expect(customURL).toMatch(/^data:image\/png;base64,/)
  const controls = page.locator('.sigil-topbar')
  await controls.getByRole('button', { name: '復原', exact: true }).click()
  await expect(photo).toHaveAttribute('src', originalURL)
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  await controls.getByRole('button', { name: '重做', exact: true }).click()
  await expect(photo).toHaveAttribute('src', customURL)
  const alt = '莓紅色油墨印刷色票'
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '替代文字', exact: true })
    .fill(alt)
  await controls.getByRole('button', { name: '存檔', exact: true }).click()
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await expect(photo).toHaveAttribute('src', customURL)
  await expect(photo).toHaveAttribute('alt', alt)
  await expect(photo).toHaveJSProperty('naturalHeight', 2)
  await page.mouse.dblclick(...(await coverCenter(page)))
  const media = page.getByRole('dialog')
  await expect(media.getByRole('button').filter({ hasText: photoFile.name })).toBeVisible()
  await media.getByRole('button', { name: '關閉', exact: true }).click()
  await controls.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '匯出 HTML' })
    .getByRole('button', { name: '下載 .html', exact: true })
    .click()
  const download = await downloading
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block' })
  try {
    // WebKit offline mode also blocks file: navigation. Block network requests while opening the file.
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const exportedPhoto = exported.getByRole('img', { name: alt, exact: true })
    await expect(exportedPhoto).toHaveAttribute('src', customURL)
    const decoded = await exportedPhoto.evaluate(async (element: HTMLImageElement) => {
      await element.decode()
      const pixels = document.createElement('canvas').getContext('2d')!
      pixels.drawImage(element, 0, 0)
      return {
        width: element.naturalWidth,
        height: element.naturalHeight,
        pixel: [...pixels.getImageData(0, 0, 1, 1).data],
      }
    })
    expect(decoded).toEqual({ width: 3, height: 2, pixel: [220, 40, 85, 255] })
  } finally {
    await reader.close()
  }
})

test.describe('本機活動頁觸控', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('直接開啟活動頁並從手機畫布編輯標題', async ({ page }) => {
    await page.goto('/activity/')
    await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
    await expect(canvas(page).locator('[data-sigil-id="activity-root"]')).toHaveCSS(
      'padding',
      '12px',
    )
    const heading = canvas(page).getByRole('heading', { name: '秋日設計工作坊' })
    await expect(heading).toBeInViewport()
    const box = (await heading.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await page.getByRole('button', { name: '編輯 活動標題', exact: true }).tap()
    const settings = page.locator('[data-compact-panel="settings"]')
    await expect(settings.getByRole('textbox', { name: '內容', exact: true })).toBeFocused()
    expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)
  })

  test('手機輕點照片更換，損毀檔案保留畫布照片與已存草稿', async ({ page }) => {
    await page.goto('/activity/')
    const photo = canvas(page).getByRole('img')
    await expect(photo).toHaveJSProperty('naturalWidth', 1200)
    await page.touchscreen.tap(...(await coverCenter(page)))
    const replace = page
      .getByRole('toolbar', { name: '元件操作' })
      .getByRole('button', { name: '更換圖片', exact: true })
    await expect(replace).toBeInViewport({ ratio: 1 })
    await replace.tap()
    await choosePhotoFile(page, photoFile)
    await expect(photo).toHaveJSProperty('naturalWidth', 3)
    const savedURL = (await photo.getAttribute('src'))!
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    const saved = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
    expect(saved).toBeTruthy()
    await replace.tap()
    const media = page.getByRole('dialog')
    await choosePhotoFile(page, {
      name: '損毀.png',
      mimeType: 'image/png',
      buffer: photoFile.buffer.subarray(0, 12),
    })
    await expect(media.getByRole('status').filter({ hasText: '無法讀取這張照片' })).toBeVisible()
    await expect(photo).toHaveAttribute('src', savedURL)
    await media.getByRole('button', { name: '關閉', exact: true }).tap()
    await expect(save).toBeDisabled()
    expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(saved)
    await page.reload()
    await expect(photo).toHaveAttribute('src', savedURL)
    await expect(photo).toHaveJSProperty('naturalWidth', 3)

    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    await page.getByRole('button', { name: '匯出', exact: true }).tap()
    const dialog = page.getByRole('dialog', { name: '匯出 HTML' })
    for (const control of [
      ...(await dialog.getByRole('button').all()),
      dialog.locator('summary'),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 })
      const bounds = (await control.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '下載 .html', exact: true }).tap()
    expect((await downloading).suggestedFilename()).toBe('sigil-page.html')
  })
})
