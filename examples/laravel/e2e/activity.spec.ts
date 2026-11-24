import { expect, test, type Download, type Page, type Response } from '@playwright/test'
import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'
import { pathToFileURL } from 'node:url'

const password = 'Sigil-e2e-only-password-2026'
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
)

function recordRuntimeErrors(
  page: Page,
  key?: string,
  expectedStatuses = [404],
  expectedUploadRejections = 0,
): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const status = message.text().match(/^Failed to load resource: .*status of (\d+)\b/)
    const pageKey = key ?? new URL(page.url()).pathname.match(/^\/editor\/([^/]+)$/)?.[1]
    if (
      expectedUploadRejections &&
      status?.[1] === '422' &&
      message.location().url === new URL('/sigil/assets', page.url()).href
    ) {
      expectedUploadRejections--
      return
    }
    if (
      pageKey &&
      message.location().url.endsWith(`/sigil/pages/${pageKey}`) &&
      status &&
      expectedStatuses.includes(Number(status[1]))
    ) {
      return
    }
    errors.push(`console: ${message.text()}`)
  })
  return errors
}

function waitForPageResponse(page: Page, key: string, method: 'GET' | 'PUT') {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/sigil/pages/${key}` &&
      response.request().method() === method,
  )
}

async function assertCSP(response: Response): Promise<void> {
  const policy = await response.headerValue('content-security-policy')
  expect(policy).toContain("script-src 'self'")
  expect(policy).toContain("require-trusted-types-for 'script'")
  expect(policy).toContain('trusted-types sigil#template sigil#sanitized')
}

async function createActivity(page: Page, key: string): Promise<void> {
  const missing = waitForPageResponse(page, key, 'GET')
  await page.goto(`/editor/${key}`)
  await expect(page.getByRole('heading', { name: 'Sigil 活動頁後台' })).toBeVisible()
  await page.getByLabel('電子郵件').fill('editor@sigil.test')
  await page.getByLabel('密碼').fill(password)
  const editorResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/editor/${key}` &&
      response.request().resourceType() === 'document',
  )
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`**/editor/${key}`)
  await assertCSP(await editorResponse)
  expect((await missing).status()).toBe(404)
  await expect(page.locator('#page-status')).toHaveText('此頁尚未建立。')

  const created = waitForPageResponse(page, key, 'PUT')
  await page.getByRole('button', { name: '建立活動頁', exact: true }).click()
  const response = await created
  expect(response.status()).toBe(201)
  expect(await response.json()).toMatchObject({ revision: 1 })
  await expect(page.locator('.sigil-app')).toBeVisible()
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
}

function canvasNode(page: Page, id: string) {
  return page.frameLocator('iframe[title="編輯畫布"]').locator(`[data-sigil-id="${id}"]`)
}

async function selectLayer(page: Page, name: string, ancestors: string[] = []): Promise<void> {
  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  for (const ancestor of ancestors) {
    const row = tree.getByRole('treeitem', { name: ancestor, exact: true })
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.press('ArrowRight')
  }
  await tree.getByRole('treeitem', { name, exact: true }).click()
}

async function editTitle(page: Page, content: string): Promise<void> {
  await selectLayer(page, '活動標題', ['活動頁', '主視覺', '活動簡介'])
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
    .fill(content)
  await expect(canvasNode(page, 'activity-title')).toHaveText(content)
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
}

