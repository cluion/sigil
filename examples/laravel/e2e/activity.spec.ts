import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Download,
  type Page,
  type Response,
} from '@playwright/test'
import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'
import { pathToFileURL } from 'node:url'
import { workshopRegistration } from '../../../e2e/mixed-content'
import { readWorkshopPhoto } from '../../../e2e/workshop-photo'
import { expectSessionLayout, workshopSessions } from '../../../e2e/responsive-wrap'

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

type SessionCookies = Awaited<ReturnType<BrowserContext['cookies']>>
// Copy only login cookies into each fresh context; browser drafts and account preferences stay isolated.
const workerSessions = new Map<string, SessionCookies>()

async function createActivity(
  page: Page,
  key: string,
  email = 'editor@sigil.test',
  session: 'worker' | 'fresh' = 'worker',
): Promise<void> {
  const cookies = session === 'worker' ? workerSessions.get(email) : undefined
  if (cookies) await page.context().addCookies(cookies)
  const missing = waitForPageResponse(page, key, 'GET')
  const navigation = await page.goto(`/editor/${key}`)
  if (cookies) {
    expect(navigation?.status()).toBe(200)
    await assertCSP(navigation!)
  } else {
    await expect(page.getByRole('heading', { name: 'Sigil 活動頁後台' })).toBeVisible()
    await page.getByLabel('電子郵件').fill(email)
    await page.getByLabel('密碼').fill(password)
    const editorResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/editor/${key}` &&
        response.request().resourceType() === 'document',
    )
    const loggedIn = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/login' && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '登入', exact: true }).click()
    expect((await loggedIn).status()).toBe(302)
    await page.waitForURL(`**/editor/${key}`)
    await assertCSP(await editorResponse)
    if (session === 'worker') workerSessions.set(email, await page.context().cookies())
  }
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

async function decodeOfflinePhotos(browser: Browser, file: string, alts: string[]) {
  const reader = await browser.newContext({ serviceWorkers: 'block' })
  const requests: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      requests.push(route.request().url())
      return route.abort()
    })
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await expect(exported.locator('script')).toHaveCount(0)
    await expect(exported.locator('img')).toHaveCount(alts.length)
    const decoded: { alt: string; width: number; height: number }[] = []
    for (const alt of alts) {
      const image = exported.getByRole('img', { name: alt, exact: true })
      await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/)
      const size = await image.evaluate(async (el: HTMLImageElement) => {
        await el.decode()
        return { width: el.naturalWidth, height: el.naturalHeight }
      })
      expect(size).toEqual({ width: 1200, height: 800 })
      decoded.push({ alt, ...size })
    }
    expect(requests).toEqual([])
    return { decoded, outgoingRequests: requests.length }
  } finally {
    await reader.close()
  }
}

test('同一個瀏覽器切換 Laravel 帳號後各自保有區塊釘選', async ({ page }, testInfo) => {
  const key = `library-pins-${testInfo.project.name}`
  const library = page.locator('.sigil-blocks-panel')
  const toggle = page.getByRole('button', { name: '新增區塊', exact: true })
  const pin = library.getByRole('button', { name: '釘選 折疊式 FAQ', exact: true })
  const pinnedOnly = library.getByRole('button', { name: '只看已釘選', exact: true })
  await createActivity(page, key, 'editor@sigil.test', 'fresh')
  await selectLayer(page, '活動標題', ['活動頁', '主視覺', '活動簡介'])
  await toggle.click()
  await pin.press('Enter')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await pin.press('Delete')
  await expect(canvasNode(page, 'activity-title')).toHaveAttribute('data-sigil-selected', '1')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await page.locator('#page-options > summary').click()
  await page.getByRole('button', { name: '登出', exact: true }).click()
  await page.waitForURL('**/login')

  await createActivity(page, key, 'other@sigil.test', 'fresh')
  await toggle.click()
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  await pinnedOnly.click()
  await expect(library.getByText('尚無已釘選區塊')).toBeVisible()
  await expect(page.getByRole('button', { name: '復原', exact: true })).toBeDisabled()
  expect((await storedPage(page, key)).revision).toBe(1)
})

test('從區塊目錄加入折疊式 FAQ，儲存重載後下載可離線開闔的問答', async ({
  page,
  browser,
}, testInfo) => {
  const key = `faq-${testInfo.project.name}`
  await createActivity(page, key)
  const savedBeforePin = await storedPage(page, key)
  const libraryToggle = page.getByRole('button', { name: '新增區塊', exact: true })
  await libraryToggle.click()
  const library = page.locator('.sigil-blocks-panel')
  const search = library.getByRole('searchbox', { name: '搜尋區塊' })
  const pinnedOnly = library.getByRole('button', { name: '只看已釘選', exact: true })
  const pin = library.getByRole('button', { name: '釘選 折疊式 FAQ', exact: true })
  await search.fill('行銷 ＦＡＱ')
  await pin.click()
  await pinnedOnly.click()
  await expect(library.locator('.sigil-block-item')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  expect(await storedPage(page, key)).toEqual(savedBeforePin)
  await search.press('ArrowDown')
  const insert = library.getByRole('button', { name: '插入 折疊式 FAQ', exact: true })
  await expect(insert).toBeFocused()
  await insert.press('Enter')

  const inspector = page.locator('.sigil-inspector')
  await inspector.getByRole('button', { name: '需要自備工具嗎？', exact: true }).click()
  const question = '報到時需要帶什麼？'
  const answer = '請出示報名通知，現場會提供材料。'
  await inspector.getByRole('textbox', { name: '問題', exact: true }).fill(question)
  await inspector.getByRole('textbox', { name: '答案', exact: true }).fill(answer)
  await savePage(page, key)
  await page.reload()
  await expect(page.locator('#page-status')).toHaveText('已載入儲存的頁面。')
  await libraryToggle.click()
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await pinnedOnly.click()
  await expect(library.locator('.sigil-block-item')).toHaveCount(1)
  await pin.click()
  await expect(library.getByText('尚無已釘選區塊')).toBeVisible()
  expect((await storedPage(page, key)).revision).toBe(2)
  const restored = page
    .frameLocator('iframe[title="編輯畫布"]')
    .locator('details')
    .filter({ hasText: question })
  await expect(restored.locator('p')).toHaveText(answer)

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('activity-faq.html')
  await (await download).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const item = exported.locator('details').filter({ hasText: question })
    const summary = item.locator('summary')
    await expect(summary).toHaveText(question)
    const open = exported.locator('details[open]').filter({ hasText: question })
    await expect(open).toHaveCount(0)
    await summary.click()
    await expect(open).toHaveCount(1)
    await expect(item.getByText(answer, { exact: true })).toBeVisible()
    await summary.press('Space')
    await expect(open).toHaveCount(0)
  } finally {
    await reader.close()
  }
})

test('從本頁圖片插入帳戶素材庫以外的封面，Laravel 重開與離線檔保留各自的說明', async ({
  page,
  browser,
}, testInfo) => {
  const key = `page-images-${testInfo.project.name}`
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key, 'other@sigil.test')
  const original = documentNode((await storedPage(page, key)).doc, 'activity-image')
  const src = original.attributes!.src!
  const footerAlt = '頁尾工作坊照片'
  await page.getByRole('button', { name: '素材庫', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const assetTab = dialog.getByRole('tab', { name: '素材庫', exact: true })
  const pageTab = dialog.getByRole('tab', { name: '本頁圖片', exact: true })
  const card = dialog.getByRole('button', { name: '活動圖片', exact: true })
  await expect(assetTab).toHaveAttribute('aria-selected', 'true')
  const library = await page.request.get('/sigil/assets', {
    headers: { Accept: 'application/json' },
  })
  expect(library.ok()).toBe(true)
  const assets = await library.json()
  expect(Array.isArray(assets)).toBe(true)
  expect(assets).not.toContainEqual(expect.objectContaining({ url: src }))
  await pageTab.click()
  await expect(card).toContainText('本頁使用 1 次')
  await card.click()
  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const last = frame.locator('[data-sigil-id="activity-root"] > img:last-child')
  await expect(last).toHaveAttribute('data-sigil-selected', '1')
  await expect(last).toHaveJSProperty('naturalWidth', 1200)
  const id = (await last.getAttribute('data-sigil-id'))!
  expect(id).not.toBe(original.id)
  expect(await last.getAttribute('alt')).toBeFalsy()
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '替代文字', exact: true })
    .fill(footerAlt)
  await expect(last).toHaveAttribute('alt', footerAlt)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, original.id)).toEqual(original)
  expect(saved.doc.root.children?.at(-1)).toMatchObject({
    id,
    type: 'image',
    attributes: { src, alt: footerAlt },
  })

  await page.reload()
  await expect(last).toHaveAttribute('alt', footerAlt)
  await selectLayer(page, '活動圖片', ['活動頁', '主視覺'])
  await page.locator('.sigil-inspector').getByRole('button', { name: '選圖', exact: true }).click()
  await pageTab.click()
  await dialog.getByRole('searchbox', { name: '搜尋本頁圖片' }).fill('頁尾工作坊照片')
  await expect(card).toContainText('本頁使用 2 次')
  await expect(card).toHaveAttribute('aria-current', 'true')
  await card.click()
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('page-images.html')
  await (await downloading).saveAs(file)
  const offline = await decodeOfflinePhotos(browser, file, [original.attributes!.alt!, footerAlt])
  await testInfo.attach('page-image-export', {
    body: JSON.stringify({
      accountAssetCount: assets.length,
      savedRevision: saved.revision,
      ...offline,
    }),
    contentType: 'application/json',
  })
  expect(errors).toEqual([])
})

test('空帳戶用網址插入第一張圖，Laravel 與下載檔保留圖片及替代文字', async ({
  page,
  browser,
}, testInfo) => {
  const key = `first-url-image-${testInfo.project.name}`
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key, 'other@sigil.test')
  const initial = await storedPage(page, key)
  const src = documentNode(initial.doc, 'activity-image').attributes!.src!
  const alt = '參加者在木桌上排列版畫紙模'
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content')
  const seeded = await page.request.put(`/sigil/pages/${key}`, {
    headers: { 'X-CSRF-TOKEN': csrf! },
    data: {
      baseRevision: initial.revision,
      doc: { ...initial.doc, root: { ...initial.doc.root, children: [] } },
    },
  })
  expect(seeded.status()).toBe(200)
  const emptyRevision = (await seeded.json()).revision
  await page.reload()
  await expect(page.locator('#page-status')).toHaveText('已載入儲存的頁面。')
  const photos = page.frameLocator('iframe[title="編輯畫布"]').locator('img')
  await expect(photos).toHaveCount(0)
  await page.getByRole('button', { name: '素材庫', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const library = await page.request.get('/sigil/assets', {
    headers: { Accept: 'application/json' },
  })
  expect(library.ok()).toBe(true)
  const assets = await library.json()
  expect(assets).toEqual([])
  await dialog.getByRole('tab', { name: '圖片網址', exact: true }).click()
  await dialog.getByRole('textbox', { name: '圖片網址', exact: true }).fill(src)
  await dialog.getByRole('textbox', { name: '替代文字', exact: true }).fill(alt)
  await dialog.getByRole('button', { name: '預覽圖片', exact: true }).click()
  const insert = dialog.getByRole('button', { name: '插入圖片', exact: true })
  await expect(insert).toBeEnabled()
  await expect(photos).toHaveCount(0)
  expect((await storedPage(page, key)).revision).toBe(emptyRevision)
  await insert.click()
  await expect(photos).toHaveAttribute('data-sigil-selected', '1')
  await expect(photos).toHaveAttribute('src', src)
  await expect(photos).toHaveAttribute('alt', alt)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(emptyRevision + 1)
  expect(saved.doc.root.children).toEqual([
    expect.objectContaining({ type: 'image', attributes: { src, alt } }),
  ])
  await page.reload()
  await expect(photos).toHaveJSProperty('naturalWidth', 1200)
  await expect(photos).toHaveAttribute('alt', alt)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('first-url-image.html')
  await (await downloading).saveAs(file)
  const offline = await decodeOfflinePhotos(browser, file, [alt])
  await testInfo.attach('first-url-image-export', {
    body: JSON.stringify({
      accountAssetCount: assets.length,
      src,
      emptyRevision,
      savedRevision: saved.revision,
      ...offline,
    }),
    contentType: 'application/json',
  })
  expect(errors).toEqual([])
})

test('為工作坊封面加入圖片連結，Laravel 保存原圖並可從下載的 HTML 點圖跳到指定區段', async ({
  page,
  browser,
}, info) => {
  const key = 'linked-workshop-cover'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const starting = await storedPage(page, key)
  const original = documentNode(starting.doc, 'activity-image')
  const alt = original.attributes!.alt!
  const src = original.attributes!.src!
  const image = canvasNode(page, 'activity-image')
  await image.evaluate((el) => (el as HTMLImageElement).decode())
  const rect = (await image.boundingBox())!
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await expect(image).toHaveAttribute('data-sigil-selected', '1')
  const panel = page.locator('.sigil-inspector')
  const destination = panel.getByRole('combobox', { name: '連到頁內區段', exact: true })
  await destination.selectOption('activity-info')
  const link = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('link', { name: alt, exact: true })
  await expect(link).toHaveAttribute('href', '#event-info')
  const wrapperId = (await link.getAttribute('data-sigil-id'))!
  await savePage(page, key)
  const stored = await storedPage(page, key)
  expect(stored.revision).toBe(2)
  const wrapper = documentNode(stored.doc, wrapperId)
  expect(wrapper).toMatchObject({
    type: 'section',
    tagName: 'a',
    attributes: { href: '#event-info' },
  })
  expect(wrapper.children?.map((child) => child.id)).toEqual(['activity-image'])
  expect(documentNode(stored.doc, 'activity-image')).toMatchObject({
    name: original.name,
    attributes: { src, alt },
  })
  await page.reload()
  await expect(link).toHaveAttribute('href', '#event-info')
  await expect(link.getByRole('img', { name: alt, exact: true })).toHaveJSProperty(
    'naturalWidth',
    1200,
  )
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = info.outputPath('linked-workshop-cover.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  const outgoing: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      outgoing.push(route.request().url())
      return route.abort()
    })
    const offline = await reader.newPage()
    const base = pathToFileURL(file).href
    await offline.goto(base)
    const exported = offline.getByRole('link', { name: alt, exact: true })
    const exportedPhoto = exported.getByRole('img', { name: alt, exact: true })
    await expect(exportedPhoto).toHaveAttribute('src', /^data:image\/webp;base64,/)
    const size = await readWorkshopPhoto(exportedPhoto)
    await expect(exported).toHaveAttribute('href', '#event-info')
    await offline.getByRole('link', { name: '查看活動資訊', exact: true }).focus()
    await offline.keyboard.press(
      info.project.name === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
    )
    await expect(exported).toBeFocused()
    expect(await exported.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
    const box = (await exported.boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThan(0)
    await offline.keyboard.press('Enter')
    await expect(offline).toHaveURL(base + '#event-info')
    await expect(offline.locator('#event-info')).toBeInViewport()
    await offline.goto(base)
    await exportedPhoto.click()
    await expect(offline).toHaveURL(base + '#event-info')
    await expect(offline.locator('#event-info')).toBeInViewport()
    expect(outgoing).toEqual([])
    expect(errors).toEqual([])
    await info.attach('offline-linked-image', {
      body: JSON.stringify({
        revision: stored.revision,
        wrapperId,
        imageId: original.id,
        alt,
        size,
        href: await exported.getAttribute('href'),
        focusBounds: box,
        outgoingRequests: outgoing.length,
      }),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
})

test('桌面與手機圖片構圖可經 Laravel 保存，下載的離線頁依寬度裁切', async ({
  page,
  browser,
}, testInfo) => {
  const key = `framing-${testInfo.project.name}`
  await createActivity(page, key)
  const initial = documentNode((await storedPage(page, key)).doc, 'activity-image')
  const tools = page.locator('.sigil-topbar')
  await selectLayer(page, '活動圖片', ['活動頁', '主視覺'])
  await page
    .locator('.sigil-inspector')
    .getByRole('button', { name: '調整圖片構圖', exact: true })
    .click()
  const framing = page.getByRole('group', { name: '圖片構圖', exact: true })
  const x = framing.getByRole('spinbutton', { name: '水平焦點 (%)', exact: true })
  const y = framing.getByRole('spinbutton', { name: '垂直焦點 (%)', exact: true })
  await x.fill('25')
  await x.press('Tab')
  await expect(canvasNode(page, 'activity-image')).toHaveCSS('object-position', '25% 50%')
  await tools.getByRole('button', { name: '手機', exact: true }).click()
  await expect(x).toHaveValue('25')
  await framing.getByRole('combobox', { name: '裁切比例', exact: true }).selectOption('1 / 1')
  await x.fill('80')
  await x.press('Tab')
  await y.fill('20')
  await y.press('Tab')
  await expect(canvasNode(page, 'activity-image')).toHaveCSS('object-position', '80% 20%')
  await savePage(page, key)
  const saved = await storedPage(page, key)
  const image = documentNode(saved.doc, 'activity-image')
  expect(saved.revision).toBe(2)
  expect(image.attributes).toEqual(initial.attributes)
  expect(image.style).toEqual({ ...initial.style, 'object-position': '25% 50%' })
  expect(image.responsiveStyles).toEqual({
    ...initial.responsiveStyles,
    mobile: {
      ...initial.responsiveStyles?.mobile,
      'aspect-ratio': '1 / 1',
      'max-height': 'none',
      'object-position': '80% 20%',
    },
  })
  await page.reload()
  await expect(canvasNode(page, 'activity-image')).toHaveCSS('object-position', '25% 50%')
  await tools.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('workshop-framing.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    viewport: { width: 1000, height: 800 },
  })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const photo = exported.getByRole('img', { name: initial.attributes!.alt!, exact: true })
    await expect(photo).toHaveAttribute('src', /^data:image\/webp;base64,/)
    await expect(photo).toHaveCSS('object-fit', 'cover')
    await expect(photo).toHaveCSS('object-position', '25% 50%')
    await exported.setViewportSize({ width: 375, height: 812 })
    await expect(photo).toHaveCSS('object-position', '80% 20%')
    await expect(photo).toHaveCSS('aspect-ratio', '1 / 1')
    const bounds = await photo.boundingBox()
    expect(bounds!.width).toBeGreaterThan(100)
    expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThan(1)
  } finally {
    await reader.close()
  }
})

test('場次列表的換行與行列間距可儲存，離線檔在 480 與 481 像素依斷點排列', async ({
  page,
  browser,
}, testInfo) => {
  const key = 'wrap-sessions-' + testInfo.project.name
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content')
  const seed = await page.request.put(`/sigil/pages/${key}`, {
    headers: { 'X-CSRF-TOKEN': csrf! },
    data: { baseRevision: 1, doc: workshopSessions() },
  })
  expect(seed.status()).toBe(200)
  await page.reload()
  await selectLayer(page, '場次列表', ['工作坊'])
  const toolbar = page.locator('.sigil-topbar')
  const panel = page.locator('.sigil-inspector')
  await panel.getByRole('tab', { name: '樣式', exact: true }).click()
  const mode = panel.getByRole('combobox', { name: '項目換行', exact: true })
  const toggle = panel.getByRole('button', { name: '分別調整間距', exact: true })
  const row = panel.getByRole('textbox', { name: '列間距', exact: true })
  const column = panel.getByRole('textbox', { name: '欄間距', exact: true })
  const sessions = page.frameLocator('iframe[title="編輯畫布"]').locator('#sessions')
  await mode.selectOption('wrap')
  await toggle.click()
  await row.fill('16px')
  await row.press('Enter')
  await expectSessionLayout(sessions, 'wrap', 16, 13)
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(mode).toHaveValue('wrap')
  await mode.selectOption('wrap-reverse')
  await expectSessionLayout(sessions, 'wrap-reverse', 16, 13)
  await panel.getByRole('button', { name: '還原換行設定', exact: true }).click()
  await expect(mode).toHaveValue('wrap')
  await expectSessionLayout(sessions, 'wrap', 16, 13)
  await mode.selectOption('wrap-reverse')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await column.fill('18px')
  await column.press('Enter')
  await row.fill('24px')
  await row.press('Enter')
  await expectSessionLayout(sessions, 'wrap-reverse', 24, 18)
  await panel.locator('[data-gap-reset="row"]').click()
  await expectSessionLayout(sessions, 'wrap-reverse', 16, 18)
  await toolbar.getByRole('button', { name: '復原', exact: true }).click()
  await expectSessionLayout(sessions, 'wrap-reverse', 24, 18)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(3)
  const savedList = documentNode(saved.doc, 'times')
  expect(savedList.style).toMatchObject({
    'flex-flow': 'row-reverse nowrap',
    'grid-gap': '9px 13px',
  })
  expect(savedList.responsiveStyles?.mobile).toMatchObject({
    'flex-wrap': 'wrap-reverse',
    'row-gap': '24px',
    'column-gap': '18px',
  })
  await page.reload()
  await expectSessionLayout(sessions, 'wrap', 16, 13)
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('workshop-sessions.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block' })
  const requests: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      requests.push(route.request().url())
      return route.abort()
    })
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await expect(exported.locator('script')).toHaveCount(0)
    const section = exported.locator('#sessions')
    const readings = []
    for (const viewport of [1024, 768, 481, 480, 375]) {
      await exported.setViewportSize({ width: viewport, height: 812 })
      const mobile = viewport <= 480
      const layout = await expectSessionLayout(
        section,
        mobile ? 'wrap-reverse' : 'wrap',
        mobile ? 24 : 16,
        mobile ? 18 : 13,
      )
      readings.push({ viewport, ...layout })
    }
    expect(requests).toEqual([])
    await testInfo.attach('offline-wrap-layout', {
      body: JSON.stringify({ revision: saved.revision, requests: requests.length, readings }),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
  expect(errors).toEqual([])
})

test('單邊間距可經 Laravel 存檔重開，離線活動頁依裝置保留其他三邊', async ({
  page,
  browser,
}, testInfo) => {
  const key = `box-spacing-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-info')
  const info = canvasNode(page, original.id)
  const toolbar = page.locator('.sigil-topbar')
  const inspector = page.locator('.sigil-inspector')
  async function expandSpacing(label: string) {
    const toggle = inspector.getByRole('button', { name: label, exact: true })
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  }
  const side = (name: string) => inspector.getByRole('textbox', { name, exact: true })

  await selectLayer(page, '活動資訊', ['活動頁'])
  await toolbar.getByRole('button', { name: '平板', exact: true }).click()
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  await expandSpacing('分別調整內距')
  const bottom = side('下方內距')
  await bottom.fill('var(--card-space)')
  await bottom.press('Control+s')
  await expect(bottom).toHaveAttribute('aria-invalid', 'true')
  await expect(inspector.getByText('這個間距值無法儲存在此網站')).toBeVisible()
  await expect(toolbar.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  expect((await storedPage(page, key)).revision).toBe(1)

  await bottom.fill('32px')
  const saveTablet = waitForPageResponse(page, key, 'PUT')
  await bottom.press('Control+s')
  expect((await saveTablet).status()).toBe(200)
  await expect(info).toHaveCSS('padding-bottom', '32px')
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expandSpacing('分別調整內距')
  await side('左方內距').fill('8px')
  await side('左方內距').press('Enter')
  await expandSpacing('分別調整外距')
  await side('上方外距').fill('-0.5rem')
  await side('上方外距').press('Enter')
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(3)
  expect(documentNode(saved.doc, original.id)).toEqual({
    ...original,
    responsiveStyles: {
      tablet: { 'padding-bottom': '32px' },
      mobile: { 'padding-left': '8px', 'margin-top': '-0.5rem' },
    },
  })

  await page.reload()
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(info).toHaveCSS('padding', '24px 24px 32px 8px')
  await expect(info).toHaveCSS('margin-top', '-8px')
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('activity-spacing.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const section = exported.locator('#event-info')
    for (const [width, padding, marginTop] of [
      [769, '24px', '0px'],
      [768, '24px 24px 32px', '0px'],
      [481, '24px 24px 32px', '0px'],
      [480, '24px 24px 32px 8px', '-8px'],
    ] as const) {
      await exported.setViewportSize({ width, height: 812 })
      await expect(section).toHaveCSS('padding', padding)
      await expect(section).toHaveCSS('margin-top', marginTop)
    }
  } finally {
    await reader.close()
  }
})

test('自訂桌面欄寬與平板手機欄數可經 Laravel 儲存，離線 HTML 依斷點排列', async ({
  page,
  browser,
}, testInfo) => {
  const key = `grid-tracks-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-info')
  await selectLayer(page, '活動資訊', ['活動頁'])
  const toolbar = page.locator('.sigil-topbar')
  const inspector = page.locator('.sigil-inspector')
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  const grid = inspector.getByRole('group', { name: '格線欄數', exact: true })
  const custom = grid.getByRole('textbox', { name: '自訂欄寬', exact: true })
  const desktop = 'minmax(0, 2fr) minmax(0, 1fr)'
  await custom.fill('minmax(')
  await custom.press('Enter')
  await expect(custom).toHaveAttribute('aria-invalid', 'true')
  await custom.fill('var(--card-columns)')
  await custom.press('Control+s')
  await expect(grid.getByRole('alert')).toHaveText('此網站不支援這種欄寬設定。')
  expect((await storedPage(page, key)).revision).toBe(1)
  await expect(toolbar.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await custom.fill(desktop)
  const firstSave = waitForPageResponse(page, key, 'PUT')
  await custom.press('Control+s')
  expect((await firstSave).status()).toBe(200)
  const firstVersion = await storedPage(page, key)
  expect(firstVersion.revision).toBe(2)
  expect(documentNode(firstVersion.doc, 'activity-info').style?.['grid-template-columns']).toBe(
    desktop,
  )
  await toolbar.getByRole('button', { name: '平板', exact: true }).click()
  await grid.getByRole('button', { name: '2 欄', exact: true }).click()
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await grid.getByRole('button', { name: '1 欄', exact: true }).click()
  await savePage(page, key)
  const stored = await storedPage(page, key)
  expect(stored.revision).toBe(3)
  const info = documentNode(stored.doc, 'activity-info')
  expect(info).toEqual({
    ...original,
    style: { ...original.style, 'grid-template-columns': desktop },
    responsiveStyles: {
      tablet: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' },
      mobile: { 'grid-template-columns': expect.stringMatching(/minmax\(0,\s*1fr\)/) },
    },
  })
  await page.reload()
  await selectLayer(page, '活動資訊', ['活動頁'])
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  await expect(custom).toHaveValue(desktop)
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('responsive-grid.html')
  await (await downloaded).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const section = exported.locator('#event-info')
    await expect(section.locator(':scope > *')).toHaveCount(4)
    const measurements: { viewport: number; columnWidths: number[] }[] = []
    for (const [width, expected] of [
      [769, [2, 1]],
      [768, [1, 1]],
      [481, [1, 1]],
      [480, [1]],
    ] as const) {
      await exported.setViewportSize({ width, height: 800 })
      const tracks = await section.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat),
      )
      measurements.push({ viewport: width, columnWidths: tracks })
      expect(tracks).toHaveLength(expected.length)
      const unit = tracks.at(-1)!
      expect(unit).toBeGreaterThan(0)
      for (const [index, weight] of expected.entries()) {
        expect(Math.abs(tracks[index]! - weight * unit)).toBeLessThan(1)
      }
      const [firstRow, nextRow] = await Promise.all(
        [0, expected.length].map((index) => section.locator(':scope > *').nth(index).boundingBox()),
      )
      expect(Math.abs(firstRow!.x - nextRow!.x)).toBeLessThan(1)
      expect(nextRow!.y).toBeGreaterThan(firstRow!.y)
    }
    await testInfo.attach('offline-grid-columns', {
      contentType: 'application/json',
      body: JSON.stringify(measurements),
    })
  } finally {
    await reader.close()
  }
})

test('格線標題可跨整列，Laravel 儲存及離線 HTML 會保留各裝置的子項配置', async ({
  page,
  browser,
}, testInfo) => {
  const key = `grid-item-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-info')
  const [heading, ...entries] = original.children!
  const toolbar = page.locator('.sigil-topbar')
  const inspector = page.locator('.sigil-inspector')
  const columns = inspector.getByRole('group', { name: '格線欄數' })
  const placement = inspector.getByRole('group', { name: '格線項目配置' })
  const full = placement.getByRole('button', { name: '橫跨整列' })
  const auto = placement.getByRole('button', { name: '自動排列' })
  await selectLayer(page, '活動資訊', ['活動頁'])
  await inspector.getByRole('tab', { name: '樣式' }).click()
  await columns.getByRole('button', { name: '3 欄', exact: true }).click()
  await toolbar.getByRole('button', { name: '平板', exact: true }).click()
  await columns.getByRole('button', { name: '2 欄', exact: true }).click()
  await selectLayer(page, '資訊標題', ['活動頁', '活動資訊'])
  await toolbar.getByRole('button', { name: '桌面', exact: true }).click()
  await full.press('Enter')
  await toolbar.getByRole('button', { name: '平板', exact: true }).click()
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  await auto.click()
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  await full.click()
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-info')).toEqual({
    ...original,
    style: { ...original.style, 'grid-template-columns': 'repeat(3, minmax(0, 1fr))' },
    responsiveStyles: { tablet: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' } },
    children: [
      {
        ...heading,
        style: { ...heading!.style, 'grid-column': '1 / -1' },
        responsiveStyles: {
          tablet: { 'grid-column': 'auto' },
          mobile: { 'grid-column': '1 / -1' },
        },
      },
      ...entries,
    ],
  })
  await page.reload()
  await selectLayer(page, '資訊標題', ['活動頁', '活動資訊'])
  await inspector.getByRole('tab', { name: '樣式' }).click()
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('activity-grid-item.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const children = exported.locator('#event-info > *')
    await expect(exported.locator('#event-info').getByRole('heading', { level: 2 })).toHaveText(
      heading!.content!,
    )
    await expect(children).toHaveText(original.children!.map((child) => child.content!))
    const measurements = []
    for (const width of [1024, 768, 375]) {
      await exported.setViewportSize({ width, height: 812 })
      const boxes = await children.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width } = element.getBoundingClientRect()
          return { x, y, width }
        }),
      )
      const [title, time, location, audience] = boxes
      const spansRow = width !== 768
      expect(title!.width > time!.width * 1.8).toBe(spansRow)
      expect(title!.y < time!.y).toBe(spansRow)
      expect(time!.y === location!.y).toBe(spansRow)
      expect(location!.y === audience!.y).toBe(width !== 375)
      measurements.push({ viewport: width, boxes })
    }
    await testInfo.attach('offline-grid-item', {
      contentType: 'application/json',
      body: JSON.stringify(measurements),
    })
  } finally {
    await reader.close()
  }
})

