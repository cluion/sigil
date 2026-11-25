import { expect, test } from '@playwright/test'
import type { ComponentNode } from '@cluion/sigil-core'
import type { SigilApp } from '@cluion/sigil-app'
import { prepareDemo } from './demo-fixture'

interface DemoNode {
  id: string
  content?: string
  children?: DemoNode[]
}

interface DemoApp {
  engine: {
    update(id: string, patch: { content: string }): void
    select(id: string | null): void
    getSelection(): string | null
    getTree(): DemoNode
  }
  getLocale(): 'zh' | 'en'
  isDirty(): boolean
  isSaving(): boolean
  toJSON(): { root: DemoNode }
}

test('有連結的格線縮圖維持指定高度，調整欄數與構圖時連結範圍跟著圖片', async ({
  page,
  context,
}) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.evaluate(() => {
    const root: ComponentNode = {
      id: 'gallery',
      type: 'section',
      style: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' },
      children: [
        {
          id: 'poster',
          type: 'image',
          name: '工作坊縮圖',
          attributes: { alt: '版畫報名', src: 'https://placehold.co/200x120' },
          style: { display: 'block', width: '70%', height: '64px', 'object-fit': 'cover' },
        },
        { id: 'date', type: 'text', content: '報名截止日' },
      ],
    }
    localStorage.setItem('sigil-demo', JSON.stringify({ version: 1, root }))
  })
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  await page.evaluate(() =>
    (window as unknown as { __sigil: SigilApp }).__sigil.engine.select('poster'),
  )
  const reader = await context.newPage()
  const readerErrors = await prepareDemo(reader)
  async function measure() {
    const html = await page.evaluate(() =>
      (window as unknown as { __sigil: SigilApp }).__sigil.toHTML('static'),
    )
    await reader.setContent(html)
    const photo = reader.getByRole('img', { name: '版畫報名' })
    return photo.evaluate(async (el) => {
      await (el as HTMLImageElement).decode()
      const box = el.getBoundingClientRect()
      const link = el.closest('a')?.getBoundingClientRect()
      return {
        width: box.width,
        height: box.height,
        linkWidth: link?.width,
        linkHeight: link?.height,
      }
    })
  }
  try {
    const original = await measure()
    expect(original.height).toBe(64)
    const toolbar = page.getByRole('toolbar', { name: '元件操作' })
    await toolbar.getByRole('button', { name: '圖片連結' }).click()
    const address = page.getByRole('textbox', { name: '圖片連結' })
    await address.fill('/registration')
    await address.press('Enter')
    const linked = await measure()
    expect(linked).toEqual({ ...original, linkWidth: original.width, linkHeight: 64 })
    await toolbar.getByRole('button', { name: '調整圖片構圖' }).click()
    await page.getByRole('button', { name: '橫跨整列', exact: true }).click()
    const full = await measure()
    expect(full.width).toBeGreaterThan(original.width * 1.9)
    expect(full.linkWidth).toBe(full.width)
    expect(full.height).toBe(64)
    await page.locator('select[data-framing="ratio"]').selectOption('1 / 1')
    const square = await measure()
    expect(square.height).toBeCloseTo(square.width, 0)
    expect(square.linkHeight).toBeCloseTo(square.height, 0)
    await page.getByRole('button', { name: '復原', exact: true }).click()
    expect(await measure()).toEqual(full)
    expect([...errors, ...readerErrors]).toEqual([])
  } finally {
    await reader.close()
  }
})

test('深層元件路徑可在有限寬度定位當前項，並以鍵盤跳到任意上層', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1000, height: 768 })
  await page.goto('/')
  await page.evaluate(() => {
    let branch: ComponentNode = {
      id: 'path-end',
      type: 'text',
      name: '報名連結的補充說明',
      content: '請攜帶報名確認信',
    }
    for (let depth = 16; depth > 0; depth--) {
      branch = {
        id: 'section-' + depth,
        type: 'section',
        name: '工作坊場次與報名資訊第 ' + depth + ' 層',
        children: [branch],
      }
    }
    localStorage.setItem('sigil-demo', JSON.stringify({ version: 1, root: branch }))
  })
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  await page.evaluate(() => {
    const app = (window as unknown as { __sigil: DemoApp }).__sigil
    app.engine.select('path-end')
  })
  const path = page.getByRole('navigation', { name: '元件路徑', exact: true })
  const current = path.locator('[aria-current="location"]')
  await expect(current).toHaveText('報名連結的補充說明')
  await expect(current).toBeInViewport({ ratio: 0.9 })
  const ancestor = path.getByRole('button', { name: '工作坊場次與報名資訊第 2 層', exact: true })
  await ancestor.focus()
  await expect(ancestor).toBeInViewport({ ratio: 0.9 })
  await ancestor.press('Enter')
  await expect(current).toHaveText('工作坊場次與報名資訊第 2 層')
  await expect(path.getByRole('button')).toHaveText(['工作坊場次與報名資訊第 1 層'])
  await expect(page.locator('.sigil-inspector-head')).toHaveText('工作坊場次與報名資訊第 2 層')
  expect(await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})