async function savePage(page: Page, key: string, expectedStatus = 200): Promise<Response> {
  const saved = waitForPageResponse(page, key, 'PUT')
  await page.getByRole('button', { name: '存檔', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(expectedStatus)
  return response
}

async function storedPage(page: Page, key: string): Promise<{ revision: number; doc: SigilDoc }> {
  const response = await page.request.get(`/sigil/pages/${key}`, {
    headers: { Accept: 'application/json' },
  })
  expect(response.status()).toBe(200)
  return response.json()
}

function documentNode(doc: SigilDoc, id: string): ComponentNode {
  const pending = [doc.root]
  while (pending.length) {
    const node = pending.pop()!
    if (node.id === id) return node
    pending.push(...(node.children ?? []))
  }
  throw new Error(`Missing document node: ${id}`)
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Download did not provide a readable stream')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('登入建立活動頁，編輯、復原重做、上傳與重載，並預覽及匯出', async ({
  page,
  browser,
}, testInfo) => {
  const errors = recordRuntimeErrors(page, undefined, [404], 1)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sigil 活動頁後台' })).toBeVisible()
  await page.getByLabel('電子郵件').fill('editor@sigil.test')
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的活動頁' })).toBeVisible()

  const [editor, lookup] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).pathname.startsWith('/editor/'),
    ),
    page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.startsWith('/sigil/pages/'),
    ),
    page.getByRole('link', { name: '新增活動頁', exact: true }).click(),
  ])
  const key = new URL(editor.url()).pathname.split('/').pop()!
  await assertCSP(editor)
  expect(new URL(lookup.url()).pathname).toBe(`/sigil/pages/${key}`)
  expect(lookup.status()).toBe(404)
  await expect(page.locator('#page-status')).toHaveText('此頁尚未建立。')
  const title = '春季攝影工作坊'
  await page.getByRole('textbox', { name: '活動名稱' }).fill(title)
  const created = waitForPageResponse(page, key, 'PUT')
  await page.getByRole('button', { name: '建立活動頁', exact: true }).click()
  const creation = await created
  expect(creation.status()).toBe(201)
  expect(await creation.json()).toMatchObject({ revision: 1 })
  await expect(page.locator('.sigil-app')).toBeVisible()
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await expect(canvasNode(page, 'activity-title')).toHaveText(title)
  await expect(page).toHaveTitle(`${title} — Sigil`)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalWidth', 1200)
  await expect(canvasNode(page, 'activity-image')).toBeInViewport()

  await selectLayer(page, '活動圖片', ['活動頁', '主視覺'])
  await page.getByRole('button', { name: '選圖', exact: true }).click()
  const media = page.getByRole('dialog', { name: '媒體庫', exact: true })
  await expect(media).toBeVisible()
  await media.getByRole('button', { name: '關閉', exact: true }).click()
  const replace = page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '更換圖片', exact: true })
  await replace.click()
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith('/sigil/assets') && response.request().method() === 'POST',
  )
  await media.locator('input[type=file]').setInputFiles({
    name: '不完整的圖片.png',
    mimeType: 'image/png',
    buffer: Buffer.from('incomplete photo'),
  })
  expect((await rejected).status()).toBe(422)
  await expect(media.getByText('請選擇符合尺寸與容量限制的 PNG、JPEG 或 WebP 圖片。')).toBeVisible()
  await expect(media.getByRole('button', { name: '重試上傳' })).toHaveCount(0)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalWidth', 1200)
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/sigil/assets' &&
      response.request().method() === 'POST',
  )
  const chooser = page.waitForEvent('filechooser')
  await media.getByRole('button', { name: '上傳圖片', exact: true }).click()
  await (
    await chooser
  ).setFiles({ name: 'activity.png', mimeType: 'image/png', buffer: imageBytes })
  const upload = await uploaded
  expect(upload.status()).toBe(201)
  expect(upload.request().headers()['content-type']).toContain('multipart/form-data; boundary=')
  expect(upload.request().headers()['x-csrf-token']).toBeTruthy()
  const asset = (await upload.json()) as { id: string; url: string; name: string }
  expect(asset.name).toBe('activity.png')
  expect(new URL(asset.url).pathname).toBe(`/sigil/media/${asset.id}`)
  await expect(media).toBeHidden()
  await expect(canvasNode(page, 'activity-image')).toHaveAttribute('src', asset.url)
  const alt = '工作坊參加者製作海報'
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '替代文字', exact: true })
    .fill(alt)
  await expect(canvasNode(page, 'activity-image')).toHaveAttribute('alt', alt)

  const time = '時間｜週六 14:00–17:00'
  const place = '地點｜河岸藝文中心'
  const details = canvasNode(page, 'activity-info')
  const content = page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
  await selectLayer(page, '活動時間', ['活動頁', '活動資訊'])
  await content.fill(time)
  await page.getByRole('treeitem', { name: '活動地點', exact: true }).click()
  await content.fill(place)
  await expect(details.getByText(place, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(details.getByText('地點｜城市創作空間', { exact: true })).toBeVisible()
  await expect(details.getByText(time, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(details.getByText(place, { exact: true })).toBeVisible()

  const topbar = page.locator('.sigil-topbar')
  await page.getByRole('treeitem', { name: '活動頁', exact: true }).click()
  await page.locator('.sigil-inspector').getByRole('tab', { name: '樣式', exact: true }).click()
  await topbar.getByRole('button', { name: '手機', exact: true }).click()
  const padding = page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內距', exact: true })
  await expect(padding).toHaveValue('0.75rem')
  await page
    .getByRole('group', { name: '內距', exact: true })
    .getByRole('button', { name: '標準', exact: true })
    .click()
  await expect(padding).toHaveValue('1rem')
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '16px')
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')

  const saved = await savePage(page, key)
  expect(await saved.json()).toMatchObject({ revision: 2 })
  await expect(page.locator('#page-status')).toHaveText('頁面已儲存。')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  const beforeReload = await storedPage(page, key)
  expect(documentNode(beforeReload.doc, 'activity-title').content).toBe(title)
  expect(documentNode(beforeReload.doc, 'activity-image').attributes?.src).toBe(asset.url)
  expect(documentNode(beforeReload.doc, 'activity-image').attributes?.alt).toBe(alt)
  const savedDetails = documentNode(beforeReload.doc, 'activity-info').children!
  expect(savedDetails.find((node) => node.name === '活動時間')?.content).toBe(time)
  expect(savedDetails.find((node) => node.name === '活動地點')?.content).toBe(place)
  expect(beforeReload.doc.root.responsiveStyles?.mobile?.padding).toBe('1rem')
  expect(beforeReload.doc.root.style?.padding).toBe('2rem')

  const reloaded = await page.reload()
  await assertCSP(reloaded!)
  await expect(page.locator('#page-status')).toHaveText('已載入儲存的頁面。')
  await expect(canvasNode(page, 'activity-title')).toHaveText(title)
  await expect(details.getByText(time, { exact: true })).toBeVisible()
  await expect(details.getByText(place, { exact: true })).toBeVisible()
  await expect(canvasNode(page, 'activity-image')).toHaveAttribute('alt', alt)
  await expect(canvasNode(page, 'activity-image')).toHaveAttribute('src', asset.url)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalWidth', 1)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalHeight', 1)
  await expect(topbar.getByRole('button', { name: '桌面', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '32px')
  expect(await storedPage(page, key)).toEqual(beforeReload)
  const bytes = await page.request.get(asset.url)
  expect(bytes.status()).toBe(200)
  expect(bytes.headers()['content-type']).toBe('image/png')
  expect(await bytes.body()).toEqual(imageBytes)

  await topbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(topbar.getByRole('button', { name: '手機', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('iframe[title="編輯畫布"]')).toHaveCSS('width', '375px')
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '16px')
  await page.getByRole('treeitem', { name: '活動頁', exact: true }).click()
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('outline-style', 'solid')
  await topbar.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(page.locator('.sigil-canvas-overlay')).toBeHidden()
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('outline-style', 'none')
  await expect(page.locator('iframe[title="編輯畫布"]')).toHaveCSS('pointer-events', 'auto')
  await canvasNode(page, 'activity-hero').getByRole('link', { name: '查看活動資訊' }).click()
  await expect(canvasNode(page, 'activity-info')).toBeInViewport()
  await topbar.getByRole('button', { name: '編輯', exact: true }).click()
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('outline-style', 'solid')
  await topbar.getByRole('button', { name: '桌面', exact: true }).click()
  await topbar.getByRole('button', { name: '匯出', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '匯出 HTML', exact: true })
  const html = await dialog.locator('textarea').inputValue()
  expect(html).toContain(title)
  expect(html).toContain(asset.url)
  expect(html).toContain('@media')
  const exported = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下載 .html', exact: true }).click()
  const download = await exported
  expect(download.suggestedFilename()).toBe('sigil-page.html')
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const reader = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    serviceWorkers: 'block',
  })
  const offlineRequests: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      offlineRequests.push(route.request().url())
      return route.abort()
    })
    const exportedPage = await reader.newPage()
    await exportedPage.goto(pathToFileURL(file).href)
    await expect(exportedPage).toHaveTitle(title)
    expect(await exportedPage.evaluate(() => document.compatMode)).toBe('CSS1Compat')
    await expect(exportedPage.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /width=device-width/,
    )
    await expect(exportedPage.getByRole('heading', { name: title })).toBeVisible()
    const exportedDetails = exportedPage.locator('#event-info')
    await expect(exportedDetails.getByText(time, { exact: true })).toBeVisible()
    await expect(exportedDetails.getByText(place, { exact: true })).toBeVisible()
    const photo = exportedPage.getByRole('img', { name: '工作坊參加者製作海報' })
    await expect(photo).toHaveAttribute(
      'src',
      'data:image/png;base64,' + imageBytes.toString('base64'),
    )
    await photo.evaluate((image: HTMLImageElement) => image.decode())
    await expect(photo).toHaveJSProperty('naturalWidth', 1)
    const root = exportedPage.locator('body > section')
    await expect(root).toHaveCSS('padding', '32px')
    await exportedPage.setViewportSize({ width: 375, height: 812 })
    await expect(root).toHaveCSS('padding', '16px')
    await exportedPage.getByRole('link', { name: '查看活動資訊' }).click()
    await expect(exportedPage.locator('#event-info')).toBeInViewport()
    expect(offlineRequests).toEqual([])
  } finally {
    await reader.close()
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  // An edit after the trial also overrides the original template metadata on download.
  const renamed = '夏季攝影工作坊'
  await editTitle(page, renamed)
  await topbar.getByRole('button', { name: '匯出', exact: true }).click()
  await page.route(asset.url, (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'Photo temporarily unavailable' }),
  )
  await dialog.getByRole('button', { name: '下載 .html', exact: true }).click()
  const fallback = dialog.getByRole('button', { name: '依原網址下載', exact: true })
  await expect(fallback).toBeVisible()
  const linkedDownload = page.waitForEvent('download')
  await fallback.click()
  const linkedHTML = await downloadText(await linkedDownload)
  expect(linkedHTML).toContain(asset.url)
  expect(linkedHTML).toContain(`<title>${renamed}</title>`)
  await page.unroute(asset.url)
  const renamedDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下載 .html', exact: true }).click()
  const portableHTML = await downloadText(await renamedDownload)
  expect(portableHTML).toContain(`<title>${renamed}</title>`)
  expect(portableHTML).toContain('data:image/png;base64,' + imageBytes.toString('base64'))
  expect(documentNode((await storedPage(page, key)).doc, 'activity-image').attributes?.src).toBe(
    asset.url,
  )
  expect(errors).toEqual([])
})

