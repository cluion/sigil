import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareDemo } from './demo-fixture'

const frame = (page: Page) => page.frameLocator('iframe[title="編輯畫布"]')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const title = (page: Page) => frame(page).locator('[data-sigil-id="activity-title"]')
const signup = (page: Page) => frame(page).locator('a[href="#event-info"]')
const editing = (page: Page) => page.getByRole('group', { name: '正在編輯文字', exact: true })
const edit = (page: Page) =>
  page
    .getByRole('toolbar', { name: '元件操作', exact: true })
    .getByRole('button', { name: '編輯文字', exact: true })

async function activateLayer(page: Page, name: string) {
  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  const item = (label: string) => tree.getByRole('treeitem', { name: label, exact: true })
  for (const parent of ['活動頁', '主視覺', '活動簡介']) {
    const branch = item(parent)
    if ((await branch.getAttribute('aria-expanded')) === 'false') await branch.press('ArrowRight')
  }
  const selected = item(name)
  await selected.press('Enter')
  return selected
}

async function tapCanvas(page: Page, target: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = (await target.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect(target).toHaveAttribute('data-sigil-selected', '1')
}

async function actionSizes(group: Locator) {
  return group.getByRole('button').evaluateAll((items) =>
    items.map((el) => ({
      label: el.getAttribute('aria-label') ?? el.textContent,
      rect: el.getBoundingClientRect().toJSON(),
    })),
  )
}

async function expectEditCaption(page: Page) {
  const caption = edit(page).locator('span')
  await expect(caption).toBeVisible()
  await expect(caption).toHaveText('編輯文字')
  expect(await caption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}

test.describe('畫布直接編輯文字與按鈕', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('鍵盤從定位進入文字編輯，組字、取消、單步復原、存檔重開與欄位焦點', async ({
    page,
  }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const heading = title(page)
    const original = await heading.innerText()
    const contact = signup(page)
    const originalContact = await contact.innerText()
    const field = page
      .locator('.sigil-inspector')
      .getByRole('textbox', { name: '內容', exact: true })
    const done = editing(page).getByRole('button', { name: '完成編輯', exact: true })
    const cancel = editing(page).getByRole('button', { name: '取消編輯', exact: true })
    const undo = button(page, '復原')
    const redo = button(page, '重做')
    const save = button(page, '存檔')
    const layer = await activateLayer(page, '活動標題')
    await heading.evaluate((el) =>
      el.ownerDocument.defaultView!.scrollTo(0, el.ownerDocument.body.scrollHeight),
    )
    const locate = button(page, '在畫布定位')
    await expect(locate).toBeVisible()
    await locate.press('Enter')
    await expect(heading).toBeInViewport()
    await edit(page).press('Enter')
    await expect(heading).toHaveAttribute('contenteditable', 'true')
    await expect(heading).toBeFocused()
    await heading.dispatchEvent('compositionstart')
    await expect(done).toBeDisabled()
    await expect(cancel).toBeDisabled()
    await page.keyboard.insertText('暫存組字')
    for (const key of ['Enter', 'Escape']) {
      await heading.dispatchEvent('keydown', { key, isComposing: true })
      await expect(heading).toBeFocused()
      await expect(editing(page)).toBeVisible()
    }
    await heading.dispatchEvent('compositionend', { data: '暫存組字' })
    await page.keyboard.press('Tab')
    await expect(done).toBeFocused()
    await expect(heading).toHaveAttribute('contenteditable', 'true')
    await expect(undo).toBeDisabled()
    await page.keyboard.press('Shift+Tab')
    await expect(heading).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(done).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(heading).toHaveText(original)
    await expect(edit(page)).toBeFocused()
    await expect(undo).toBeDisabled()
    await expect(save).toBeDisabled()

    await page.keyboard.press('Enter')
    const revised = '冬日版畫工作坊'
    await page.keyboard.insertText(revised)
    await expect(heading).toHaveText(revised)
    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: testInfo.outputPath('inline-desktop.png'),
        animations: 'disabled',
      })
    }
    await page.keyboard.press('Tab')
    await expect(done).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(heading).not.toHaveAttribute('contenteditable', 'true')
    await expect(edit(page)).toBeFocused()
    await expect(field).toHaveValue(revised)
    await undo.press('Enter')
    await expect(heading).toHaveText(original)
    await expect(undo).toBeDisabled()
    await redo.press('Enter')
    await save.press('Enter')
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await expect(save).toBeDisabled()
    await page.reload()
    await expect(heading).toHaveText(revised)
    await expect(contact).toHaveText(originalContact)
    await expect(contact).toHaveAttribute('href', '#event-info')

    await activateLayer(page, '活動標題')
    await edit(page).press('Enter')
    await page.keyboard.insertText('工作坊場次說明')
    await field.click()
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('工作坊場次說明')
    await expect(editing(page)).toBeHidden()
    await undo.press('Enter')
    await expect(heading).toHaveText(revised)

    await layer.getByRole('button', { name: '鎖定', exact: true }).press('Enter')
    await expect(layer.getByRole('button', { name: '解鎖', exact: true })).toBeVisible()
    await expect(edit(page)).toBeDisabled()
    await heading.scrollIntoViewIfNeeded()
    const lockedBox = (await heading.boundingBox())!
    await page.mouse.dblclick(lockedBox.x + lockedBox.width / 2, lockedBox.y + lockedBox.height / 2)
    await expect(editing(page)).toBeHidden()
    await expect(heading).not.toHaveAttribute('contenteditable', 'true')
    expect(errors).toEqual([])
  })
})