test('文字排版預設可經 Laravel 存檔重開，離線標題依裝置調整字級、行高與字距', async ({
  page,
  browser,
}, testInfo) => {
  const key = `typography-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-title')
  const toolbar = page.locator('.sigil-topbar')
  const inspector = page.locator('.sigil-inspector')
  const preset = inspector.getByRole('combobox', { name: '文字排版預設', exact: true })
  const tracking = inspector.getByRole('textbox', { name: '字距', exact: true })
  const title = canvasNode(page, original.id)
  await selectLayer(page, '活動標題', ['活動頁', '主視覺', '活動簡介'])
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  await inspector.getByRole('button', { name: '文字', exact: true }).click()
  await tracking.fill('var(--title-tracking)')
  await tracking.press('Enter')
  await expect(tracking).toHaveAttribute('aria-invalid', 'true')
  await expect(toolbar.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await tracking.press('Escape')
  await expect(tracking).toHaveValue('-0.04em')

  await preset.selectOption('display')
  await expect(title).toHaveCSS('font-weight', '700')
  await savePage(page, key)
  const desktop = {
    ...original.style,
    'font-size': 'clamp(2rem, 5vw, 4rem)',
    'line-height': '1.1',
    'font-weight': '700',
    'letter-spacing': '-0.035em',
  }
  const first = await storedPage(page, key)
  expect(first.revision).toBe(2)
  expect(documentNode(first.doc, original.id)).toEqual({ ...original, style: desktop })
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await preset.selectOption('body')
  await tracking.fill('0.05em')
  await tracking.press('Enter')
  await expect(title).toHaveCSS('font-size', '16px')
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(3)
  expect(documentNode(saved.doc, original.id)).toEqual({
    ...original,
    style: desktop,
    responsiveStyles: {
      mobile: {
        'font-size': '1rem',
        'line-height': '1.6',
        'font-weight': '400',
        'letter-spacing': '0.05em',
      },
    },
  })

  await page.reload()
  await expect(title).toHaveCSS('font-weight', '700')
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(title).toHaveCSS('font-weight', '400')
  await expect(title).toHaveText(original.content!)
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('typography.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const heading = exported.getByRole('heading', {
      level: 1,
      name: original.content!,
      exact: true,
    })
    const measurements = []
    for (const width of [1280, 768, 481, 480, 375]) {
      await exported.setViewportSize({ width, height: 812 })
      const mobile = width <= 480
      const expectedSize = mobile ? 16 : Math.max(32, Math.min(width * 0.05, 64))
      await expect(heading).toHaveCSS('font-weight', mobile ? '400' : '700')
      const metrics = await heading.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
          letterSpacing: parseFloat(style.letterSpacing),
          weight: style.fontWeight,
        }
      })
      expect(metrics.fontSize).toBeCloseTo(expectedSize, 1)
      expect(metrics.lineHeight).toBeCloseTo(expectedSize * (mobile ? 1.6 : 1.1), 1)
      expect(metrics.letterSpacing).toBeCloseTo(expectedSize * (mobile ? 0.05 : -0.035), 1)
      measurements.push({ width, ...metrics })
    }
    await testInfo.attach('offline-typography', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
})

test('將活動時間改為第三級標題，Laravel 重開後保留層級與離線頁面結構', async ({
  page,
  browser,
}, testInfo) => {
  const key = `heading-format-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-info')
  const time = original.children!.find((node) => node.name === '活動時間')!
  const headingName = time.content!
  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const thirdLevel = frame.getByRole('heading', { name: headingName, level: 3, exact: true })
  await selectLayer(page, '活動時間', ['活動頁', '活動資訊'])
  const format = page.getByRole('combobox', { name: '文字格式', exact: true })
  await expect(format).toHaveValue('span')
  await expect(thirdLevel).toHaveCount(0)
  await format.focus()
  await format.selectOption('h3')
  await expect(format).toBeFocused()
  await expect(thirdLevel).toHaveAttribute('data-sigil-id', time.id)
  await expect(thirdLevel).toHaveAttribute('data-sigil-selected', '1')
  await expect(frame.getByRole('heading', { name: '活動資訊', level: 2 })).toBeVisible()

  await savePage(page, key)
  const stored = await storedPage(page, key)
  expect(stored.revision).toBe(2)
  expect(documentNode(stored.doc, original.id)).toEqual({
    ...original,
    children: original.children!.map((node) =>
      node.id === time.id ? { ...node, tagName: 'h3' } : node,
    ),
  })
  await page.reload()
  await expect(thirdLevel).toBeVisible()
  await page.getByRole('button', { name: '標題大綱', exact: true }).click()
  const search = page.getByRole('searchbox', { name: '搜尋標題', exact: true })
  await search.fill(headingName)
  await page.getByRole('button', { name: `H3 ${headingName}`, exact: true }).click()
  await expect(thirdLevel).toHaveAttribute('data-sigil-selected', '1')
  await expect(format).toHaveValue('h3')
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  const toolbar = page.locator('.sigil-topbar')
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('activity-headings.html')
  await (await download).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await exported.getByRole('link', { name: '查看活動資訊' }).click()
    const info = exported.locator('#event-info:target')
    await expect(info.getByRole('heading', { level: 2, name: '活動資訊' })).toBeVisible()
    await expect(
      info.getByRole('heading', { level: 3, name: headingName, exact: true }),
    ).toBeVisible()
    await expect(info.locator(':scope > *')).toHaveText(
      original.children!.map((node) => node.content!),
    )
  } finally {
    await reader.close()
  }
})