test('畫布元件工具列停靠在畫布下方，可選父層、複製、刪除及復原', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'sigil-demo',
      JSON.stringify({
        version: 1,
        root: {
          id: 'tool-root',
          type: 'section',
          style: { padding: '160px 24px 1000px' },
          children: [
            {
              id: 'tool-group',
              type: 'section',
              name: '活動資訊',
              children: [
                { id: 'tool-title', type: 'text', name: '活動標題', content: '週末工作坊' },
              ],
            },
            {
              id: 'tool-locked',
              type: 'text',
              name: '受保護的資訊',
              content: '聯絡我們',
              locked: true,
            },
          ],
        },
      }),
    )
  })
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const toolbar = page.getByRole('toolbar', { name: '元件操作', exact: true })
  const title = frame.getByText('週末工作坊', { exact: true })
  const box = await title.boundingBox()
  if (!box) throw new Error('找不到活動標題')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(toolbar).toBeVisible()
  await expect(toolbar).toContainText('活動標題')
  const beforeScroll = await toolbar.boundingBox()
  if (!beforeScroll) throw new Error('找不到畫布工具列')
  const iframeBox = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
  expect(beforeScroll.y).toBeGreaterThanOrEqual(iframeBox.y + iframeBox.height - 1)
  const titleBefore = (await title.boundingBox())!
  await frame.locator('body').evaluate((el) => el.ownerDocument.defaultView!.scrollBy(0, 50))
  await expect.poll(async () => Math.round(titleBefore.y - (await title.boundingBox())!.y)).toBe(50)
  expect((await toolbar.boundingBox())!.y).toBeCloseTo(beforeScroll.y)
  const parent = toolbar.getByRole('button', { name: '選取父層' })
  await parent.focus()
  await parent.press('Enter')
  await expect(toolbar).toContainText('活動資訊')
  await parent.press('ArrowRight')
  const duplicate = toolbar.getByRole('button', { name: '複製元件' })
  await expect(duplicate).toBeFocused()
  await duplicate.press('Enter')
  await expect(title).toHaveCount(2)
  await expect(frame.locator('[data-sigil-id="tool-group"] + [data-sigil-selected]')).toContainText(
    '週末工作坊',
  )
  await duplicate.press('ArrowRight')
  const remove = toolbar.getByRole('button', { name: '刪除元件' })
  await expect(remove).toBeFocused()
  await remove.press('Enter')
  await expect(title).toHaveCount(1)
  await expect(toolbar).toBeFocused()
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(title).toHaveCount(2)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(title).toHaveCount(1)
  const locked = await frame.getByText('聯絡我們', { exact: true }).boundingBox()
  if (!locked) throw new Error('找不到鎖定元件')
  await page.mouse.click(locked.x + locked.width / 2, locked.y + locked.height / 2)
  await expect(duplicate).toBeDisabled()
  await expect(toolbar.getByRole('button', { name: '刪除元件' })).toBeDisabled()
  await parent.click()
  await expect(toolbar.getByRole('button')).toHaveCount(0)
  await page.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(toolbar).toBeHidden()
  expect(errors).toEqual([])
})

test('匯入格線區域與個別欄線後，畫布和成品依相同斷點順序套用配置', async ({ page }, testInfo) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  const doc = {
    version: 1,
    root: {
      id: 'schedule',
      type: 'section',
      name: '場次表',
      style: { display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)' },
      children: [
        {
          id: 'session',
          type: 'text',
          tagName: 'h2',
          name: '場次標題',
          content: '午後場次',
          style: { 'grid-column': '1 / -1', 'grid-area': '2 / 2 / 3 / 4', 'grid-column-end': '5' },
          responsiveStyles: {
            tablet: { 'grid-column-end': '4', 'grid-column': 'auto' },
            mobile: { 'grid-area': '1 / 2 / 2 / 3' },
          },
        },
      ],
    },
  }
  await page.evaluate((data) => localStorage.setItem('sigil-demo', JSON.stringify(data)), doc)
  await page.getByRole('button', { name: '讀 localStorage' }).click()
  const title = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByRole('heading', { name: '午後場次' })
  const scenarios = [
    { device: '桌面', width: 1100, area: '2 / 2 / 3 / 5' },
    { device: '平板', width: 700, area: '2 / auto / 3 / auto' },
    { device: '手機', width: 400, area: '1 / 2 / 2 / 3' },
  ]
  async function expectArea(element: typeof title, area: string) {
    await expect
      .poll(() =>
        element.evaluate((node) => {
          const style = getComputedStyle(node)
          return [
            style.gridRowStart,
            style.gridColumnStart,
            style.gridRowEnd,
            style.gridColumnEnd,
          ].join(' / ')
        }),
      )
      .toBe(area)
  }
  for (const { device, area } of scenarios) {
    await page.getByRole('button', { name: device, exact: true }).click()
    await expectArea(title, area)
  }
  await page.getByRole('button', { name: '桌面', exact: true }).click()
  const root = page.getByRole('treeitem', { name: '場次表', exact: true })
  if ((await root.getAttribute('aria-expanded')) === 'false') await root.press('ArrowRight')
  await page.getByRole('treeitem', { name: '場次標題', exact: true }).click()
  await page.getByRole('tab', { name: '樣式', exact: true }).click()
  const controls = page.getByRole('group', { name: '格線項目配置' })
  await controls.getByRole('button', { name: '橫跨整列' }).click()
  await expectArea(title, '2 / 1 / 3 / -1')
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expectArea(title, scenarios[0]!.area)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '匯出 HTML' })
    .getByRole('button', { name: '下載 .html' })
    .click()
  const file = testInfo.outputPath('grid-schedule.html')
  await (await downloading).saveAs(file)
  await page.route('**/grid-schedule', (route) =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', path: file }),
  )
  await page.goto('/grid-schedule')
  for (const { width, area } of scenarios) {
    await page.setViewportSize({ width, height: 800 })
    await expectArea(page.getByRole('heading', { name: '午後場次' }), area)
  }
  expect(errors).toEqual([])
})

