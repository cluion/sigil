import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareDemo } from './demo-fixture'

const rows = [
  ['previous', '場地與交通', '前往工作坊的方式'],
  ['current', '報名時間', '報名時間與費用'],
  ['next', '取消政策', '取消與改期方式'],
  ['tall', '活動說明', '工作坊詳情與場次'],
  ['last', '聯絡資訊', '聯絡活動主辦單位'],
]

async function openSchedule(page: Page) {
  const errors = await prepareDemo(page)
  await page.goto('/activity/')
  const children = rows.map(([id, name, content]) => ({
    id,
    name,
    content,
    type: 'text',
    tagName: 'p',
    style: {
      margin: '0',
      padding: '0 12px',
      height: id === 'tall' ? '1400px' : '40px',
      'line-height': '40px',
      'box-sizing': 'border-box',
      background: id === 'current' ? '#edf2ff' : '#fff',
    },
  }))
  const doc = {
    version: 1,
    meta: { title: '週末版畫工作坊' },
    root: {
      id: 'schedule',
      type: 'section',
      name: '工作坊',
      style: { padding: '140px 0 120px', color: '#18294e' },
      children,
    },
  }
  await page.evaluate(
    (value) => localStorage.setItem('sigil-demo-activity-v1', JSON.stringify(value)),
    doc,
  )
  await page.reload()
  await expect(
    page.frameLocator('iframe[title="編輯畫布"]').getByText('報名時間與費用'),
  ).toBeVisible()
  return errors
}

const frame = (page: Page) => page.frameLocator('iframe[title="編輯畫布"]')
const row = (page: Page, id: string) => frame(page).locator(`[data-sigil-id="${id}"]`)
const toolbar = (page: Page) => page.getByRole('toolbar', { name: '元件操作' })

async function atFrameTop(item: Locator, pixels: number) {
  await item.evaluate(
    (el, top) => el.ownerDocument.defaultView!.scrollBy(0, el.getBoundingClientRect().top - top),
    pixels,
  )
  await item.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const win = el.ownerDocument.defaultView!
        win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()))
      }),
  )
}

async function selectOnCanvas(page: Page, id: string, touch: boolean) {
  const box = (await row(page, id).boundingBox())!
  const x = box.x + 30
  const y = box.y + 20
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(row(page, id)).toHaveAttribute('data-sigil-selected', '1')
}

async function measure(page: Page, id: string) {
  const target = (await row(page, id).boundingBox())!
  const frameBox = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
  const bar = await toolbar(page).boundingBox()
  const x = target.x + 30
  const y = Math.max(frameBox.y + 2, target.y) + 20
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return {
        toolbar: !!element?.closest('[role="toolbar"]'),
        canvas: !!element?.closest('.sigil-canvas-host'),
      }
    },
    { x, y },
  )
  let overlap = 0
  if (bar) {
    const dx = Math.max(
      0,
      Math.min(target.x + target.width, bar.x + bar.width, frameBox.x + frameBox.width) -
        Math.max(target.x, bar.x, frameBox.x),
    )
    const dy = Math.max(
      0,
      Math.min(target.y + target.height, bar.y + bar.height, frameBox.y + frameBox.height) -
        Math.max(target.y, bar.y, frameBox.y),
    )
    overlap = dx * dy
  }
  return { target, frame: frameBox, bar, hit, overlap }
}