test('頁面色票與手機半透明背景可經 Laravel 保存並離線顯示', async ({ page, browser }, testInfo) => {
  const key = `page-colors-${testInfo.project.name}`
  await createActivity(page, key)
  const original = documentNode((await storedPage(page, key)).doc, 'activity-info')
  const info = canvasNode(page, 'activity-info')
  const toolbar = page.locator('.sigil-topbar')
  const settings = page.locator('.sigil-inspector')
  await selectLayer(page, '活動資訊', ['活動頁'])
  await settings.getByRole('tab', { name: '樣式', exact: true }).click()
  await settings.getByRole('button', { name: '文字', exact: true }).click()
  const textColor = settings.locator('[data-color-property="color"]')
  const value = textColor.getByRole('textbox', { name: '文字顏色', exact: true })
  await value.fill('var(--brand)')
  await value.press('Enter')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await expect(textColor.getByText('此編輯器無法儲存這個色值')).toBeVisible()
  await expect(toolbar.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await value.press('Escape')
  await textColor.getByRole('button', { name: '頁面色票' }).click()
  await textColor.getByRole('button', { name: '#243e83', exact: true }).click()
  await expect(info).toHaveCSS('color', 'rgb(36, 62, 131)')
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await settings.getByRole('button', { name: '外觀', exact: true }).click()
  const background = settings.getByRole('textbox', { name: '背景顏色', exact: true })
  await expect(background).toHaveValue('#eef2f8')
  const tint = 'rgba(52, 128, 92, 0.5)'
  await background.fill(tint)
  await background.press('Enter')
  await expect(info).toHaveCSS('background-color', tint)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-info')).toEqual({
    ...original,
    style: { ...original.style, color: '#243e83' },
    responsiveStyles: { mobile: { 'background-color': tint } },
  })
  await page.reload()
  await expect(info).toHaveCSS('color', 'rgb(36, 62, 131)')
  await toolbar.getByRole('button', { name: '手機', exact: true }).click()
  await expect(info).toHaveCSS('background-color', tint)
  await toolbar.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('page-colors.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const section = exported.locator('#event-info')
    for (const [width, color] of [
      [481, 'rgb(238, 242, 248)'],
      [480, tint],
    ] as const) {
      await exported.setViewportSize({ width, height: 812 })
      await expect(section).toHaveCSS('background-color', color)
      await expect(section).toHaveCSS('color', 'rgb(36, 62, 131)')
    }
  } finally {
    await reader.close()
  }
})

