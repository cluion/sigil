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

test('CSP／Trusted Types：可信路徑、sanitizer 與 raw sink 能力', async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await enableViolationRecording(page)
  const response = await page.goto('/')
  expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
  const capabilities = await page.evaluate(() => ({
    trustedTypes: typeof Reflect.get(globalThis, 'trustedTypes')?.createPolicy === 'function',
    nativeSanitizer: typeof Reflect.get(Element.prototype, 'setHTML') === 'function',
  }))
  testInfo.annotations.push({
    type: 'browser-runtime',
    description: JSON.stringify({
      engine: browserName,
      version: browser.version(),
      ...capabilities,
    }),
  })

  await expect(page.locator('.sigil-app')).toBeVisible()
  expect(await readViolations(page)).toEqual([])
  expect(runtimeErrors).toEqual([])

  const canvas = page.frameLocator('.sigil-canvas-iframe')
  await expect(canvas.locator('[data-sigil-id="rich-demo"] strong')).toHaveText('粗體')

  // Exercise the demo's stricter allowlist independently of core's native setHTML path.
  const sanitizerResult = await page.evaluate(async () => {
    const moduleUrl = '/rich-text.ts'
    const { sanitizeDemoRichText } = await import(moduleUrl)
    const input =
      '<p onclick="window.__compatXss = true"><strong>bold</strong><em>italic</em><br>' +
      '<a href="https://example.com/">web</a><a href="mailto:team@example.com">mail</a>' +
      '<a href="jav&#x61;script:window.__compatXss=true">unsafe</a>' +
      '<script>window.__compatXss=true</script><style>body{display:none}</style>' +
      '<iframe srcdoc="bad">frame</iframe><object>object</object><embed>' +
      '<svg><text>svg</text></svg><math><mi>math</mi></math></p>'
    return {
      first: sanitizeDemoRichText(input),
      second: sanitizeDemoRichText(input),
      defaultPolicy: Reflect.get(globalThis, 'trustedTypes')?.defaultPolicy ?? null,
    }
  })
  const allowedOutput =
    '<p><strong>bold</strong><em>italic</em><br><a href="https://example.com/">web</a>' +
    '<a href="mailto:team@example.com">mail</a><a>unsafe</a></p>'
  expect(sanitizerResult).toEqual({
    first: allowedOutput,
    second: allowedOutput,
    defaultPolicy: null,
  })
  await expect(canvas.locator('[data-ref="title"]')).toHaveText('提示框')

  // createApp() 再次掛載時必須重用同 realm、同名稱的 Trusted Types policies。
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Insert 文字', exact: true })).toBeVisible()
  expect(await readViolations(page)).toEqual([])
  expect(runtimeErrors).toEqual([])
  await expect(canvas.locator('[data-sigil-id="rich-demo"] strong')).toHaveText('粗體')

  // The sanitizer contract applies even when the engine cannot enforce Trusted Types.
  await page.evaluate(() => {
    const app = (
      window as unknown as {
        __sigil: { engine: { update: (id: string, patch: { content: string }) => void } }
      }
    ).__sigil
    app.engine.update('rich-demo', {
      content:
        '<p onclick="window.__compatXss = true"><strong>Safe content</strong>' +
        '<script>window.__compatXss = true</script>' +
        '<a href="javascript:window.__compatXss = true">Unsafe link</a></p>',
    })
  })
  const sanitized = canvas.locator('[data-sigil-id="rich-demo"]')
  await expect(sanitized.locator('strong')).toHaveText('Safe content')
  await expect(sanitized.locator('script, [onclick], a[href^="javascript:"]')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, '__compatXss'))).toBeUndefined()
  expect(
    await sanitized.evaluate((element) =>
      Reflect.get(element.ownerDocument.defaultView!, '__compatXss'),
    ),
  ).toBeUndefined()

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const exported = page.getByRole('dialog', { name: 'Export HTML', exact: true })
  await expect(exported).toBeVisible()
  await expect(exported.locator('textarea')).toHaveValue(/<strong>Safe content<\/strong>/)
  await expect(exported.locator('textarea')).not.toHaveValue(/<script|onclick|javascript:/)
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

  const evidence = {
    engine: browserName,
    version: browser.version(),
    ...capabilities,
    rawSink: rawSinkResult,
    protection: capabilities.trustedTypes ? 'trusted-types-enforcement' : 'sanitizer-fallback',
    sanitization: capabilities.nativeSanitizer ? 'native-setHTML' : 'injected-sanitizer',
  }
  testInfo.annotations.push({ type: 'browser-security', description: JSON.stringify(evidence) })
  await testInfo.attach('browser-security.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  })
  if (capabilities.trustedTypes) {
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

    // A fresh realm without the parser policy must fail closed, including on engines
    // that normally take the native sanitizer path. Never introduce a default policy.
    const probe = await page.context().newPage()
    try {
      await enableViolationRecording(probe)
      await probe.route('**/parser-policy-probe', (route) =>
        route.fulfill({
          contentType: 'text/html',
          headers: {
            'Content-Security-Policy': enforcedPolicy.replace(' sigil-demo#parse', ''),
          },
          body: '<!doctype html><title>Parser policy probe</title>',
        }),
      )
      await probe.goto('/parser-policy-probe')
      const refused = await probe.evaluate(async () => {
        Object.defineProperty(Element.prototype, 'setHTML', {
          value: undefined,
          configurable: true,
        })
        const moduleUrl = '/rich-text.ts'
        const { sanitizeDemoRichText } = await import(moduleUrl)
        try {
          sanitizeDemoRichText('<p>must not pass</p>')
          return { blocked: false, defaultPolicy: null }
        } catch (error) {
          return {
            blocked: error instanceof TypeError,
            defaultPolicy: Reflect.get(globalThis, 'trustedTypes')?.defaultPolicy ?? null,
          }
        }
      })
      expect(refused).toEqual({ blocked: true, defaultPolicy: null })
      await expect
        .poll(async () =>
          (await readViolations(probe)).filter(
            (violation) =>
              violation.disposition === 'enforce' &&
              violation.effectiveDirective === 'trusted-types',
          ),
        )
        .toHaveLength(1)
    } finally {
      await probe.close()
    }
  } else {
    // Unsupported directives cannot protect raw sinks; the safe rendering checks above still run.
    expect(rawSinkResult).toEqual({ blocked: false, errorName: null })
    expect(await readViolations(page)).toEqual([])
  }
})