test('隱藏節點符合預覽，兩份匯出片段各自保留桌面、平板與手機樣式', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  const fragments: string[] = []
  for (const [name, desktop, tablet, mobile] of [
    ['春季活動', '32px', '24px', '16px'],
    ['夏季活動', '40px', '20px', '8px'],
  ] as const) {
    const doc = {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        name,
        style: { padding: desktop },
        responsiveStyles: { tablet: { padding: tablet }, mobile: { padding: mobile } },
        children: [
          { id: 'title', type: 'text', content: name },
          { id: 'draft', type: 'text', hidden: true, content: '草稿文字' },
        ],
      },
    }
    await page.evaluate((doc) => localStorage.setItem('sigil-demo', JSON.stringify(doc)), doc)
    await page.getByRole('button', { name: '讀 localStorage' }).click()
    const draft = page.frameLocator('iframe[title="編輯畫布"]').getByText('草稿文字')
    await expect(draft).toBeVisible()
    await page.getByRole('button', { name: '預覽', exact: true }).click()
    await expect(draft).toBeHidden()
    await page.getByRole('button', { name: '編輯', exact: true }).click()
    await expect(draft).toBeVisible()
    await page.getByRole('button', { name: '匯出', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '匯出 HTML' })
    fragments.push(await dialog.locator('textarea').inputValue())
    await page.keyboard.press('Escape')
  }

  await page.route('**/exported-fragments', (route) =>
    route.fulfill({
      contentType: 'text/html;charset=utf-8',
      body: ['<!doctype html><meta charset="utf-8">', ...fragments].join('\n'),
    }),
  )
  await page.goto('/exported-fragments')
  const spring = page.locator('section').filter({ hasText: '春季活動' })
  const summer = page.locator('section').filter({ hasText: '夏季活動' })
  for (const [width, first, second] of [
    [1024, '32px', '40px'],
    [768, '24px', '20px'],
    [375, '16px', '8px'],
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    await expect(spring).toHaveCSS('padding', first)
    await expect(summer).toHaveCSS('padding', second)
  }
  await expect(spring.getByText('草稿文字')).toBeHidden()
  expect(errors).toEqual([])
})

test('桌面主流程：右鍵排序、Undo／Redo 與雙擊文字編輯', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')

  const layerLabels = page.locator('.sigil-layer-label')
  await expect(layerLabels.nth(1)).toHaveText('標題文字')
  await expect(layerLabels.nth(2)).toHaveText('主按鈕')

  const layerTree = page.getByRole('tree', { name: '圖層', exact: true })
  const layerRows = layerTree.getByRole('treeitem')
  await layerRows.first().focus()
  await layerRows.first().press('ArrowRight')
  await expect(layerRows.nth(1)).toBeFocused()
  await layerRows.nth(1).press('Space')
  await expect(layerRows.nth(1)).toHaveAttribute('aria-selected', 'true')
  await layerRows.nth(1).press('Shift+F10')
  await expect(page.getByRole('menu', { name: '節點操作', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(layerRows.nth(1)).toBeFocused()

  const layerCount = await layerLabels.count()
  const addBlocks = page.getByRole('button', { name: '新增區塊', exact: true })
  const pageStructure = page.getByRole('button', { name: '頁面結構', exact: true })
  await addBlocks.click()
  const textBlock = page.getByRole('button', { name: '插入 文字', exact: true })
  await textBlock.focus()
  await textBlock.press('Enter')
  await pageStructure.click()
  await expect(layerLabels).toHaveCount(layerCount + 1)
  await expect(page.locator('.sigil-layer-row--active .sigil-layer-label')).toHaveText('text')

  await page.getByText('主按鈕', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '上移', exact: true }).click()
  await expect(layerLabels.nth(1)).toHaveText('主按鈕')
  await expect(layerLabels.nth(2)).toHaveText('標題文字')

  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(layerLabels.nth(1)).toHaveText('標題文字')
  await expect(layerLabels.nth(2)).toHaveText('主按鈕')

  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(layerLabels.nth(1)).toHaveText('主按鈕')
  await expect(layerLabels.nth(2)).toHaveText('標題文字')

  const canvasTitle = page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByText('點我編輯', { exact: true })
  const titleBox = await canvasTitle.boundingBox()
  expect(titleBox).not.toBeNull()
  if (!titleBox) throw new Error('找不到畫布標題位置')

  await page.mouse.dblclick(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2)
  const inlineEditor = page
    .frameLocator('iframe[title="編輯畫布"]')
    .locator('[contenteditable="true"]')
  await expect(inlineEditor).toHaveText('點我編輯')
  await inlineEditor.dispatchEvent('compositionstart')
  await inlineEditor.fill('E2E 標')
  await inlineEditor.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await inlineEditor.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
  await expect(inlineEditor).toBeFocused()
  await inlineEditor.fill('E2E 標題')
  await inlineEditor.dispatchEvent('compositionend', { data: '標題' })
  await inlineEditor.press('Enter')
  await expect(
    page.frameLocator('iframe[title="編輯畫布"]').getByText('E2E 標題', { exact: true }),
  ).toBeVisible()
  await expect(inlineEditor).toHaveCount(0)

  await addBlocks.click()
  const blockBox = await textBlock.boundingBox()
  const target = await page
    .frameLocator('iframe[title="編輯畫布"]')
    .getByText('E2E 標題', { exact: true })
    .boundingBox()
  if (!blockBox || !target) throw new Error('找不到拖放區塊或畫布標題')
  await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + 3, target.y + target.height / 2, { steps: 12 })
  await page.mouse.up()
  await pageStructure.click()
  await expect(layerLabels).toHaveCount(layerCount + 2)
  await expect(layerLabels.nth(2)).toHaveText('text')

  const exportButton = page.getByRole('button', { name: '匯出', exact: true })
  await exportButton.focus()
  await exportButton.press('Enter')
  const exportDialog = page.getByRole('dialog', { name: '匯出 HTML', exact: true })
  await expect(exportDialog).toHaveAttribute('aria-modal', 'true')
  const closeButtons = exportDialog.getByRole('button', { name: '關閉', exact: true })
  await closeButtons.first().focus()
  await page.keyboard.press('Shift+Tab')
  await expect(closeButtons.last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(exportDialog).toHaveCount(0)
  await expect(exportButton).toBeFocused()

  await expect
    .poll(() =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        app:
          document.querySelector('.sigil-app')!.scrollWidth -
          document.querySelector('.sigil-app')!.clientWidth,
      })),
    )
    .toEqual({ page: 0, app: 0 })
  expect(errors).toEqual([])
})