test('設定頁內連結與手機排列，儲存後可在匯出頁面跳到目標', async ({ page, browser }, testInfo) => {
  const key = 'e2e-layout-and-links'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const inspector = page.locator('.sigil-inspector')
  const toolbar = page.locator('.sigil-topbar')
  await selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  const destination = inspector.getByRole('combobox', { name: '連到頁內區段' })
  const address = inspector.getByRole('textbox', { name: '連結網址' })
  await expect(address).toHaveValue('#event-info')
  await destination.selectOption({ label: '常見問題' })
  const fragment = await address.inputValue()
  expect(fragment).toMatch(/^#section-/)
  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  await expect(frame.locator(fragment)).toContainText('參加前的小提醒')
  await toolbar.getByRole('button', { name: '復原', exact: true }).click()
  await expect(address).toHaveValue('#event-info')
  await expect(frame.locator(fragment)).toHaveCount(0)
  await toolbar.getByRole('button', { name: '重做', exact: true }).click()
  await expect(address).toHaveValue(fragment)

  await selectLayer(page, '活動資訊')
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await inspector.getByRole('combobox', { name: '顯示方式', exact: true }).selectOption('flex')
  await inspector.getByRole('combobox', { name: '排列方向', exact: true }).selectOption('column')
  await inspector.getByRole('combobox', { name: '項目對齊', exact: true }).selectOption('center')
  await inspector.getByRole('combobox', { name: '項目間距', exact: true }).selectOption('1rem')
  await expect(frame.locator('#event-info')).toHaveCSS('gap', '16px')
  await frame.locator('#event-info').scrollIntoViewIfNeeded()
  await page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '複製元件' })
    .click()
  await expect(frame.locator('#event-info')).toHaveCount(1)
  await expect(frame.locator('#event-info-copy')).toHaveCount(1)
  await savePage(page, key)
  const stored = await storedPage(page, key)
  expect(documentNode(stored.doc, 'activity-info').style?.display).toBe('grid')
  expect(documentNode(stored.doc, 'activity-info').responsiveStyles?.mobile).toMatchObject({
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'center',
    gap: '1rem',
  })
  await page.reload()
  await expect(frame.locator('#event-info-copy')).toHaveCount(1)
  await expect(frame.locator('#event-info')).toHaveCSS('display', 'grid')
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const exporting = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '匯出 HTML' })
    .getByRole('button', { name: '下載 .html' })
    .click()
  const file = testInfo.outputPath('工作坊.html')
  await (await exporting).saveAs(file)
  const reader = await browser.newContext({
    viewport: { width: 375, height: 812 },
    serviceWorkers: 'block',
  })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const cover = exported.getByRole('img')
    await expect(cover).toHaveAttribute('src', /^data:image\/webp;base64,/)
    await cover.evaluate((image: HTMLImageElement) => image.decode())
    await expect(cover).toHaveJSProperty('naturalWidth', 1200)
    const info = exported.locator('#event-info')
    await expect(info).toHaveCSS('display', 'flex')
    await expect(info).toHaveCSS('align-items', 'center')
    await expect(info).toHaveCSS('gap', '16px')
    await exported.getByRole('link', { name: '查看活動資訊' }).click()
    await expect(exported.locator(':target')).toContainText('參加前的小提醒')
    await exported.setViewportSize({ width: 1280, height: 800 })
    await expect(info).toHaveCSS('display', 'grid')
  } finally {
    await reader.close()
  }
  expect(errors).toEqual([])
})

