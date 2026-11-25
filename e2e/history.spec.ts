import { expect, test, type Locator } from '@playwright/test'
import { prepareDemo } from './demo-fixture'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  const touch = viewport.width === 375
  test.describe(`${viewport.width}px 編輯歷程`, () => {
    test.use({ viewport, hasTouch: touch })
    test('選步驟後才套用，跨步跳轉可重做，從較早版本編輯會建立新分支', async ({ page }, info) => {
      const errors = await prepareDemo(page)
      await page.goto('/activity/')
      const canvas = page.frameLocator('iframe[title="編輯畫布"]')
      const heading = canvas.locator('[data-sigil-id="activity-title"]')
      const original = await heading.innerText()
      const first = '冬季版畫工作坊'
      const replacement = '冬季版畫工作坊加開場'
      const link = canvas.getByRole('link', { name: '查看活動資訊', exact: true })
      const command = (name: string) => page.getByRole('button', { name, exact: true })
      const history = command('編輯歷程')
      const more = command('更多工具')
      const dialog = page.getByRole('dialog', { name: '編輯歷程', exact: true })
      const list = dialog.getByRole('listbox')
      const steps = dialog.getByRole('option')
      const current = dialog.locator('[role="option"][aria-current="step"]')
      const opened = dialog.getByRole('option', { name: /開啟文件/ })
      const apply = dialog.getByRole('button', { name: '回到這一步', exact: true })
      const action = page.getByRole('toolbar', { name: '元件操作', exact: true })
      const activate = (el: Locator) => (touch ? el.tap() : el.press('Enter'))
      async function openHistory() {
        if (touch && !(await history.isVisible())) await more.tap()
        await activate(history)
        await expect(list).toBeFocused()
      }
      async function expectClosed() {
        await expect(dialog).toBeHidden()
        await expect(touch ? more : history).toBeFocused()
      }
      async function enterCanvas() {
        if (touch && (await history.isVisible())) await more.tap()
      }
      async function select(node: Locator) {
        await enterCanvas()
        await node.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const box = (await node.boundingBox())!
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        if (touch) await page.touchscreen.tap(point.x, point.y)
        else await page.mouse.click(point.x, point.y)
        await expect(node).toHaveAttribute('data-sigil-selected', '1')
      }
      async function rewriteTitle(text: string) {
        await select(heading)
        await activate(action.getByRole('button', { name: '編輯文字', exact: true }))
        await page.keyboard.insertText(text)
        await activate(command('完成編輯'))
        await expect(heading).toHaveText(text)
      }
      await openHistory()
      await expect(steps).toHaveCount(1)
      await expect(opened).toHaveAttribute('aria-current', 'step')
      await expect(apply).toBeDisabled()
      await page.keyboard.press('Escape')
      await expectClosed()

      await rewriteTitle(first)
      await select(link)
      const originalId = await link.getAttribute('data-sigil-id')
      await activate(action.getByRole('button', { name: '複製元件', exact: true }))
      await expect(link).toHaveCount(2)
      const selectedLink = canvas.locator('a[href="#event-info"][data-sigil-selected="1"]')
      const duplicateId = await selectedLink.getAttribute('data-sigil-id')
      expect(duplicateId).toBeTruthy()
      expect(duplicateId).not.toBe(originalId)
      await openHistory()
      await expect(steps).toHaveCount(3)
      await expect(dialog.getByRole('option', { name: new RegExp(first) })).toHaveCount(1)
      const lastId = await current.getAttribute('data-history-id')
      expect(lastId).toBeTruthy()
      await expect(current).toHaveAttribute('aria-selected', 'true')
      if (touch) await opened.tap()
      else await list.press('Home')
      await expect(opened).toHaveAttribute('aria-selected', 'true')
      await expect(current).toHaveAttribute('data-history-id', lastId!)
      await expect(apply).toBeEnabled()
      await expect(heading).toHaveText(first)
      await expect(link).toHaveCount(2)
      const stepLabels = await steps.allTextContents()
      const geometry = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect()
        return { width: box.width, height: box.height, left: box.left, right: box.right }
      })
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(viewport.width)
      if (touch) {
        const targets = await dialog.locator('button:visible, [role="option"]').evaluateAll((els) =>
          els.map((el) => {
            const { width, height } = el.getBoundingClientRect()
            return Math.min(width, height)
          }),
        )
        expect(Math.min(...targets)).toBeGreaterThanOrEqual(44)
      }
      if (info.project.name === 'chromium') {
        // Chromium's native tap highlight fades independently of CSS animations.
        if (touch) await page.waitForTimeout(350)
        await page.screenshot({
          path: info.outputPath(`history-${viewport.width}.png`),
          animations: 'disabled',
        })
      }
      await page.keyboard.press('Escape')
      await expectClosed()
      await expect(heading).toHaveText(first)
      await expect(link).toHaveCount(2)

      await openHistory()
      await expect(current).toHaveAttribute('aria-selected', 'true')
      if (touch) await opened.tap()
      else await opened.click()
      await activate(apply)
      await expectClosed()
      await expect(heading).toHaveText(original)
      await expect(link).toHaveCount(1)
      if (touch && !(await history.isVisible())) await more.tap()
      await expect(command('復原')).toBeDisabled()
      await activate(command('重做'))
      await expect(heading).toHaveText(first)
      await expect(link).toHaveCount(1)
      await expect(selectedLink).toHaveCount(0)
      await activate(command('重做'))
      await expect(link).toHaveCount(2)
      await expect(selectedLink).toHaveAttribute('data-sigil-id', duplicateId!)
      const restoredSelectionId = await selectedLink.getAttribute('data-sigil-id')
      await activate(command('復原'))
      await expect(link).toHaveCount(1)
      await expect(selectedLink).toHaveCount(0)

      await rewriteTitle(replacement)
      await openHistory()
      await expect(steps).toHaveCount(3)
      await expect(dialog.locator(`[data-history-id="${lastId}"]`)).toHaveCount(0)
      await expect(current).toContainText(replacement)
      await expect(current).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('Escape')
      await expectClosed()
      if (touch && !(await history.isVisible())) await more.tap()
      await expect(command('重做')).toBeDisabled()
      await activate(command('復原'))
      await expect(heading).toHaveText(first)
      await activate(command('重做'))
      await expect(heading).toHaveText(replacement)
      await expect(link).toHaveCount(1)
      expect(errors).toEqual([])
      await info.attach('history-workflow', {
        contentType: 'application/json',
        body: JSON.stringify({
          viewport,
          touch,
          stepLabels,
          duplicateId,
          restoredSelectionId,
          geometry,
          original,
          first,
          replacement,
        }),
      })
    })
  })
}

test('工程示例切換英文後可從 Edit history 查閱文件起點', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  const history = page.getByRole('button', { name: 'Edit history', exact: true })
  await history.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Edit history', exact: true })
  const initial = dialog.getByRole('option', { name: /Opened document/ })
  await expect(initial).toHaveAttribute('aria-current', 'step')
  await expect(initial).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByText('開啟文件', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(history).toBeFocused()
  expect(errors).toEqual([])
})