test('localStorage 保存：額度不足保留 dirty，重試成功才確認 checkpoint', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('treeitem', { name: '標題文字', exact: true }).click()
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
    .fill('必須保留的本機內容')

  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Reflect.set(window, '__restoreStorage', () => {
      Storage.prototype.setItem = original
    })
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'sigil-demo') {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  const persist = page.getByRole('button', { name: '寫入 localStorage', exact: true })
  await persist.click()
  await expect(page.locator('.sigil-status')).toContainText('存檔失敗')
  await expect(page.locator('#toolbar')).toContainText('失敗')
  expect(
    await page.evaluate(() => {
      const app = (window as unknown as { __sigil: DemoApp }).__sigil
      return {
        dirty: app.isDirty(),
        saving: app.isSaving(),
        stored: localStorage.getItem('sigil-demo'),
      }
    }),
  ).toEqual({ dirty: true, saving: false, stored: null })

  await page.evaluate(() => {
    const restore = Reflect.get(window, '__restoreStorage') as () => void
    restore()
    Reflect.deleteProperty(window, '__restoreStorage')
  })
  await persist.click()
  await expect(page.locator('#toolbar')).toContainText('已寫入 LS')
  await expect(page.getByText('hook:afterSave ok', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => {
      const app = (window as unknown as { __sigil: DemoApp }).__sigil
      return {
        dirty: app.isDirty(),
        saving: app.isSaving(),
        stored: localStorage.getItem('sigil-demo'),
      }
    }),
  ).toEqual({ dirty: false, saving: false, stored: expect.stringContaining('必須保留的本機內容') })
  expect(errors).toEqual([])
})