for (const touch of [false, true]) {
  test.describe(touch ? '手機畫布工具列' : '桌面畫布工具列', () => {
    test.use({
      hasTouch: touch,
      viewport: touch ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    })

    test('貼邊與高元件仍可點選相鄰內容，捲離後能用工具列回到選取', async ({ page }, testInfo) => {
      const errors = await openSchedule(page)
      const bar = toolbar(page)
      const locate = bar.getByRole('button', { name: '在畫布定位', exact: true })
      const activate = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      const readings: Record<string, Awaited<ReturnType<typeof measure>>> = {}
      async function check(id: string, name: string) {
        const reading = await measure(page, id)
        expect(reading.bar).not.toBeNull()
        expect(reading.bar!.y).toBeGreaterThanOrEqual(reading.frame.y + reading.frame.height - 1)
        expect(reading.overlap).toBe(0)
        expect(reading.hit).toEqual({ toolbar: false, canvas: true })
        readings[name] = reading
      }
      await selectOnCanvas(page, 'current', touch)
      await expect(bar).toBeVisible()
      await expect(locate).toBeHidden()
      await check('previous', 'previousSibling')
      await selectOnCanvas(page, 'previous', touch)
      await selectOnCanvas(page, 'current', touch)
      await atFrameTop(row(page, 'current'), 4)
      await check('next', 'topEdgeNextSibling')
      await selectOnCanvas(page, 'next', touch)
      const selected = row(page, 'next')
      await atFrameTop(selected, -12)
      await expect(locate).toBeHidden()
      await expect(selected).toBeInViewport()
      await atFrameTop(selected, -90)
      await expect(locate).toBeVisible()
      if (touch) {
        const sizes = await bar.getByRole('button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const { left, right, width, height } = button.getBoundingClientRect()
            return { name: button.getAttribute('aria-label'), left, right, width, height }
          }),
        )
        for (const size of sizes) {
          expect(Math.min(size.width, size.height), size.name ?? '').toBeGreaterThanOrEqual(44)
          expect(size.left).toBeGreaterThanOrEqual(0)
          expect(size.right).toBeLessThanOrEqual(375)
        }
        await testInfo.attach('touch-targets', {
          body: JSON.stringify(sizes),
          contentType: 'application/json',
        })
      }
      const outside = await selected.boundingBox()
      const iframe = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
      expect(outside!.y + outside!.height).toBeLessThan(iframe.y)
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(
            touch ? 'toolbar-mobile-locate.png' : 'toolbar-desktop-locate.png',
          ),
          animations: 'disabled',
        })
      }
      await activate(locate)
      await expect(locate).toBeHidden()
      await expect(bar).toBeFocused()
      await expect(selected).toHaveAttribute('data-sigil-selected', '1')
      const returned = (await selected.boundingBox())!
      expect(returned.y).toBeGreaterThanOrEqual(iframe.y)
      expect(returned.y + returned.height).toBeLessThanOrEqual(iframe.y + iframe.height)
      await atFrameTop(row(page, 'tall'), 4)
      await selectOnCanvas(page, 'tall', touch)
      await check('tall', 'oversizedSelection')
      expect(readings.oversizedSelection!.target.height).toBeGreaterThan(iframe.height)
      await atFrameTop(row(page, 'last'), iframe.height - 46)
      await selectOnCanvas(page, 'last', touch)
      await check('last', 'bottomEdgeSelection')
      await atFrameTop(row(page, 'current'), 96)
      await selectOnCanvas(page, 'current', touch)
      if (!touch) {
        const current = row(page, 'current')
        const bounds = (await current.boundingBox())!
        await page.mouse.dblclick(bounds.x + 30, bounds.y + 20)
        await expect(current).toHaveAttribute('contenteditable', 'true')
        await expect(bar).toBeHidden()
        await current.press('Escape')
        await expect(bar).toBeVisible()
      }
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(touch ? 'toolbar-mobile.png' : 'toolbar-desktop.png'),
          animations: 'disabled',
        })
      }
      await activate(page.getByRole('button', { name: '預覽', exact: true }))
      await expect(bar).toBeHidden()
      await activate(page.getByRole('button', { name: '編輯', exact: true }))
      await expect(bar).toBeVisible()
      await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
      expect(errors).toEqual([])
      await testInfo.attach('docked-toolbar', {
        body: JSON.stringify({ viewport: page.viewportSize(), readings, outside, returned }),
        contentType: 'application/json',
      })
    })
  })
}

test.describe('320px 圖片工具列', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, colorScheme: 'dark' })

  test('圖片操作維持兩行，可設定圖片連結，定位時仍看得見更換圖片文字', async ({
    page,
  }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const cover = row(page, 'activity-image')
    await expect(cover).toHaveAttribute('src', /.+/)
    const source = await cover.getAttribute('src')
    await page.evaluate((src) => {
      localStorage.setItem('sigil-theme', 'dark')
      localStorage.setItem(
        'sigil-demo-activity-v1',
        JSON.stringify({
          version: 1,
          root: {
            id: 'workshop',
            type: 'section',
            style: { padding: '8px', 'min-height': '1600px' },
            children: [
              {
                id: 'photo',
                type: 'image',
                name: '版畫工作坊學員作品與製作過程的照片選輯',
                attributes: { src, alt: '版畫照片' },
                style: { width: '180px', height: '112px', 'object-fit': 'cover' },
              },
            ],
          },
        }),
      )
    }, source)
    await page.reload()
    const photo = row(page, 'photo')
    await photo.evaluate((el) => (el as HTMLImageElement).decode())
    await selectOnCanvas(page, 'photo', true)

    const bar = toolbar(page)
    const replaceCaption = bar
      .getByRole('button', { name: '更換圖片', exact: true })
      .locator('span')
    const locate = bar.getByRole('button', { name: '在畫布定位', exact: true })
    async function checkLayout(buttonCount: number) {
      await expect(replaceCaption).toBeVisible()
      await expect(replaceCaption).toHaveText('更換圖片')
      expect(await replaceCaption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const geometry = await measure(page, 'photo')
      expect(geometry.bar!.y).toBeGreaterThanOrEqual(geometry.frame.y + geometry.frame.height)
      expect(geometry.overlap).toBe(0)
      const targets = await bar.getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => ({
          name: button.getAttribute('aria-label'),
          rect: button.getBoundingClientRect().toJSON(),
        })),
      )
      expect(targets).toHaveLength(buttonCount)
      expect(new Set(targets.map(({ rect }) => Math.round(rect.y))).size).toBeLessThanOrEqual(2)
      for (const { name, rect } of targets) {
        expect(Math.min(rect.width, rect.height), name ?? '').toBeGreaterThanOrEqual(44)
        expect(rect.left).toBeGreaterThanOrEqual(0)
        expect(rect.right).toBeLessThanOrEqual(320)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
      return { geometry, targets }
    }
    await expect(locate).toBeHidden()
    const linkCaption = bar.getByRole('button', { name: '圖片連結', exact: true }).locator('span')
    await expect(linkCaption).toBeVisible()
    expect(await linkCaption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const selected = await checkLayout(8)
    expect(selected.geometry.hit).toEqual({ toolbar: false, canvas: true })
    await atFrameTop(photo, -300)
    await expect(locate).toBeVisible()
    const offscreen = await checkLayout(9)
    expect(errors).toEqual([])
    await testInfo.attach('image-toolbar-layout', {
      body: JSON.stringify({ selected, offscreen }),
      contentType: 'application/json',
    })
  })
})
