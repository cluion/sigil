import { expect, test, type Page } from '@playwright/test'
import { enforcedPolicy } from './security-policy'

interface RecordedViolation {
  blockedURI: string
  disposition: SecurityPolicyViolationEvent['disposition']
  effectiveDirective: string
  sample: string
}

async function enableViolationRecording(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: RecordedViolation[] = []
    Object.defineProperty(window, '__sigilCspViolations', {
      value: violations,
      configurable: false,
      writable: false,
    })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push({
        blockedURI: event.blockedURI,
        disposition: event.disposition,
        effectiveDirective: event.effectiveDirective,
        sample: event.sample,
      })
    })
  })
}

async function readViolations(page: Page): Promise<RecordedViolation[]> {
  const byFrame = await Promise.all(
    page.frames().map((frame) =>
      frame.evaluate(
        () =>
          (
            window as unknown as {
              __sigilCspViolations?: RecordedViolation[]
            }
          ).__sigilCspViolations ?? [],
      ),
    ),
  )
  return byFrame.flat()
}

test('CSP／Trusted Types enforcement：可信路徑可運作，raw sink 會被阻擋', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await enableViolationRecording(page)
  const response = await page.goto('/')
  expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)

  await expect(page.locator('.sigil-app')).toBeVisible()
  expect(await readViolations(page)).toEqual([])
  expect(runtimeErrors).toEqual([])

  const canvas = page.frameLocator('.sigil-canvas-iframe')
  await expect(canvas.locator('[data-sigil-id="rich-demo"] strong')).toHaveText('粗體')
  await expect(canvas.locator('[data-ref="title"]')).toHaveText('提示框')

  // createApp() 再次掛載時必須重用同 realm、同名稱的 Trusted Types policies。
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Insert 文字', exact: true })).toBeVisible()
  expect(await readViolations(page)).toEqual([])
  expect(runtimeErrors).toEqual([])
  await expect(canvas.locator('[data-sigil-id="rich-demo"] strong')).toHaveText('粗體')

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Export HTML', exact: true })).toBeVisible()
  expect(await readViolations(page)).toEqual([])
  expect(runtimeErrors).toEqual([])
  await page.keyboard.press('Escape')

  const rawSinkResult = await page.evaluate(() => {
    const target = document.createElement('div')
    try {
      // eslint-disable-next-line no-restricted-syntax -- 負向測試需證明 enforcement 會阻擋 raw sink。
      target.innerHTML = '<img src=x onerror=alert(1)>'
      return { blocked: false, errorName: null }
    } catch (error) {
      return {
        blocked: error instanceof TypeError,
        errorName: error instanceof Error ? error.name : String(error),
      }
    }
  })

  expect(rawSinkResult).toEqual({ blocked: true, errorName: 'TypeError' })
  await expect
    .poll(async () =>
      (await readViolations(page)).filter(
        (violation) =>
          violation.disposition === 'enforce' &&
          violation.effectiveDirective === 'require-trusted-types-for',
      ),
    )
    .toHaveLength(1)
})