test('範本流程：另存、重命名、再插入與刪除', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const library = page.getByRole('button', { name: '新增區塊', exact: true })
  await library.click()
  await expect(page.getByRole('button', { name: 'Hero 組合 範本操作', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '頁面結構', exact: true }).click()
  await page.getByRole('treeitem', { name: '主按鈕', exact: true }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept('E2E 範本')
  })
  await page.getByRole('button', { name: '存為範本', exact: true }).click()
  await library.click()
  await expect(page.getByRole('button', { name: 'E2E 範本 範本操作', exact: true })).toBeVisible()

  const search = page.getByRole('searchbox', { name: '搜尋區塊', exact: true })
  await search.fill('範本 Ｅ２Ｅ')
  const pinnedOnly = page.getByRole('button', { name: '只看已釘選', exact: true })
  const pin = page.getByRole('button', { name: '釘選 E2E 範本', exact: true })
  await pin.press('Enter')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await pinnedOnly.click()
  await page.getByRole('button', { name: 'E2E 範本 範本操作', exact: true }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept('E2E 已改名')
  })
  await page.getByRole('menuitem', { name: '重新命名', exact: true }).click()
  await expect(page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true })).toBeVisible()
  await expect(search).toHaveValue('範本 Ｅ２Ｅ')
  await expect(page.getByRole('button', { name: '釘選 E2E 已改名', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const canvasButtons = page
    .frameLocator('iframe[title="編輯畫布"]')
    .locator('button[data-sigil-id]')
  const previousCount = await canvasButtons.count()
  await page.getByRole('button', { name: '插入 E2E 已改名', exact: true }).click()
  await expect(canvasButtons).toHaveCount(previousCount + 1)

  await page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  await page.getByRole('menuitem', { name: '刪除', exact: true }).click()
  await expect(page.getByRole('button', { name: 'E2E 已改名 範本操作', exact: true })).toHaveCount(
    0,
  )
  await expect(canvasButtons).toHaveCount(previousCount + 1)
  await expect(page.getByText('尚無已釘選區塊', { exact: true })).toBeVisible()
  await pinnedOnly.click()
  await search.fill('')
  await expect(page.getByRole('button', { name: '插入 Hero 組合', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('富文字：編輯、undo／redo、範本、save／load 與安全匯出', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const rich = frame.locator('[data-sigil-id="rich-demo"]')
  await expect(rich.locator('strong')).toHaveText('粗體')
  await expect(rich.locator('em')).toHaveText('斜體')
  await expect(rich.locator('a')).toHaveAttribute('href', 'https://example.com/')

  const richBox = await rich.boundingBox()
  expect(richBox).not.toBeNull()
  if (!richBox) throw new Error('找不到富文字位置')
  await page.mouse.dblclick(richBox.x + richBox.width / 2, richBox.y + richBox.height / 2)

  await expect(rich).toHaveAttribute('contenteditable', 'true')
  await expect(rich).toHaveAttribute('aria-label', '富文字內容')
  await rich.dispatchEvent('compositionstart')
  await rich.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
  await rich.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
  await expect(rich).toHaveAttribute('contenteditable', 'true')
  await rich.dispatchEvent('compositionend')
  await rich.locator('p').fill('取消這次修改')
  await rich.press('Escape')
  await expect(rich.locator('strong')).toHaveText('粗體')
  await expect(rich).toBeFocused()
  await page.mouse.dblclick(richBox.x + richBox.width / 2, richBox.y + richBox.height / 2)
  await rich.press('Control+Enter')
  await expect(rich).not.toHaveAttribute('contenteditable', 'true')
  await page.mouse.dblclick(richBox.x + richBox.width / 2, richBox.y + richBox.height / 2)
  await rich.locator('p').fill('富文字 E2E')
  await rich.locator('p').selectText()
  await frame.getByRole('button', { name: '粗體', exact: true }).click()
  await frame.getByRole('button', { name: '斜體', exact: true }).click()
  await frame.getByRole('button', { name: '安全連結', exact: true }).click()
  await frame.getByRole('button', { name: '完成', exact: true }).click()

  await expect(rich).not.toHaveAttribute('contenteditable', 'true')
  await expect(rich.locator('strong em a[href="https://example.com/"]')).toHaveText('富文字 E2E')
  await expect(rich).toBeFocused()

  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  await undo.click()
  await expect(rich).toContainText('這是 粗體、斜體與安全連結')
  await redo.click()
  await expect(rich.locator('strong em a')).toHaveText('富文字 E2E')

  page.once('dialog', async (dialog) => dialog.accept('富文字範本'))
  await page.getByRole('button', { name: '存為範本', exact: true }).click()
  await page.getByRole('button', { name: '新增區塊', exact: true }).click()
  await expect(page.getByRole('button', { name: '富文字範本 範本操作', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '插入 富文字範本', exact: true }).press('Enter')
  await expect(frame.getByText('富文字 E2E', { exact: true })).toHaveCount(2)

  await page.getByRole('button', { name: '寫入 localStorage', exact: true }).click()
  await expect(page.getByText('hook:afterSave ok', { exact: true })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __sigil: DemoApp }).__sigil.isDirty()))
    .toBe(false)
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  await expect(frame.locator('[data-sigil-id="rich-demo"] strong em a')).toHaveText('富文字 E2E')
  await expect(frame.getByText('富文字 E2E', { exact: true })).toHaveCount(2)

  await page.evaluate(() => {
    const app = (window as unknown as { __sigil: DemoApp }).__sigil
    const richNode = app.toJSON().root.children?.find((node) => node.id === 'rich-demo')
    app.engine.update('rich-demo', {
      content: `${richNode?.content ?? ''}<script>window.__sigilRichTextXss = true</script>`,
    })
  })
  await expect(frame.locator('[data-sigil-id="rich-demo"] script')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, '__sigilRichTextXss'))).toBeUndefined()

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const exported = page.getByRole('dialog', { name: '匯出 HTML', exact: true }).locator('textarea')
  await expect(exported).toHaveValue(
    /<p><strong><em><a href="https:\/\/example\.com\/">富文字 E2E<\/a><\/em><\/strong><\/p>/,
  )
  await expect(exported).not.toHaveValue(/<script/)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'compact')
  await page.getByRole('button', { name: '圖層／設定', exact: true }).click()
  const settings = page.locator('[data-compact-panel="settings"]')
  await settings.getByRole('treeitem', { name: '富文字', exact: true }).first().click()
  await expect(settings.locator('.sigil-rich-text-hint')).toHaveText('請在畫布編輯富文字')
  await expect
    .poll(() =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        app:
          document.querySelector('.sigil-app')!.scrollWidth -
          document.querySelector('.sigil-app')!.clientWidth,
      })),
    )
    .toEqual({ page: 0, app: 0 })
  expect(errors).toEqual([])
})