test('跨裝置套用樣式可經 Laravel 保存，下載頁依寬度顯示結果', async ({
  page,
  browser,
}, testInfo) => {
  const key = `styles-${testInfo.project.name}`
  await createActivity(page, key)
  const initial = documentNode((await storedPage(page, key)).doc, 'activity-info')
  const tools = page.locator('.sigil-topbar')
  const styles = page.locator('.sigil-inspector')
  await selectLayer(page, '主視覺', ['活動頁'])
  await tools.getByRole('button', { name: '手機', exact: true }).click()
  await styles.getByRole('tab', { name: '樣式', exact: true }).click()
  await styles.getByRole('button', { name: '複製樣式' }).click()
  await tools.getByRole('button', { name: '平板', exact: true }).click()
  await selectLayer(page, '活動資訊', ['活動頁'])
  await styles.getByRole('button', { name: '套用樣式' }).click()
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-info')).toEqual({
    ...initial,
    responsiveStyles: {
      tablet: {
        'grid-template-columns': 'minmax(0, 1fr)',
        background: '#f8f4eb',
        overflow: 'hidden',
      },
    },
  })

  await page.reload()
  await tools.getByRole('button', { name: '匯出', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('styled-activity.html')
  await (await download).saveAs(file)
  const reader = await browser.newContext({ viewport: { width: 1024, height: 800 } })
  try {
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const info = exported.locator('#event-info')
    await expect(info).toHaveCSS('background-color', 'rgb(238, 242, 248)')
    await exported.setViewportSize({ width: 720, height: 800 })
    await expect(info).toHaveCSS('background-color', 'rgb(248, 244, 235)')
    await expect(info).toHaveCSS('padding', '24px')
  } finally {
    await reader.close()
  }
})

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

