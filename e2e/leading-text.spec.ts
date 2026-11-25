import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareDemo } from './demo-fixture'
import { workshopRegistration } from './mixed-content'

const revised = '預約名額前，請先閱讀'
const original = '報名前請閱讀'

async function selectFirstText(page: Page, item: Locator, touch: boolean) {
  const box = (await item.boundingBox())!
  const point = await item.evaluate((el) => {
    const range = el.ownerDocument.createRange()
    range.selectNodeContents(el.firstChild!)
    const text = range.getClientRects()[0]!
    const parent = el.getBoundingClientRect()
    return {
      x: text.x - parent.x + Math.min(8, text.width / 2),
      y: text.y - parent.y + text.height / 2,
    }
  })
  const x = box.x + point.x
  const y = box.y + point.y
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

for (const [width, height] of [
  [1440, 900],
  [375, 812],
  [320, 568],
] as const) {
  const touch = width < 768
  test.describe(touch ? `${width}px 段落開頭文字` : '桌面段落開頭文字', () => {
    test.use({ viewport: { width, height }, hasTouch: touch })
    test('從畫布編輯段落開頭，子連結與粗體保留，復原重做後可存檔重開', async ({ page }, info) => {
      const errors = await prepareDemo(page)
      await page.addInitScript((doc) => {
        const key = 'sigil-demo-activity-v1'
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
      }, workshopRegistration())
      await page.goto('/activity/')
      const frame = page.frameLocator('iframe[title="編輯畫布"]')
      const paragraph = frame.locator('[data-sigil-id="instructions"]')
      const terms = paragraph.getByRole('link', { name: '參加須知', exact: true })
      const strong = paragraph.locator(':scope > strong')
      const bar = page.getByRole('toolbar', { name: '元件操作', exact: true })
      const start = bar.getByRole('button', { name: '編輯開頭文字', exact: true })
      const field = page.getByRole('textbox', { name: '開頭文字', exact: true })
      const activate = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      const button = (name: string) => page.getByRole('button', { name, exact: true })
      const closePanel = async () => {
        if (touch) {
          await button('關閉面板').tap()
          await expect(page.locator('[data-compact-panel="settings"]')).toBeHidden()
        }
      }
      const more = button('更多工具')
      const undo = button('復原')
      const redo = button('重做')
      async function check(content: string) {
        await expect(paragraph).toHaveText(content + '參加須知（週五截止）')
        await expect(terms).toHaveAttribute('href', '#terms')
        await expect(strong).toHaveText('（週五截止）')
        const leading = await paragraph.evaluate((el) =>
          [...el.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join(''),
        )
        expect(leading).toBe(content)
      }
      await check(original)
      if (touch) await selectFirstText(page, paragraph, true)
      else {
        const tree = page.getByRole('tree', { name: '圖層', exact: true })
        const root = tree.getByRole('treeitem', { name: '工作坊', exact: true })
        if ((await root.getAttribute('aria-expanded')) === 'false') await root.press('ArrowRight')
        await tree.getByRole('treeitem', { name: '報名說明', exact: true }).press('Enter')
      }
      await expect(paragraph).toHaveAttribute('data-sigil-selected', '1')
      await expect(bar.getByRole('button', { name: '編輯文字', exact: true })).toBeHidden()
      await expect(start.locator('span')).toBeVisible()
      expect(await start.locator('span').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      )
      await activate(start)
      await expect(field).toBeFocused()
      await expect(field).toHaveValue(original)
      await expect(paragraph).not.toHaveAttribute('contenteditable', 'true')
      const setCandidate = (text: string) =>
        field.evaluate((el: HTMLInputElement, value) => {
          el.value = value
          el.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              isComposing: true,
              inputType: 'insertCompositionText',
              data: value,
            }),
          )
        }, text)
      await field.dispatchEvent('compositionstart')
      await setCandidate('報名前請閱ㄉ')
      await check(original)
      await setCandidate(original)
      await field.dispatchEvent('compositionend', { data: '' })
      await check(original)
      await expect(button('存檔')).toBeDisabled()
      if (!touch) await expect(undo).toBeDisabled()
      const linkRef = await terms.elementHandle()
      const strongRef = await strong.elementHandle()
      await field.fill('')
      await check('')
      expect(await linkRef!.evaluate((el) => el.isConnected)).toBe(true)
      expect(await strongRef!.evaluate((el) => el.isConnected)).toBe(true)
      await closePanel()
      if (touch) await more.tap()
      await activate(undo)
      await check(original)
      await expect(undo).toBeDisabled()
      if (touch) await more.tap()
      await activate(start)
      await expect(field).toBeFocused()
      const restoredLink = await terms.elementHandle()
      await field.fill(revised)
      await check(revised)
      expect(await restoredLink!.evaluate((el) => el.isConnected)).toBe(true)
      if (info.project.name === 'chromium') {
        if (touch) {
          await page.locator('[data-compact-panel="settings"]').evaluate(async (panel) => {
            await Promise.all(panel.getAnimations().map((animation) => animation.finished))
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            )
          })
        }
        await page.screenshot({
          path: info.outputPath(`leading-${width}-field.png`),
          animations: 'disabled',
        })
      }
      await closePanel()
      await selectFirstText(page, terms, touch)
      await expect(terms).toHaveAttribute('data-sigil-selected', '1')
      await expect(bar.getByRole('button', { name: '編輯文字', exact: true })).toBeVisible()
      if (touch) {
        if (width === 375 && info.project.name === 'chromium')
          await page.screenshot({
            path: info.outputPath('leading-375-link.png'),
            animations: 'disabled',
          })
        await more.tap()
      }
      await activate(undo)
      await check(original)
      await expect(undo).toBeDisabled()
      await activate(redo)
      await check(revised)
      await activate(button('存檔'))
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await page.reload()
      await check(revised)
      expect(errors).toEqual([])
      await info.attach('mixed-content', {
        body: JSON.stringify({
          viewport: width,
          ownText: revised,
          childOrder: await paragraph.locator(':scope > *').evaluateAll((els) =>
            els.map((el) => ({
              tag: el.tagName.toLowerCase(),
              text: el.textContent,
              href: el.getAttribute('href'),
            })),
          ),
        }),
        contentType: 'application/json',
      })
    })
  })
}