test('Marketing Hero：鍵盤插入、語意輸出與 responsive 預設', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  await page.getByRole('button', { name: '新增區塊', exact: true }).click()
  const insertHero = page.getByRole('button', { name: '插入 Hero 主視覺', exact: true })
  await insertHero.focus()
  await insertHero.press('Enter')

  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const hero = frame.locator('section[aria-label="主視覺"]')
  await expect(hero).toHaveCount(1)
  await expect(hero.locator('h1')).toHaveText('讓每個想法，都能快速成為漂亮頁面')
  await expect(hero.locator('p')).toContainText('適合各種裝置')
  await expect(hero.locator('button[type="button"]')).toHaveText('立即開始')
  await expect(hero.locator('h1')).toHaveCSS('font-size', '56px')

  await page.getByRole('button', { name: '手機', exact: true }).click()
  await expect(hero.locator('h1')).toHaveCSS('font-size', '36px')
  await expect(hero).toHaveCSS('min-height', '416px')

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const exported = page.getByRole('dialog', { name: '匯出 HTML', exact: true }).locator('textarea')
  await expect(exported).toHaveValue(/<section aria-label="主視覺"/)
  await expect(exported).toHaveValue(/<h1[^>]*>讓每個想法，都能快速成為漂亮頁面<\/h1>/)
  await expect(exported).toHaveValue(/@media \(max-width:480px\)/)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
  await expect
    .poll(async () => ({
      page: await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      app: await page
        .locator('.sigil-app')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
      canvas: await frame
        .locator('html')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
    }))
    .toEqual({ page: 0, app: 0, canvas: 0 })
  expect(errors).toEqual([])
})

test('Marketing Pricing：三方案、推薦狀態、responsive grid 與安全輸出', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  await page.getByRole('button', { name: '新增區塊', exact: true }).click()
  const insertPricing = page.getByRole('button', { name: '插入 Pricing 方案價格', exact: true })
  await insertPricing.focus()
  await insertPricing.press('Enter')

  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const pricing = frame.getByRole('region', { name: '方案價格', exact: true })
  const planList = pricing.getByRole('list', { name: '方案列表', exact: true })
  const plans = planList.locator(':scope > article[role="listitem"]')
  await expect(pricing.getByRole('heading', { name: '選擇適合你的成長方案' })).toBeVisible()
  await expect(plans).toHaveCount(3)
  await expect(plans.nth(0)).toContainText('入門')
  await expect(plans.nth(1)).toContainText('最受歡迎')
  await expect(plans.nth(1)).toHaveAttribute('data-featured', 'true')
  await expect(plans.nth(2)).toContainText('企業')
  await expect.poll(() => gridColumnCount(planList)).toBe(3)

  await page.getByRole('button', { name: '平板', exact: true }).click()
  await expect.poll(() => gridColumnCount(planList)).toBe(2)
  await page.getByRole('button', { name: '手機', exact: true }).click()
  await expect.poll(() => gridColumnCount(planList)).toBe(1)
  await expect(plans.nth(1)).toHaveCSS('transform', 'none')

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const exported = page.getByRole('dialog', { name: '匯出 HTML', exact: true }).locator('textarea')
  await expect(exported).toHaveValue(/<section aria-label="方案價格"/)
  await expect(exported).toHaveValue(/<article role="listitem" aria-label="專業方案"/)
  await expect(exported).toHaveValue(/<ul[^>]*>.*<li/s)
  await expect(exported).toHaveValue(/@media \(max-width:480px\)/)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
  await expect
    .poll(async () => ({
      page: await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      app: await page
        .locator('.sigil-app')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
      canvas: await frame
        .locator('html')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
    }))
    .toEqual({ page: 0, app: 0, canvas: 0 })
  expect(errors).toEqual([])
})

test('Marketing FAQ：語意問答、responsive grid 與安全輸出', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')

  await page.getByRole('button', { name: '新增區塊', exact: true }).click()
  const insertFAQ = page.getByRole('button', { name: '插入 FAQ 常見問題', exact: true })
  await insertFAQ.focus()
  await insertFAQ.press('Enter')

  const frame = page.frameLocator('iframe[title="編輯畫布"]')
  const faq = frame.getByRole('region', { name: '常見問題', exact: true })
  const faqList = faq.locator('dl[aria-label="常見問題列表"]')
  const items = faqList.locator(':scope > div')
  await expect(faq.getByRole('heading', { name: '開始之前，先了解這些' })).toBeVisible()
  await expect(items).toHaveCount(6)
  await expect(items.locator('dt')).toHaveCount(6)
  await expect(items.locator('dd')).toHaveCount(6)
  await expect(items.first().locator('dt')).toHaveText('Sigil 適合哪類產品？')
  await expect(items.last().locator('dd')).toContainText('不綁定後端技術')
  await expect.poll(() => gridColumnCount(faqList)).toBe(2)

  await page.getByRole('button', { name: '平板', exact: true }).click()
  await expect.poll(() => gridColumnCount(faqList)).toBe(1)
  await page.getByRole('button', { name: '手機', exact: true }).click()
  await expect.poll(() => gridColumnCount(faqList)).toBe(1)

  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const exported = page.getByRole('dialog', { name: '匯出 HTML', exact: true }).locator('textarea')
  await expect(exported).toHaveValue(/<section aria-label="常見問題"/)
  await expect(exported).toHaveValue(/<dl aria-label="常見問題列表"/)
  await expect(exported).toHaveValue(/<dt[^>]*>Sigil 適合哪類產品？<\/dt>/)
  await expect(exported).toHaveValue(/<dd[^>]*>適合需要在既有產品中加入視覺化內容編輯能力/)
  await expect(exported).toHaveValue(/@media \(max-width:480px\)/)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
  await expect
    .poll(async () => ({
      page: await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      app: await page
        .locator('.sigil-app')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
      canvas: await frame
        .locator('html')
        .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth)),
    }))
    .toEqual({ page: 0, app: 0, canvas: 0 })
  expect(errors).toEqual([])
})