test('從匯出清單修正頁內連結，Laravel 重開與離線下載都能跳到目的區段', async ({
  page,
  browser,
}, testInfo) => {
  const key = `review-links-${testInfo.project.name}`
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const cta = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('link', { name: '查看活動資訊' })
  const id = (await cta.getAttribute('data-sigil-id'))!
  const initial = documentNode((await storedPage(page, key)).doc, id)
  const inspector = page.locator('.sigil-inspector')
  const address = inspector.getByRole('textbox', { name: '連結網址', exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const dialog = page.getByRole('dialog', { name: '匯出 HTML' })
  const filter = dialog.getByRole('button', { name: '只看待處理' })
  const download = dialog.getByRole('button', { name: '下載 .html' })
  const review = async () => {
    await page.getByRole('button', { name: '匯出', exact: true }).click()
    await dialog.locator('summary').filter({ hasText: '頁面連結' }).click()
    await filter.click()
  }

  await selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  await address.fill('#missing-workshop')
  await address.press('Enter')
  await expect(cta).toHaveAttribute('href', '#missing-workshop')
  expect(await (await savePage(page, key)).json()).toMatchObject({ revision: 2 })
  await page.reload()
  await expect(cta).toHaveAttribute('href', '#missing-workshop')
  await review()
  const issue = dialog.getByRole('button').filter({ hasText: '#missing-workshop' })
  await expect(issue).toContainText('找不到頁內目標')
  await expect(download).toBeEnabled()
  await issue.click()
  await expect(dialog).toHaveCount(0)
  await expect(address).toBeFocused()
  await expect(save).toBeDisabled()

  await inspector.getByRole('combobox', { name: '連到頁內區段' }).selectOption('activity-info')
  await expect(cta).toHaveAttribute('href', '#event-info')
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(3)
  expect(documentNode(saved.doc, id)).toEqual(initial)
  await page.reload()
  await expect(cta).toHaveAttribute('href', '#event-info')
  await review()
  await expect(dialog.getByText('沒有待處理的連結')).toBeVisible()
  await expect(save).toBeDisabled()
  const downloading = page.waitForEvent('download')
  await download.click()
  const file = testInfo.outputPath('reviewed-links.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await exported.getByRole('link', { name: '查看活動資訊' }).click()
    await expect(exported.locator('#event-info:target')).toContainText('城市創作空間')
  } finally {
    await reader.close()
  }
  expect(errors).toEqual([])
})

test('重新命名頁內錨點後，Laravel 與離線成品保留新名稱及連結', async ({
  page,
  browser,
}, testInfo) => {
  const key = `anchors-${testInfo.project.name}`
  await createActivity(page, key)
  const original = await storedPage(page, key)
  const info = documentNode(original.doc, 'activity-info')
  const cta = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('link', { name: '查看活動資訊' })
  const linkId = (await cta.getAttribute('data-sigil-id'))!
  const originalLink = documentNode(original.doc, linkId)
  await selectLayer(page, '活動資訊', ['活動頁'])
  const panel = page.locator('.sigil-inspector')
  await panel.getByRole('button', { name: '編輯頁內錨點' }).click()
  const field = panel.getByRole('textbox', { name: '錨點名稱', exact: true })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('event-info')
  const name = "工作坊-l'été"
  const fragment = '#' + encodeURIComponent(name).replaceAll("'", '%27')
  await field.fill(name)
  await field.press('Enter')
  await expect(cta).toHaveAttribute('href', fragment)
  await expect(canvasNode(page, 'activity-info')).toHaveAttribute('id', name)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, 'activity-info')).toEqual({
    ...info,
    attributes: { ...info.attributes, id: name },
  })
  expect(documentNode(saved.doc, linkId)).toEqual({
    ...originalLink,
    attributes: { ...originalLink.attributes, href: fragment },
  })
  await page.reload()
  await expect(cta).toHaveAttribute('href', fragment)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('renamed-anchor.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await exported.getByRole('link', { name: '查看活動資訊' }).click()
    await expect(exported.locator(':target')).toHaveAttribute('id', name)
    await expect(exported.locator(':target')).toContainText('城市創作空間')
    await expect(exported.locator('#event-info')).toHaveCount(0)
  } finally {
    await reader.close()
  }
})