for (const width of [375, 320]) {
  test.describe(`${width}px 觸控文字編輯`, () => {
    test.use({ hasTouch: true, viewport: { width, height: width === 320 ? 568 : 812 } })
    test('輕點按鈕改文字，可取消或完成，復原重做後存檔仍保留連結', async ({ page }, testInfo) => {
      const errors = await prepareDemo(page)
      await page.goto('/activity/')
      const contact = signup(page)
      const original = await contact.innerText()
      const heading = title(page)
      const originalTitle = await heading.innerText()
      const group = editing(page)
      const done = group.getByRole('button', { name: '完成編輯', exact: true })
      const cancel = group.getByRole('button', { name: '取消編輯', exact: true })
      const save = button(page, '存檔')
      const more = button(page, '更多工具')
      await tapCanvas(page, heading)
      await expectEditCaption(page)
      await tapCanvas(page, contact)
      await expectEditCaption(page)
      const selection = page.getByRole('toolbar', { name: '元件操作', exact: true })
      const linkCaption = selection
        .getByRole('button', { name: '編輯連結', exact: true })
        .locator('span')
      await expect(linkCaption).toBeVisible()
      expect(await linkCaption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const linkActions = await actionSizes(selection)
      expect(linkActions).toHaveLength(8)
      expect(new Set(linkActions.map(({ rect }) => Math.round(rect.y))).size).toBeLessThanOrEqual(2)
      for (const { label, rect } of linkActions) {
        expect(Math.min(rect.width, rect.height), label ?? '').toBeGreaterThanOrEqual(44)
        expect(rect.left).toBeGreaterThanOrEqual(0)
        expect(rect.right).toBeLessThanOrEqual(width)
      }
      if (width === 320 && testInfo.project.name === 'chromium') {
        await page.screenshot({ path: testInfo.outputPath('link-320.png'), animations: 'disabled' })
      }
      await edit(page).tap()
      await expect(contact).toBeFocused()
      await expect(contact).toHaveAttribute('contenteditable', 'true')
      await page.keyboard.insertText('暫時不採用此文案')
      await cancel.tap()
      await expect(edit(page)).toBeFocused()
      await expect(contact).toHaveText(original)
      await expect(save).toBeDisabled()
      await edit(page).tap()
      const revised = '查看場次與報名'
      await page.keyboard.insertText(revised)
      await expect(contact).toHaveText(revised)
      const actions = await actionSizes(group)
      expect(actions).toHaveLength(2)
      for (const { label, rect } of actions) {
        expect(Math.min(rect.width, rect.height), label ?? '').toBeGreaterThanOrEqual(44)
        expect(rect.left).toBeGreaterThanOrEqual(0)
        expect(rect.right).toBeLessThanOrEqual(width)
      }
      const canvasRect = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
      const dockRect = (await group.boundingBox())!
      expect(dockRect.y).toBeGreaterThanOrEqual(canvasRect.y + canvasRect.height - 1)
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(`inline-${width}.png`),
          animations: 'disabled',
        })
      }
      await done.tap()
      await expect(edit(page)).toBeFocused()
      await expect(contact).not.toHaveAttribute('contenteditable', 'true')
      await expect(contact).toHaveAttribute('href', '#event-info')
      await more.tap()
      const undo = button(page, '復原')
      await undo.tap()
      await expect(undo).toBeDisabled()
      await expect(contact).toHaveText(original)
      await button(page, '重做').tap()
      await expect(contact).toHaveText(revised)
      await save.tap()
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await expect(save).toBeDisabled()
      await page.reload()
      await expect(contact).toHaveText(revised)
      await expect(contact).toHaveAttribute('href', '#event-info')
      await expect(heading).toHaveText(originalTitle)
      expect(errors).toEqual([])
      await testInfo.attach('touch-editing', {
        body: JSON.stringify({
          width,
          linkActions,
          actions,
          dockRect,
          canvasRect,
          original,
          revised,
          href: await contact.getAttribute('href'),
        }),
        contentType: 'application/json',
      })
    })
  })
}

