import { expect, test, type Locator, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { prepareDemo } from './demo-fixture'
import { readWorkshopPhoto } from './workshop-photo'

const frame = (page: Page) => page.frameLocator('iframe[title="編輯畫布"]')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const photo = (page: Page) => frame(page).locator('img[data-sigil-id="activity-image"]')
const linkedPhoto = (page: Page) =>
  frame(page).locator('a:has(> img[data-sigil-id="activity-image"])')

async function selectPhoto(page: Page, touch: boolean) {
  const image = photo(page)
  await image.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const rect = (await image.boundingBox())!
  const ibox = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
  const x = (Math.max(rect.x, ibox.x) + Math.min(rect.x + rect.width, ibox.x + ibox.width)) / 2
  const y = (Math.max(rect.y, ibox.y) + Math.min(rect.y + rect.height, ibox.y + ibox.height)) / 2
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(image).toHaveAttribute('data-sigil-selected', '1')
}

async function photoGeometry(image: Locator) {
  return image.evaluate((el) => {
    const doc = el.ownerDocument
    const origin = doc.querySelector('[data-sigil-id="activity-root"]')!.getBoundingClientRect()
    function bounds(target: Element) {
      const box = target.getBoundingClientRect()
      return {
        width: box.width,
        height: box.height,
        left: box.left - origin.left,
        top: box.top - origin.top,
      }
    }
    return {
      image: bounds(el),
      intro: bounds(doc.querySelector('[data-sigil-id="activity-title"]')!.parentElement!),
      next: bounds(doc.querySelector('[data-sigil-id="activity-info"]')!),
    }
  })
}

function expectSameLayout(
  before: Awaited<ReturnType<typeof photoGeometry>>,
  after: Awaited<ReturnType<typeof photoGeometry>>,
) {
  for (const node of ['image', 'intro', 'next'] as const) {
    for (const key of ['width', 'height', 'left', 'top'] as const) {
      expect(Math.abs(after[node][key] - before[node][key]), node + '.' + key).toBeLessThanOrEqual(
        1,
      )
    }
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
  { width: 375, height: 812 },
]) {
  const touch = viewport.width < 1000
  test.describe(`${viewport.width}px 圖片連結`, () => {
    test.use({ viewport, hasTouch: touch })
    test('為封面加上連結、修改或移除，復原保留原圖與區段目的地', async ({
      page,
      browser,
    }, info) => {
      const errors = await prepareDemo(page)
      await page.goto('/activity/')
      const image = photo(page)
      await image.evaluate((el) => (el as HTMLImageElement).decode())
      const src = await image.getAttribute('src')
      const alt = (await image.getAttribute('alt'))!
      const wrapper = linkedPhoto(page)
      const settings = page.locator('.sigil-inspector')
      const address = settings.getByRole('textbox', { name: '圖片連結', exact: true })
      const target = settings.getByRole('combobox', { name: '連到頁內區段', exact: true })
      const remove = settings.getByRole('button', { name: '移除圖片連結', exact: true })
      const save = button(page, '存檔')
      const undo = button(page, '復原')
      const redo = button(page, '重做')
      const more = button(page, '更多工具')
      const compact = await more.isVisible()
      const activate = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      if (touch) {
        if (compact) await more.tap()
        await activate(button(page, viewport.width === 375 ? '手機' : '平板'))
        if (compact) await more.tap()
      }
      async function openSettings() {
        await selectPhoto(page, touch)
        await activate(
          page
            .getByRole('toolbar', { name: '元件操作', exact: true })
            .getByRole('button', { name: '圖片連結', exact: true }),
        )
        await expect(address).toBeFocused()
      }
      async function closeSettings() {
        if (!compact) return
        await button(page, '關閉面板').tap()
        await expect(page.locator('[data-compact-panel="settings"]')).toBeHidden()
      }
      await openSettings()
      const before = await photoGeometry(image)
      await expect(address).toHaveValue('')
      await expect(wrapper).toHaveCount(0)
      await address.fill('https://')
      await address.press('Enter')
      await expect(address).toHaveAttribute('aria-invalid', 'true')
      await expect(save).toBeDisabled()
      await expect(wrapper).toHaveCount(0)
      const external = 'https://example.test/workshop'
      await address.fill(external)
      await expect(wrapper).toHaveCount(0)
      await expect(save).toBeDisabled()
      await address.press('Escape')
      await expect(address).toHaveValue('')
      await expect(wrapper).toHaveCount(0)
      await address.fill(external)
      await activate(
        settings
          .locator('.sigil-image-link-field')
          .getByRole('button', { name: '套用', exact: true }),
      )
      await expect(wrapper).toHaveAttribute('href', external)
      const wrapperId = await wrapper.getAttribute('data-sigil-id')
      expect(wrapperId).toBeTruthy()
      await expect(image).toHaveAttribute('alt', alt)
      await expect(image).toHaveAttribute('src', src!)
      const after = await photoGeometry(image)
      await info.attach('cover-layout', {
        body: JSON.stringify({ viewport, before, after }),
        contentType: 'application/json',
      })
      expectSameLayout(before, after)
      await closeSettings()
      if (compact) await more.tap()
      await activate(undo)
      await expect(wrapper).toHaveCount(0)
      await expect(image).toHaveCount(1)
      await expect(undo).toBeDisabled()
      await activate(redo)
      await expect(wrapper).toHaveAttribute('data-sigil-id', wrapperId!)
      if (compact) await more.tap()
      await openSettings()
      await expect(address).toHaveValue(external)
      if (!touch) {
        await settings.getByRole('checkbox', { name: '在新分頁開啟', exact: true }).check()
        await expect(wrapper).toHaveAttribute('target', '_blank')
        await expect(wrapper).toHaveAttribute('rel', /\bnoopener\b/)
      }
      await target.selectOption('activity-info')
      await expect(wrapper).toHaveAttribute('href', '#event-info')
      await expect(wrapper).not.toHaveAttribute('target', '_blank')
      await expect(wrapper).toHaveAttribute('data-sigil-id', wrapperId!)
      await expect(address).toHaveValue('#event-info')
      if (info.project.name === 'chromium') {
        await address.scrollIntoViewIfNeeded()
        if (compact) {
          await page.locator('[data-compact-panel="settings"]').evaluate(async (panel) => {
            await Promise.all(panel.getAnimations().map((animation) => animation.finished))
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            )
          })
        }
        await page.screenshot({
          path: info.outputPath(`image-link-${viewport.width}.png`),
          animations: 'disabled',
        })
      }
      await activate(remove)
      await expect(wrapper).toHaveCount(0)
      await expect(image).toHaveAttribute('alt', alt)
      const removed = await photoGeometry(image)
      expectSameLayout(before, removed)
      await closeSettings()
      if (compact) await more.tap()
      await activate(undo)
      await expect(wrapper).toHaveAttribute('href', '#event-info')
      await expect(wrapper).toHaveAttribute('data-sigil-id', wrapperId!)
      await activate(save)
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await page.reload()
      await expect(wrapper).toHaveAttribute('href', '#event-info')
      await expect(image).toHaveAttribute('src', src!)
      await expect(image).toHaveAttribute('alt', alt)
      await expect(image).toHaveJSProperty('naturalWidth', 1200)
      const outerUrl = page.url()
      await activate(button(page, '預覽'))
      await image.scrollIntoViewIfNeeded()
      const section = frame(page).locator('#event-info')
      const destinationScroll = await section.evaluate((el) => {
        const win = el.ownerDocument.defaultView!
        const scroll = el.ownerDocument.scrollingElement!
        return Math.min(
          scroll.scrollHeight - scroll.clientHeight,
          win.scrollY + el.getBoundingClientRect().top,
        )
      })
      if (touch) await image.tap()
      else await image.click()
      await expect(section).toBeInViewport()
      await expect
        .poll(() =>
          section.evaluate(
            (el, expected) => Math.abs(el.ownerDocument.defaultView!.scrollY - expected),
            destinationScroll,
          ),
        )
        .toBeLessThanOrEqual(1)
      expect(page.url()).toBe(outerUrl)
      expect(page.context().pages()).toHaveLength(1)
      await activate(button(page, '編輯'))
      if (!touch) {
        await activate(button(page, '匯出'))
        const downloading = page.waitForEvent('download')
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '下載 .html', exact: true })
          .click()
        const file = info.outputPath('linked-cover.html')
        await (await downloading).saveAs(file)
        const reader = await browser.newContext({
          javaScriptEnabled: false,
          serviceWorkers: 'block',
        })
        try {
          await reader.route(/^https?:/, (route) => route.abort())
          const offline = await reader.newPage()
          await offline.goto(pathToFileURL(file).href)
          const link = offline.getByRole('link', { name: alt, exact: true })
          await expect(link).toHaveAttribute('href', '#event-info')
          const decoded = await readWorkshopPhoto(link.getByRole('img', { name: alt, exact: true }))
          await offline.getByRole('link', { name: '查看活動資訊', exact: true }).focus()
          await offline.keyboard.press(
            info.project.name === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
          )
          await expect(link).toBeFocused()
          expect(await link.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
          const box = (await link.boundingBox())!
          expect(Math.min(box.width, box.height)).toBeGreaterThan(0)
          const focus = await link.evaluate((el) => {
            const style = getComputedStyle(el)
            return {
              style: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
              color: style.outlineColor,
            }
          })
          expect(focus.style).not.toBe('none')
          expect(focus.width).toBeGreaterThan(0)
          await info.attach('keyboard-focus', {
            body: JSON.stringify({ box, focus, decoded }),
            contentType: 'application/json',
          })
          if (info.project.name === 'chromium')
            await offline.screenshot({
              path: info.outputPath('image-link-keyboard.png'),
              animations: 'disabled',
            })
          await offline.keyboard.press('Enter')
          await expect(offline).toHaveURL(pathToFileURL(file).href + '#event-info')
          await expect(offline.locator('#event-info')).toBeInViewport()
        } finally {
          await reader.close()
        }
      }
      expect(errors).toEqual([])
      await info.attach('linked-photo', {
        body: JSON.stringify({
          viewport,
          alt,
          src,
          wrapperId,
          before,
          after,
          removed,
          finalHref: await wrapper.getAttribute('href'),
        }),
        contentType: 'application/json',
      })
    })
  })
}