test('移動元件經 Laravel 存檔重開後保留內容、順序與離線頁面連結', async ({
  page,
  browser,
}, testInfo) => {
  const key = `move-component-${testInfo.project.name}`
  await createActivity(page, key)
  const original = await storedPage(page, key)
  const hero = documentNode(original.doc, 'activity-hero')
  const intro = hero.children!.find((node) => node.name === '活動簡介')!
  const link = intro.children!.find((node) => node.name === '主要行動')!
  const faq = original.doc.root.children!.find((node) => node.name === '常見問題')!
  await selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  await page.getByRole('button', { name: '移動元件', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '移動元件' })
  await dialog.getByRole('searchbox', { name: '搜尋目的地' }).fill('常見問題')
  await dialog.getByLabel('目的地', { exact: true }).selectOption(faq.id)
  await dialog.getByLabel('插入位置').selectOption('before')
  await dialog.getByLabel('放在這個元件之前').selectOption({ label: '工具問題' })
  await dialog.getByRole('button', { name: '移動', exact: true }).click()
  const movedLink = canvasNode(page, faq.id).getByRole('link', { name: '查看活動資訊' })
  await expect(movedLink).toHaveAttribute('data-sigil-id', link.id)
  await expect(canvasNode(page, intro.id).getByRole('link')).toHaveCount(0)
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(2)
  expect(documentNode(saved.doc, intro.id).children).toEqual(
    intro.children!.filter((n) => n.id !== link.id),
  )
  expect(documentNode(saved.doc, faq.id).children).toEqual([
    faq.children![0],
    link,
    ...faq.children!.slice(1),
  ])
  await page.reload()
  await expect(movedLink).toHaveAttribute('href', '#event-info')
  await selectLayer(page, '主要行動', ['活動頁', '常見問題'])
  const path = page.getByRole('navigation', { name: '元件路徑' })
  await expect(path.locator('[aria-current="location"]')).toHaveText('主要行動')
  await expect(path.getByRole('button')).toHaveText(['活動頁', '常見問題'])
  await path.getByRole('button', { name: '常見問題', exact: true }).press('Enter')
  await expect(canvasNode(page, faq.id)).toHaveAttribute('data-sigil-selected', '1')
  await expect(page.getByRole('treeitem', { name: '常見問題', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '復原', exact: true })).toBeDisabled()
  expect(await storedPage(page, key)).toEqual(saved)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).click()
  const file = testInfo.outputPath('moved-component.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await expect(exported.getByRole('link', { name: '查看活動資訊' })).toHaveCount(1)
    await expect(exported.getByRole('navigation', { name: '元件路徑' })).toHaveCount(0)
    const exportedLink = exported.locator('h2 + a:has(+ h3)').filter({ hasText: '查看活動資訊' })
    await expect(exportedLink).toBeVisible()
    await exportedLink.click()
    await expect(exported.locator(':target')).toHaveAttribute('id', 'event-info')
  } finally {
    await reader.close()
  }
})

test('從畫布改寫活動按鈕文字，Laravel 重開與離線 HTML 仍能跳到活動資訊', async ({
  page,
  browser,
}, testInfo) => {
  const key = 'inline-workshop-cta'
  const label = '查看場次與報名'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const canvas = page.frameLocator('iframe[title="編輯畫布"]')
  const original = canvas.getByRole('link', { name: '查看活動資訊', exact: true })
  const id = (await original.getAttribute('data-sigil-id'))!
  const before = await storedPage(page, key)
  await selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  const edit = page
    .getByRole('toolbar', { name: '元件操作', exact: true })
    .getByRole('button', { name: '編輯文字', exact: true })
  await edit.press('Enter')
  const input = canvas.getByRole('textbox', { name: '主要行動', exact: true })
  await expect(input).toBeFocused()
  await page.keyboard.insertText(label)
  await expect(input).toHaveText(label)
  await page.keyboard.press('Tab')
  const done = page
    .getByRole('group', { name: '正在編輯文字' })
    .getByRole('button', { name: '完成編輯' })
  await expect(done).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(edit).toBeFocused()
  const saved = await savePage(page, key)
  const stored = await storedPage(page, key)
  expect(stored.revision).toBe(before.revision + 1)
  expect(documentNode(stored.doc, id)).toEqual({ ...documentNode(before.doc, id), content: label })
  await page.reload()
  const reopened = canvas.getByRole('link', { name: label, exact: true })
  await expect(reopened).toHaveAttribute('href', '#event-info')
  await expect(reopened).not.toHaveAttribute('contenteditable', 'true')
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('inline-workshop.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block', javaScriptEnabled: false })
  const outgoing: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      outgoing.push(route.request().url())
      return route.abort()
    })
    const offline = await reader.newPage()
    await offline.goto(pathToFileURL(file).href)
    const cta = offline.getByRole('link', { name: label, exact: true })
    await expect(cta).toHaveCount(1)
    await expect(cta).toHaveAttribute('href', '#event-info')
    await expect(
      offline.locator(
        '[contenteditable], [enterkeyhint], [data-sigil-id], [role="textbox"], .sigil-inline-edit-controls',
      ),
    ).toHaveCount(0)
    await expect(cta.locator('span')).toHaveCount(0)
    await cta.click()
    await expect(offline).toHaveURL(pathToFileURL(file).href + '#event-info')
    await expect(offline.locator('#event-info')).toBeInViewport()
    expect(outgoing).toEqual([])
    expect(errors).toEqual([])
    await testInfo.attach('inline-laravel', {
      body: JSON.stringify({
        initialRevision: before.revision,
        savedRevision: stored.revision,
        putStatus: saved.status(),
        label: await cta.innerText(),
        href: await cta.getAttribute('href'),
        offlineFragment: new URL(offline.url()).hash,
        outgoingRequests: outgoing.length,
      }),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
})