test('從我的活動頁建立、重試並依儲存後的名稱找回頁面', async ({ page }) => {
  const desktop = page.viewportSize()!
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('電子郵件')).toBeFocused()
  await expect(page.getByLabel('電子郵件')).toHaveCSS('outline-style', 'solid')
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)
  await page.getByLabel('電子郵件').fill('editor@sigil.test')
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的活動頁' })).toBeVisible()
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)

  await page.route('**/sigil/pages/*', (route) => route.fulfill({ status: 503 }), { times: 1 })
  await page.getByRole('link', { name: '新增活動頁' }).click()
  await expect(page.locator('#page-status')).toHaveText(
    '無法讀取頁面。請檢查連線，再按「重新載入」。',
  )
  await page.getByRole('button', { name: '重新載入' }).click()
  const name = page.getByRole('textbox', { name: '活動名稱' })
  const title = '社區攝影活動'
  await name.fill(title)
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)
  await page.setViewportSize(desktop)
  await page.route('**/sigil/pages/*', (route) => route.fulfill({ status: 503 }), { times: 1 })
  await page.getByRole('button', { name: '建立活動頁' }).click()
  await expect(page.locator('#page-status')).toContainText('再按「建立活動頁」')
  await expect(name).toHaveValue(title)
  const directory = page.getByRole('link', { name: '我的活動頁' })
  let releaseCreate!: () => void
  const heldCreate = new Promise<void>((resolve) => {
    releaseCreate = resolve
  })
  await page.route(
    '**/sigil/pages/*',
    async (route) => {
      await heldCreate
      await route.continue()
    },
    { times: 1 },
  )
  try {
    const sending = page.waitForRequest((request) => request.method() === 'PUT')
    await page.getByRole('button', { name: '建立活動頁' }).click()
    await sending
    await directory.click()
    await expect(page.locator('#page-status')).toContainText('操作尚未完成')
    await expect(page).toHaveURL(/\/editor\//)
  } finally {
    releaseCreate()
  }
  await expect(canvasNode(page, 'activity-title')).toHaveText(title)

  const key = new URL(page.url()).pathname.split('/').pop()!
  const renamed = '夏日社區攝影活動'
  await editTitle(page, renamed)
  const titleField = page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
  await expect(titleField).toBeFocused()
  const savedTitle = waitForPageResponse(page, key, 'PUT')
  await titleField.press('ControlOrMeta+s')
  expect((await savedTitle).status()).toBe(200)
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await editTitle(page, '未儲存的名稱')
  const dismissLeave = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('beforeunload')
    await dialog.dismiss()
  })
  await Promise.all([dismissLeave, directory.click({ noWaitAfter: true })])
  await expect(canvasNode(page, 'activity-title')).toHaveText('未儲存的名稱')
  const acceptLeave = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('beforeunload')
    await dialog.accept()
  })
  await Promise.all([acceptLeave, directory.click({ noWaitAfter: true })])
  await page.getByRole('link', { name: renamed, exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/editor/' + key + '$'))
  await expect(canvasNode(page, 'activity-title')).toHaveText(renamed)

  // Earlier documents can lack the activity template's title node.
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content')
  for (const [legacyKey, metadata, expected] of [
    ['e2e-legacy-title', { title: '歷史活動名稱' }, '歷史活動名稱'],
    ['e2e-legacy-key', {}, 'e2e-legacy-key'],
  ] as const) {
    const response = await page.request.put(`/sigil/pages/${legacyKey}`, {
      headers: { 'X-CSRF-TOKEN': csrf! },
      data: {
        baseRevision: 0,
        doc: { version: 1, root: { id: 'root', type: 'section' }, meta: metadata },
      },
    })
    expect(response.status()).toBe(201)
    const switcher = page.locator('.activity-switcher')
    await switcher.locator('summary').click()
    await expect(switcher.locator('[aria-current="page"]')).toBeVisible()
    await switcher.getByRole('link', { name: expected, exact: true }).click()
    await expect(page).toHaveTitle(`${expected} — Sigil`)
    await page.getByRole('button', { name: '匯出', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載 .html', exact: true }).click()
    expect(await downloadText(await download)).toContain(`<title>${expected}</title>`)
    await page.keyboard.press('Escape')
  }
})

test('兩個視窗發生 409 時保留修改及備份，確認後才載入勝出版本', async ({ page, context }) => {
  const key = 'e2e-conflict'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const other = await context.newPage()
  const otherErrors = recordRuntimeErrors(other, key, [409])
  await other.goto(`/editor/${key}`)
  await expect(other.locator('#page-status')).toHaveText('已載入儲存的頁面。')

  const winner = '第一個視窗已儲存的標題'
  const pending = '第二個視窗不能遺失的標題'
  await editTitle(page, winner)
  await savePage(page, key)
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await editTitle(other, pending)
  await savePage(other, key, 409)
  await expect(other.locator('#page-status')).toContainText('另一個視窗已更新此頁')
  await expect(other.locator('.sigil-status-dirty')).toHaveText('未儲存')
  await expect(other.getByRole('button', { name: '存檔', exact: true })).toBeEnabled()
  await expect(canvasNode(other, 'activity-title')).toHaveText(pending)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-title').content).toBe(winner)

  const backup = other.waitForEvent('download')
  await other.getByRole('button', { name: '下載內容備份', exact: true }).click()
  const download = await backup
  expect(download.suggestedFilename()).toBe(`${key}-backup.json`)
  const doc = JSON.parse(await downloadText(download)) as SigilDoc
  expect(documentNode(doc, 'activity-title').content).toBe(pending)
  await expect(other.locator('.sigil-status-dirty')).toHaveText('未儲存')
  expect(await storedPage(page, key)).toEqual(saved)

  const cancelledPrompt = other.waitForEvent('dialog')
  const cancelledReload = other.getByRole('button', { name: '重新載入', exact: true }).click()
  const cancelDialog = await cancelledPrompt
  expect(cancelDialog.type()).toBe('confirm')
  expect(cancelDialog.message()).toContain('放棄目前尚未儲存的修改')
  await cancelDialog.dismiss()
  await cancelledReload
  await expect(canvasNode(other, 'activity-title')).toHaveText(pending)
  await expect(other.locator('.sigil-status-dirty')).toHaveText('未儲存')

  let releaseLoad!: () => void
  const heldLoad = new Promise<void>((resolve) => {
    releaseLoad = resolve
  })
  await other.route(
    `**/sigil/pages/${key}`,
    async (route) => {
      expect(route.request().method()).toBe('GET')
      await heldLoad
      await route.continue()
    },
    { times: 1 },
  )
  const loadStarted = other.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === `/sigil/pages/${key}` && request.method() === 'GET',
  )
  const reloaded = waitForPageResponse(other, key, 'GET')
  try {
    const acceptedPrompt = other.waitForEvent('dialog')
    const acceptedReload = other.getByRole('button', { name: '重新載入', exact: true }).click()
    const acceptDialog = await acceptedPrompt
    expect(acceptDialog.type()).toBe('confirm')
    await acceptDialog.accept()
    await acceptedReload
    await loadStarted
    await expect(other.locator('#sigil-root')).toHaveAttribute('inert', '')
    await other.keyboard.press('Control+z')
    await expect(canvasNode(other, 'activity-title')).toHaveText(pending)
    await expect(other.locator('.sigil-status-dirty')).toHaveText('未儲存')
  } finally {
    releaseLoad()
  }
  expect((await reloaded).status()).toBe(200)
  await expect(canvasNode(other, 'activity-title')).toHaveText(winner)
  await expect(other.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  expect(await storedPage(other, key)).toEqual(saved)
  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})

test('一次 503 保留 dirty 並可真實重試；匿名請求不能存取頁面與素材清單', async ({
  page,
  browser,
}) => {
  const key = 'e2e-retry'
  const errors = recordRuntimeErrors(page, key, [404, 503])
  await createActivity(page, key)
  const original = await storedPage(page, key)
  const title = '重試成功後保留的標題'
  const heading = canvasNode(page, 'activity-title')
  const bounds = (await heading.boundingBox())!
  await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(heading).toBeFocused()
  await heading.fill(title)
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeEnabled()

  const leaving = page.waitForEvent('dialog')
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0)
  })
  const prompt = await leaving
  expect(prompt.type()).toBe('beforeunload')
  await prompt.dismiss()
  await expect(heading).toHaveText(title)
  expect(await storedPage(page, key)).toEqual(original)
  await page.route(
    `**/sigil/pages/${key}`,
    async (route) => {
      expect(route.request().method()).toBe('PUT')
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    },
    { times: 1 },
  )
  await savePage(page, key, 503)
  await expect(page.locator('#page-status')).toContainText('儲存失敗，修改仍保留')
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeEnabled()
  expect(await storedPage(page, key)).toEqual(original)
  await savePage(page, key)
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await expect(page.locator('#page-status')).toHaveText('頁面已儲存。')
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-title').content).toBe(title)

  const anonymous = await browser.newContext()
  try {
    for (const path of [`/sigil/pages/${key}`, '/sigil/assets']) {
      const response = await anonymous.request.get(new URL(path, page.url()).href, {
        headers: { Accept: 'application/json' },
      })
      expect(response.status()).toBe(401)
      expect(await response.json()).toMatchObject({ message: 'Unauthenticated.' })
    }
  } finally {
    await anonymous.close()
  }
  expect(errors).toEqual([])
})

