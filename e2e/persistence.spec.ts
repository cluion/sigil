import { expect, test, type Page } from '@playwright/test'
import type { SigilDoc } from '@cluion/sigil-core'
import { enforcedPolicy } from './security-policy'

interface PersistenceApp {
  isDirty(): boolean
  isSaving(): boolean
  toJSON(): SigilDoc
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function recordRuntimeErrors(page: Page, expectedHTTPStatuses: number[]): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Chromium reports intentionally mocked HTTP errors as failed resources too.
    const status = message.text().match(/^Failed to load resource: .*status of (\d+)\b/)
    if (
      message.location().url.endsWith('/__e2e/page') &&
      status &&
      expectedHTTPStatuses.includes(Number(status[1]))
    ) {
      return
    }
    errors.push(`console: ${message.text()}`)
  })
  return errors
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const app = (window as unknown as { __sigil: PersistenceApp }).__sigil
    return {
      dirty: app.isDirty(),
      saving: app.isSaving(),
      content: app.toJSON().root.children?.[0]?.content,
    }
  })
}

async function editTitle(page: Page, content: string): Promise<void> {
  await page.getByRole('treeitem', { name: '活動標題', exact: true }).click()
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
    .fill(content)
  await expect(
    page.frameLocator('iframe[title="編輯畫布"]').locator('[data-sigil-id="page-title"]'),
  ).toHaveText(content)
}

test('HTTP save：等待回應時的新編輯保留 dirty，第二次存檔後 reload 還原最新內容', async ({
  page,
}) => {
  const errors = recordRuntimeErrors(page, [404])
  const firstWrite = deferred()
  const writes: SigilDoc[] = []
  const persisted: { doc: SigilDoc | null } = { doc: null }
  let loads = 0
  await page.route('**/__e2e/page', async (route) => {
    if (route.request().method() === 'GET') {
      loads += 1
      await route.fulfill({
        status: persisted.doc ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(persisted.doc),
      })
      return
    }
    expect(route.request().method()).toBe('PUT')
    const doc = route.request().postDataJSON() as SigilDoc
    writes.push(doc)
    if (writes.length === 1) await firstWrite.promise
    persisted.doc = structuredClone(doc)
    await route.fulfill({ status: 204 })
  })

  try {
    const response = await page.goto('/fixtures/persistence.html')
    expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
    await expect(page.locator('.sigil-app')).toBeVisible()
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await expect(save).toBeDisabled()
    await editTitle(page, '第一次送出的標題')
    await save.click()
    await expect.poll(() => writes.length).toBe(1)
    await expect(save).toBeDisabled()
    await expect(page.locator('.sigil-status')).toContainText('儲存中…')
    expect(writes[0]?.root.children?.[0]?.content).toBe('第一次送出的標題')

    await editTitle(page, '等待存檔時的新標題')
    expect(await readState(page)).toEqual({
      dirty: true,
      saving: true,
      content: '等待存檔時的新標題',
    })
    firstWrite.resolve()
    await expect(page.locator('.sigil-status')).toContainText('仍有未儲存變更')
    await expect(save).toBeEnabled()
    expect(await readState(page)).toEqual({
      dirty: true,
      saving: false,
      content: '等待存檔時的新標題',
    })
    expect(persisted.doc?.root.children?.[0]?.content).toBe('第一次送出的標題')

    await save.click()
    await expect(save).toBeDisabled()
    await expect
      .poll(() => readState(page))
      .toEqual({
        dirty: false,
        saving: false,
        content: '等待存檔時的新標題',
      })
    expect(writes).toHaveLength(2)
    expect(persisted.doc?.root.children?.[0]?.content).toBe('等待存檔時的新標題')

    const reloaded = await page.reload()
    expect(await reloaded?.headerValue('content-security-policy')).toBe(enforcedPolicy)
    await expect(
      page.frameLocator('iframe[title="編輯畫布"]').locator('[data-sigil-id="page-title"]'),
    ).toHaveText('等待存檔時的新標題')
    expect(await readState(page)).toEqual({
      dirty: false,
      saving: false,
      content: '等待存檔時的新標題',
    })
    expect(loads).toBe(2)
    expect(writes).toHaveLength(2)
    expect(errors).toEqual([])
  } finally {
    firstWrite.resolve()
  }
})

test('HTTP 503：顯示存檔失敗、保留修改並可重試，沒有未處理的 rejection', async ({ page }) => {
  const errors = recordRuntimeErrors(page, [404, 503])
  const writes: SigilDoc[] = []
  const persisted: { doc: SigilDoc | null } = { doc: null }
  await page.route('**/__e2e/page', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: 'null' })
      return
    }
    expect(route.request().method()).toBe('PUT')
    const doc = route.request().postDataJSON() as SigilDoc
    writes.push(doc)
    if (writes.length === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    persisted.doc = structuredClone(doc)
    await route.fulfill({ status: 204 })
  })

  const response = await page.goto('/fixtures/persistence.html')
  expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
  await editTitle(page, '不能遺失的活動標題')
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await save.click()
  await expect(page.locator('.sigil-status')).toContainText('存檔失敗')
  await expect(save).toBeEnabled()
  expect(await readState(page)).toEqual({
    dirty: true,
    saving: false,
    content: '不能遺失的活動標題',
  })
  expect(persisted.doc).toBeNull()
  expect(writes).toHaveLength(1)

  await save.click()
  await expect(page.locator('.sigil-status')).toContainText('已寫入 ProjectStore')
  await expect(save).toBeDisabled()
  expect(await readState(page)).toEqual({
    dirty: false,
    saving: false,
    content: '不能遺失的活動標題',
  })
  expect(writes).toHaveLength(2)
  expect(writes[1]).toEqual(writes[0])
  expect(persisted.doc?.root.children?.[0]?.content).toBe('不能遺失的活動標題')
  expect(errors).toEqual([])
})