test('從畫布改段落開頭可保存子連結，Laravel 重開與離線頁保留內容順序', async ({
  page,
  browser,
}, info) => {
  const key = 'workshop-leading-text'
  const revised = '預約名額前，請先閱讀'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content')
  const original = workshopRegistration()
  const seed = await page.request.put('/sigil/pages/' + key, {
    headers: { 'X-CSRF-TOKEN': csrf! },
    data: { baseRevision: 1, doc: original },
  })
  expect(seed.status()).toBe(200)
  await page.reload()
  await selectLayer(page, '報名說明', ['工作坊'])
  const entry = page
    .getByRole('toolbar', { name: '元件操作', exact: true })
    .getByRole('button', { name: '編輯開頭文字', exact: true })
  await entry.press('Enter')
  const field = page.getByRole('textbox', { name: '開頭文字', exact: true })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('報名前請閱讀')
  await field.fill(revised)
  const paragraph = canvasNode(page, 'instructions')
  const link = paragraph.getByRole('link', { name: '參加須知', exact: true })
  await expect(link).toHaveAttribute('href', '#terms')
  await expect(paragraph.locator('strong')).toHaveText('（週五截止）')
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(3)
  expect(documentNode(saved.doc, 'instructions')).toEqual({
    ...documentNode(original, 'instructions'),
    content: revised,
  })
  await page.reload()
  await expect(paragraph).toHaveText(revised + '參加須知（週五截止）')
  await expect(link).toHaveAttribute('href', '#terms')
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = info.outputPath('registration-instructions.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block', javaScriptEnabled: false })
  const outgoing: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      outgoing.push(route.request().url())
      return route.abort()
    })
    const offline = await reader.newPage()
    await offline.goto(pathToFileURL(file).href)
    const exported = offline
      .locator('p')
      .filter({ has: offline.getByRole('link', { name: '參加須知', exact: true }) })
    const nodes = await exported.evaluate((el) =>
      Array.from(el.childNodes, (n) => ({ tag: n.nodeName, text: n.textContent })),
    )
    expect(nodes).toEqual([
      { tag: '#text', text: revised },
      { tag: 'A', text: '參加須知' },
      { tag: 'STRONG', text: '（週五截止）' },
    ])
    const target = exported.getByRole('link', { name: '參加須知', exact: true })
    await expect(target).toHaveAttribute('href', '#terms')
    await target.click()
    await expect(offline).toHaveURL(pathToFileURL(file).href + '#terms')
    await expect(offline.locator('#terms')).toBeInViewport()
    expect(outgoing).toEqual([])
    expect(errors).toEqual([])
    await info.attach('offline-leading-text', {
      body: JSON.stringify({
        revision: saved.revision,
        nodes,
        href: await target.getAttribute('href'),
        offlineFragment: new URL(offline.url()).hash,
        externalRequests: outgoing.length,
      }),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
})