test.describe('觸控編輯', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('從畫布點選標題直接編輯，預覽與重新載入保留修改', async ({ page }) => {
    const key = 'e2e-touch-selection'
    await createActivity(page, key)
    const editor = page.locator('.sigil-app')
    await expect(editor).toHaveAttribute('data-layout', 'compact')
    const more = editor.getByRole('button', { name: '更多工具', exact: true })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding-left', '12px')
    const title = canvasNode(page, 'activity-title')
    await expect(title).toBeInViewport()
    const titleBox = (await title.boundingBox())!
    await page.touchscreen.tap(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2)
    const editTitle = editor.getByRole('button', { name: '編輯 活動標題', exact: true })
    await expect(editTitle).toBeInViewport({ ratio: 1 })
    await editTitle.tap()
    const panel = editor.locator('[data-compact-panel="settings"]')
    const text = panel.getByRole('textbox', { name: '內容', exact: true })
    await expect(text).toBeFocused()
    await expect(text).toBeInViewport({ ratio: 1 })
    await expect(panel.getByRole('tree')).toHaveCount(0)
    await text.fill('週末版畫體驗')
    await panel.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await expect(editTitle).toBeFocused()

    await savePage(page, key)
    await expect(page).toHaveTitle('週末版畫體驗 — Sigil')
    await editor.getByRole('button', { name: '預覽', exact: true }).tap()
    await expect(editTitle).toBeHidden()
    await expect(title).toHaveText('週末版畫體驗')
    await editor.getByRole('button', { name: '編輯', exact: true }).tap()
    await more.tap()
    await expect(editor.getByRole('button', { name: '手機', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(editor.getByRole('button', { name: '匯出', exact: true })).toBeVisible()
    await more.tap()
    await page.reload()
    await expect(title).toHaveText('週末版畫體驗')
    expect(
      await page.locator('html').evaluate((root) => ({
        width: root.scrollWidth - root.clientWidth,
        height: root.scrollHeight - root.clientHeight,
      })),
    ).toEqual({ width: 0, height: 0 })
  })
})
