import { expect, test, type Locator } from '@playwright/test'
import type { SigilDoc } from '@cluion/sigil-core'
import { prepareDemo } from './demo-fixture'

const workshop: SigilDoc = {
  version: 1,
  root: {
    id: 'workshop',
    type: 'section',
    name: '工作坊',
    style: { padding: '20px' },
    children: [
      { id: 'headline', type: 'text', name: '公告標題', tagName: 'h1', content: '場次公告' },
      {
        id: 'schedule',
        type: 'text',
        name: '時段說明',
        tagName: 'p',
        content: '上午場次、下午場次',
      },
      {
        id: 'register',
        type: 'button',
        name: '報名連結',
        tagName: 'a',
        content: '場次報名',
        attributes: { href: '#reservation', title: '場次連結' },
      },
      {
        id: 'reservation',
        type: 'text',
        name: '預約須知',
        tagName: 'p',
        locked: true,
        content: '場次須預約',
        attributes: { id: 'reservation' },
        style: { 'margin-top': '110vh' },
      },
    ],
  },
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  const touch = viewport.width === 375
  test.describe(`${viewport.width}px 尋找與取代`, () => {
    test.use({ viewport, hasTouch: touch })
    test('選同一段第二處、預覽再全部取代，復原後能定位鎖定文字', async ({ page }, info) => {
      const errors = await prepareDemo(page)
      await page.addInitScript((doc) => {
        const key = 'sigil-demo-activity-v1'
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
      }, workshop)
      await page.goto('/activity/')
      const canvas = page.frameLocator('iframe[title="編輯畫布"]')
      const node = (id: string) => canvas.locator(`[data-sigil-id="${id}"]`)
      const title = node('headline'),
        schedule = node('schedule'),
        link = node('register'),
        locked = node('reservation')
      const button = (name: string) => page.getByRole('button', { name, exact: true })
      const trigger = button('尋找與取代'),
        more = button('更多工具')
      const dialog = page.getByRole('dialog', { name: '尋找與取代', exact: true })
      const query = dialog.getByRole('searchbox', { name: '尋找文字', exact: true })
      const replacement = dialog.getByRole('textbox', { name: '取代為', exact: true })
      const results = dialog.getByRole('listbox', { name: '搜尋結果', exact: true })
      const single = dialog.getByRole('button', { name: '取代一處', exact: true })
      const all = dialog.getByRole('button', { name: '全部取代', exact: true })
      const confirm = dialog.getByRole('button', { name: '確認取代 3 處', exact: true })
      const lockedMatch = results.getByRole('option', { name: /預約須知/ })
      const act = (el: Locator) => (touch ? el.tap() : el.press('Enter'))
      async function open() {
        if (touch && !(await trigger.isVisible())) await more.tap()
        await act(trigger)
        await expect(query).toBeFocused()
        await query.fill('場次')
      }
      async function expectClosed() {
        await expect(dialog).toBeHidden()
        await expect(touch ? more : trigger).toBeFocused()
      }
      async function expectText(heading: string, timetable: string, signup: string) {
        await expect(title).toHaveText(heading)
        await expect(schedule).toHaveText(timetable)
        await expect(link).toHaveText(signup)
        await expect(link).toHaveAttribute('href', '#reservation')
        await expect(link).toHaveAttribute('title', '場次連結')
        await expect(locked).toHaveText('場次須預約')
      }
      await open()
      await expect(results.getByRole('option')).toHaveCount(5)
      await expect(lockedMatch).toContainText('已鎖定')
      await replacement.fill('席次')
      const repeated = results.getByRole('option', { name: /時段說明/ })
      await expect(repeated).toHaveCount(2)
      if (touch) await repeated.nth(1).tap()
      else {
        await repeated.first().click()
        await results.press('ArrowDown')
      }
      await expect(repeated.nth(1)).toHaveAttribute('aria-selected', 'true')
      await expectText('場次公告', '上午場次、下午場次', '場次報名')
      const geometry = await dialog.evaluate((el) => el.getBoundingClientRect().toJSON())
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(viewport.width)
      const controls = await dialog
        .locator('button:visible, [role="option"], input[type="text"], input[type="search"]')
        .evaluateAll((items) =>
          items.map((el) => {
            const { width, height } = el.getBoundingClientRect()
            return Math.min(width, height)
          }),
        )
      const minTarget = Math.min(...controls)
      if (touch) expect(minTarget).toBeGreaterThanOrEqual(44)
      if (info.project.name === 'chromium') {
        // Chromium's touch highlight fades after the row is selected.
        if (touch) await page.waitForTimeout(350)
        await page.screenshot({
          path: info.outputPath(`page-text-${viewport.width}.png`),
          animations: 'disabled',
        })
      }
      await act(single)
      await expect(dialog).toBeVisible()
      await expectText('場次公告', '上午場次、下午席次', '場次報名')
      await expect(results.getByRole('option')).toHaveCount(4)
      await replacement.fill('席位')
      await act(all)
      await expect(confirm).toBeVisible()
      await expectText('場次公告', '上午場次、下午席次', '場次報名')
      await page.keyboard.press('Escape')
      await expectClosed()
      await expectText('場次公告', '上午場次、下午席次', '場次報名')

      await open()
      await replacement.fill('席位')
      await act(all)
      await act(confirm)
      await expectText('席位公告', '上午席位、下午席次', '席位報名')
      await expect(results.getByRole('option')).toHaveCount(1)
      await expect(lockedMatch).toContainText('已鎖定')
      await expect(single).toBeDisabled()
      await expect(all).toBeDisabled()
      await page.keyboard.press('Escape')
      await expectClosed()
      if (touch) await more.tap()
      await act(button('復原'))
      await expectText('場次公告', '上午場次、下午席次', '場次報名')
      await act(button('復原'))
      await expectText('場次公告', '上午場次、下午場次', '場次報名')
      await expect(button('復原')).toBeDisabled()
      await act(button('重做'))
      await expectText('場次公告', '上午場次、下午席次', '場次報名')
      await act(button('重做'))
      await expectText('席位公告', '上午席位、下午席次', '席位報名')
      await open()
      if (touch) await lockedMatch.tap()
      else await lockedMatch.click()
      await expect(locked).not.toBeInViewport()
      await act(dialog.getByRole('button', { name: '跳到畫布', exact: true }))
      await expect(dialog).toBeHidden()
      await expect(locked).toHaveAttribute('data-sigil-selected', '1')
      await expect(locked).toBeInViewport()
      expect(errors).toEqual([])
      await info.attach('page-text-workflow', {
        contentType: 'application/json',
        body: JSON.stringify({
          viewport,
          geometry,
          minTarget,
          initialResults: 5,
          singleResult: '上午場次、下午席次',
          editableResultsInBatch: 3,
          finalHeading: await title.textContent(),
          finalSchedule: await schedule.textContent(),
          finalLink: await link.textContent(),
          preservedTitle: await link.getAttribute('title'),
          preservedHref: await link.getAttribute('href'),
          lockedSelection: await locked.getAttribute('data-sigil-id'),
          lockedContent: await locked.textContent(),
        }),
      })
    })
  })
}

test('工程示例可用英文尋找文字，取消後回到工具', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Find and replace', exact: true })
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Find and replace', exact: true })
  const query = dialog.getByRole('searchbox', { name: 'Find text', exact: true })
  await expect(query).toBeFocused()
  const matches = dialog.getByRole('listbox', { name: 'Search results' }).getByRole('option')
  const native = page.frameLocator('iframe[title="Canvas"]').getByText('點我編輯', { exact: true })
  for (const skipped of ['安全連結', '提示框']) {
    await query.fill('點我編輯')
    await expect(matches).toHaveCount(1)
    await expect(matches).toContainText('點我編輯')
    await query.fill(skipped)
    await expect(matches).toHaveCount(0)
  }
  await expect(dialog.getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter')
  await expect(trigger).toBeFocused()
  await expect(native).toHaveCount(1)
  expect(errors).toEqual([])
})