test('聯絡連結可經 Laravel 存檔重開，匯出後依設定開啟報名分頁', async ({
  page,
  browser,
}, testInfo) => {
  const key = `link-kinds-${testInfo.project.name}`
  const panel = page.locator('.sigil-inspector')
  const kind = panel.getByRole('combobox', { name: '連結類型', exact: true })
  const link = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('link', { name: '查看活動資訊' })
  const selectCTA = () => selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  await createActivity(page, key)
  await selectCTA()
  const id = (await link.getAttribute('data-sigil-id'))!
  await panel.getByRole('checkbox', { name: '在新分頁開啟' }).check()
  for (const contact of [
    {
      kind: 'email',
      label: '電子郵件地址',
      input: 'workshop+info@example.test',
      saved: 'mailto:workshop+info@example.test',
    },
    { kind: 'tel', label: '電話號碼', input: '+886 (2) 2345-6789', saved: 'tel:+886223456789' },
  ]) {
    await kind.selectOption(contact.kind)
    const field = panel.getByRole('textbox', { name: contact.label, exact: true })
    await field.fill(contact.input)
    await field.press('Enter')
    await expect(link).toHaveAttribute('href', contact.saved)
    await savePage(page, key)
    expect(documentNode((await storedPage(page, key)).doc, id).attributes).toMatchObject({
      href: contact.saved,
      target: '_self',
    })
    await page.reload()
    await selectCTA()
    await expect(kind).toHaveValue(contact.kind)
    await expect(field).toHaveValue(contact.saved.slice(contact.saved.indexOf(':') + 1))
  }

  const registration = new URL('/registration', page.url()).href
  await kind.selectOption('url')
  await panel.getByRole('textbox', { name: '連結網址', exact: true }).fill(registration)
  await panel.getByRole('button', { name: '套用', exact: true }).click()
  await panel.getByRole('checkbox', { name: '在新分頁開啟' }).check()
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(4)
  expect(documentNode(saved.doc, id).attributes).toMatchObject({
    href: registration,
    target: '_blank',
    rel: 'noopener',
  })
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = testInfo.outputPath('registration-link.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block' })
  try {
    await reader.route(registration, (route) =>
      route.fulfill({ contentType: 'text/plain', body: 'Registration' }),
    )
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const opened = reader.waitForEvent('page')
    await exported.getByRole('link', { name: '查看活動資訊' }).click()
    const tab = await opened
    await expect(tab).toHaveURL(registration)
    await expect(tab.locator('body')).toContainText('Registration')
    expect(await tab.evaluate(() => window.opener === null)).toBe(true)
    await expect(exported).toHaveURL(pathToFileURL(file).href)
  } finally {
    await reader.close()
  }
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

  test('手機從搜尋結果改圖層名稱與標題，返回後可繼續搜尋並保存', async ({ page }, testInfo) => {
    const key = `panel-search-${testInfo.project.name}`
    await createActivity(page, key)
    const toggle = page.getByRole('button', { name: '圖層／設定', exact: true })
    await toggle.tap()
    const panel = page.locator('[data-compact-panel="settings"]')
    const search = panel.getByRole('searchbox', { name: '搜尋圖層' })
    await search.fill('活動標題')
    const result = panel.locator('[data-layer-result="activity-title"]')
    await result.tap()
    await expect(panel.getByRole('tab', { name: '內容', exact: true })).toBeFocused()
    const original = await storedPage(page, key)
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
    await panel.getByRole('tab', { name: '進階', exact: true }).tap()
    const name = '工作坊主標'
    const dialog = page.waitForEvent('dialog').then(async (dialog) => {
      const oldName = dialog.defaultValue()
      await dialog.accept(name)
      return oldName
    })
    await panel.getByRole('button', { name: '重新命名圖層' }).tap()
    expect(await dialog).toBe('活動標題')
    await expect(panel.locator('.sigil-inspector-head')).toHaveText(name)
    await panel.getByRole('tab', { name: '內容', exact: true }).tap()
    const title = '冬日版畫工作坊'
    await panel.getByRole('textbox', { name: '內容', exact: true }).fill(title)
    await panel.getByRole('button', { name: '圖層', exact: true }).tap()
    await expect(search).toHaveValue('活動標題')
    await expect(search).toBeFocused()
    await expect(panel.getByText('找不到符合的圖層', { exact: true })).toBeVisible()
    await search.fill(name)
    await expect(result).toBeVisible()
    await result.tap()
    await expect(panel.getByRole('textbox', { name: '內容', exact: true })).toHaveValue(title)
    await panel.getByRole('button', { name: '關閉面板' }).tap()
    await expect(toggle).toBeFocused()
    expect((await storedPage(page, key)).revision).toBe(original.revision)
    await savePage(page, key)
    const saved = await storedPage(page, key)
    expect(saved.revision).toBe(original.revision + 1)
    expect(documentNode(saved.doc, 'activity-title')).toEqual({
      ...documentNode(original.doc, 'activity-title'),
      name,
      content: title,
    })
    await page.reload()
    await expect(canvasNode(page, 'activity-title')).toHaveText(title)
    await toggle.tap()
    await expect(panel.getByRole('treeitem', { name, exact: true })).toBeVisible()
  })

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

test('從編輯歷程選擇版本，Laravel 重開與離線檔只保留確認的內容和樣式', async ({
  page,
  browser,
}, info) => {
  const key = 'history-workshop'
  const retainedTitle = '冬季版畫工作坊加開場'
  const discardedLabel = '暫定報名按鈕'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const before = await storedPage(page, key)
  const history = page.getByRole('button', { name: '編輯歷程', exact: true })
  const dialog = page.getByRole('dialog', { name: '編輯歷程', exact: true })
  const inspector = page.locator('.sigil-inspector')
  const section = canvasNode(page, 'activity-info')
  const originalColor = await section.evaluate((el) => getComputedStyle(el).color)
  await editTitle(page, retainedTitle)
  await history.press('Enter')
  await expect(dialog.getByRole('option', { name: new RegExp(retainedTitle) })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await page.keyboard.press('Escape')

  await selectLayer(page, '主要行動', ['活動頁', '主視覺', '活動簡介'])
  const cta = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('link', { name: '查看活動資訊', exact: true })
  const ctaId = (await cta.getAttribute('data-sigil-id'))!
  await inspector.getByRole('textbox', { name: '內容', exact: true }).fill(discardedLabel)
  await expect(canvasNode(page, ctaId)).toHaveText(discardedLabel)
  await selectLayer(page, '活動資訊', ['活動頁'])
  await inspector.getByRole('tab', { name: '樣式', exact: true }).click()
  await inspector.getByRole('button', { name: '文字', exact: true }).click()
  const color = inspector.getByRole('textbox', { name: '文字顏色', exact: true })
  await color.fill('#943378')
  await color.press('Enter')
  await expect(section).toHaveCSS('color', 'rgb(148, 51, 120)')

  await history.press('Enter')
  await expect(dialog.getByRole('option')).toHaveCount(4)
  const stepsBeforeJump = await dialog.getByRole('option').allTextContents()
  const retainedStep = dialog.getByRole('option', { name: new RegExp(retainedTitle) })
  await expect(retainedStep).not.toContainText('已儲存')
  await retainedStep.click()
  await expect(canvasNode(page, ctaId)).toHaveText(discardedLabel)
  await expect(section).toHaveCSS('color', 'rgb(148, 51, 120)')
  await dialog.getByRole('button', { name: '回到這一步', exact: true }).press('Enter')
  await expect(history).toBeFocused()
  await expect(cta).toBeVisible()
  await expect(section).toHaveCSS('color', originalColor)
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeEnabled()
  await savePage(page, key)
  const saved = await storedPage(page, key)
  expect(saved.revision).toBe(before.revision + 1)
  const expected = structuredClone(before.doc)
  documentNode(expected, 'activity-title').content = retainedTitle
  expect(saved.doc).toEqual(expected)

  await history.press('Enter')
  await expect(retainedStep).toContainText('已儲存')
  await expect(retainedStep).toHaveAttribute('aria-current', 'step')
  const savedStepLabel = await retainedStep.innerText()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(canvasNode(page, 'activity-title')).toHaveText(retainedTitle)
  await expect(cta).toBeVisible()
  await expect(section).toHaveCSS('color', originalColor)
  await history.press('Enter')
  await expect(dialog.getByRole('option')).toHaveCount(1)
  await expect(dialog.getByRole('option', { name: /開啟文件/ })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '復原', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = info.outputPath('history-workshop.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  const outgoing: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      outgoing.push(route.request().url())
      return route.abort()
    })
    const offline = await reader.newPage()
    await offline.goto(pathToFileURL(file).href)
    await expect(offline.getByRole('heading', { name: retainedTitle, exact: true })).toBeVisible()
    await expect(offline.getByRole('link', { name: '查看活動資訊', exact: true })).toHaveAttribute(
      'href',
      '#event-info',
    )
    await expect(offline.getByText(discardedLabel, { exact: true })).toHaveCount(0)
    await expect(offline.locator('#event-info')).toHaveCSS('color', originalColor)
    await expect(offline.locator('[data-history-id], [data-sigil-id]')).toHaveCount(0)
    expect(outgoing).toEqual([])
    expect(errors).toEqual([])
    await info.attach('stored-history', {
      contentType: 'application/json',
      body: JSON.stringify({
        revision: saved.revision,
        retainedTitle,
        originalColor,
        stepsBeforeJump,
        savedStepLabel,
        stepsAfterReload: 1,
        outgoingRequests: outgoing.length,
      }),
    })
  } finally {
    await reader.close()
  }
})

test('尋找與取代活動文案，Laravel 重開與離線下載保留原連結、樣式和照片', async ({
  page,
  browser,
}, info) => {
  const key = 'workshop-page-text'
  const errors = recordRuntimeErrors(page, key)
  await createActivity(page, key)
  const before = await storedPage(page, key)
  const original = '活動資訊',
    replacement = '工作坊場次'
  const canvas = page.frameLocator('iframe[title="編輯畫布"]')
  const link = canvas.getByRole('link', { name: '查看' + original, exact: true })
  const heading = canvas.getByRole('heading', { name: original, level: 2, exact: true })
  const linkId = (await link.getAttribute('data-sigil-id'))!
  const headingId = (await heading.getAttribute('data-sigil-id'))!
  const href = (await link.getAttribute('href'))!
  const background = await link.evaluate((el) => getComputedStyle(el).backgroundColor)
  const headingSize = await heading.evaluate((el) => getComputedStyle(el).fontSize)
  const imageAlt = documentNode(before.doc, 'activity-image').attributes!.alt!
  const revisedLink = canvas.getByRole('link', { name: '查看' + replacement, exact: true })
  const revisedHeading = canvas.getByRole('heading', { name: replacement, level: 2, exact: true })
  const open = page.getByRole('button', { name: '尋找與取代', exact: true })
  await open.press('Enter')
  const dialog = page.getByRole('dialog', { name: '尋找與取代', exact: true })
  await dialog.getByRole('searchbox', { name: '尋找文字', exact: true }).fill(original)
  await expect(dialog.getByRole('option')).toHaveCount(2)
  await dialog.getByRole('textbox', { name: '取代為', exact: true }).fill(replacement)
  await dialog.getByRole('button', { name: '全部取代', exact: true }).press('Enter')
  const confirm = dialog.getByRole('button', { name: '確認取代 2 處', exact: true })
  await expect(confirm).toBeVisible()
  await expect(link).toHaveCount(1)
  await expect(heading).toHaveCount(1)
  await confirm.press('Enter')
  await expect(revisedHeading).toHaveAttribute('data-sigil-id', headingId)
  await expect(revisedLink).toHaveAttribute('data-sigil-id', linkId)
  await page.keyboard.press('Escape')
  const undo = page.getByRole('button', { name: '復原', exact: true })
  await undo.press('Enter')
  await expect(link).toHaveCount(1)
  await expect(heading).toHaveCount(1)
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await savePage(page, key)
  const stored = await storedPage(page, key)
  const expected = structuredClone(before.doc)
  documentNode(expected, headingId).content = replacement
  documentNode(expected, linkId).content = '查看' + replacement
  expect(stored.revision).toBe(before.revision + 1)
  expect(stored.doc).toEqual(expected)
  await page.reload()
  await expect(revisedHeading).toHaveCSS('font-size', headingSize)
  await expect(revisedLink).toHaveAttribute('href', href)
  await expect(revisedLink).toHaveCSS('background-color', background)
  await expect(undo).toBeDisabled()

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  const file = info.outputPath('page-text-workshop.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  const requests: string[] = []
  try {
    await reader.route(/^https?:/, (route) => {
      requests.push(route.request().url())
      return route.abort()
    })
    const offline = await reader.newPage()
    await offline.goto(pathToFileURL(file).href)
    const offlineLink = offline.getByRole('link', { name: '查看' + replacement, exact: true })
    await expect(offlineLink).toHaveAttribute('href', href)
    await expect(offlineLink).toHaveCSS('background-color', background)
    await expect(
      offline.getByRole('heading', { name: replacement, level: 2, exact: true }),
    ).toHaveCSS('font-size', headingSize)
    await expect(offline.getByText(original, { exact: true })).toHaveCount(0)
    const image = offline.getByRole('img', { name: imageAlt, exact: true })
    await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/)
    const photo = await readWorkshopPhoto(image)
    await expect(offline.locator('script,[data-sigil-id]')).toHaveCount(0)
    await offlineLink.click()
    await expect(offline.locator(':target')).toHaveAttribute('id', href.slice(1))
    expect(requests).toEqual([])
    expect(errors).toEqual([])
    await info.attach('page-text-laravel', {
      contentType: 'application/json',
      body: JSON.stringify({
        revision: stored.revision,
        updatedNodeIds: [headingId, linkId],
        heading: replacement,
        link: await offlineLink.innerText(),
        href,
        headingSize,
        background,
        imageAlt,
        photo,
        offlineFragment: new URL(offline.url()).hash,
        outgoingRequests: requests.length,
      }),
    })
  } finally {
    await reader.close()
  }
})