test.describe('原生按鈕的畫布文字編輯', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } })

  test('透過鍵盤輸入改寫原生 button 標籤，完成後重開仍可操作', async ({ page }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.addInitScript(() => {
      const key = 'sigil-demo-activity-v1'
      if (localStorage.getItem(key)) return
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          root: {
            id: 'workshop',
            type: 'section',
            name: '場次報名',
            style: { padding: '16px', display: 'flex', 'align-items': 'center', gap: '8px' },
            children: [
              {
                id: 'register',
                type: 'button',
                name: '報名操作',
                content: '預約名額',
                attributes: { type: 'button' },
                style: { 'min-height': '72px', 'min-width': '116px', padding: '8px' },
              },
              { id: 'description', type: 'text', content: '每人限報名一次' },
            ],
          },
        }),
      )
    })
    await page.goto('/activity/')
    const target = frame(page).locator('button[data-sigil-id="register"]')
    await tapCanvas(page, target)
    await expectEditCaption(page)
    const textLayout = (item: Locator) =>
      item.evaluate((el) => {
        const box = el.getBoundingClientRect()
        const range = el.ownerDocument.createRange()
        range.selectNodeContents(el)
        const text = range.getBoundingClientRect()
        return {
          width: box.width,
          height: box.height,
          textLeft: text.left - box.left,
          textTop: text.top - box.top,
        }
      })
    const before = await textLayout(target)
    await edit(page).tap()
    const input = frame(page).getByRole('textbox', { name: '報名操作', exact: true })
    await expect(input).toHaveAttribute('contenteditable', 'true')
    await expect(input).toHaveAttribute('data-sigil-selected', '1')
    await expect(input).toBeFocused()
    const during = await textLayout(input)
    expect(Math.abs(during.textTop - before.textTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(during.textLeft - before.textLeft)).toBeLessThanOrEqual(1)
    expect(during.width).toBeCloseTo(before.width)
    expect(during.height).toBeCloseTo(before.height)
    await page.keyboard.insertText('登記')
    await page.keyboard.type(' 2')
    await expect(input).toHaveText('登記 2')
    await editing(page).getByRole('button', { name: '完成編輯', exact: true }).tap()
    await expect(edit(page)).toBeFocused()
    const save = button(page, '存檔')
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await expect(save).toBeDisabled()
    await page.reload()
    await expect(target).toHaveText('登記 2')
    await expect(target).toHaveAttribute('type', 'button')
    await expect(frame(page).locator('[data-sigil-id="description"]')).toHaveText('每人限報名一次')
    await tapCanvas(page, target)
    await edit(page).tap()
    await expect(input).toBeFocused()
    await editing(page).getByRole('button', { name: '取消編輯', exact: true }).tap()
    await expect(save).toBeDisabled()
    expect(errors).toEqual([])
    await testInfo.attach('native-button-layout', {
      body: JSON.stringify({ before, during }),
      contentType: 'application/json',
    })
  })
})
