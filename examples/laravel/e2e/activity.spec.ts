import { expect, test, type Download, type Page, type Response } from '@playwright/test'
import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'

const password = 'Sigil-e2e-only-password-2026'
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
)

function recordRuntimeErrors(page: Page, key: string, expectedStatuses = [404]): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const status = message.text().match(/^Failed to load resource: .*status of (\d+)\b/)
    // Only the page API's explicitly expected failures are exempt from this assertion.
    if (
      message.location().url.endsWith(`/sigil/pages/${key}`) &&
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

async function editTitle(page: Page, content: string): Promise<void> {
  await page.getByRole('treeitem', { name: '活動標題', exact: true }).click()
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

test('登入建立活動頁，編輯、復原重做、上傳與重載，並預覽及匯出', async ({ page }) => {
  const key = 'e2e-activity'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const title = '已儲存的秋日設計工作坊'
  await editTitle(page, title)
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(canvasNode(page, 'activity-title')).toHaveText('秋日設計工作坊')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(canvasNode(page, 'activity-title')).toHaveText(title)

  await page.getByRole('treeitem', { name: '活動圖片', exact: true }).click()
  await page.getByRole('button', { name: '選圖', exact: true }).click()
  const media = page.getByRole('dialog', { name: '媒體庫', exact: true })
  await expect(media).toBeVisible()
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

  const topbar = page.locator('.sigil-topbar')
  await page.getByRole('treeitem', { name: '活動頁', exact: true }).click()
  await page.locator('.sigil-inspector').getByRole('tab', { name: '樣式', exact: true }).click()
  await topbar.getByRole('button', { name: 'Mobile', exact: true }).click()
  const padding = page.locator('.sigil-inspector').getByRole('textbox', { name: /^padding/ })
  await expect(padding).toHaveValue('0.75rem')
  await padding.fill('1rem')
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '16px')
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')

  const saved = await savePage(page, key)
  expect(await saved.json()).toMatchObject({ revision: 2 })
  await expect(page.locator('#page-status')).toHaveText('頁面已儲存。')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  const beforeReload = await storedPage(page, key)
  expect(documentNode(beforeReload.doc, 'activity-title').content).toBe(title)
  expect(documentNode(beforeReload.doc, 'activity-image').attributes?.src).toBe(asset.url)
  expect(beforeReload.doc.root.responsiveStyles?.mobile?.padding).toBe('1rem')
  expect(beforeReload.doc.root.style?.padding).toBe('2rem')

  const reloaded = await page.reload()
  await assertCSP(reloaded!)
  await expect(page.locator('#page-status')).toHaveText('已載入儲存的頁面。')
  await expect(canvasNode(page, 'activity-title')).toHaveText(title)
  await expect(canvasNode(page, 'activity-image')).toHaveAttribute('src', asset.url)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalWidth', 1)
  await expect(canvasNode(page, 'activity-image')).toHaveJSProperty('naturalHeight', 1)
  await expect(topbar.getByRole('button', { name: 'Desktop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '32px')
  expect(await storedPage(page, key)).toEqual(beforeReload)
  const bytes = await page.request.get(asset.url)
  expect(bytes.status()).toBe(200)
  expect(bytes.headers()['content-type']).toBe('image/png')
  expect(await bytes.body()).toEqual(imageBytes)

  await topbar.getByRole('button', { name: 'Mobile', exact: true }).click()
  await expect(topbar.getByRole('button', { name: 'Mobile', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('iframe[title="編輯畫布"]')).toHaveCSS('width', '375px')
  await expect(canvasNode(page, 'activity-root')).toHaveCSS('padding', '16px')
  await topbar.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(page.locator('.sigil-canvas-overlay')).toBeHidden()
  await expect(page.locator('iframe[title="編輯畫布"]')).toHaveCSS('pointer-events', 'auto')
  await canvasNode(page, 'activity-hero').getByRole('link', { name: '查看活動資訊' }).click()
  await expect(canvasNode(page, 'activity-info')).toBeInViewport()
  await topbar.getByRole('button', { name: '編輯', exact: true }).click()
  await topbar.getByRole('button', { name: 'Desktop', exact: true }).click()
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
  expect(await downloadText(download)).toBe(html)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
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
  await editTitle(page, title)
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
