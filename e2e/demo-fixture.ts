import type { Page } from '@playwright/test'

const placeholderSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
    <rect width="200" height="120" fill="#e2e8f0" />
  </svg>
`

export async function prepareDemo(page: Page): Promise<string[]> {
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