test('390px compact：抽屜、焦點、主題與 overflow', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const app = page.locator('.sigil-app')
  const blocksToggle = page.getByRole('button', { name: '區塊', exact: true })
  const settingsToggle = page.getByRole('button', { name: '圖層／設定', exact: true })
  const blocks = page.locator('[data-compact-panel="blocks"]')
  const settings = page.locator('[data-compact-panel="settings"]')
  const backdrop = page.locator('.sigil-panel-backdrop')

  await expect(app).toHaveAttribute('data-layout', 'compact')
  await expect(blocksToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false')

  await blocksToggle.click()
  await expect(blocks).toHaveAttribute('data-open', 'true')
  await expect(blocks).toHaveAttribute('aria-hidden', 'false')
  await expect(settings).toHaveAttribute('data-open', 'false')
  await blocks.getByRole('searchbox', { name: '搜尋區塊', exact: true }).fill('文字')
  await expect(blocks.getByRole('button', { name: '插入 文字', exact: true })).toBeVisible()

  const backdropBox = await backdrop.boundingBox()
  expect(backdropBox).not.toBeNull()
  if (!backdropBox) throw new Error('找不到面板背景')
  await backdrop.click({
    position: { x: backdropBox.width - 8, y: backdropBox.height / 2 },
  })
  await expect(blocks).toHaveAttribute('data-open', 'false')
  await expect(blocksToggle).toBeFocused()

  await settingsToggle.click()
  await expect(settings).toHaveAttribute('data-open', 'true')
  await expect(settings.getByRole('button', { name: '圖層', exact: true })).toBeFocused()
  const targets = app.locator('.sigil-topbar button:visible, [data-open="true"] .sigil-panel-close')
  const smallestTarget = await targets.evaluateAll((buttons) =>
    Math.min(
      ...buttons.flatMap((button) => {
        const { width, height } = button.getBoundingClientRect()
        return [width, height]
      }),
    ),
  )
  expect(smallestTarget).toBeGreaterThanOrEqual(44)
  expect((await app.locator('.sigil-canvas-wrap').boundingBox())!.height).toBeGreaterThan(300)
  const heroLayer = settings.getByRole('treeitem', { name: '主圖', exact: true })
  await heroLayer.press('Enter')
  const contentTab = settings.getByRole('tab', { name: '內容' })
  await expect(contentTab).toBeFocused()
  await contentTab.press('ArrowRight')
  const styleTab = settings.getByRole('tab', { name: '樣式' })
  await expect(styleTab).toBeFocused()
  await expect(settings.getByRole('tabpanel', { name: '樣式' })).toBeVisible()
  await styleTab.press('Home')
  await expect(contentTab).toBeFocused()
  await settings.getByRole('button', { name: '圖層', exact: true }).click()
  await heroLayer.click()
  const pick = settings.getByRole('button', { name: '選圖', exact: true })
  await pick.click()
  const media = page.getByRole('dialog', { name: '媒體庫', exact: true })
  await expect(media).toBeVisible()
  await media.getByRole('button', { name: '關閉', exact: true }).press('Delete')
  await expect(settings.locator('[role="treeitem"][aria-label="主圖"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(media).toHaveCount(0)
  await expect(pick).toBeFocused()
  await expect(settings).toHaveAttribute('data-open', 'true')
  await page.keyboard.press('Escape')
  await expect(settings).toHaveAttribute('data-open', 'false')
  await expect(settingsToggle).toBeFocused()

  const theme = page.locator('.sigil-topbar button[title="主題"]')
  await page.getByRole('button', { name: '更多工具', exact: true }).click()
  await theme.click()
  await theme.click()
  await expect(app).toHaveClass(/sigil-theme-dark/)
  await settingsToggle.click()
  const selectedRow = settings.getByRole('treeitem', { selected: true })
  const accent = await app
    .locator('.sigil-topbar-brand')
    .evaluate((el) => getComputedStyle(el).color)
  await expect(selectedRow).toHaveCSS('color', accent)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector('.sigil-app')!
        const topbar = document.querySelector('.sigil-topbar')!
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          app: root.scrollWidth - root.clientWidth,
          topbar: topbar.scrollWidth - topbar.clientWidth,
        }
      }),
    )
    .toEqual({ page: 0, app: 0, topbar: 0 })
  expect(errors).toEqual([])
})

async function gridColumnCount(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
  )
}

test('runtime locale：保留 App 狀態、套用 override 與更新完整介面', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '平板', exact: true }).click()
  await page.evaluate(() => {
    const app = (window as unknown as { __sigil: DemoApp }).__sigil
    app.engine.select('rich-demo')
    app.engine.update('rich-demo', { content: '<p>locale state</p>' })
    Reflect.set(window, '__sigilLocaleProbe', {
      app,
      engine: app.engine,
      root: document.querySelector('.sigil-app'),
      tree: app.engine.getTree(),
    })
  })
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
  await page.getByRole('button', { name: '中/EN', exact: true }).click()

  expect(
    await page.evaluate(() => {
      const app = (window as unknown as { __sigil: DemoApp }).__sigil
      const probe = Reflect.get(window, '__sigilLocaleProbe') as {
        app: DemoApp
        engine: DemoApp['engine']
        root: Element
        tree: DemoNode
      }
      return {
        sameApp: app === probe.app,
        sameEngine: app.engine === probe.engine,
        sameRoot: document.querySelector('.sigil-app') === probe.root,
        sameTree: app.engine.getTree() === probe.tree,
        locale: app.getLocale(),
        selection: app.engine.getSelection(),
        content: app.engine.getTree().children?.find((node) => node.id === 'rich-demo')?.content,
      }
    }),
  ).toEqual({
    sameApp: true,
    sameEngine: true,
    sameRoot: true,
    sameTree: true,
    locale: 'en',
    selection: 'rich-demo',
    content: '<p>locale state</p>',
  })

  const app = page.locator('.sigil-app')
  await expect(app).toHaveAttribute('data-layout', 'desktop')
  await expect(page.locator('.sigil-topbar-brand')).toHaveText('Sigil Demo')
  await expect(page.locator('.sigil-status-dirty')).toHaveText('Unsaved')
  const localizedPath = page.getByRole('navigation', { name: 'Component path', exact: true })
  await expect(localizedPath.getByRole('button', { name: '首區', exact: true })).toBeVisible()
  await expect(localizedPath.locator('[aria-current="location"]')).toHaveText('富文字')
  await expect(page.getByRole('button', { name: 'Tablet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Save as Template', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  const layerTree = page.getByRole('tree', { name: 'Layers', exact: true })
  await expect(layerTree).toBeVisible()
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search blocks', exact: true })).toHaveAttribute(
    'placeholder',
    'Search blocks…',
  )
  await expect(page.getByRole('button', { name: 'Insert 文字', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Page structure', exact: true }).click()
  await expect(layerTree.getByRole('button', { name: 'Hide', exact: true }).first()).toBeVisible()
  await expect(layerTree.getByRole('button', { name: 'Lock', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(page.locator('.sigil-help-panel li')).toHaveText([
    'Delete / Backspace — Delete',
    'Ctrl/Cmd+Z — Undo',
    'Ctrl/Cmd+Shift+Z / Y — Redo',
    'Ctrl/Cmd+C / V — Copy / Paste',
    'Ctrl/Cmd+S — Save',
  ])
  await page.getByRole('button', { name: 'Keys', exact: true }).click()

  await layerTree.getByRole('treeitem', { name: '主圖', exact: true }).click()
  await expect(page.locator('.sigil-tab')).toHaveText(['Content', 'Style', 'Advanced'])
  await expect(page.locator('.sigil-inspector .sigil-field-label')).toHaveText([
    'Image',
    'Alternative text',
    'Image link',
    'Link to section',
  ])
  await page.getByRole('button', { name: 'Choose image', exact: true }).click()
  const media = page.getByRole('dialog', { name: 'Media library', exact: true })
  await expect(media).toBeVisible()
  await expect(media.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await media.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(media).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(app).toHaveAttribute('data-layout', 'compact')
  const blocksToggle = page.getByRole('button', { name: 'Blocks', exact: true })
  await blocksToggle.click()
  const blocks = page.locator('[data-compact-panel="blocks"]')
  await expect(blocks).toHaveAttribute('data-open', 'true')
  await expect(blocks.getByRole('searchbox', { name: 'Search blocks', exact: true })).toBeVisible()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector('.sigil-app')!
        const topbar = document.querySelector('.sigil-topbar')!
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          app: root.scrollWidth - root.clientWidth,
          topbar: topbar.scrollWidth - topbar.clientWidth,
        }
      }),
    )
    .toEqual({ page: 0, app: 0, topbar: 0 })

  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  await expect(page.locator('.sigil-topbar-brand')).toHaveText('Sigil')
  await expect(blocks.getByRole('searchbox', { name: '搜尋區塊', exact: true })).toHaveAttribute(
    'placeholder',
    '搜尋區塊…',
  )
  expect(
    await page.evaluate(() => {
      const app = (window as unknown as { __sigil: DemoApp }).__sigil
      const probe = Reflect.get(window, '__sigilLocaleProbe') as { app: DemoApp; engine: unknown }
      return {
        sameApp: app === probe.app,
        sameEngine: app.engine === probe.engine,
        locale: app.getLocale(),
      }
    }),
  ).toEqual({ sameApp: true, sameEngine: true, locale: 'zh' })
  expect(errors).toEqual([])
})
