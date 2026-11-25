import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { createActivityDocument } from '../examples/laravel/resources/js/activity-template'
import { prepareDemo } from './demo-fixture'
import { enforcedPolicy } from './security-policy'
import { expectSessionLayout, workshopSessions } from './responsive-wrap'

const canvas = (page: Page) => page.frameLocator('iframe[title="編輯畫布"]')

// Check the painted text after ancestor clipping, including a drawer transition or line clamp.
async function highlightedTextIsVisible(highlight: Locator): Promise<boolean> {
  return highlight.evaluate((mark) => {
    const node = mark.firstChild
    if (!(node instanceof Text) || !node.length) return false
    const range = document.createRange()
    let offset = 0
    for (const character of node.data) {
      range.setStart(node, offset)
      offset += character.length
      range.setEnd(node, offset)
      const rect = range.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (!rect.width || !mark.parentElement!.contains(hit)) return false
    }
    return true
  })
}

// An opaque raspberry-red 3 × 2 PNG with a known pixel value for the offline export.
const photoFile = {
  name: '我的版畫.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGO4oxEKQQxwFgBUGggXKr8ekwAAAABJRU5ErkJggg==',
    'base64',
  ),
}

async function coverCenter(page: Page): Promise<[number, number]> {
  const cover = canvas(page).getByRole('img')
  await cover.scrollIntoViewIfNeeded()
  const image = (await cover.boundingBox())!
  const frame = (await page.locator('iframe[title="編輯畫布"]').boundingBox())!
  const x =
    (Math.max(image.x, frame.x) + Math.min(image.x + image.width, frame.x + frame.width)) / 2
  const y =
    (Math.max(image.y, frame.y) + Math.min(image.y + image.height, frame.y + frame.height)) / 2
  return [x, y]
}

async function choosePhotoFile(page: Page, file: typeof photoFile): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('dialog').getByRole('button', { name: '加入裝置照片', exact: true }).click()
  await (await chooser).setFiles(file)
}

async function activityLayer(page: Page, branch: string[], name: string) {
  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  for (const ancestor of branch) {
    const row = tree.getByRole('treeitem', { name: ancestor, exact: true })
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.press('ArrowRight')
  }
  return tree.getByRole('treeitem', { name, exact: true })
}

const titleLayer = (page: Page) => activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '活動標題')
const insertAfterSelection = (page: Page) =>
  page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '在下方新增區塊', exact: true })

function faqLibrary(page: Page) {
  const library = page.locator('.sigil-blocks-panel')
  return {
    library,
    search: library.getByRole('searchbox', { name: '搜尋區塊' }),
    pin: library.getByRole('button', { name: '釘選 折疊式 FAQ', exact: true }),
    filter: library.getByRole('button', { name: '只看已釘選', exact: true }),
    insert: library.getByRole('button', { name: '插入 折疊式 FAQ', exact: true }),
    results: library.getByRole('button', { name: /^插入 / }),
    afterTitle: canvas(page).locator('[data-sigil-id="activity-title"] + [data-faq-accordion]'),
  }
}

async function expectGridColumns(grid: Locator, columns: number) {
  await expect(grid).toHaveCSS('display', 'grid')
  const measure = () =>
    grid.evaluate((node) => {
      const parent = node.getBoundingClientRect()
      const children = [...node.children].map((el) => {
        const rect = el.getBoundingClientRect()
        const margin = getComputedStyle(el)
        return {
          x: Math.round(rect.left - parent.left - parseFloat(margin.marginLeft)),
          y: Math.round(rect.top - parent.top - parseFloat(margin.marginTop)),
        }
      })
      const tracks = getComputedStyle(node).gridTemplateColumns.split(/\s+/).map(parseFloat)
      return { children, tracks }
    })
  await expect.poll(async () => (await measure()).tracks.length).toBe(columns)
  const { children, tracks } = await measure()
  expect(tracks.every((width) => width > 0)).toBe(true)
  expect(Math.max(...tracks) - Math.min(...tracks)).toBeLessThan(1)
  expect(children.length).toBeGreaterThan(columns)
  for (let index = 1; index < children.length; index++) {
    const child = children[index]!
    if (index < columns) expect(child.x).toBeGreaterThan(children[index - 1]!.x)
    else {
      expect(child.x).toBe(children[index % columns]!.x)
      expect(child.y).toBeGreaterThan(children[index - columns]!.y)
    }
  }
  return { columns, tracks, children }
}

async function expectInfoTitlePlacement(grid: Locator, columns: number, full: boolean) {
  const layout = await grid.evaluate((element) => {
    const style = getComputedStyle(element)
    const origin = element.getBoundingClientRect()
    const tracks = style.gridTemplateColumns.split(/\s+/).map(parseFloat)
    const children = Array.from(element.children, (child) => {
      const rect = child.getBoundingClientRect()
      const margin = getComputedStyle(child)
      return {
        x: rect.left - origin.left - parseFloat(margin.marginLeft),
        y: rect.top - origin.top - parseFloat(margin.marginTop),
        width: rect.width + parseFloat(margin.marginLeft) + parseFloat(margin.marginRight),
      }
    })
    return { tracks, gap: parseFloat(style.columnGap), children }
  })
  expect(layout.tracks).toHaveLength(columns)
  expect(layout.children).toHaveLength(4)
  const title = layout.children[0]!
  const rowWidth = layout.tracks.reduce((sum, n) => sum + n, 0) + (columns - 1) * layout.gap
  expect(Math.abs(title.width - (full ? rowWidth : layout.tracks[0]!))).toBeLessThan(1)
  const rowTops = [title.y]
  for (const [index, child] of layout.children.slice(1).entries()) {
    const slot = index + (full ? 0 : 1)
    const column = slot % columns
    const row = Math.floor(slot / columns) + (full ? 1 : 0)
    const offset = layout.tracks.slice(0, column).reduce((sum, n) => sum + n + layout.gap, 0)
    expect(Math.abs(child.x - title.x - offset)).toBeLessThan(1)
    if (rowTops[row] === undefined) {
      expect(child.y).toBeGreaterThan(rowTops[row - 1]!)
      rowTops[row] = child.y
    }
    expect(Math.abs(child.y - rowTops[row]!)).toBeLessThan(1)
  }
  return layout
}

async function editTitle(page: Page, value: string): Promise<void> {
  await (await titleLayer(page)).click()
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
    .fill(value)
  await expect(canvas(page).getByRole('heading', { name: value })).toBeVisible()
}

async function downloadLinkPage(page: Page, path: string): Promise<void> {
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
  await (await downloading).saveAs(path)
}

function moveControls(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: '元件操作' })
  const dialog = page.getByRole('dialog', { name: '移動元件' })
  return {
    toolbar,
    open: toolbar.getByRole('button', { name: '移動元件', exact: true }),
    dialog,
    search: dialog.getByRole('searchbox', { name: '搜尋目的地' }),
    destination: dialog.getByRole('combobox', { name: '目的地', exact: true }),
    position: dialog.getByRole('combobox', { name: '插入位置' }),
    before: dialog.getByRole('combobox', { name: '放在這個元件之前' }),
    cancel: dialog.getByRole('button', { name: '取消', exact: true }),
    confirm: dialog.getByRole('button', { name: '移動', exact: true }),
  }
}

test('鍵盤新增標題區塊並進入文字格式選單，復原與存檔保留位置', async ({ page }, testInfo) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const frame = canvas(page)
  const info = frame.locator('#event-info')
  const existing = info.getByRole('heading', { level: 2, name: '活動資訊', exact: true })
  const next = info.locator(':scope > :nth-child(2)')
  const originalNextId = await next.getAttribute('data-sigil-id')
  const panel = page.locator('.sigil-inspector')
  const format = panel.getByRole('combobox', { name: '文字格式', exact: true })
  const content = panel.getByRole('textbox', { name: '內容', exact: true })
  const action = (name: string) => page.getByRole('button', { name, exact: true }).press('Enter')
  await (await activityLayer(page, ['活動頁', '活動資訊'], '資訊標題')).press('Enter')
  await expect(existing).toHaveAttribute('data-sigil-selected', '1')
  await expect(format).toHaveValue('h2')
  await existing.scrollIntoViewIfNeeded()
  const box = (await existing.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(info.getByRole('textbox', { name: '資訊標題', exact: true })).toBeFocused()
  await page.keyboard.insertText('活動時程與資訊')
  await format.focus()
  await expect(content).toHaveValue('活動時程與資訊')
  await expect(info.getByRole('heading', { name: '活動時程與資訊', level: 2 })).toHaveAttribute(
    'data-sigil-selected',
    '1',
  )
  await action('復原')
  await expect(existing).toHaveText('活動資訊')
  await expect(content).toHaveValue('活動資訊')
  await insertAfterSelection(page).press('Enter')
  const library = page.locator('.sigil-blocks-panel')
  const search = library.getByRole('searchbox', { name: '搜尋區塊' })
  await expect(search).toBeFocused()
  await search.fill('heading')
  await library.getByRole('button', { name: '插入 標題', exact: true }).press('Enter')
  await expect(next).toHaveJSProperty('localName', 'h2')
  await expect(next).toHaveAttribute('data-sigil-selected', '1')
  const id = (await next.getAttribute('data-sigil-id'))!
  const name = '工作坊時程'
  await content.fill(name)
  await expect(info.getByRole('heading', { name, level: 2, exact: true })).toHaveText(name)
  await content.press('Tab')
  await expect(format).toBeFocused()
  await format.selectOption('h3')
  await expect(format).toBeFocused()
  await expect(format).toHaveValue('h3')
  await expect(next).toHaveAttribute('data-sigil-id', id)
  await expect(next).toHaveJSProperty('localName', 'h3')
  await expect(next).toHaveAttribute('data-sigil-selected', '1')
  await expect(info.getByRole('heading', { name, level: 3, exact: true })).toHaveText(name)
  await expect(info.locator(':scope > :nth-child(3)')).toHaveAttribute(
    'data-sigil-id',
    originalNextId!,
  )
  await action('復原')
  await expect(next).toHaveJSProperty('localName', 'h2')
  await expect(next).toHaveText(name)
  await expect(format).toHaveValue('h2')
  await action('重做')
  await expect(format).toHaveValue('h3')
  if (testInfo.project.name === 'chromium') {
    await next.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('heading-format-desktop.png'),
      animations: 'disabled',
    })
  }
  await action('存檔')
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await action('預覽')
  await expect(frame.getByRole('heading', { level: 1, name: '秋日設計工作坊' })).toBeVisible()
  await expect(existing).toBeVisible()
  await expect(info.getByRole('heading', { name, level: 3, exact: true })).toBeVisible()
  await expect(next).toHaveText(name)
  expect(errors).toEqual([])
})

test('頁面色票可用鍵盤重用半透明文字顏色，取消無效值、復原並重開草稿', async ({
  page,
}, testInfo) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const panel = page.locator('.sigil-inspector')
  const title = canvas(page).locator('[data-sigil-id="activity-title"]')
  const organizer = canvas(page).getByText('城市創作空間', { exact: true })
  const titleColor = await title.evaluate((el) => getComputedStyle(el).color)
  const color = panel.locator('[data-color-property="color"]')
  const value = color.getByRole('textbox', { name: '文字顏色', exact: true })
  const palette = color.getByRole('button', { name: '頁面色票', exact: true })
  const rgba = 'rgba(106, 31, 76, 0.8)'
  const swatch = color.getByRole('button', { name: rgba, exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })

  await (await activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '主辦單位')).press('Enter')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  await panel.getByRole('button', { name: '文字', exact: true }).press('Enter')
  await expect(value).toHaveValue('#3c5086')
  await value.fill('#12')
  await value.press('Enter')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await expect(organizer).toHaveCSS('color', 'rgb(60, 80, 134)')
  await expect(save).toBeDisabled()
  await value.press('Escape')
  await expect(value).toHaveValue('#3c5086')
  await value.fill('var(--workshop-ink, #245678)')
  await value.press('Enter')
  await expect(value).toHaveAttribute('aria-invalid', 'true')
  await expect(color.getByText('此編輯器無法儲存這個色值', { exact: true })).toBeVisible()
  await expect(organizer).toHaveCSS('color', 'rgb(60, 80, 134)')
  await value.press('Escape')
  await expect(value).toHaveValue('#3c5086')
  await expect(save).toBeDisabled()
  await value.fill(rgba)
  await expect(save).toBeDisabled()
  await value.press('Enter')
  await expect(organizer).toHaveCSS('color', rgba)
  await undo.press('Enter')
  await expect(organizer).toHaveCSS('color', 'rgb(60, 80, 134)')
  await expect(save).toBeDisabled()
  await redo.press('Enter')
  await (await titleLayer(page)).press('Enter')
  await palette.press('Enter')
  await expect(swatch).toBeVisible()
  const firstColor = color.locator('.sigil-color-option').first()
  await palette.press('Tab')
  await expect(firstColor).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(swatch).toBeHidden()
  await expect(palette).toBeFocused()
  await palette.press('Enter')
  await swatch.press('Enter')
  await expect(title).toHaveCSS('color', rgba)
  await expect(palette).toBeFocused()
  await undo.press('Enter')
  await expect(title).toHaveCSS('color', titleColor)
  await expect(organizer).toHaveCSS('color', rgba)
  await redo.press('Enter')
  await expect(title).toHaveCSS('color', rgba)
  if (testInfo.project.name === 'chromium') {
    await palette.press('Enter')
    await expect(swatch).toHaveAttribute('aria-pressed', 'true')
    await color.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('page-colors-desktop.png'),
      animations: 'disabled',
    })
    await swatch.press('Escape')
  }
  await save.press('Enter')
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await expect(title).toHaveCSS('color', rgba)
  await expect(organizer).toHaveCSS('color', rgba)
  expect(errors).toEqual([])
})

function readTypography(text: Locator) {
  return text.evaluate((element) => {
    const style = getComputedStyle(element)
    const px = (value: string) => Math.round(parseFloat(value) * 10) / 10
    return {
      size: px(style.fontSize),
      line: px(style.lineHeight),
      weight: style.fontWeight,
      spacing: style.letterSpacing === 'normal' ? 0 : px(style.letterSpacing),
    }
  })
}

test('從畫布調整文字排版，整組套用與復原後仍可單獨編輯平板字距', async ({
  page,
  browser,
}, testInfo) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto('/activity/')
  expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
  const title = canvas(page).getByRole('heading', { name: '秋日設計工作坊', level: 1 })
  const before = await readTypography(title)
  const originalColor = await title.evaluate((el) => getComputedStyle(el).color)
  const heading = { size: 32, line: 40, weight: '600', spacing: -0.5 }
  const tablet = { ...heading, spacing: 1.6 }
  const panel = page.locator('.sigil-inspector')
  const preset = panel.getByRole('combobox', { name: '文字排版預設', exact: true })
  const spacing = panel.getByRole('textbox', { name: '字距', exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  await (await titleLayer(page)).press('Enter')
  const toolbar = page.getByRole('toolbar', { name: '元件操作' })
  await toolbar.getByRole('button', { name: '調整文字排版' }).press('Enter')
  await expect(preset).toBeFocused()
  await expect(undo).toBeDisabled()
  await preset.selectOption({ label: '章節標題' })
  await expect.poll(() => readTypography(title)).toEqual(heading)
  await expect(title).toHaveCSS('color', originalColor)
  await undo.press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(before)
  await expect(undo).toBeDisabled()
  await expect(save).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(heading)

  await page.getByRole('button', { name: '平板', exact: true }).press('Enter')
  await expect(spacing).toHaveAttribute('data-style-inherited', 'true')
  await spacing.fill('wrong-unit')
  await spacing.press('Enter')
  await expect(spacing).toHaveAttribute('aria-invalid', 'true')
  await expect.poll(() => readTypography(title)).toEqual(heading)
  await spacing.press('Escape')
  await spacing.fill('0.05em')
  await spacing.press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(tablet)
  await page.getByRole('button', { name: '手機', exact: true }).press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(tablet)
  await expect(spacing).toHaveAttribute('data-style-source', 'tablet')
  await page.getByRole('button', { name: '桌面', exact: true }).press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(heading)
  await expect(preset).toHaveValue('heading')
  if (testInfo.project.name === 'chromium') {
    await preset.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.screenshot({
      path: testInfo.outputPath('typography-desktop.png'),
      animations: 'disabled',
    })
  }
  await save.press('Enter')
  await expect(save).toBeDisabled()
  await page.reload()
  await expect.poll(() => readTypography(title)).toEqual(heading)
  await page.getByRole('button', { name: '匯出', exact: true }).press('Enter')
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).press('Enter')
  const file = testInfo.outputPath('typography.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const h1 = exported.getByRole('heading', { name: '秋日設計工作坊', level: 1 })
    const samples = []
    for (const width of [769, 768, 375]) {
      await exported.setViewportSize({ width, height: 812 })
      await expect.poll(() => readTypography(h1)).toEqual(width > 768 ? heading : tablet)
      samples.push({ width, ...(await readTypography(h1)) })
    }
    await testInfo.attach('offline-typography', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    })
    await expect(h1).toHaveCSS('color', originalColor)
  } finally {
    await reader.close()
  }
  expect(errors).toEqual([])
})

test('匯入 font 簡寫後套用文字排版，復原與離線 HTML 都保留字型家族及斜體', async ({
  page,
  browser,
}, testInfo) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  const doc = {
    version: 1,
    root: {
      id: 'program',
      type: 'section',
      name: '工作坊',
      children: [
        {
          id: 'sessions',
          type: 'text',
          name: '活動場次',
          tagName: 'h2',
          content: 'Workshop sessions',
          style: {
            'font-size': '92px',
            'font-weight': '900',
            'line-height': '3',
            font: 'italic 500 24px/1.5 Georgia, serif',
            'letter-spacing': '1px',
          },
        },
      ],
    },
  }
  await page.evaluate((draft) => localStorage.setItem('sigil-demo', JSON.stringify(draft)), doc)
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  const title = canvas(page).getByRole('heading', { name: 'Workshop sessions', level: 2 })
  const before = { size: 24, line: 36, weight: '500', spacing: 1 }
  const after = { size: 16, line: 25.6, weight: '400', spacing: 0 }
  await expect.poll(() => readTypography(title)).toEqual(before)
  const family = await title.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).toMatch(/Georgia/i)
  const layer = await activityLayer(page, ['工作坊'], '活動場次')
  await layer.press('Enter')
  await page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '調整文字排版' })
    .press('Enter')
  const preset = page.getByRole('combobox', { name: '文字排版預設', exact: true })
  await preset.selectOption({ label: '內文' })
  await expect.poll(() => readTypography(title)).toEqual(after)
  await expect(title).toHaveCSS('font-style', 'italic')
  await expect(title).toHaveCSS('font-family', family)
  const undo = page.getByRole('button', { name: '復原', exact: true })
  await undo.press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(before)
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await expect.poll(() => readTypography(title)).toEqual(after)
  await page.getByRole('button', { name: '匯出', exact: true }).press('Enter')
  const downloading = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: '下載 .html' }).press('Enter')
  const file = testInfo.outputPath('font-shorthand.html')
  await (await downloading).saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const h2 = exported.getByRole('heading', { name: 'Workshop sessions', level: 2 })
    await expect.poll(() => readTypography(h2)).toEqual(after)
    await expect(h2).toHaveCSS('font-style', 'italic')
    await expect(h2).toHaveCSS('font-family', family)
    await testInfo.attach('shorthand-typography', {
      body: JSON.stringify({ ...(await readTypography(h2)), family, fontStyle: 'italic' }),
      contentType: 'application/json',
    })
  } finally {
    await reader.close()
  }
  expect(errors).toEqual([])
})

test('活動資訊的格線欄數在桌面、平板與手機可各自調整、繼承及預覽', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  await (await activityLayer(page, ['活動頁'], '活動資訊')).press('Enter')
  const panel = page.locator('.sigil-inspector')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  const columns = (count: number) => panel.getByRole('button', { name: count + ' 欄', exact: true })
  const grid = canvas(page).locator('#event-info')
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  const device = (name: string) => page.getByRole('button', { name, exact: true })
  const readings = []
  await expectGridColumns(grid, 1)
  await columns(3).press('Enter')
  readings.push(await expectGridColumns(grid, 3))
  await expect(columns(3)).toHaveAttribute('aria-pressed', 'true')
  await columns(3).press('Delete')
  await expect(grid).toHaveAttribute('data-sigil-selected', '1')
  await undo.press('Enter')
  await expectGridColumns(grid, 1)
  await expect(undo).toBeDisabled()
  await redo.press('Enter')
  await expectGridColumns(grid, 3)
  await grid.scrollIntoViewIfNeeded()
  await columns(3).scrollIntoViewIfNeeded()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: testInfo.outputPath('grid-desktop.png'), animations: 'disabled' })
  await device('平板').press('Enter')
  await expectGridColumns(grid, 3)
  await columns(2).press('Enter')
  readings.push(await expectGridColumns(grid, 2))
  await device('手機').press('Enter')
  await expectGridColumns(grid, 2)
  await columns(1).press('Enter')
  readings.push(await expectGridColumns(grid, 1))
  const inherit = panel.locator('[data-grid-inherit]')
  await inherit.press('Enter')
  await expectGridColumns(grid, 2)
  await expect(inherit).toBeDisabled()
  await expect(columns(2)).toBeFocused()
  await undo.press('Enter')
  await expectGridColumns(grid, 1)
  await redo.press('Enter')
  await expectGridColumns(grid, 2)
  await columns(1).press('Enter')
  await device('存檔').press('Enter')
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await expect(device('存檔')).toBeDisabled()
  await page.reload()
  await device('預覽').press('Enter')
  for (const [mode, count] of [
    ['桌面', 3],
    ['平板', 2],
    ['手機', 1],
  ] as const) {
    await device(mode).press('Enter')
    await expectGridColumns(grid, count)
  }
  await testInfo.attach('grid-geometry', {
    body: JSON.stringify(readings),
    contentType: 'application/json',
  })
})

for (const touch of [false, true]) {
  test.describe(touch ? '手機場次排列' : '桌面場次排列', () => {
    test.use({
      hasTouch: touch,
      viewport: touch ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    })
    test('換行保留反向橫排順序，分別調整行列距離後可以復原', async ({ page }, testInfo) => {
      const errors = await prepareDemo(page)
      const response = await page.goto('/activity/')
      expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
      await page.evaluate(
        (doc) => localStorage.setItem('sigil-demo-activity-v1', JSON.stringify(doc)),
        workshopSessions(),
      )
      await page.reload()
      const section = canvas(page).locator('#sessions')
      const activate = (locator: Locator) => (touch ? locator.tap() : locator.press('Enter'))
      const toggleDrawer = page.getByRole('button', { name: '圖層／設定', exact: true })
      const drawer = page.locator('[data-compact-panel="settings"]')
      if (touch) await activate(toggleDrawer)
      await activate(await activityLayer(page, ['工作坊'], '場次列表'))
      const inspector = page.locator('.sigil-inspector')
      await activate(inspector.getByRole('tab', { name: '樣式', exact: true }))
      const mode = inspector.getByRole('combobox', { name: '項目換行', exact: true })
      const expand = inspector.getByRole('button', { name: '分別調整間距', exact: true })
      const row = inspector.getByRole('textbox', { name: '列間距', exact: true })
      const column = inspector.getByRole('textbox', { name: '欄間距', exact: true })
      const readings = [await expectSessionLayout(section, 'nowrap', 9, 13)]
      await expect(mode).toHaveValue('nowrap')
      await mode.selectOption({ label: touch ? '反向換行' : '自動換行' })
      const selected = touch ? 'wrap-reverse' : 'wrap'
      readings.push(await expectSessionLayout(section, selected, 9, 13))
      await activate(expand)
      await expect(row).toHaveValue('9px')
      await expect(column).toHaveValue('13px')
      await row.fill('24px')
      if (touch) await column.tap()
      else await row.press('Enter')
      readings.push(await expectSessionLayout(section, selected, 24, 13))
      await column.fill('18px')
      await column.press('Enter')
      readings.push(await expectSessionLayout(section, selected, 24, 18))
      if (touch) {
        await expect(inspector.locator('[data-style-source-label="gap"]')).not.toHaveText('未設定')
        await expect(inspector.locator('[data-style-reset="gap"]')).toBeHidden()
        for (const target of [expand, row, column]) {
          const rect = (await target.boundingBox())!
          expect(Math.min(rect.width, rect.height)).toBeGreaterThanOrEqual(44)
        }
        expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
      }
      if (testInfo.project.name === 'chromium') {
        await column.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(touch ? 'wrap-mobile.png' : 'wrap-desktop.png'),
          animations: 'disabled',
        })
      }
      if (touch) {
        await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
        if (testInfo.project.name === 'chromium') {
          await expect(drawer).toBeHidden()
          await page.screenshot({
            path: testInfo.outputPath('wrap-mobile-canvas.png'),
            animations: 'disabled',
          })
        }
        await page.getByRole('button', { name: '更多工具', exact: true }).tap()
      }
      await activate(page.getByRole('button', { name: '復原', exact: true }))
      await expectSessionLayout(section, selected, 24, 13)
      await activate(page.getByRole('button', { name: '重做', exact: true }))
      await expectSessionLayout(section, selected, 24, 18)
      await activate(page.getByRole('button', { name: '存檔', exact: true }))
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await page.reload()
      await expectSessionLayout(section, selected, 24, 18)
      if (!touch) {
        await activate(await activityLayer(page, ['工作坊'], '場次列表'))
        await activate(inspector.getByRole('tab', { name: '樣式', exact: true }))
        await inspector
          .getByRole('combobox', { name: '顯示方式', exact: true })
          .selectOption('grid')
        await expect(mode).toBeHidden()
        await activate(inspector.getByRole('button', { name: '2 欄', exact: true }))
        if ((await expand.getAttribute('aria-expanded')) === 'false') await activate(expand)
        await row.fill('30px')
        await row.press('Enter')
        await column.fill('12px')
        await column.press('Enter')
        await expect(section).toHaveCSS('gap', '30px 12px')
        const grid = await section.evaluate((el) => {
          const [a, b, c] = Array.from(el.children, (child) => child.getBoundingClientRect())
          return { rowGap: c!.top - a!.bottom, columnGap: b!.left - a!.right }
        })
        expect(grid.rowGap).toBeCloseTo(30)
        expect(grid.columnGap).toBeCloseTo(12)
        await testInfo.attach('grid-gaps', {
          body: JSON.stringify(grid),
          contentType: 'application/json',
        })
      }
      await testInfo.attach('wrap-layout', {
        body: JSON.stringify({ viewport: page.viewportSize(), readings }),
        contentType: 'application/json',
      })
      expect(errors).toEqual([])
    })
  })
}

function boxSides(target: Locator, property: 'padding' | 'margin') {
  return target.evaluate((element, prop) => {
    const style = getComputedStyle(element)
    return ['top', 'right', 'bottom', 'left'].map((side) =>
      style.getPropertyValue(prop + '-' + side),
    )
  }, property)
}

test('四邊間距可從現有簡寫單獨調整，保留其他三邊並一次復原', async ({ page }, testInfo) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const panel = page.locator('.sigil-inspector')
  const title = canvas(page).getByRole('heading', { name: '參加前的小提醒', exact: true })
  const faq = title.locator('..')
  await (await activityLayer(page, ['活動頁'], '常見問題')).press('Enter')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  const expand = panel.getByRole('button', { name: '分別調整內距', exact: true })
  const bottom = panel.getByRole('textbox', { name: '下方內距', exact: true })
  const shorthand = panel.locator('input[data-style-property="padding"]')
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const before = ['8px', '24px', '24px', '24px']
  await expand.press('Space')
  await expect(expand).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(before)
  const initialHeight = (await faq.boundingBox())!.height
  await expect(undo).toBeDisabled()
  await expect(bottom).toHaveValue('1.5rem')
  await bottom.fill('-2px')
  await bottom.press('Enter')
  await expect(bottom).toHaveAttribute('aria-invalid', 'true')
  await expect(undo).toBeDisabled()
  await bottom.press('Escape')
  await expect(bottom).toHaveValue('1.5rem')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.sigil-app')).toHaveClass(/sigil-theme-dark/)
  const errorColors = []
  for (const control of [bottom, shorthand]) {
    const previous = await control.inputValue()
    const defaultBorder = await control.evaluate((el) => getComputedStyle(el).borderTopColor)
    await control.fill('var(--workshop-gap)')
    await control.press('Enter')
    const error = panel.getByText('這個間距值無法儲存在此網站', { exact: true })
    await expect(error).toBeVisible()
    await expect(control).not.toHaveCSS('border-top-color', defaultBorder)
    const colors = await error.evaluate((el) => {
      let background = 'rgba(0, 0, 0, 0)'
      for (
        let node: Element | null = el;
        node && background === 'rgba(0, 0, 0, 0)';
        node = node.parentElement
      )
        background = getComputedStyle(node).backgroundColor
      const color = getComputedStyle(el).color
      function luminance(rgb: string) {
        const [r, g, b] = rgb
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((n) => Number(n) / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      const front = luminance(color)
      const back = luminance(background)
      return {
        color,
        background,
        contrast: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
      }
    })
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5)
    errorColors.push(colors)
    await expect(control).toHaveValue('var(--workshop-gap)')
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
    await expect(undo).toBeDisabled()
    await expect.poll(() => boxSides(faq, 'padding')).toEqual(before)
    await control.press('Escape')
    await expect(control).toHaveValue(previous)
  }
  await testInfo.attach('dark-error-contrast', {
    body: JSON.stringify(errorColors),
    contentType: 'application/json',
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('.sigil-app')).not.toHaveClass(/sigil-theme-dark/)
  await bottom.fill('52px')
  await bottom.press('Enter')
  const asymmetric = ['8px', '24px', '52px', '24px']
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(asymmetric)
  await expect.poll(async () => (await faq.boundingBox())!.height - initialHeight).toBe(28)
  await expect(bottom).toBeFocused()
  if (testInfo.project.name === 'chromium') {
    await bottom.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await faq.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.screenshot({
      path: testInfo.outputPath('box-spacing-desktop.png'),
      animations: 'disabled',
    })
  }
  await undo.press('Enter')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(before)
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await panel.getByRole('button', { name: '寬鬆', exact: true }).press('Enter')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(Array(4).fill('32px'))
  await undo.press('Enter')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(asymmetric)
  await shorthand.fill('4px 12px 20px 16px')
  await shorthand.press('Tab')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(['4px', '12px', '20px', '16px'])
  await undo.press('Enter')
  await expect.poll(() => boxSides(faq, 'padding')).toEqual(asymmetric)
  await (await activityLayer(page, ['活動頁', '常見問題'], '常見問題標題')).press('Enter')
  await panel.getByRole('button', { name: '分別調整外距', exact: true }).press('Enter')
  const leftMargin = panel.getByRole('textbox', { name: '左方外距', exact: true })
  await leftMargin.fill('-4px')
  await leftMargin.press('Tab')
  await expect.poll(() => boxSides(title, 'margin')).toEqual(['0px', '0px', '12px', '-4px'])
  await undo.press('Enter')
  await expect.poll(() => boxSides(title, 'margin')).toEqual(['0px', '0px', '12px', '0px'])
  expect(errors).toEqual([])
})

test('格線項目可用鍵盤將資訊標題橫跨整列，保留各裝置的排列與繼承', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const info = canvas(page).locator('#event-info')
  const title = canvas(page).getByRole('heading', { name: '活動資訊', exact: true })
  const panel = page.locator('.sigil-inspector')
  const item = panel.getByRole('group', { name: '格線項目配置', exact: true })
  const full = item.getByRole('button', { name: '橫跨整列', exact: true })
  const auto = item.getByRole('button', { name: '自動排列', exact: true })
  const inherit = item.getByRole('button', { name: '沿用上層配置', exact: true })
  const tools = page.locator('.sigil-topbar')
  const action = (name: string) => tools.getByRole('button', { name, exact: true }).press('Enter')
  const select = async (name: string) =>
    (await activityLayer(page, ['活動頁', '活動資訊'], name)).press('Enter')

  await (await activityLayer(page, ['活動頁'], '活動資訊')).press('Enter')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  await panel.getByRole('button', { name: '3 欄', exact: true }).press('Enter')
  await action('平板')
  await panel.getByRole('button', { name: '2 欄', exact: true }).press('Enter')
  await action('桌面')
  await select('資訊標題')
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  await full.press('Space')
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  const desktop = await expectInfoTitlePlacement(info, 3, true)
  await full.press('Enter')
  await full.press('Delete')
  await expect(title).toHaveAttribute('data-sigil-selected', '1')
  await action('復原')
  await expectInfoTitlePlacement(info, 3, false)
  await action('重做')
  await expectInfoTitlePlacement(info, 3, true)
  await info.scrollIntoViewIfNeeded()
  if (testInfo.project.name === 'chromium') {
    await page.screenshot({
      path: testInfo.outputPath('title-full-row-desktop.png'),
      animations: 'disabled',
    })
  }

  const move = moveControls(page)
  await move.open.press('Enter')
  await move.destination.selectOption('activity-root')
  await move.confirm.press('Enter')
  await expect(info.getByRole('heading', { name: '活動資訊', exact: true })).toHaveCount(0)
  await expect(item).toBeHidden()
  await action('復原')
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  await expectInfoTitlePlacement(info, 3, true)
  await select('活動時間')
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  await (await activityLayer(page, [], '活動頁')).press('Enter')
  await expect(item).toBeHidden()
  await select('資訊標題')
  await action('平板')
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  const tablet = await expectInfoTitlePlacement(info, 2, true)
  await action('手機')
  await auto.press('Enter')
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  const mobile = await expectInfoTitlePlacement(info, 2, false)
  await inherit.press('Enter')
  await expect(inherit).toBeDisabled()
  await expect(full).toHaveAttribute('aria-pressed', 'true')
  await expect(full).toBeFocused()
  await expectInfoTitlePlacement(info, 2, true)
  await action('復原')
  await expectInfoTitlePlacement(info, 2, false)
  await action('存檔')
  await expect(tools.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await page.reload()
  await action('預覽')
  await expectInfoTitlePlacement(info, 3, true)
  await action('手機')
  await expectInfoTitlePlacement(info, 2, false)
  await testInfo.attach('title-row-geometry', {
    body: JSON.stringify({ desktop, tablet, mobile }),
    contentType: 'application/json',
  })
})

test('主視覺的格線欄數可保留自動排版、試填與取消自訂比例', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  await (await activityLayer(page, ['活動頁'], '主視覺')).press('Enter')
  const panel = page.locator('.sigil-inspector')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  const input = panel.getByRole('textbox', { name: '自訂欄寬', exact: true })
  const hero = canvas(page).locator('[data-sigil-id="activity-hero"]')
  const original = 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))'
  const rule = () => hero.evaluate((el) => (el as HTMLElement).style.gridTemplateColumns)
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await expect(input).toHaveValue(original)
  await input.fill('minmax(0,')
  await input.press('Enter')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(panel.getByRole('alert')).toBeVisible()
  expect(await rule()).toContain('auto-fit')
  await expect(save).toBeDisabled()
  await expect(undo).toBeDisabled()
  await input.press('Escape')
  await expect(input).toHaveValue(original)
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await input.fill('minmax(0, 2fr) minmax(0, 1fr)')
  await expect(undo).toBeDisabled()
  await input.press('Enter')
  const tracks = await hero.evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(/\s+/).map(parseFloat),
  )
  expect(tracks).toHaveLength(2)
  expect(tracks[0]! / tracks[1]!).toBeCloseTo(2, 1)
  await expect(save).toBeEnabled()
  await undo.press('Enter')
  await expect(input).toHaveValue(original)
  expect(await rule()).toContain('auto-fit')
  await expect(undo).toBeDisabled()
  const saveShortcut = await page.evaluate(() =>
    /Mac/i.test(navigator.platform) ? 'Meta+s' : 'Control+s',
  )
  await input.fill('minmax(0,')
  await input.press(saveShortcut)
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(await rule()).toContain('auto-fit')
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBeNull()
  await input.fill('2fr 3fr')
  await input.press(saveShortcut)
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await (await activityLayer(page, ['活動頁'], '主視覺')).press('Enter')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  await expect(input).toHaveValue('2fr 3fr')
  await expect(save).toBeDisabled()
})

test('元件路徑可從深層按鈕跳到區段，並隨改名、搬移與復原同步', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const path = page.getByRole('navigation', { name: '元件路徑', exact: true })
  const current = path.locator('[aria-current="location"]')
  const ancestors = path.getByRole('button')
  const cta = await activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '主要行動')
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  const original = ['活動頁', '主視覺', '活動簡介']
  await cta.press('Enter')
  await expect(ancestors).toHaveText(original)
  await expect(current).toHaveText('主要行動')
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: testInfo.outputPath('path-desktop.png'), animations: 'disabled' })
  await path.getByRole('button', { name: '主視覺', exact: true }).press('Enter')
  await expect(current).toHaveText('主視覺')
  await expect(ancestors).toHaveText(['活動頁'])
  await expect(page.locator('.sigil-inspector-head')).toHaveText('主視覺')
  await expect(page.getByRole('treeitem', { name: '主視覺', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const hero = canvas(page).locator('[data-sigil-id="activity-hero"]')
  await expect(hero).toHaveAttribute('data-sigil-selected', '1')
  await expect(hero).toBeInViewport()
  await expect(save).toBeDisabled()
  await expect(undo).toBeDisabled()

  await cta.press('Enter')
  const rename = '工作坊介紹'
  page.once('dialog', (dialog) => dialog.accept(rename))
  await page.getByRole('treeitem', { name: '活動簡介', exact: true }).press('F2')
  await expect(ancestors).toHaveText(['活動頁', '主視覺', rename])
  await expect(current).toHaveText('主要行動')
  await undo.click()
  await expect(ancestors).toHaveText(original)
  const move = moveControls(page)
  await move.open.click()
  await move.destination.selectOption('activity-info')
  await move.confirm.click()
  await expect(current).toHaveText('主要行動')
  await expect(ancestors).toHaveText(['活動頁', '活動資訊'])
  await undo.click()
  await expect(ancestors).toHaveText(original)
  await redo.click()
  await expect(ancestors).toHaveText(['活動頁', '活動資訊'])
  await page.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(path).toBeHidden()
  await page.getByRole('button', { name: '編輯', exact: true }).click()
  await expect(current).toHaveText('主要行動')
  await expect(ancestors).toHaveText(['活動頁', '活動資訊'])
})

test('移動元件可跨區段、同層排序並保存到草稿與離線頁面', async ({ page, browser }, testInfo) => {
  await page.goto('/activity/')
  const linkName = '查看活動資訊'
  const frame = canvas(page)
  const link = frame.getByRole('link', { name: linkName, exact: true })
  const originalLink = frame.locator('[data-sigil-id="activity-hero"]').getByRole('link')
  const infoItems = frame.locator('#event-info > [data-sigil-id]')
  await expect(infoItems).toHaveCount(4)
  const originalOrder = await infoItems.allTextContents()
  const linkId = (await originalLink.getAttribute('data-sigil-id'))!
  expect(linkId).toBeTruthy()
  const move = moveControls(page)
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  const primary = await activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '主要行動')
  await primary.press('Enter')
  await move.open.press('Enter')
  await expect(move.search).toBeFocused()
  await move.search.fill('活動資訊')
  await move.destination.selectOption('activity-info')
  await move.position.selectOption('first')
  await page.keyboard.press('Escape')
  await expect(move.dialog).toBeHidden()
  await expect(move.open).toBeFocused()
  await expect(originalLink).toHaveAttribute('data-sigil-selected', '1')
  await expect(infoItems).toHaveText(originalOrder)
  await expect(save).toBeDisabled()

  await move.open.press('Enter')
  await move.destination.selectOption('activity-info')
  await move.position.selectOption('before')
  await move.before.selectOption({ label: '活動地點' })
  await expect(move.dialog.getByRole('status')).toContainText('活動地點')
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: testInfo.outputPath('move-desktop.png'), animations: 'disabled' })
  await move.confirm.press('Enter')
  await expect(move.dialog).toBeHidden()
  await expect(move.toolbar).toBeFocused()
  const beforeLocation = [...originalOrder.slice(0, 2), linkName, ...originalOrder.slice(2)]
  await expect(infoItems).toHaveText(beforeLocation)
  await expect(originalLink).toHaveCount(0)
  await expect(link).toHaveAttribute('data-sigil-id', linkId)
  await expect(link).toHaveAttribute('data-sigil-selected', '1')
  await expect(link).toBeInViewport()
  await expect(page.getByRole('treeitem', { name: '主要行動', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await undo.press('Enter')
  await expect(originalLink).toHaveAttribute('data-sigil-id', linkId)
  await expect(infoItems).toHaveText(originalOrder)
  await expect(undo).toBeDisabled()
  await redo.press('Enter')
  await expect(infoItems).toHaveText(beforeLocation)

  const movedLayer = await activityLayer(page, ['活動頁', '活動資訊'], '主要行動')
  await movedLayer.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '移動元件', exact: true }).click()
  await expect(move.destination).toHaveValue('activity-info')
  await move.position.selectOption('last')
  await move.confirm.click()
  const last = [...originalOrder, linkName]
  await expect(infoItems).toHaveText(last)
  await expect(link).toHaveAttribute('data-sigil-selected', '1')
  await undo.click()
  await expect(infoItems).toHaveText(beforeLocation)
  await redo.click()
  await expect(infoItems).toHaveText(last)
  await save.click()
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await expect(infoItems).toHaveText(last)
  await expect(link).toHaveAttribute('data-sigil-id', linkId)
  await expect(link).toHaveAttribute('href', '#event-info')
  const file = testInfo.outputPath('workshop-moved.html')
  await downloadLinkPage(page, file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await expect(exported.locator('#event-info > *')).toHaveText(last)
    const exportedLink = exported.getByRole('link', { name: linkName, exact: true })
    await expect(exportedLink).toHaveAttribute('href', '#event-info')
    await exportedLink.click()
    await expect(exported.locator(':target')).toHaveAttribute('id', 'event-info')
  } finally {
    await reader.close()
  }
})

test('頁內錨點改名可保護既有連結、復原並輸出可跳轉的中文網址', async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/activity/')
  const panel = page.locator('.sigil-inspector')
  const group = panel.getByRole('group', { name: '頁內錨點', exact: true })
  const name = group.getByRole('textbox', { name: '錨點名稱', exact: true })
  const apply = group.getByRole('button', { name: '套用錨點', exact: true })
  const status = group.getByRole('status')
  const primary = canvas(page).getByRole('link', { name: '查看活動資訊', exact: true })
  const info = canvas(page).locator('[data-sigil-id="activity-info"]')
  const save = page.getByRole('button', { name: '存檔', exact: true })

  await (await activityLayer(page, ['活動頁'], '常見問題')).press('Enter')
  await panel.getByRole('tab', { name: '進階', exact: true }).click()
  await name.fill('workshop-faq')
  await name.press('Enter')
  await expect(canvas(page).locator('#workshop-faq')).toContainText('參加前的小提醒')
  await save.click()
  await expect(page.locator('.sigil-status').getByText('已儲存', { exact: true })).toBeVisible()

  await (await activityLayer(page, ['活動頁'], '活動資訊')).press('Enter')
  await panel.getByRole('tab', { name: '內容', exact: true }).click()
  await panel.getByRole('button', { name: '編輯頁內錨點', exact: true }).press('Enter')
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('event-info')
  await expect(group.locator('.sigil-anchor-references')).toContainText('1')
  for (const [value, reason] of [
    ['workshop-faq', '已被使用'],
    ['', '參照'],
  ] as const) {
    await name.fill(value)
    await apply.click()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(status.filter({ hasText: reason })).toBeVisible()
    await expect(info).toHaveAttribute('id', 'event-info')
    await expect(primary).toHaveAttribute('href', '#event-info')
    await expect(save).toBeDisabled()
  }

  const renamed = '工作坊-報名資訊'
  await name.fill(renamed)
  await name.press('Enter')
  await expect(info).toHaveAttribute('id', renamed)
  const href = (await primary.getAttribute('href'))!
  expect(decodeURIComponent(href)).toBe('#' + renamed)
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(info).toHaveAttribute('id', 'event-info')
  await expect(primary).toHaveAttribute('href', '#event-info')
  await expect(name).toHaveValue('event-info')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(info).toHaveAttribute('id', renamed)
  await expect(primary).toHaveAttribute('href', href)

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => sessionStorage.setItem('copied-anchor', value) },
    })
  })
  await group.getByRole('button', { name: '複製頁內連結', exact: true }).press('Enter')
  await expect(status.filter({ hasText: '已複製頁內連結' })).toBeVisible()
  expect(
    decodeURIComponent((await page.evaluate(() => sessionStorage.getItem('copied-anchor'))) ?? ''),
  ).toBe('#' + renamed)
  await save.click()
  await expect(page.locator('.sigil-status').getByText('已儲存', { exact: true })).toBeVisible()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({
      path: testInfo.outputPath('anchor-editing-desktop.png'),
      animations: 'disabled',
    })
  await page.reload()
  await expect(info).toHaveAttribute('id', renamed)
  await expect(primary).toHaveAttribute('href', href)
  const file = testInfo.outputPath('workshop-anchor.html')
  await downloadLinkPage(page, file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    await exported.getByRole('link', { name: '查看活動資訊', exact: true }).click()
    await expect(exported.locator(':target')).toHaveAttribute('id', renamed)
    await expect(exported.locator(':target')).toContainText('城市創作空間')
  } finally {
    await reader.close()
  }
})

test('頁內連結會展開折疊中的答案並移交鍵盤焦點', async ({ page }) => {
  const json = JSON.stringify({
    version: 1,
    root: {
      id: 'page',
      type: 'section',
      children: [
        {
          id: 'jump',
          type: 'text',
          tagName: 'a',
          content: '前往答案',
          attributes: { href: '#answer' },
        },
        {
          id: 'question',
          type: 'section',
          tagName: 'details',
          children: [
            { id: 'label', type: 'text', tagName: 'summary', content: '如何報名？' },
            {
              id: 'answer-link',
              type: 'text',
              tagName: 'a',
              content: '活動報名表',
              attributes: { id: 'answer', href: '/registration' },
            },
          ],
        },
      ],
    },
  })
  await page.addInitScript((draft) => localStorage.setItem('sigil-demo-activity-v1', draft), json)
  await page.goto('/activity/')
  const preview = canvas(page)
  await expect(preview.locator('details')).toHaveCount(1)
  await page.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(preview.locator('details')).toHaveJSProperty('open', false)
  await preview.getByRole('link', { name: '前往答案' }).press('Enter')
  await expect(preview.locator('details')).toHaveJSProperty('open', true)
  await expect(preview.getByRole('link', { name: '活動報名表' })).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(json)
})

for (const touch of [false, true]) {
  test.describe(touch ? '手機觸控頁面連結' : '桌面鍵盤頁面連結', () => {
    test.use({
      hasTouch: touch,
      viewport: touch ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    })

    test('從匯出檢查頁面連結、修正目的地並實際走訪下載頁', async ({ page, browser }, testInfo) => {
      const errors = await prepareDemo(page)
      const external = 'https://studio.example.test/workshop'
      const outgoing: string[] = []
      await page.context().route(external, (route) => {
        outgoing.push(route.request().url())
        return route.abort()
      })
      await page.goto('/activity/')
      const cover = await canvas(page).getByRole('img').getAttribute('src')
      const draft = createActivityDocument('秋日設計工作坊', cover!)
      draft.root.children!.push(
        {
          id: 'registration-link',
          type: 'text',
          tagName: 'a',
          content: '查看報名資訊',
          attributes: { href: '#old-registration' },
        },
        {
          id: 'studio-link',
          type: 'text',
          tagName: 'a',
          content: '主辦單位網站',
          attributes: { href: external },
        },
      )
      const saved = JSON.stringify(draft)
      await page.evaluate((doc) => localStorage.setItem('sigil-demo-activity-v1', doc), saved)
      await page.reload()
      const originalURL = page.url()
      const save = page.locator('[data-command-id="save"]')
      const undo = page.locator('[data-command-id="undo"]')
      const dialog = page.getByRole('dialog', { name: '匯出 HTML' })
      const details = dialog.locator('details.sigil-page-links')
      const summary = details.locator('summary')
      const count = details.getByRole('status').filter({ hasText: '共 3 個連結' })
      const filter = details.getByRole('button', { name: '只看待處理', exact: true })
      const source = details.locator('[data-page-link-id="registration-link"]')
      const address = page
        .locator('.sigil-inspector')
        .getByRole('textbox', { name: '連結網址', exact: true })
      const activate = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      const openExport = async () => {
        const more = page.getByRole('button', { name: '更多工具', exact: true })
        if (touch && (await more.getAttribute('aria-expanded')) === 'false') await more.tap()
        await activate(page.getByRole('button', { name: '匯出', exact: true }))
        await expect(details.locator('[data-page-link-id]')).toHaveCount(0)
        await activate(summary)
        await expect(details).toHaveJSProperty('open', true)
      }
      const closeSettings = async () => {
        if (touch) await page.getByRole('button', { name: '關閉面板', exact: true }).tap()
      }

      await openExport()
      await expect(count).toContainText('1 個待處理')
      await expect(details.locator('[data-page-link-id]')).toHaveCount(3)
      await expect(source).toContainText('找不到頁內目標')
      await expect(source).toContainText('#old-registration')
      await expect(source).toContainText('查看報名資訊')
      if (touch) {
        for (const control of [summary, filter, source]) {
          const bounds = (await control.boundingBox())!
          expect(Math.min(bounds.height, bounds.width)).toBeGreaterThanOrEqual(44)
        }
        expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBe(375)
      }
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(touch ? 'page-links-mobile.png' : 'page-links-desktop.png'),
          animations: 'disabled',
        })
      }
      await activate(details.locator('[data-page-link-id="studio-link"]'))
      await expect(dialog).toHaveCount(0)
      await expect(address).toBeFocused()
      await expect(address).toHaveValue(external)
      await expect(undo).toBeDisabled()
      await expect(save).toBeDisabled()
      await closeSettings()
      await openExport()
      await activate(filter)
      await expect(filter).toHaveAttribute('aria-pressed', 'true')
      await expect(details.locator('[data-page-link-id]')).toHaveCount(1)
      await activate(source)
      await expect(address).toBeFocused()
      await expect(address).toHaveValue('#old-registration')
      const link = canvas(page).getByRole('link', { name: '查看報名資訊', exact: true })
      await expect(link).toHaveAttribute('data-sigil-selected', '1')
      await expect(undo).toBeDisabled()
      await expect(save).toBeDisabled()
      expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(saved)
      expect(page.context().pages()).toHaveLength(1)
      expect(page.url()).toBe(originalURL)
      expect(outgoing).toEqual([])

      await page
        .locator('.sigil-inspector')
        .getByRole('combobox', { name: '連到頁內區段', exact: true })
        .selectOption({ label: '活動資訊' })
      await expect(link).toHaveAttribute('href', '#event-info')
      await expect(undo).toBeEnabled()
      await expect(save).toBeEnabled()
      await closeSettings()
      await openExport()
      await expect(count).toContainText('0 個待處理')
      await activate(filter)
      await expect(details.locator('[data-page-link-id]')).toHaveCount(0)
      const download = page.waitForEvent('download')
      await activate(dialog.getByRole('button', { name: '下載 .html', exact: true }))
      const file = testInfo.outputPath('page-links.html')
      await (await download).saveAs(file)
      const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
      try {
        await reader.route(/^https?:/, (route) => {
          outgoing.push(route.request().url())
          return route.abort()
        })
        const exported = await reader.newPage()
        const url = pathToFileURL(file).href
        await exported.goto(url)
        const repaired = exported.getByRole('link', { name: '查看報名資訊', exact: true })
        await expect(repaired).toHaveAttribute('href', '#event-info')
        await repaired.click()
        await expect(exported).toHaveURL(url + '#event-info')
        await expect(exported.locator('#event-info')).toBeInViewport()
      } finally {
        await reader.close()
      }
      expect(outgoing).toEqual([])
      expect(errors).toEqual([])
    })
  })
}

for (const touch of [false, true]) {
  test.describe(touch ? '手機本頁圖片' : '桌面本頁圖片', () => {
    test.use({
      hasTouch: touch,
      viewport: touch ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    })

    test('用頁面上不同位置的圖片說明搜尋，重用同一張照片', async ({ page }, testInfo) => {
      const errors = await prepareDemo(page)
      const response = await page.goto('/activity/')
      expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
      const frame = canvas(page)
      const cover = frame.locator('[data-sigil-id="activity-image"]')
      await expect(cover).toHaveJSProperty('naturalWidth', 1200)
      const coverURL = (await cover.getAttribute('src'))!
      const coverAlt = (await cover.getAttribute('alt'))!
      const url = new URL('/raspberry-ink.png', page.url()).href
      await page.route(url, (route) =>
        route.fulfill({ contentType: 'image/png', body: photoFile.buffer }),
      )
      const draft = createActivityDocument('秋日設計工作坊', coverURL)
      for (const [id, name, alt] of [
        ['ink-one', '油墨色樣', '覆盆莓紅色打樣'],
        ['ink-two', '印刷配方', '夜場示範用墨'],
      ] as const) {
        draft.root.children!.push({ id, type: 'image', name, attributes: { src: url, alt } })
      }
      await page.evaluate(
        (doc) => localStorage.setItem('sigil-demo-activity-v1', JSON.stringify(doc)),
        draft,
      )
      await page.reload()
      await expect(cover).toHaveJSProperty('naturalWidth', 1200)
      const enter = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      const dialog = page.getByRole('dialog')
      const pageTab = dialog.getByRole('tab', { name: '本頁圖片', exact: true })
      const search = dialog.getByRole('searchbox', { name: '搜尋本頁圖片' })
      const item = dialog
        .locator('.sigil-media-card')
        .filter({ has: page.locator('img[src$="/raspberry-ink.png"]') })
      const save = page.getByRole('button', { name: '存檔', exact: true })
      const footer = frame.locator('[data-sigil-id="activity-root"] > img:last-child')
      if (touch) {
        await page.getByRole('button', { name: '更多工具', exact: true }).tap()
        await page.getByRole('button', { name: '插入圖片至頁尾', exact: true }).tap()
      } else {
        await (await activityLayer(page, ['活動頁', '主視覺'], '活動圖片')).press('Enter')
        await page
          .getByRole('toolbar', { name: '元件操作' })
          .getByRole('button', { name: '更換圖片', exact: true })
          .press('Enter')
      }
      await expect(dialog.getByRole('tab', { name: '素材庫', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(
        dialog.getByRole('button', { name: '工作坊版畫照片', exact: true }),
      ).toBeVisible()
      await expect(item).toHaveCount(0)
      await enter(pageTab)
      await expect(item).toContainText('本頁使用 2 次')
      await expect(dialog.locator('.sigil-media-card:visible')).toHaveCount(2)
      if (!touch) {
        await expect(dialog.locator('.sigil-media-card[aria-current="true"]')).toHaveText(
          /活動圖片/,
        )
      }
      if (touch) {
        const tab = (await pageTab.boundingBox())!
        expect(Math.min(tab.width, tab.height)).toBeGreaterThanOrEqual(44)
        expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBe(375)
      }
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(touch ? 'page-images-mobile.png' : 'page-images-desktop.png'),
          animations: 'disabled',
        })
      }
      await search.fill('夜場 覆盆莓')
      await expect(dialog.locator('.sigil-media-card:visible')).toHaveCount(1)
      await expect(item).toContainText('油墨色樣')
      await enter(item)
      await expect(dialog).toHaveCount(0)
      if (touch) {
        await expect(footer).toHaveAttribute('data-sigil-selected', '1')
        await expect(page.getByRole('toolbar', { name: '元件操作' })).toBeFocused()
        await expect(page.getByRole('button', { name: '更多工具', exact: true })).toHaveAttribute(
          'aria-expanded',
          'false',
        )
        await expect(footer).toHaveAttribute('src', url)
        expect(await footer.getAttribute('alt')).toBeFalsy()
      } else {
        await expect(cover).toHaveAttribute('src', url)
        await expect(cover).toHaveAttribute('alt', coverAlt)
        await expect(cover).toHaveJSProperty('naturalWidth', 3)
      }
      const undo = page.getByRole('button', { name: '復原', exact: true })
      if (touch && !(await undo.isVisible()))
        await page.getByRole('button', { name: '更多工具', exact: true }).tap()
      await enter(undo)
      await expect(save).toBeDisabled()
      await expect(frame.locator('img')).toHaveCount(3)
      await expect(cover).toHaveAttribute('src', coverURL)
      await enter(page.getByRole('button', { name: '重做', exact: true }))
      await expect(frame.locator('img[src$="/raspberry-ink.png"]')).toHaveCount(3)
      await enter(save)
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await page.reload()
      await expect(touch ? footer : cover).toHaveJSProperty('naturalWidth', 3)
      await expect(frame.locator('img[src$="/raspberry-ink.png"]')).toHaveCount(3)
      await expect(frame.locator('[data-sigil-id="ink-two"]')).toHaveAttribute(
        'alt',
        '夜場示範用墨',
      )
      await expect(cover).toHaveAttribute('alt', coverAlt)
      expect(errors).toEqual([])
    })

    test('空白頁用網址預覽並插入第一張圖片，取消與復原均保留空白草稿', async ({
      page,
    }, testInfo) => {
      const errors = await prepareDemo(page)
      const response = await page.goto('/activity/')
      expect(await response?.headerValue('content-security-policy')).toBe(enforcedPolicy)
      const frame = canvas(page)
      const cover = frame.locator('[data-sigil-id="activity-image"]')
      await expect(cover).toHaveJSProperty('naturalWidth', 1200)
      const coverURL = new URL((await cover.getAttribute('src'))!, page.url())
      const valid = coverURL.pathname + '?studio=url-preview'
      const broken = '/gallery-missing.webp'
      const pendingURL = new URL('/gallery-pending.png', page.url()).href
      let onPending: (route: Route) => void
      const pendingPreview = new Promise<Route>((resolve) => {
        onPending = resolve
      })
      await page.route(pendingURL, (route) => onPending(route))
      const alt = '兩位參加者在工作坊排列版畫'
      const empty = JSON.stringify({
        version: 1,
        root: { id: 'workshop-gallery', type: 'section', name: '工作坊相簿', children: [] },
      })
      const requests: string[] = []
      const observed = new Set([new URL(valid, page.url()).href, new URL(broken, page.url()).href])
      page.on('request', (request) => {
        if (observed.has(request.url())) requests.push(request.url())
      })
      await page.route(new URL(broken, page.url()).href, (route) =>
        route.fulfill({ contentType: 'text/plain', body: 'This image is unavailable.' }),
      )
      await page.evaluate((doc) => localStorage.setItem('sigil-demo-activity-v1', doc), empty)
      await page.reload()
      const images = frame.locator('[data-sigil-id="workshop-gallery"] > img')
      const save = page.getByRole('button', { name: '存檔', exact: true })
      const more = page.getByRole('button', { name: '更多工具', exact: true })
      const activate = (control: Locator) => (touch ? control.tap() : control.press('Enter'))
      const dialog = page.getByRole('dialog', { name: '插入圖片至頁尾' })
      const urlTab = dialog.getByRole('tab', { name: '圖片網址', exact: true })
      const address = dialog.getByRole('textbox', { name: '圖片網址', exact: true })
      const description = dialog.getByRole('textbox', { name: '替代文字', exact: true })
      const preview = dialog.getByRole('button', { name: '預覽圖片', exact: true })
      const insert = dialog.getByRole('button', { name: '插入圖片', exact: true })
      const openURL = async () => {
        if (touch && (await more.getAttribute('aria-expanded')) !== 'true') await activate(more)
        await activate(
          page.getByRole('button', { name: touch ? '插入圖片至頁尾' : '素材庫', exact: true }),
        )
        await activate(urlTab)
      }
      await expect(save).toBeDisabled()
      await openURL()
      await address.fill(broken)
      await description.fill(alt)
      await expect(insert).toBeDisabled()
      const requestsBeforePreview = requests.length
      expect(requestsBeforePreview).toBe(0)
      await activate(preview)
      await expect(dialog.getByRole('status').filter({ hasText: /無法|未能|失敗/ })).toBeVisible()
      await expect(insert).toBeDisabled()
      expect(requests).toEqual([new URL(broken, page.url()).href])
      await address.fill(valid)
      await expect(insert).toBeDisabled()
      expect(requests).toHaveLength(1)
      await activate(preview)
      await expect(insert).toBeEnabled()
      await address.fill(pendingURL)
      await expect(insert).toBeDisabled()
      await activate(preview)
      const pending = await pendingPreview
      await activate(dialog.getByRole('tab', { name: '本頁圖片', exact: true }))
      await expect(dialog.getByText('本頁尚無圖片', { exact: true })).toBeVisible()
      await activate(dialog.getByRole('button', { name: '關閉', exact: true }))
      await expect(dialog).toHaveCount(0)
      await pending.fulfill({ contentType: 'image/png', body: photoFile.buffer })
      await expect(images).toHaveCount(0)
      await expect(save).toBeDisabled()
      const stored = () => page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
      expect(await stored()).toBe(empty)

      await openURL()
      await address.fill(valid)
      await description.fill(alt)
      await activate(preview)
      await expect(insert).toBeEnabled()
      await expect(
        dialog.getByRole('status').filter({ hasText: '圖片已載入 · 1200 × 800' }),
      ).toBeVisible()
      await expect(images).toHaveCount(0)
      await expect(save).toBeDisabled()
      if (touch) {
        await expect(insert).toBeInViewport()
        expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBe(375)
      }
      if (testInfo.project.name === 'chromium') {
        await page.screenshot({
          path: testInfo.outputPath(touch ? 'insert-url-mobile.png' : 'insert-url-desktop.png'),
          animations: 'disabled',
        })
      }
      await activate(insert)
      await expect(images).toHaveCount(1)
      await expect(images).toHaveAttribute('src', valid)
      await expect(images).toHaveAttribute('alt', alt)
      await expect(images).toHaveJSProperty('naturalWidth', 1200)
      await expect(images).toHaveAttribute('data-sigil-selected', '1')
      if (touch) await activate(more)
      await activate(page.getByRole('button', { name: '復原', exact: true }))
      await expect(images).toHaveCount(0)
      await expect(save).toBeDisabled()
      expect(await stored()).toBe(empty)
      await activate(page.getByRole('button', { name: '重做', exact: true }))
      await expect(images).toHaveAttribute('alt', alt)
      await activate(save)
      await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
        '活動頁已儲存到此瀏覽器。',
      )
      await page.reload()
      await expect(images).toHaveAttribute('src', valid)
      await expect(images).toHaveAttribute('alt', alt)
      await expect(images).toHaveJSProperty('naturalWidth', 1200)
      await testInfo.attach('first-url-image', {
        body: JSON.stringify({
          input: touch ? 'touch' : 'keyboard',
          viewport: page.viewportSize(),
          requestsBeforePreview,
          savedImage: await images.evaluate((image: HTMLImageElement) => ({
            src: image.getAttribute('src'),
            alt: image.alt,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })),
        }),
        contentType: 'application/json',
      })
      expect(errors).toEqual([])
    })
  })
}

test('英文暗色介面的頁面連結可辨識隱藏區段中的目的地', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepareDemo(page)
  await page.goto('/')
  const doc = {
    version: 1,
    root: {
      id: 'workshop',
      type: 'section',
      name: 'Community workshop',
      children: [
        {
          id: 'schedule',
          type: 'text',
          tagName: 'a',
          content: 'Workshop agenda',
          attributes: { href: '#sessions' },
        },
        {
          id: 'contact',
          type: 'text',
          tagName: 'a',
          content: 'Contact the studio',
          attributes: { href: 'mailto:studio@example.test' },
        },
        {
          id: 'unpublished',
          type: 'section',
          attributes: { hidden: '' },
          children: [
            {
              id: 'sessions',
              type: 'text',
              tagName: 'h2',
              content: 'Sessions',
              attributes: { id: 'sessions' },
            },
          ],
        },
      ],
    },
  }
  await page.evaluate((draft) => localStorage.setItem('sigil-demo', JSON.stringify(draft)), doc)
  await page.getByRole('button', { name: '讀 localStorage', exact: true }).click()
  await page.getByRole('button', { name: '中/EN', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export HTML' })
  await expect(dialog).toHaveClass(/sigil-theme-dark/)
  const links = dialog.locator('details.sigil-page-links')
  await links.getByText('Page links', { exact: true }).click()
  await expect(links.getByRole('status')).toHaveText('Total links: 2 · Needs attention: 1')
  await expect(links.getByRole('button', { name: 'Inspect link Workshop agenda' })).toContainText(
    'Page target is hidden',
  )
  await expect(
    links.getByRole('button', { name: 'Inspect link Contact the studio' }),
  ).toContainText('Email')
  if (testInfo.project.name === 'chromium') {
    await page.screenshot({
      path: testInfo.outputPath('page-links-english-dark.png'),
      animations: 'disabled',
    })
  }
  await links.getByRole('button', { name: 'Needs attention only' }).click()
  await expect(links.locator('[data-page-link-id]')).toHaveCount(1)
  await expect(links.locator('[data-page-link-id]')).toHaveAttribute(
    'data-page-link-id',
    'schedule',
  )
  await links.getByRole('button', { name: 'Inspect link Workshop agenda' }).click()
  const inspector = page.locator('.sigil-inspector')
  await expect(inspector.getByRole('textbox', { name: 'Link address' })).toHaveValue('#sessions')
  const section = inspector.getByRole('combobox', { name: 'Link to section', exact: true })
  await expect(section).toBeEnabled()
  await expect(section.locator('option[value="workshop"]')).toHaveText('Community workshop')
  await expect(section.locator('option[value="sessions"]')).toHaveCount(0)
})

test('5,000 節點的頁面連結分批顯示，篩選能直接找到末尾缺少的目標', async ({ page }, testInfo) => {
  const children = Array.from({ length: 4999 }, (_, index) => {
    const id = 'entry-' + index
    const isLast = index === 4998
    return index % 50 === 0 || isLast
      ? {
          id,
          type: 'text',
          tagName: 'a',
          content: '導覽 ' + index,
          attributes: { href: isLast ? '#missing' : '#top' },
        }
      : { id, type: 'text', content: '段落 ' + index }
  })
  const json = JSON.stringify({
    version: 1,
    root: { id: 'page', type: 'section', attributes: { id: 'top' }, children },
  })
  await page.addInitScript((value) => localStorage.setItem('sigil-demo-activity-v1', value), json)
  await page.goto('/activity/')
  const nodes = canvas(page).locator('[data-sigil-id]')
  await expect(nodes).toHaveCount(5000)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const details = page.getByRole('dialog').locator('details.sigil-page-links')
  const rows = details.locator('[data-page-link-id]')
  await expect(rows).toHaveCount(0)
  await details.locator('summary').press('Enter')
  await expect(details.getByRole('status').filter({ hasText: '共 101 個連結' })).toContainText(
    '1 個待處理',
  )
  await expect(rows).toHaveCount(40)
  await details.getByRole('button', { name: '顯示更多連結', exact: true }).press('Enter')
  await expect(rows).toHaveCount(80)
  await details.getByRole('button', { name: '只看待處理', exact: true }).press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveAttribute('data-page-link-id', 'entry-4998')
  await expect(rows).toContainText('#missing')
  await testInfo.attach('large-page-links', {
    contentType: 'application/json',
    body: JSON.stringify({
      nodes: await nodes.count(),
      links: 101,
      initiallyRendered: 0,
      firstBatch: 40,
      secondBatch: 80,
      issues: await rows.count(),
      sourceId: await rows.getAttribute('data-page-link-id'),
    }),
  })
})

test('連結目的地可修復失效錨點、定位畫布區段，下載頁實際點擊可另開分頁', async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/activity/')
  await (await activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '主要行動')).press('Enter')
  const inspector = page.locator('.sigil-inspector')
  const address = inspector.getByRole('textbox', { name: '連結網址', exact: true })
  const reveal = inspector.getByRole('button', { name: '在畫布定位區段', exact: true })
  const link = canvas(page).getByRole('link', { name: '查看活動資訊', exact: true })
  const missing = '#removed-section'
  await expect(address).toHaveValue('#event-info')
  await address.fill(missing)
  await address.press('Enter')
  await expect(link).toHaveAttribute('href', missing)
  const warning = inspector.getByRole('status').filter({ hasText: '找不到這個頁內區段' })
  await expect(warning).toBeVisible()
  await expect(reveal).not.toBeVisible()

  const section = inspector.getByRole('combobox', { name: '連到頁內區段', exact: true })
  await section.selectOption({ label: '常見問題' })
  const fragment = await address.inputValue()
  expect(fragment).toMatch(/^#section-/)
  const target = canvas(page).locator(fragment)
  await expect(link).toHaveAttribute('href', fragment)
  await expect(target).toContainText('參加前的小提醒')
  await expect(warning).not.toBeVisible()
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(target).toHaveCount(0)
  await expect(link).toHaveAttribute('href', missing)
  await expect(warning).toBeVisible()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(reveal).toBeEnabled()
  const newTab = inspector.getByRole('checkbox', { name: '在新分頁開啟', exact: true })
  await newTab.check()
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /\bnoopener\b/)
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await save.click()
  await expect(save).toBeDisabled()
  await expect(target).not.toBeInViewport()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({
      path: testInfo.outputPath('link-destinations-desktop.png'),
      animations: 'disabled',
    })
  await reveal.press('Enter')
  await expect(target).toHaveAttribute('data-sigil-selected', '1')
  await expect(target).toBeInViewport()
  await expect(page.getByRole('treeitem', { name: '常見問題', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(save).toBeDisabled()

  await page.getByRole('button', { name: '預覽', exact: true }).click()
  await link.scrollIntoViewIfNeeded()
  await expect(target).not.toBeInViewport()
  await link.press('Enter')
  await expect(target).toBeInViewport()
  expect(page.context().pages()).toHaveLength(1)
  await page.getByRole('button', { name: '編輯', exact: true }).click()

  const file = testInfo.outputPath('activity-link.html')
  await downloadLinkPage(page, file)
  const reader = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1000, height: 550 },
  })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const source = await reader.newPage()
    const url = pathToFileURL(file).href
    await source.goto(url)
    const exportedLink = source.getByRole('link', { name: '查看活動資訊', exact: true })
    await expect(exportedLink).toHaveAttribute('href', fragment)
    const opened = reader.waitForEvent('page')
    await exportedLink.click()
    const destination = await opened
    await expect(destination).toHaveURL(url + fragment)
    await expect(destination.locator(fragment)).toBeInViewport()
    expect(await destination.evaluate(() => window.opener === null)).toBe(true)
    await expect(source).toHaveURL(url)
  } finally {
    await reader.close()
  }
})

test('區塊庫釘選可跨分頁、重開，搜尋後能用鍵盤插在標題下方', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/activity/')
  const block = faqLibrary(page)
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  await (await titleLayer(page)).press('Enter')
  await insertAfterSelection(page).press('Enter')
  await block.search.fill('ＦＡＱ　行銷')
  await expect(block.results).toHaveCount(2)
  const other = await context.newPage()
  try {
    await other.goto('/activity/')
    await other.getByRole('button', { name: '新增區塊', exact: true }).click()
    const otherBlocks = faqLibrary(other)
    await otherBlocks.filter.click()
    await expect(otherBlocks.results).toHaveCount(0)
    await expect(otherBlocks.library.getByText('尚無已釘選區塊', { exact: true })).toBeVisible()
    await page.bringToFront()
    await block.pin.press('Space')
    await expect(block.pin).toHaveAttribute('aria-pressed', 'true')
    await expect(otherBlocks.pin).toHaveAttribute('aria-pressed', 'true')
    await block.filter.press('Space')
    await expect(block.filter).toHaveAttribute('aria-pressed', 'true')
    await expect(block.results).toHaveCount(1)
    await expect(block.library.getByText(/插入於「活動標題」下方/)).toBeVisible()
    await block.search.fill('圖片')
    await expect(block.library.getByText('無符合區塊', { exact: true })).toBeVisible()
    await expect(block.results).toHaveCount(0)
    await block.search.fill('ＦＡＱ　行銷')
    await expect(save).toBeDisabled()
    await expect(undo).toBeDisabled()
    await block.search.press('ArrowDown')
    await expect(block.insert).toBeFocused()
    await page.screenshot({
      path: testInfo.outputPath('pinned-library-desktop.png'),
      animations: 'disabled',
    })
    await page.keyboard.press('Enter')
    await expect(block.afterTitle).toHaveAttribute('data-sigil-selected', '1')
    await expect(block.afterTitle.locator('summary').first()).toHaveText('需要自備工具嗎？')
    const id = await block.afterTitle.getAttribute('data-sigil-id')
    expect(id).toBeTruthy()
    await undo.click()
    await expect(block.afterTitle).toHaveCount(0)
    await expect(undo).toBeDisabled()
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(block.afterTitle).toHaveAttribute('data-sigil-id', id!)
    await save.click()
    await expect(save).toBeDisabled()
    await page.reload()
    await expect(block.afterTitle).toHaveAttribute('data-sigil-id', id!)
    await page.getByRole('button', { name: '新增區塊', exact: true }).click()
    await expect(block.pin).toHaveAttribute('aria-pressed', 'true')
    await block.filter.click()
    await block.pin.click()
    await expect(block.results).toHaveCount(0)
    await expect(otherBlocks.results).toHaveCount(0)
    await expect(block.library.getByText('尚無已釘選區塊', { exact: true })).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(undo).toBeDisabled()
    await expect(block.afterTitle).toHaveCount(1)
  } finally {
    await other.close()
  }
})

test('區塊庫釘選遇到儲存額度不足時，個別成功寫入仍保留其他暫存變更的提示', async ({ page }) => {
  await page.goto('/activity/')
  const libraryToggle = page.getByRole('button', { name: '新增區塊', exact: true })
  await libraryToggle.click()
  const block = faqLibrary(page)
  const staticFAQ = block.library.getByRole('button', { name: '釘選 FAQ 常見問題', exact: true })
  const notice = block.library.getByText('釘選變更僅保留於目前工作階段。', { exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const readDraft = () => page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
  const draft = await readDraft()
  await staticFAQ.click()
  await page.reload()
  await libraryToggle.click()
  await block.search.fill('FAQ')
  await expect(staticFAQ).toHaveAttribute('aria-pressed', 'true')
  const restore = await page.evaluateHandle(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key.startsWith('sigil:pin:')) {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      }
      original.call(this, key, value)
    }
    return () => {
      Storage.prototype.setItem = original
    }
  })
  try {
    await block.pin.click()
    await expect(block.pin).toHaveAttribute('aria-pressed', 'true')
    await expect(notice).toBeVisible()
    await staticFAQ.click()
    await expect(staticFAQ).toHaveAttribute('aria-pressed', 'false')
    await expect(block.pin).toHaveAttribute('aria-pressed', 'true')
    await expect(notice).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(undo).toBeDisabled()
    expect(await readDraft()).toBe(draft)
  } finally {
    await restore.evaluate((reset) => reset())
    await restore.dispose()
  }
  await block.pin.click()
  await expect(notice).toBeHidden()
  await expect(block.pin).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await libraryToggle.click()
  await expect(staticFAQ).toHaveAttribute('aria-pressed', 'false')
  await expect(block.pin).toHaveAttribute('aria-pressed', 'false')
  await expect(notice).toBeHidden()
  await expect(save).toBeDisabled()
  await expect(undo).toBeDisabled()
  expect(await readDraft()).toBe(draft)
})

test('鍵盤在所選標題下方新增區塊，可取消、復原與重開草稿', async ({ page }) => {
  await page.goto('/activity/')
  const afterTitle = canvas(page).locator('[data-sigil-id="activity-title"] + [data-sigil-id]')
  const original = '用紙張、色塊與油墨，親手完成一張屬於你的海報。'
  await expect(afterTitle).toHaveText(original)
  const title = await titleLayer(page)
  await title.press('Enter')
  const insertAfter = insertAfterSelection(page)
  await insertAfter.press('Enter')
  const library = page.locator('.sigil-blocks-panel')
  const search = library.getByRole('searchbox', { name: '搜尋區塊' })
  await expect(search).toBeFocused()
  await expect(library.getByText(/活動標題/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(insertAfter).toBeFocused()
  await expect(afterTitle).toHaveText(original)
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await expect(save).toBeDisabled()

  await page.keyboard.press('Enter')
  await expect(search).toBeFocused()
  await search.fill('文字')
  await page.keyboard.press('Tab')
  await expect(library.getByRole('button', { name: '插入 文字', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(afterTitle).toHaveText('文字')
  await expect(afterTitle).toHaveAttribute('data-sigil-selected', /.+/)
  const originalAfterInsert = canvas(page).locator(
    '[data-sigil-id="activity-title"] + [data-sigil-id] + [data-sigil-id]',
  )
  await expect(originalAfterInsert).toHaveText(original)
  await page.getByRole('button', { name: '復原', exact: true }).press('Enter')
  await expect(afterTitle).toHaveText(original)
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await expect(afterTitle).toHaveText('文字')
  await save.press('Enter')
  await expect(save).toBeDisabled()
  await page.reload()
  await expect(afterTitle).toHaveText('文字')
  await expect(originalAfterInsert).toHaveText(original)
})

test('從圖層選取畫布外的常見問題，直接在原位置下方插入', async ({ page }) => {
  await page.setViewportSize({ width: 1160, height: 600 })
  await page.goto('/activity/')
  const frame = canvas(page)
  const question = frame.getByRole('heading', { name: '沒有經驗也能參加嗎？', exact: true })
  const scrollTop = () =>
    frame.locator('body').evaluate((el) => el.ownerDocument.defaultView!.scrollY)
  await expect(question).toHaveCount(1)
  await expect(question).not.toBeInViewport()
  const initialScroll = await scrollTop()
  const row = await activityLayer(page, ['活動頁', '常見問題'], '經驗問題')
  await row.press('Enter')
  await expect(question).toHaveAttribute('data-sigil-selected', '1')
  await expect(question).toBeInViewport({ ratio: 1 })
  await expect.poll(scrollTop).toBeGreaterThan(initialScroll)
  const action = insertAfterSelection(page)
  await expect(action).toBeInViewport({ ratio: 1 })
  await action.click()
  await page.getByRole('button', { name: '插入 按鈕', exact: true }).click()
  const inserted = question.locator('+ [data-sigil-selected]')
  await expect(inserted).toHaveText('按鈕')
  await expect(inserted).toBeInViewport({ ratio: 1 })
  await expect(inserted.locator('+ [data-sigil-id]')).toHaveText(
    '可以，老師會從構圖開始示範，再陪你完成印製。',
  )
})

test('標題大綱依章節順序用鍵盤定位，改字、變更層級與復原都同步', async ({ page }, testInfo) => {
  const errors = await prepareDemo(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/activity/')
  const allLayers = page.getByRole('button', { name: '所有圖層', exact: true })
  const headings = page.getByRole('button', { name: '標題大綱', exact: true })
  const outline = page.locator('.sigil-heading-outline')
  const filter = outline.getByRole('searchbox', { name: '搜尋標題', exact: true })
  const question = '沒有經驗也能參加嗎？'
  const result = outline.getByRole('button', { name: 'H3 ' + question, exact: true })
  const target = canvas(page).getByRole('heading', { level: 3, name: question, exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const fullSearch = page.getByRole('searchbox', { name: '搜尋圖層', exact: true })
  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  const branch = tree.getByRole('treeitem', { name: '常見問題', exact: true })
  await branch.press('ArrowLeft')
  await expect(branch).toHaveAttribute('aria-expanded', 'false')
  await (await titleLayer(page)).press('Enter')
  await fullSearch.fill('油墨')
  await headings.press('Enter')
  await expect(headings).toHaveAttribute('aria-pressed', 'true')
  await expect(fullSearch).toBeHidden()
  await expect(outline.locator('[data-heading-id]')).toHaveText([
    /秋日設計工作坊/,
    /活動資訊/,
    /參加前的小提醒/,
    /需要自備工具嗎？/,
    /沒有經驗也能參加嗎？/,
  ])
  const first = outline.getByRole('button', { name: 'H1 秋日設計工作坊', exact: true })
  await expect(first).toHaveAttribute('aria-current', 'true')
  await expect(target).not.toBeInViewport()
  await filter.press('ArrowDown')
  await expect(first).toBeFocused()
  await first.press('End')
  await expect(result).toBeFocused()
  await result.press('Delete')
  await expect(first).toHaveAttribute('aria-current', 'true')
  await expect(target).not.toBeInViewport()
  await result.press('Enter')
  await expect(target).toHaveAttribute('data-sigil-selected', '1')
  await expect(target).toBeInViewport({ ratio: 1 })
  await expect(result).toHaveAttribute('aria-current', 'true')
  await expect(undo).toBeDisabled()
  await expect(save).toBeDisabled()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({
      path: testInfo.outputPath('heading-outline-desktop.png'),
      animations: 'disabled',
    })
  const selectedColor = () => result.evaluate((element) => getComputedStyle(element).color)
  const light = await selectedColor()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.sigil-app')).toHaveClass(/sigil-theme-dark/)
  await expect.poll(selectedColor).not.toBe(light)
  await allLayers.press('Enter')
  await expect(fullSearch).toHaveValue('油墨')
  await fullSearch.press('Escape')
  const selectedLayer = tree.getByRole('treeitem', { name: '經驗問題', exact: true })
  await expect(selectedLayer).toHaveAttribute('aria-selected', 'true')
  await expect(selectedLayer).toBeInViewport({ ratio: 1 })
  await headings.press('Enter')

  const panel = page.locator('.sigil-inspector')
  const format = panel.getByRole('combobox', { name: '文字格式', exact: true })
  const edited = '初學者的報名說明'
  const renamed = outline.getByRole('button', { name: 'H3 ' + edited, exact: true })
  await panel.getByRole('textbox', { name: '內容', exact: true }).fill(edited)
  await expect(renamed).toHaveAttribute('aria-current', 'true')
  await expect(result).toHaveCount(0)
  await format.selectOption('h4')
  const retagged = outline.getByRole('button', { name: 'H4 ' + edited, exact: true })
  await expect(retagged).toHaveAttribute('aria-current', 'true')
  await expect(canvas(page).getByRole('heading', { level: 4, name: edited })).toBeVisible()
  await format.selectOption('p')
  await expect(retagged).toHaveCount(0)
  await expect(outline.locator('[data-heading-id]')).toHaveCount(4)
  await undo.click()
  await expect(retagged).toHaveAttribute('aria-current', 'true')
  await undo.click()
  await expect(renamed).toHaveAttribute('aria-current', 'true')
  expect(errors).toEqual([])
})

test('圖層搜尋以內容和 HTML ID 尋找收合元件，用鍵盤定位到畫布', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/activity/')
  await editTitle(page, '週末海報小聚')
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await save.click()
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  const draft = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
  expect(draft).toBeTruthy()
  await page.reload()

  const tree = page.getByRole('tree', { name: '圖層', exact: true })
  const branch = tree.getByRole('treeitem', { name: '常見問題', exact: true })
  const selected = tree.getByRole('treeitem', { name: '經驗說明', exact: true })
  if ((await branch.getAttribute('aria-expanded')) === 'true') await branch.press('ArrowLeft')
  await expect(selected).toHaveCount(0)
  await (await titleLayer(page)).press('Enter')
  const originalSelection = canvas(page).getByRole('heading', { name: '週末海報小聚', exact: true })
  await expect(originalSelection).toHaveAttribute('data-sigil-selected', '1')
  const answer = canvas(page).getByText('可以，老師會從構圖開始示範，再陪你完成印製。', {
    exact: true,
  })
  await expect(answer).not.toBeInViewport()

  const search = page.getByRole('searchbox', { name: '搜尋圖層', exact: true })
  await search.fill('問題')
  const toolsQuestion = page.getByRole('button', { name: /^工具問題/ })
  await expect(toolsQuestion.locator('.sigil-layer-search-name mark')).toHaveText('問題')
  await expect(toolsQuestion.locator('.sigil-layer-search-path mark')).toHaveText('問題')
  await search.fill('EVENT-INFO')
  await expect(page.getByRole('button', { name: /活動資訊/ }).locator('mark')).toHaveText(
    'event-info',
  )
  await search.fill('這份草稿裡沒有這個詞')
  await expect(page.getByRole('status').filter({ hasText: '找不到符合的圖層' })).toBeVisible()
  await search.press('Escape')
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(branch).toHaveAttribute('aria-expanded', 'false')

  await search.fill('常見問題 構圖 印製')
  const result = page.getByRole('button', { name: /經驗說明/ })
  await expect(result.locator('.sigil-layer-search-path mark')).toHaveText('常見問題')
  const highlights = result.locator('.sigil-layer-search-excerpt mark')
  await expect(highlights).toHaveText(['構圖', '印製'])
  await expect(answer).not.toHaveAttribute('data-sigil-selected', '1')
  await search.press('ArrowDown')
  await expect(result).toBeFocused()
  await result.press('Delete')
  await expect(originalSelection).toHaveAttribute('data-sigil-selected', '1')
  await expect(save).toBeDisabled()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: testInfo.outputPath('layer-search-desktop.png') })
  const markColor = () =>
    highlights.first().evaluate((mark) => getComputedStyle(mark).backgroundColor)
  const lightColor = await markColor()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.sigil-app')).toHaveClass(/sigil-theme-dark/)
  await expect.poll(markColor).not.toBe(lightColor)
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: testInfo.outputPath('layer-search-desktop-dark.png') })
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('')
  await expect(selected).toHaveAttribute('aria-selected', 'true')
  await expect(selected).toBeFocused()
  await expect(answer).toHaveAttribute('data-sigil-selected', '1')
  await expect(answer).toBeInViewport({ ratio: 1 })
  await expect(save).toBeDisabled()
  await expect(page.getByRole('button', { name: '復原', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(draft)
})

test('活動圖片構圖可用鍵盤及拖曳調整，復原後還原畫布像素', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const photo = canvas(page).locator('img[data-sigil-id="activity-image"]')
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  const src = await photo.getAttribute('src')
  const alt = await photo.getAttribute('alt')
  await (await activityLayer(page, ['活動頁', '主視覺'], '活動圖片')).press('Enter')
  const inspector = page.locator('.sigil-inspector')
  await inspector.getByRole('button', { name: '調整圖片構圖', exact: true }).press('Enter')
  await expect(inspector.getByRole('tab', { name: '樣式', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const ratio = inspector.getByRole('combobox', { name: '裁切比例', exact: true })
  const fit = inspector.getByRole('combobox', { name: '圖片適應方式', exact: true })
  const xFocus = inspector.getByRole('spinbutton', { name: '水平焦點 (%)', exact: true })
  const yFocus = inspector.getByRole('spinbutton', { name: '垂直焦點 (%)', exact: true })
  const save = page.getByRole('button', { name: '存檔', exact: true })
  const undo = page.getByRole('button', { name: '復原', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })
  await expect(save).toBeDisabled()
  await ratio.selectOption('1 / 1')
  await expect(photo).toHaveCSS('aspect-ratio', '1 / 1')
  await expect(photo).toHaveCSS('object-fit', 'cover')
  const square = (await photo.boundingBox())!
  expect(square.width / square.height).toBeCloseTo(1, 1)
  await ratio.selectOption('3 / 4')
  await expect(photo).toHaveCSS('aspect-ratio', '3 / 4')
  const portrait = (await photo.boundingBox())!
  expect(portrait.width / portrait.height).toBeCloseTo(0.75, 2)
  await undo.press('Enter')
  await expect(photo).toHaveCSS('aspect-ratio', '1 / 1')
  await xFocus.fill('15')
  await xFocus.press('Tab')
  await expect(photo).toHaveCSS('object-position', '15% 50%')

  // Sample the center of the painted photo, outside the selection outline and toolbar.
  const [centerX, centerY] = await coverCenter(page)
  const clip = { x: Math.floor(centerX) - 12, y: Math.floor(centerY) - 12, width: 24, height: 24 }
  async function sample() {
    const capture = await page.screenshot({ clip, animations: 'disabled', scale: 'css' })
    return page.evaluate(async (data) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + data
      await image.decode()
      const tile = document.createElement('canvas')
      tile.width = image.width
      tile.height = image.height
      const context = tile.getContext('2d')!
      context.drawImage(image, 0, 0)
      return Array.from(context.getImageData(0, 0, tile.width, tile.height).data)
    }, capture.toString('base64'))
  }
  const before = await sample()
  // WebKit can vary a few channel levels when repainting the same subpixel crop.
  const pixelDifference = (after: number[]) =>
    after.reduce((total, value, index) => total + Math.abs(value - before[index]!), 0) /
    after.length
  const surface = inspector.locator('.sigil-framing-surface')
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.25, { steps: 8 })
  await page.mouse.up()
  const x = Number(await xFocus.inputValue())
  const y = Number(await yFocus.inputValue())
  expect(Math.abs(x - 85)).toBeLessThanOrEqual(1)
  expect(Math.abs(y - 25)).toBeLessThanOrEqual(1)
  const position = x + '% ' + y + '%'
  await expect(photo).toHaveCSS('object-position', position)
  expect(pixelDifference(await sample())).toBeGreaterThan(15)
  await undo.press('Enter')
  await expect(photo).toHaveCSS('object-position', '15% 50%')
  expect(pixelDifference(await sample())).toBeLessThan(4)
  await redo.press('Enter')
  await expect(photo).toHaveCSS('object-position', position)
  await fit.selectOption('contain')
  await expect(photo).toHaveCSS('object-fit', 'contain')
  await undo.press('Enter')
  await expect(photo).toHaveCSS('object-fit', 'cover')
  await expect(photo).toHaveAttribute('src', src!)
  await expect(photo).toHaveAttribute('alt', alt!)
  await surface.scrollIntoViewIfNeeded()
  if (testInfo.project.name === 'chromium')
    await page.screenshot({
      path: testInfo.outputPath('image-framing-desktop.png'),
      animations: 'disabled',
    })

  await page.getByRole('button', { name: '手機', exact: true }).press('Enter')
  await expect(photo).toHaveCSS('aspect-ratio', '16 / 9')
  await expect(photo).toHaveCSS('object-position', position)
  await page.getByRole('button', { name: '桌面', exact: true }).press('Enter')
  await save.press('Enter')
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await page.getByRole('button', { name: '預覽', exact: true }).click()
  await expect(photo).toHaveCSS('aspect-ratio', '1 / 1')
  await expect(photo).toHaveCSS('object-position', position)
  await expect(photo).toHaveAttribute('src', src!)
  await expect(photo).toHaveAttribute('alt', alt!)
})

test('複製樣式到另一段活動內容，一次復原與重做並保存到草稿', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  const description = '用紙張、色塊與油墨，親手完成一張屬於你的海報。'
  const target = canvas(page).getByText(description, { exact: true })
  const source = canvas(page).getByRole('heading', { name: '活動資訊', exact: true })
  const originalSize = await target.evaluate((node) => getComputedStyle(node).fontSize)
  const originalLine = await target.evaluate((node) => getComputedStyle(node).lineHeight)
  const originalColor = await target.evaluate((node) => getComputedStyle(node).color)
  const sourceSize = await source.evaluate((node) => getComputedStyle(node).fontSize)
  const sourceLine = await source.evaluate((node) => getComputedStyle(node).lineHeight)
  expect(originalSize).not.toBe(sourceSize)
  expect(originalLine).not.toBe(sourceLine)

  const panel = page.locator('.sigil-inspector')
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await (await activityLayer(page, ['活動頁', '活動資訊'], '資訊標題')).press('Enter')
  await panel.getByRole('tab', { name: '樣式', exact: true }).press('Enter')
  await panel.getByRole('button', { name: '複製樣式', exact: true }).press('Enter')
  await expect(save).toBeDisabled()
  await (await activityLayer(page, ['活動頁', '主視覺', '活動簡介'], '活動說明')).press('Enter')
  await panel.getByRole('button', { name: '套用樣式', exact: true }).press('Enter')
  await expect(target).toHaveCSS('font-size', sourceSize)
  await expect(target).toHaveCSS('line-height', sourceLine)
  await expect(target).toHaveCSS('color', originalColor)
  await expect(target).toHaveCSS('margin-bottom', '12px')
  await page.getByRole('button', { name: '復原', exact: true }).press('Enter')
  await expect(target).toHaveCSS('font-size', originalSize)
  await expect(target).toHaveCSS('line-height', originalLine)
  await expect(target).toHaveCSS('margin-bottom', '0px')
  await expect(save).toBeDisabled()
  await page.getByRole('button', { name: '重做', exact: true }).press('Enter')
  await expect(target).toHaveCSS('font-size', sourceSize)
  await save.press('Enter')
  await expect(save).toBeDisabled()
  await page.reload()
  await expect(target).toHaveCSS('font-size', sourceSize)
  await expect(target).toHaveCSS('line-height', sourceLine)
  await expect(target).toHaveCSS('color', originalColor)
  await expect(target).toHaveCSS('margin-bottom', '12px')
})

test('從工程示例開啟工作坊，直接在畫布以快捷鍵存檔並重開本機草稿', async ({ page }) => {
  const errors = await prepareDemo(page)
  await page.goto('/')
  await page.getByRole('button', { name: '寫入 localStorage' }).click()
  await expect(page.getByText('已寫入 LS', { exact: true })).toBeVisible()
  const original = await page.evaluate(() => localStorage.getItem('sigil-demo'))
  expect(original).toBeTruthy()

  const origin = new URL(page.url()).origin
  const unexpectedRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.protocol.startsWith('http') &&
      (url.origin !== origin || url.pathname.startsWith('/sigil/'))
    ) {
      unexpectedRequests.push(request.url())
    }
  })
  const response = page.waitForResponse((res) => res.url() === origin + '/activity/')
  await page.getByRole('link', { name: '活動頁範例' }).click()
  expect((await response).headers()['content-security-policy']).toContain("script-src 'self'")
  await expect(canvas(page).getByRole('heading', { name: '秋日設計工作坊' })).toBeVisible()
  const photo = canvas(page).getByRole('img')
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  await expect(photo).toHaveJSProperty('naturalHeight', 800)
  await page.getByText('本機草稿', { exact: true }).click()
  await expect(page.locator('#storage-guide').filter({ hasText: '存在此瀏覽器' })).toBeVisible()
  await page.getByText('本機草稿', { exact: true }).click()

  const title = '週末版畫小聚'
  const heading = canvas(page).getByRole('heading', { level: 1 })
  const box = (await heading.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  const titleInput = canvas(page).getByRole('textbox', { name: '活動標題', exact: true })
  await expect(titleInput).toBeFocused()
  await page.keyboard.insertText(title)
  await expect(titleInput).toHaveText(title)
  await expect(titleInput).toBeFocused()
  await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
  const saveShortcut = await page.evaluate(() =>
    /Mac/i.test(navigator.platform) ? 'Meta+s' : 'Control+s',
  )
  await page.keyboard.press(saveShortcut)
  await expect(page).toHaveTitle(`${title} — Sigil`)
  const content = page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '內容', exact: true })
  await expect(content).toHaveValue(title)
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(heading).toHaveText('秋日設計工作坊')
  await expect(content).toHaveValue('秋日設計工作坊')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(heading).toHaveText(title)
  await expect(content).toHaveValue(title)
  await page.getByText('本機草稿', { exact: true }).click()
  await page.getByRole('button', { name: '重新載入' }).click()
  await expect(canvas(page).getByRole('heading', { name: title })).toBeVisible()
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo'))).toBe(original)
  expect(unexpectedRequests).toEqual([])

  await page.getByRole('link', { name: '工程示例' }).click()
  await page.getByRole('button', { name: '讀 localStorage' }).click()
  await expect(canvas(page).getByText('點我編輯', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const unavailable of ['拒絕存取', '草稿格式損壞'] as const) {
  test(`本機${unavailable}仍可編輯和匯出，並保留已有資料`, async ({ page, browser }, testInfo) => {
    const key = 'sigil-demo-activity-v1'
    const original = '{"version":1,"root":{"id":"missing-type"}}'
    await page.addInitScript(
      ({ unavailable, key, original }) => {
        localStorage.setItem(key, original)
        if (unavailable === '拒絕存取') {
          const read = Storage.prototype.getItem
          Storage.prototype.getItem = function (name) {
            if (name === key) throw new DOMException('Storage disabled', 'SecurityError')
            return read.call(this, name)
          }
        }
      },
      { unavailable, key, original },
    )
    await page.goto('/activity/')
    await expect(page.locator('#page-status')).toContainText('本次修改無法存檔')
    await editTitle(page, '試作中的海報課')
    await page.getByRole('button', { name: '存檔', exact: true }).click()
    await expect(page.locator('.sigil-status-dirty')).toHaveText('未儲存')
    await page.getByRole('button', { name: '匯出', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
    const downloaded = await downloading
    const file = testInfo.outputPath(downloaded.suggestedFilename())
    await downloaded.saveAs(file)
    const reader = await browser.newContext({ serviceWorkers: 'block' })
    try {
      const requests: string[] = []
      await reader.route(/^https?:/, (route) => {
        requests.push(route.request().url())
        return route.abort()
      })
      const exported = await reader.newPage()
      await exported.goto(pathToFileURL(file).href)
      await expect(exported).toHaveTitle('試作中的海報課')
      const photo = exported.getByRole('img')
      await expect(photo).toHaveAttribute('src', /^data:image\/webp;base64,/)
      await photo.evaluate((element: HTMLImageElement) => element.decode())
      await expect(photo).toHaveJSProperty('naturalWidth', 1200)
      await expect(photo).toHaveJSProperty('naturalHeight', 800)
      expect(requests).toEqual([])
    } finally {
      await reader.close()
    }
    expect(await page.evaluate((key) => localStorage[key], key)).toBe(original)
  })
}

test('畫布更換照片可復原重做，重開草稿與離線下載檔都保留選圖及替代文字', async ({
  page,
  browser,
}, testInfo) => {
  await page.goto('/activity/')
  const photo = canvas(page).getByRole('img')
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  const originalURL = (await photo.getAttribute('src'))!
  const originalAlt = (await photo.getAttribute('alt'))!
  await page.mouse.click(...(await coverCenter(page)))
  const replace = page
    .getByRole('toolbar', { name: '元件操作' })
    .getByRole('button', { name: '更換圖片', exact: true })
  await replace.click()
  await choosePhotoFile(page, photoFile)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(photo).toHaveJSProperty('naturalWidth', 3)
  await expect(photo).toHaveAttribute('alt', originalAlt)
  const customURL = (await photo.getAttribute('src'))!
  expect(customURL).toMatch(/^data:image\/png;base64,/)
  const controls = page.locator('.sigil-topbar')
  await controls.getByRole('button', { name: '復原', exact: true }).click()
  await expect(photo).toHaveAttribute('src', originalURL)
  await expect(photo).toHaveJSProperty('naturalWidth', 1200)
  await controls.getByRole('button', { name: '重做', exact: true }).click()
  await expect(photo).toHaveAttribute('src', customURL)
  const alt = '莓紅色油墨印刷色票'
  await page
    .locator('.sigil-inspector')
    .getByRole('textbox', { name: '替代文字', exact: true })
    .fill(alt)
  await controls.getByRole('button', { name: '存檔', exact: true }).click()
  await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
    '活動頁已儲存到此瀏覽器。',
  )
  await page.reload()
  await expect(photo).toHaveAttribute('src', customURL)
  await expect(photo).toHaveAttribute('alt', alt)
  await expect(photo).toHaveJSProperty('naturalHeight', 2)
  await page.mouse.dblclick(...(await coverCenter(page)))
  const media = page.getByRole('dialog')
  await expect(media.getByRole('button').filter({ hasText: photoFile.name })).toBeVisible()
  await media.getByRole('button', { name: '關閉', exact: true }).click()
  await controls.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '匯出 HTML' })
    .getByRole('button', { name: '下載 .html', exact: true })
    .click()
  const download = await downloading
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const reader = await browser.newContext({ serviceWorkers: 'block' })
  try {
    // WebKit offline mode also blocks file: navigation. Block network requests while opening the file.
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const exportedPhoto = exported.getByRole('img', { name: alt, exact: true })
    await expect(exportedPhoto).toHaveAttribute('src', customURL)
    const decoded = await exportedPhoto.evaluate(async (element: HTMLImageElement) => {
      await element.decode()
      const pixels = document.createElement('canvas').getContext('2d')!
      pixels.drawImage(element, 0, 0)
      return {
        width: element.naturalWidth,
        height: element.naturalHeight,
        pixel: [...pixels.getImageData(0, 0, 1, 1).data],
      }
    })
    expect(decoded).toEqual({ width: 3, height: 2, pixel: [220, 40, 85, 255] })
  } finally {
    await reader.close()
  }
})

test('折疊式 FAQ 新增問答、復原、重開、鍵盤預覽與離線 HTML', async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/activity/')
  await page.getByRole('button', { name: '新增區塊', exact: true }).click()
  const library = page.locator('.sigil-blocks-panel')
  await library.getByRole('searchbox', { name: '搜尋區塊' }).fill('FAQ')
  await library.getByRole('button', { name: '插入 折疊式 FAQ', exact: true }).click()
  const panel = page.locator('.sigil-inspector')
  const question = panel.getByRole('textbox', { name: '問題', exact: true })
  const answer = panel.getByRole('textbox', { name: '答案', exact: true })
  const existing = panel.getByRole('button', { name: '需要自備工具嗎？', exact: true })
  await existing.press('Enter')
  await expect(question).toBeFocused()
  await expect(answer).toHaveValue('活動現場會提供所需工具與材料。')
  await panel.getByRole('button', { name: '返回問答清單', exact: true }).press('Enter')
  await expect(existing).toBeFocused()
  await panel.getByRole('button', { name: '新增問答', exact: true }).press('Enter')
  await expect(question).toBeFocused()
  await expect(question).toHaveValue('新的問題')
  await expect(answer).toHaveValue('請填寫答案。')
  const questionText = '我的作品什麼時候可以領取？'
  const answerText = '作品晾乾後，即可在當天帶回家。'
  await question.fill(questionText)
  await answer.fill(answerText)
  await answer.press('Tab')
  const frame = canvas(page)
  const addedRow = frame.locator('details').filter({ hasText: questionText })
  await expect(addedRow.locator('summary')).toHaveText(questionText)
  await expect(addedRow).toContainText(answerText)
  await page.getByRole('button', { name: '復原', exact: true }).click()
  await expect(addedRow).toContainText('請填寫答案。')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(addedRow).toContainText(answerText)
  await addedRow.scrollIntoViewIfNeeded()
  const editedAnswer = addedRow.getByText(answerText, { exact: true })
  await expect
    .poll(() =>
      editedAnswer.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return element.contains(
          element.ownerDocument.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          ),
        )
      }),
    )
    .toBe(true)
  const toolbar = page.getByRole('toolbar', { name: '元件操作' })
  const editedSummary = addedRow.locator('summary')
  await expect
    .poll(async () => {
      const [bar, summary] = await Promise.all([toolbar.boundingBox(), editedSummary.boundingBox()])
      if (!bar || !summary) return 'missing'
      if (
        bar.y + bar.height <= summary.y ||
        summary.y + summary.height <= bar.y ||
        bar.x + bar.width <= summary.x ||
        summary.x + summary.width <= bar.x
      )
        return 'clear'
      return JSON.stringify({ toolbar: bar, summary })
    })
    .toBe('clear')
  if (testInfo.project.name === 'chromium') {
    await page.screenshot({ path: testInfo.outputPath('faq-authoring.png') })
  }
  const save = page.getByRole('button', { name: '存檔', exact: true })
  await save.click()
  await expect(save).toBeDisabled()
  await page.reload()
  await expect(addedRow).toContainText(answerText)
  const savedDraft = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
  expect(savedDraft).toBeTruthy()
  await page.getByRole('button', { name: '預覽', exact: true }).click()
  const firstRow = frame.locator('details').first()
  await expect(firstRow).toHaveJSProperty('open', false)
  await expect(addedRow).toHaveJSProperty('open', false)
  const addedSummary = addedRow.locator('summary')
  await addedSummary.press('Enter')
  await expect(addedRow).toHaveJSProperty('open', true)
  await expect(addedRow.getByText(answerText, { exact: true })).toBeVisible()
  await expect(firstRow).toHaveJSProperty('open', false)
  if (testInfo.project.name === 'chromium') {
    await page.screenshot({ path: testInfo.outputPath('faq-desktop-preview.png') })
  }
  await addedSummary.press('Space')
  await expect(addedRow).toHaveJSProperty('open', false)
  await firstRow.locator('summary').click()
  await expect(firstRow).toHaveJSProperty('open', true)
  await page.getByRole('button', { name: '編輯', exact: true }).click()
  await expect(save).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(savedDraft)
  await page.getByRole('button', { name: '匯出', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('dialog', { name: '匯出 HTML' })
    .getByRole('button', { name: '下載 .html', exact: true })
    .click()
  const download = await downloading
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await reader.route(/^https?:/, (route) => route.abort())
    const exported = await reader.newPage()
    await exported.goto(pathToFileURL(file).href)
    const exportedRow = exported.locator('details').filter({ hasText: questionText })
    await expect(exported.locator('details[open]')).toHaveCount(0)
    const openRow = exported.locator('details[open]').filter({ hasText: questionText })
    const summary = exportedRow.locator('summary')
    await expect(summary).toHaveText(questionText)
    await summary.click()
    await expect(openRow).toHaveCount(1)
    await expect(exportedRow.getByText(answerText, { exact: true })).toBeVisible()
    await summary.press('Enter')
    await expect(openRow).toHaveCount(0)
  } finally {
    await reader.close()
  }
})

test.describe('本機活動頁觸控', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('手機從畫布調整文字排版，單獨還原行高後存檔重開', async ({ page }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const title = canvas(page).getByRole('heading', { name: '秋日設計工作坊', level: 1 })
    await title.scrollIntoViewIfNeeded()
    const hit = (await title.boundingBox())!
    await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height / 2)
    const toolbar = page.getByRole('toolbar', { name: '元件操作' })
    await toolbar.getByRole('button', { name: '調整文字排版' }).tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    const preset = drawer.getByRole('combobox', { name: '文字排版預設', exact: true })
    const line = drawer.getByRole('textbox', { name: '行高', exact: true })
    const spacing = drawer.getByRole('textbox', { name: '字距', exact: true })
    await expect(preset).toBeFocused()
    await preset.tap()
    await preset.selectOption({ label: '註解' })
    const caption = { size: 14, line: 19.6, weight: '400', spacing: 0.3 }
    await expect.poll(() => readTypography(title)).toEqual(caption)
    await line.tap()
    await line.fill('1.75')
    await spacing.tap()
    await expect.poll(() => readTypography(title)).toEqual({ ...caption, line: 24.5 })
    const inherit = drawer.locator('[data-style-reset="line-height"]')
    await inherit.tap()
    await expect(line).toHaveAttribute('data-style-inherited', 'true')
    await expect.poll(() => readTypography(title)).toEqual({ ...caption, line: 16.1 })
    await line.fill('1.75')
    await line.press('Enter')
    await spacing.fill('2px')
    await spacing.press('Enter')
    const edited = { ...caption, line: 24.5, spacing: 2 }
    await expect.poll(() => readTypography(title)).toEqual(edited)
    const controls = []
    for (const control of [preset, line, spacing, inherit]) {
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375)
      controls.push({ width: box.width, height: box.height })
    }
    await testInfo.attach('touch-typography', {
      body: JSON.stringify({ controls, computed: await readTypography(title) }),
      contentType: 'application/json',
    })
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBe(375)
    if (testInfo.project.name === 'chromium') {
      await preset.evaluate((el) =>
        el.closest('label, .sigil-field')?.scrollIntoView({ block: 'start' }),
      )
      await page.screenshot({
        path: testInfo.outputPath('typography-mobile.png'),
        animations: 'disabled',
      })
    }
    await drawer.getByRole('button', { name: '關閉面板' }).tap()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.reload()
    await expect.poll(() => readTypography(title)).toEqual(edited)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: '平板', exact: true }).tap()
    await expect(title).not.toHaveCSS('font-size', '14px')
    await (await titleLayer(page)).tap()
    const panel = page.locator('.sigil-inspector')
    await panel.getByRole('tab', { name: '樣式', exact: true }).tap()
    await panel.getByRole('button', { name: '文字', exact: true }).tap()
    await expect(panel.getByRole('combobox', { name: '文字排版預設' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('手機從畫布更改標題文字格式，段落與標題共用原有樣式及位置', async ({ page }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const frame = canvas(page)
    const title = frame.locator('[data-sigil-id="activity-title"]')
    const readStyle = () =>
      title.evaluate((el) => ({
        style: el.getAttribute('style'),
        fontSize: getComputedStyle(el).fontSize,
        parentId: el.parentElement?.dataset.sigilId,
        previousId: el.previousElementSibling?.getAttribute('data-sigil-id'),
        nextId: el.nextElementSibling?.getAttribute('data-sigil-id'),
      }))
    const original = await readStyle()
    await expect(title).toHaveJSProperty('localName', 'h1')
    await title.scrollIntoViewIfNeeded()
    const hit = (await title.boundingBox())!
    await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height / 2)
    const edit = page.getByRole('button', { name: '編輯 活動標題', exact: true })
    await edit.tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    const content = drawer.getByRole('textbox', { name: '內容', exact: true })
    const format = drawer.getByRole('combobox', { name: '文字格式', exact: true })
    await expect(content).toBeFocused()
    await expect(format).toHaveValue('h1')
    const bounds = (await format.boundingBox())!
    const contentBounds = (await content.boundingBox())!
    for (const rect of [bounds, contentBounds]) {
      expect(rect.height).toBeGreaterThanOrEqual(44)
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(375)
    }
    await expect(content).toHaveCSS('font-size', '16px')
    await expect(format).toHaveCSS('font-size', '16px')
    await format.tap()
    await format.selectOption('p')
    await expect(title).toHaveJSProperty('localName', 'p')
    await expect(frame.getByRole('heading', { name: '秋日設計工作坊', exact: true })).toHaveCount(0)
    expect(await readStyle()).toEqual(original)
    await format.selectOption('h2')
    await expect(
      frame.getByRole('heading', { level: 2, name: '秋日設計工作坊', exact: true }),
    ).toHaveCount(1)
    await expect(title).toHaveAttribute('data-sigil-selected', '1')
    if (testInfo.project.name === 'webkit')
      await page.screenshot({
        path: testInfo.outputPath('heading-format-mobile.png'),
        animations: 'disabled',
      })
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await expect(edit).toBeFocused()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.reload()
    await expect(title).toHaveJSProperty('localName', 'h2')
    await expect(title).toHaveText('秋日設計工作坊')
    expect(await readStyle()).toEqual(original)
    await testInfo.attach('heading-format-touch', {
      body: JSON.stringify({
        width: bounds.width,
        height: bounds.height,
        contentWidth: contentBounds.width,
        contentHeight: contentBounds.height,
        originalFontSize: original.fontSize,
      }),
      contentType: 'application/json',
    })
    expect(errors).toEqual([])
  })

  test('手機四邊間距可單獨設定和清除左方內距，重開後保留裝置差異', async ({ page }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const info = canvas(page).locator('#event-info')
    const original = ['24px', '24px', '24px', '24px']
    const edited = ['24px', '24px', '24px', '42px']
    await expect.poll(() => boxSides(info, 'padding')).toEqual(original)
    const drawer = page.locator('[data-compact-panel="settings"]')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    await (await activityLayer(page, ['活動頁'], '活動資訊')).tap()
    await drawer.getByRole('tab', { name: '樣式', exact: true }).tap()
    const toggle = drawer.getByRole('button', { name: '分別調整內距', exact: true })
    const left = drawer.getByRole('textbox', { name: '左方內距', exact: true })
    const clear = drawer.getByRole('button', { name: '清除左方內距覆寫', exact: true })
    await toggle.tap()
    await expect(clear).toBeDisabled()
    await expect(left).toHaveValue('1.5rem')
    await left.tap()
    await left.fill('42px')
    await drawer.getByRole('textbox', { name: '下方內距', exact: true }).tap()
    await expect.poll(() => boxSides(info, 'padding')).toEqual(edited)
    for (const control of [toggle, left, clear]) {
      const box = (await control.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    if (testInfo.project.name === 'webkit') {
      await clear.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('box-spacing-mobile.png'),
        animations: 'disabled',
      })
    }
    await clear.tap()
    await expect(left).toHaveValue('1.5rem')
    await expect(clear).toBeDisabled()
    await expect.poll(() => boxSides(info, 'padding')).toEqual(original)
    await left.fill('42px')
    await left.press('Enter')
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload()
    await expect.poll(() => boxSides(info, 'padding')).toEqual(original)
    await page.getByRole('button', { name: '平板', exact: true }).tap()
    await expect.poll(() => boxSides(info, 'padding')).toEqual(original)
    await page.getByRole('button', { name: '手機', exact: true }).tap()
    await expect.poll(() => boxSides(info, 'padding')).toEqual(edited)
    expect(errors).toEqual([])
  })

  test('手機可從頁面色票取用主視覺背景，還原繼承後存檔重開保留裝置差異', async ({
    page,
  }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const info = canvas(page).locator('#event-info')
    const hero = canvas(page).locator('[data-sigil-id="activity-hero"]')
    const source = await hero.evaluate((el) => getComputedStyle(el).backgroundColor)
    const original = await info.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(original).not.toBe(source)
    const drawer = page.locator('[data-compact-panel="settings"]')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    await (await activityLayer(page, ['活動頁'], '活動資訊')).tap()
    await drawer.getByRole('tab', { name: '樣式', exact: true }).tap()
    await drawer.getByRole('button', { name: '外觀', exact: true }).tap()
    const field = drawer.locator('[data-color-property="background-color"]')
    const toggle = field.getByRole('button', { name: '頁面色票', exact: true })
    const swatch = field.getByRole('button', { name: '#f8f4eb', exact: true })
    const value = field.getByRole('textbox', { name: '背景顏色', exact: true })
    const native = field.locator('input[type="color"]')
    const inherit = drawer.locator('[data-style-reset="background-color"]')
    await expect(value).toHaveValue('#eef2f8')
    await expect(native).toHaveValue('#eef2f8')
    await toggle.tap()
    await expect(swatch).toBeVisible()
    await expect(field.getByRole('button', { name: '#eef2f8', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const targets = await field.locator('.sigil-color-option').evaluateAll((buttons) =>
      buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect()
        return { color: button.getAttribute('aria-label') ?? button.textContent, width, height }
      }),
    )
    expect(targets.length).toBeGreaterThan(2)
    for (const target of targets)
      expect(Math.min(target.width, target.height), target.color ?? '').toBeGreaterThanOrEqual(44)
    const overflow = await field.evaluate((el) => {
      const drawer = el.closest('[data-compact-panel]')!
      return {
        field: el.scrollWidth - el.clientWidth,
        drawer: drawer.scrollWidth - drawer.clientWidth,
      }
    })
    expect(overflow).toEqual({ field: 0, drawer: 0 })
    if (testInfo.project.name === 'webkit') {
      await swatch.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('page-colors-mobile.png'),
        animations: 'disabled',
      })
    }
    await swatch.tap()
    await expect(info).toHaveCSS('background-color', source)
    await expect(value).toHaveValue('#f8f4eb')
    await expect(inherit).toBeEnabled()
    await inherit.tap()
    await expect(info).toHaveCSS('background-color', original)
    await expect(value).toHaveValue('#eef2f8')
    await expect(inherit).toBeDisabled()
    await toggle.tap()
    await swatch.tap()
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload()
    await expect(info).toHaveCSS('background-color', original)
    await page.getByRole('button', { name: '手機', exact: true }).tap()
    await expect(info).toHaveCSS('background-color', source)
    expect(errors).toEqual([])
    await testInfo.attach('page-colors-touch', {
      body: JSON.stringify({ source, original, targets, overflow }),
      contentType: 'application/json',
    })
  })

  test('手機圖層與設定分別使用整個抽屜，往返保留選取、焦點與捲動位置', async ({
    page,
  }, testInfo) => {
    await page.goto('/activity/')
    const opener = page.getByRole('button', { name: '圖層／設定', exact: true })
    await opener.tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    const layers = drawer.getByRole('button', { name: '圖層', exact: true })
    const settings = drawer.getByRole('button', { name: '元件設定', exact: true })
    const tree = drawer.getByRole('tree', { name: '圖層', exact: true })
    const tabs = drawer.getByRole('tablist')
    const style = drawer.getByRole('tab', { name: '樣式', exact: true })
    const close = drawer.getByRole('button', { name: '關閉面板', exact: true })
    const save = page.getByRole('button', { name: '存檔', exact: true })
    const before = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
    const sizes = () =>
      drawer.evaluate((el) => ({
        drawer: el.clientHeight,
        layers: el.querySelector<HTMLElement>('.sigil-layers-box')!.clientHeight,
        tree: el.querySelector<HTMLElement>('.sigil-layer-tree')!.clientHeight,
        inspector: el.querySelector<HTMLElement>('.sigil-inspector')!.clientHeight,
        fields: el.querySelector<HTMLElement>('.sigil-inspector-body')!.clientHeight,
        overflow: el.scrollWidth - el.clientWidth,
      }))
    await expect(layers).toHaveAttribute('aria-pressed', 'true')
    await expect(tabs).toBeHidden()
    const layerSize = await sizes()
    expect(layerSize.layers).toBeGreaterThan(layerSize.drawer * 0.8)
    expect(layerSize.tree).toBeGreaterThan(layerSize.drawer * 0.65)
    expect(layerSize.inspector).toBe(0)
    expect(layerSize.overflow).toBe(0)
    const targets = []
    for (const button of [layers, settings, close]) {
      const box = (await button.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      targets.push({ label: await button.textContent(), width: box.width, height: box.height })
    }
    const info = await activityLayer(page, ['活動頁'], '活動資訊')
    const root = tree.getByRole('treeitem', { name: '活動頁', exact: true })
    await root.press('ArrowDown')
    await expect(tree.getByRole('treeitem', { name: '主視覺', exact: true })).toBeFocused()
    await expect(layers).toHaveAttribute('aria-pressed', 'true')
    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: testInfo.outputPath('mobile-layers.png'),
        animations: 'disabled',
      })
    }
    await info.press('Enter')
    await expect(settings).toHaveAttribute('aria-pressed', 'true')
    await expect(tree).toBeHidden()
    await expect(drawer.getByRole('tab', { name: '內容', exact: true })).toBeFocused()
    await style.press('Enter')
    const inspectorSize = await sizes()
    expect(inspectorSize.inspector).toBeGreaterThan(inspectorSize.drawer * 0.8)
    expect(inspectorSize.fields).toBeGreaterThan(inspectorSize.drawer * 0.65)
    expect(inspectorSize.layers).toBe(0)
    expect(inspectorSize.overflow).toBe(0)
    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: testInfo.outputPath('mobile-settings.png'),
        animations: 'disabled',
      })
    }
    await layers.tap()
    await expect(info).toBeFocused()
    const end = await activityLayer(page, ['活動頁', '常見問題'], '經驗說明')
    await end.scrollIntoViewIfNeeded()
    const scrollTop = await tree.evaluate((el) => el.scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
    await end.tap()
    await expect(style).toBeFocused()
    await expect(drawer.locator('.sigil-inspector-head')).toHaveText('經驗說明')
    await layers.tap()
    await expect(end).toBeFocused()
    expect(Math.abs((await tree.evaluate((el) => el.scrollTop)) - scrollTop)).toBeLessThanOrEqual(1)
    await settings.tap()
    await expect(drawer.locator('.sigil-inspector-head')).toHaveText('經驗說明')
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveAttribute('data-open', 'false')
    await expect(opener).toBeFocused()
    await expect(save).toBeDisabled()
    expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(before)
    await testInfo.attach('mobile-panel-heights', {
      contentType: 'application/json',
      body: JSON.stringify({ layerSize, inspectorSize, targets, scrollTop }),
    })
  })

  test('手機格線項目可觸控讓標題橫跨整列，並還原繼承', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const info = canvas(page).locator('#event-info')
    const drawer = page.locator('[data-compact-panel="settings"]')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    const layer = (name: string) => drawer.getByRole('treeitem', { name, exact: true })
    const expand = async (name: string) => {
      const row = layer(name)
      if ((await row.getAttribute('aria-expanded')) === 'false')
        await row.locator('[data-layer-action="toggle"]').tap()
    }
    await expand('活動頁')
    await layer('活動資訊').tap()
    await drawer.getByRole('tab', { name: '樣式', exact: true }).tap()
    await drawer.getByRole('button', { name: '3 欄', exact: true }).tap()
    await drawer.getByRole('button', { name: '圖層', exact: true }).tap()
    await expand('活動資訊')
    await layer('資訊標題').tap()
    const item = drawer.getByRole('group', { name: '格線項目配置', exact: true })
    const span = item.getByRole('button', { name: '橫跨整列', exact: true })
    await span.tap()
    await expect(span).toHaveAttribute('aria-pressed', 'true')
    const geometry = await expectInfoTitlePlacement(info, 3, true)
    const targets = await item.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect()
        return { label: button.textContent, width, height }
      }),
    )
    expect(targets).toHaveLength(3)
    for (const target of targets)
      expect(Math.min(target.width, target.height), target.label ?? '').toBeGreaterThanOrEqual(44)
    const overflow = await item.evaluate((el) => ({
      item: el.scrollWidth - el.clientWidth,
      drawer:
        el.closest('[data-compact-panel]')!.scrollWidth -
        el.closest('[data-compact-panel]')!.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(overflow).toEqual({ item: 0, drawer: 0, page: 0 })
    if (testInfo.project.name === 'webkit') {
      await item.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('title-full-row-mobile.png'),
        animations: 'disabled',
      })
    }
    const inherit = item.getByRole('button', { name: '沿用上層配置', exact: true })
    await inherit.tap()
    await expect(inherit).toBeDisabled()
    await expectInfoTitlePlacement(info, 3, false)
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    await page.getByRole('button', { name: '復原', exact: true }).tap()
    await expectInfoTitlePlacement(info, 3, true)
    await testInfo.attach('title-row-touch', {
      body: JSON.stringify({ geometry, targets, overflow }),
      contentType: 'application/json',
    })
  })

  test('手機格線欄數可觸控將活動簡介從直向排列改為兩欄，並一次復原', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const intro = canvas(page).locator(':has(> [data-sigil-id="activity-title"])')
    await expect(intro).toHaveCSS('display', 'flex')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    await (await activityLayer(page, ['活動頁', '主視覺'], '活動簡介')).tap()
    await drawer.getByRole('tab', { name: '樣式', exact: true }).tap()
    const buttons = drawer.locator('button[data-grid-columns]')
    await expect(buttons).toHaveCount(6)
    await buttons.nth(1).tap()
    await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expectGridColumns(intro, 2)
    const sizes = await buttons.evaluateAll((controls) =>
      controls.map((el) => {
        const { width, height } = el.getBoundingClientRect()
        return { width, height }
      }),
    )
    for (const { width, height } of sizes)
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(44)
    const drawerOverflow = await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)
    const pageOverflow = await page
      .locator('html')
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(drawerOverflow).toBe(0)
    expect(pageOverflow).toBe(0)
    if (testInfo.project.name === 'webkit') {
      await drawer.locator('.sigil-grid-columns').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('grid-mobile.png'),
        animations: 'disabled',
      })
    }
    await testInfo.attach('grid-touch-controls', {
      body: JSON.stringify({ sizes, drawerOverflow, pageOverflow }),
      contentType: 'application/json',
    })
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    await page.getByRole('button', { name: '復原', exact: true }).tap()
    await expect(intro).toHaveCSS('display', 'flex')
    await expect(intro).toHaveCSS('flex-direction', 'column')
    await expect(page.getByRole('button', { name: '復原', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '重做', exact: true }).tap()
    await expectGridColumns(intro, 2)
  })

  test('手機區塊庫釘選搜尋後可觸控插在畫布標題下方', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    await page.getByRole('button', { name: '區塊', exact: true }).tap()
    const drawer = page.locator('[data-compact-panel="blocks"]')
    const block = faqLibrary(page)
    await block.search.fill('行銷　ＦＡＱ')
    await expect(block.results).toHaveCount(2)
    await block.pin.tap()
    await expect(block.pin).toHaveAttribute('aria-pressed', 'true')
    await block.filter.tap()
    await expect(block.results).toHaveCount(1)
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await expect(save).toBeDisabled()
    const heading = canvas(page).getByRole('heading', { name: '秋日設計工作坊', exact: true })
    await heading.scrollIntoViewIfNeeded()
    const bounds = (await heading.boundingBox())!
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await insertAfterSelection(page).tap()
    await expect(drawer).toHaveAttribute('data-open', 'true')
    await expect(block.search).toHaveValue('行銷　ＦＡＱ')
    await expect(block.filter).toHaveAttribute('aria-pressed', 'true')
    await expect(block.results).toHaveCount(1)
    const controls = { pin: block.pin, filter: block.filter, insert: block.insert }
    const sizes: Record<string, { width: number; height: number }> = {}
    for (const [name, control] of Object.entries(controls)) {
      await expect(control).toBeInViewport({ ratio: 1 })
      const { width, height } = (await control.boundingBox())!
      expect(Math.min(width, height), name).toBeGreaterThanOrEqual(44)
      sizes[name] = { width, height }
    }
    const overflow = await drawer.evaluate((el) => ({
      drawer: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(overflow).toEqual({ drawer: 0, page: 0 })
    await testInfo.attach('pinned-library-targets', {
      body: JSON.stringify({ viewport: page.viewportSize(), sizes, overflow }),
      contentType: 'application/json',
    })
    await page.screenshot({
      path: testInfo.outputPath('pinned-library-mobile.png'),
      animations: 'disabled',
    })
    await block.insert.tap()
    await expect(drawer).toHaveAttribute('data-open', 'false')
    await expect(block.afterTitle).toHaveAttribute('data-sigil-selected', '1')
    await expect(save).toBeEnabled()
    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    const undo = page.getByRole('button', { name: '復原', exact: true })
    await undo.tap()
    await expect(block.afterTitle).toHaveCount(0)
    await expect(undo).toBeDisabled()
    await page.getByRole('button', { name: '重做', exact: true }).tap()
    await expect(block.afterTitle).toHaveCount(1)
  })

  test('手機元件路徑可返回畫布或點選上層後直接編輯', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const frame = canvas(page)
    const heading = frame.getByRole('heading', { name: '秋日設計工作坊', exact: true })
    await heading.scrollIntoViewIfNeeded()
    const hit = (await heading.boundingBox())!
    await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height / 2)
    await expect(heading).toHaveAttribute('data-sigil-selected', '1')
    const trigger = page.getByRole('button', { name: '元件路徑', exact: true })
    const dialog = page.getByRole('dialog', { name: '元件路徑', exact: true })
    const edit = page.getByRole('button', { name: '編輯 活動標題', exact: true })
    await expect(trigger).toBeInViewport({ ratio: 1 })
    await expect(edit).toBeInViewport({ ratio: 1 })
    const bounds = { trigger: (await trigger.boundingBox())!, edit: (await edit.boundingBox())! }
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[aria-current="location"]')).toHaveText('活動標題')
    for (const name of ['活動頁', '主視覺', '活動簡介', '關閉']) {
      const target = dialog.getByRole('button', { name, exact: true })
      await expect(target).toBeInViewport({ ratio: 1 })
      Object.assign(bounds, { [name]: (await target.boundingBox())! })
    }
    for (const [name, box] of Object.entries(bounds))
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
    const overflow = await dialog.evaluate((el) => ({
      dialog: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(overflow).toEqual({ dialog: 0, page: 0 })
    await testInfo.attach('path-touch-controls', {
      body: JSON.stringify({ viewport: page.viewportSize(), bounds, overflow }),
      contentType: 'application/json',
    })
    await page.screenshot({ path: testInfo.outputPath('path-mobile.png'), animations: 'disabled' })
    const ancestor = dialog.getByRole('button', { name: '活動簡介', exact: true })
    await ancestor.focus()
    await ancestor.press('Delete')
    await expect(ancestor).toBeFocused()
    await expect(dialog).toBeVisible()
    await expect(heading).toHaveAttribute('data-sigil-selected', '1')
    await expect(page.locator('.sigil-status [data-save-state]')).toHaveText('已儲存')
    await expect(page.locator('button[data-command-id="save"]')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(heading).toHaveAttribute('data-sigil-selected', '1')
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await expect(save).toBeDisabled()
    await trigger.tap()
    await dialog.getByRole('button', { name: '主視覺', exact: true }).tap()
    await expect(dialog).toBeHidden()
    const hero = frame.locator('[data-sigil-id="activity-hero"]')
    await expect(hero).toHaveAttribute('data-sigil-selected', '1')
    await expect(hero).toBeInViewport()
    await expect(save).toBeDisabled()
    await page.getByRole('button', { name: '編輯 主視覺', exact: true }).tap()
    const settings = page.locator('[data-compact-panel="settings"]')
    await expect(settings.locator('.sigil-inspector-head')).toHaveText('主視覺')
    await settings.getByRole('tab', { name: '進階', exact: true }).tap()
    await expect(settings.getByRole('textbox', { name: '元件內部 ID', exact: true })).toHaveValue(
      'activity-hero',
    )
    await settings.getByRole('textbox', { name: 'class', exact: true }).fill('workshop-hero')
    await expect(hero).toHaveClass('workshop-hero')
    await trigger.tap()
    await dialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await expect(trigger).toBeFocused()
    await expect(settings).toHaveAttribute('data-open', 'true')
    await expect(settings.locator('.sigil-inspector-head')).toHaveText('主視覺')
    await trigger.tap()
    await dialog.getByRole('button', { name: '活動頁', exact: true }).tap()
    await expect(settings).toHaveAttribute('data-open', 'false')
    await expect(frame.locator('[data-sigil-id="activity-root"]')).toHaveAttribute(
      'data-sigil-selected',
      '1',
    )
    await expect(save).toBeEnabled()
    await page.getByRole('button', { name: '預覽', exact: true }).tap()
    await expect(trigger).toBeHidden()
    await expect(dialog).toBeHidden()
  })

  test('手機用觸控移動元件到活動資訊開頭', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const link = canvas(page).getByRole('link', { name: '查看活動資訊', exact: true })
    await link.scrollIntoViewIfNeeded()
    const box = (await link.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    const move = moveControls(page)
    await expect(move.open).toBeInViewport({ ratio: 1 })
    const openBounds = (await move.open.boundingBox())!
    await move.open.tap()
    await expect(move.dialog).toBeVisible()
    await move.search.tap()
    await move.search.fill('活動資訊')
    await move.destination.selectOption('activity-info')
    await move.position.selectOption('before')
    await move.before.selectOption({ label: '活動地點' })
    const bounds: Record<string, typeof openBounds> = { open: openBounds }
    for (const [key, control] of Object.entries({
      search: move.search,
      destination: move.destination,
      position: move.position,
      before: move.before,
      cancel: move.cancel,
      confirm: move.confirm,
    })) {
      await expect(control).toBeInViewport({ ratio: 1 })
      bounds[key] = (await control.boundingBox())!
    }
    for (const [key, box] of Object.entries(bounds))
      expect(Math.min(box.width, box.height), key).toBeGreaterThanOrEqual(44)
    const overflow = await move.dialog.evaluate((el) => ({
      dialog: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(overflow).toEqual({ dialog: 0, page: 0 })
    await testInfo.attach('move-touch-controls', {
      body: JSON.stringify({ viewport: page.viewportSize(), bounds, overflow }),
      contentType: 'application/json',
    })
    await page.screenshot({ path: testInfo.outputPath('move-mobile.png'), animations: 'disabled' })
    await move.cancel.tap()
    await expect(move.dialog).toBeHidden()
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
    await move.open.tap()
    await move.destination.selectOption('activity-info')
    await move.position.selectOption('first')
    await move.confirm.tap()
    await expect(canvas(page).locator('#event-info > :first-child')).toHaveText('查看活動資訊')
    await expect(link).toHaveAttribute('data-sigil-selected', '1')
    await expect(link).toBeInViewport({ ratio: 1 })
    await expect(move.toolbar).toBeInViewport({ ratio: 1 })

    const drawer = page.locator('[data-compact-panel="settings"]')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    const row = await activityLayer(page, ['活動頁', '活動資訊'], '主要行動')
    const moveItem = page.getByRole('menuitem', { name: '移動元件', exact: true })
    await row.press('Shift+F10')
    await moveItem.press('Enter')
    await expect(move.search).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(move.dialog).toBeHidden()
    await expect(drawer).toHaveAttribute('data-open', 'true')
    await expect(row).toBeFocused()
    await expect(canvas(page).locator('#event-info > :first-child')).toHaveText('查看活動資訊')

    await page.keyboard.press('Shift+F10')
    await moveItem.press('Enter')
    await expect(move.destination).toHaveValue('activity-info')
    await move.position.selectOption('last')
    await move.confirm.press('Enter')
    await expect(move.dialog).toBeHidden()
    await expect(drawer).toHaveAttribute('data-open', 'false')
    await expect(canvas(page).locator('#event-info > :last-child')).toHaveText('查看活動資訊')
    await expect(link).toHaveAttribute('data-sigil-selected', '1')
    await expect(move.toolbar).toBeFocused()
    await expect(move.toolbar).toBeInViewport({ ratio: 1 })
  })

  test('手機頁內錨點可觸控改名並在剪貼簿受限時手動複製', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const drawer = page.locator('[data-compact-panel="settings"]')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    await (await activityLayer(page, ['活動頁'], '活動資訊')).tap()
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '編輯 活動資訊', exact: true }).tap()
    const shortcut = drawer.getByRole('button', { name: '編輯頁內錨點', exact: true })
    const shortcutSize = (await shortcut.boundingBox())!
    await shortcut.tap()
    const group = drawer.getByRole('group', { name: '頁內錨點', exact: true })
    const name = group.getByRole('textbox', { name: '錨點名稱', exact: true })
    const apply = group.getByRole('button', { name: '套用錨點', exact: true })
    const copy = group.getByRole('button', { name: '複製頁內連結', exact: true })
    await expect(name).toBeFocused()
    await name.fill('workshop-info')
    await apply.tap()
    await expect(canvas(page).getByRole('link', { name: '查看活動資訊' })).toHaveAttribute(
      'href',
      '#workshop-info',
    )
    await expect(canvas(page).locator('[data-sigil-id="activity-info"]')).toHaveAttribute(
      'id',
      'workshop-info',
    )
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }),
    )
    await copy.tap()
    const manual = group.getByRole('textbox', { name: '頁內連結', exact: true })
    await expect(manual).toBeFocused()
    await expect(manual).toHaveValue('#workshop-info')
    await expect(manual).toHaveJSProperty('readOnly', true)
    expect(
      await manual.evaluate((input: HTMLInputElement) =>
        input.value.slice(input.selectionStart!, input.selectionEnd!),
      ),
    ).toBe('#workshop-info')
    const sizes: Record<string, number> = { shortcut: shortcutSize.height }
    for (const [key, control] of Object.entries({ name, apply, copy, manual })) {
      const bounds = (await control.boundingBox())!
      sizes[key] = bounds.height
    }
    for (const [key, height] of Object.entries(sizes))
      expect(height, key).toBeGreaterThanOrEqual(44)
    const overflow = await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBe(0)
    await testInfo.attach('anchor-touch-controls', {
      body: JSON.stringify({ viewport: page.viewportSize(), sizes, overflow }),
      contentType: 'application/json',
    })
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('anchor-editing-mobile.png'),
        animations: 'disabled',
      })
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toContain(
      '"id":"workshop-info"',
    )
    await page.reload()
    await expect(canvas(page).locator('#workshop-info')).toHaveAttribute(
      'data-sigil-id',
      'activity-info',
    )
  })

  test('手機連結目的地可從畫布編輯聯絡電話，重開及離線 HTML 保留可撥號的網址', async ({
    page,
    browser,
  }, testInfo) => {
    await page.goto('/activity/')
    const initial = canvas(page).getByRole('link', { name: '查看活動資訊', exact: true })
    const toolbar = page.getByRole('toolbar', { name: '元件操作' })
    const edit = toolbar.getByRole('button', { name: '編輯連結', exact: true })
    async function openLinkSettings(): Promise<void> {
      await initial.scrollIntoViewIfNeeded()
      const box = (await initial.boundingBox())!
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await edit.tap()
    }
    await openLinkSettings()
    const drawer = page.locator('[data-compact-panel="settings"]')
    const kind = drawer.getByRole('combobox', { name: '連結類型', exact: true })
    await expect(kind).toBeFocused()
    await expect(kind.locator('option:checked')).toHaveText('網址或頁內區段')
    await drawer.getByRole('button', { name: '在畫布定位區段', exact: true }).tap()
    await expect(drawer).toHaveAttribute('data-open', 'false')
    const info = canvas(page).locator('#event-info')
    await expect(info).toHaveAttribute('data-sigil-selected', '1')
    await expect(info).toBeInViewport()
    await expect(toolbar).toBeFocused()
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
    await openLinkSettings()
    await expect(kind).toBeFocused()
    const newTab = drawer.locator('.sigil-link-new-tab')
    const newTabBounds = (await newTab.boundingBox())!
    expect(Math.min(newTabBounds.height, newTabBounds.width)).toBeGreaterThanOrEqual(44)
    await newTab.tap()
    await expect(initial).toHaveAttribute('target', '_blank')
    const contactLabel = '聯絡工作坊'
    await drawer.getByRole('textbox', { name: '內容', exact: true }).fill(contactLabel)
    const link = canvas(page).getByRole('link', { name: contactLabel, exact: true })
    await kind.selectOption({ label: '電子郵件' })
    await expect(newTab).toBeHidden()
    const email = drawer.getByRole('textbox', { name: '電子郵件地址', exact: true })
    const apply = drawer.getByRole('button', { name: '套用', exact: true })
    await email.fill('workshop@example.test')
    await apply.tap()
    await expect(link).toHaveAttribute('href', 'mailto:workshop@example.test')
    await expect(link).not.toHaveAttribute('target', '_blank')
    await kind.selectOption({ label: '電話' })
    await expect(newTab).toBeHidden()
    const phone = drawer.getByRole('textbox', { name: '電話號碼', exact: true })
    await phone.fill('分機')
    await apply.tap()
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(
      drawer.getByRole('status').filter({ hasText: '請輸入有效的電話號碼' }),
    ).toBeVisible()
    await expect(link).toHaveAttribute('href', 'mailto:workshop@example.test')
    await phone.fill('+886 (2) 2345-6789')
    await apply.tap()
    const telephone = 'tel:+886223456789'
    await expect(link).toHaveAttribute('href', telephone)
    const overflow = await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBe(0)
    const sizes: Record<string, { width: number; height: number }> = {
      newTab: { width: newTabBounds.width, height: newTabBounds.height },
    }
    const controls = { kind, phone, apply }
    for (const [name, control] of Object.entries(controls)) {
      const { width, height } = (await control.boundingBox())!
      sizes[name] = { width, height }
      expect(Math.min(height, width), name).toBeGreaterThanOrEqual(44)
    }
    await testInfo.attach('link-controls', {
      body: JSON.stringify({ viewport: page.viewportSize(), overflow, sizes }),
      contentType: 'application/json',
    })
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('link-destinations-mobile.png'),
        animations: 'disabled',
      })
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await expect(edit).toBeFocused()
    await page.getByRole('button', { name: '存檔', exact: true }).tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.reload()
    await expect(link).toHaveAttribute('href', telephone)
    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    const file = testInfo.outputPath('activity-contact.html')
    await downloadLinkPage(page, file)
    const reader = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
    try {
      await reader.route(/^https?:/, (route) => route.abort())
      const exported = await reader.newPage()
      await exported.goto(pathToFileURL(file).href)
      const exportedLink = exported.getByRole('link', { name: contactLabel, exact: true })
      await expect(exportedLink).toHaveAttribute('href', telephone)
      await expect(exportedLink).not.toHaveAttribute('target', '_blank')
    } finally {
      await reader.close()
    }
  })

  test('手機點選原圖設定活動圖片構圖，重開草稿與離線 HTML 保留裝置差異', async ({
    page,
    browser,
  }, testInfo) => {
    await page.goto('/activity/')
    const photo = canvas(page).locator('img[data-sigil-id="activity-image"]')
    await expect(photo).toHaveJSProperty('naturalWidth', 1200)
    const src = await photo.getAttribute('src')
    await page.touchscreen.tap(...(await coverCenter(page)))
    const framingAction = page
      .getByRole('toolbar', { name: '元件操作' })
      .getByRole('button', { name: '調整圖片構圖', exact: true })
    await framingAction.tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    await expect(drawer.getByRole('group', { name: '圖片構圖', exact: true })).toBeFocused()
    const ratio = drawer.getByRole('combobox', { name: '裁切比例', exact: true })
    await ratio.selectOption('3 / 4')
    await expect(photo).toHaveCSS('aspect-ratio', '3 / 4')
    const surface = drawer.locator('.sigil-framing-surface')
    await surface.scrollIntoViewIfNeeded()
    const box = (await surface.boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    const tapX = box.x + box.width * 0.25
    const tapY = box.y + box.height * 0.7
    await expect
      .poll(() =>
        surface.evaluate((el, point) => el.contains(el.ownerDocument.elementFromPoint(...point)), [
          tapX,
          tapY,
        ] as const),
      )
      .toBe(true)
    await page.touchscreen.tap(tapX, tapY)
    const x = Number(
      await drawer.getByRole('spinbutton', { name: '水平焦點 (%)', exact: true }).inputValue(),
    )
    const y = Number(
      await drawer.getByRole('spinbutton', { name: '垂直焦點 (%)', exact: true }).inputValue(),
    )
    expect(Math.abs(x - 25)).toBeLessThanOrEqual(1)
    expect(Math.abs(y - 70)).toBeLessThanOrEqual(1)
    const position = x + '% ' + y + '%'
    await expect(photo).toHaveCSS('object-position', position)
    await expect(drawer.getByRole('button', { name: '沿用上層焦點', exact: true })).toBeEnabled()
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('image-framing-mobile.png'),
        animations: 'disabled',
      })

    await drawer.getByRole('button', { name: '沿用上層焦點', exact: true }).tap()
    await expect(photo).toHaveCSS('object-position', '50% 50%')
    await expect(photo).toHaveCSS('aspect-ratio', '3 / 4')
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await expect(framingAction).toBeFocused()
    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    await page.getByRole('button', { name: '復原', exact: true }).tap()
    await expect(photo).toHaveCSS('object-position', position)
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await page.reload()
    await page.getByRole('button', { name: '預覽', exact: true }).tap()
    await expect(photo).toHaveCSS('object-position', position)
    await expect(photo).toHaveCSS('aspect-ratio', '3 / 4')
    await expect(photo).toHaveAttribute('src', src!)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload()
    await expect(photo).toHaveCSS('aspect-ratio', '4 / 3')
    await expect(photo).toHaveCSS('object-position', '50% 50%')
    await expect(save).toBeDisabled()

    await page.getByRole('button', { name: '匯出', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: '下載 .html', exact: true }).click()
    const file = testInfo.outputPath('activity-framing.html')
    await (await downloading).saveAs(file)
    const reader = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 900 },
    })
    try {
      await reader.route(/^https?:/, (route) => route.abort())
      const exported = await reader.newPage()
      await exported.goto(pathToFileURL(file).href)
      const exportedPhoto = exported.locator('img')
      await expect(exportedPhoto).toHaveAttribute('src', /^data:image\/webp;base64,/)
      await expect(exportedPhoto).toHaveCSS('aspect-ratio', '4 / 3')
      await expect(exportedPhoto).toHaveCSS('object-position', '50% 50%')
      await exported.setViewportSize({ width: 375, height: 812 })
      await expect(exportedPhoto).toHaveCSS('aspect-ratio', '3 / 4')
      await expect(exportedPhoto).toHaveCSS('object-position', position)
      const frame = (await exportedPhoto.boundingBox())!
      expect(frame.width / frame.height).toBeCloseTo(0.75, 2)
      if (testInfo.project.name === 'chromium')
        await exported.screenshot({ path: testInfo.outputPath('image-framing-mobile-export.png') })
    } finally {
      await reader.close()
    }
  })

  test('手機標題大綱可觸控跳到章節設定，返回保留篩選與焦點', async ({ page }, testInfo) => {
    const errors = await prepareDemo(page)
    await page.goto('/activity/')
    const opener = page.getByRole('button', { name: '圖層／設定', exact: true })
    const drawer = page.locator('[data-compact-panel="settings"]')
    const layers = drawer.getByRole('button', { name: '圖層', exact: true })
    const headings = drawer.getByRole('button', { name: '標題大綱', exact: true })
    const outline = drawer.locator('.sigil-heading-outline')
    const filter = outline.getByRole('searchbox', { name: '搜尋標題', exact: true })
    const title = '需要自備工具嗎？'
    const result = outline.getByRole('button', { name: 'H3 ' + title, exact: true })
    const target = canvas(page).getByRole('heading', { level: 3, name: title, exact: true })
    await opener.tap()
    await headings.tap()
    await expect(headings).toHaveAttribute('aria-pressed', 'true')
    await expect(result).toBeInViewport({ ratio: 1 })
    for (const control of [headings, filter, result]) {
      const box = (await control.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('heading-outline-mobile.png'),
        animations: 'disabled',
      })
    await filter.fill('工具')
    await expect(outline.locator('[data-heading-id]')).toHaveCount(1)
    await result.tap()
    await expect(drawer.getByRole('tab', { name: '內容', exact: true })).toBeFocused()
    const content = drawer.getByRole('textbox', { name: '內容', exact: true })
    await expect(content).toHaveValue(title)
    await layers.tap()
    await expect(filter).toHaveValue('工具')
    await expect(result).toBeFocused()
    await expect(result).toHaveAttribute('aria-current', 'true')
    const close = drawer.getByRole('button', { name: '關閉面板', exact: true })
    await close.tap()
    await expect(target).toBeInViewport()
    await expect(target).toHaveAttribute('data-sigil-selected', '1')
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeDisabled()
    await opener.tap()
    await result.tap()
    await content.fill('工作室提供材料嗎？')
    await layers.tap()
    await expect(filter).toHaveValue('工具')
    await expect(filter).toBeFocused()
    await expect(outline.locator('[data-heading-id]')).toHaveCount(0)
    await filter.fill('材料')
    await expect(
      outline.getByRole('button', { name: 'H3 工作室提供材料嗎？', exact: true }),
    ).toHaveAttribute('aria-current', 'true')
    expect(errors).toEqual([])
  })

  test('手機圖層搜尋可辨識長文字並從抽屜找到畫布元件', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    const open = page.getByRole('button', { name: '圖層／設定', exact: true })
    const drawer = page.locator('[data-compact-panel="settings"]')
    const close = drawer.getByRole('button', { name: '關閉面板', exact: true })
    await open.tap()
    await (await activityLayer(page, ['活動頁', '常見問題'], '工具說明')).tap()
    const text = '可用工具：' + 'WorkshopPrintmaking'.repeat(12) + '，現場提供油墨滾筒。'
    await drawer.getByRole('textbox', { name: '內容', exact: true }).fill(text)
    await close.tap()
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    const draft = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
    expect(draft).toBeTruthy()
    await page.reload()
    await open.tap()
    const search = drawer.getByRole('searchbox', { name: '搜尋圖層', exact: true })
    const tabs = drawer.getByRole('tablist')
    await expect(tabs).toBeHidden()
    await search.tap()
    await search.fill('活動')
    await expect(tabs).toBeHidden()
    await expect(drawer.getByRole('button', { name: /^活動標題/ })).toBeVisible()
    const firstName = drawer
      .getByRole('button', { name: /^活動頁/ })
      .locator('.sigil-layer-search-name mark')
    await expect(firstName).toHaveText('活動')
    await expect.poll(() => highlightedTextIsVisible(firstName)).toBe(true)
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('layer-search-mobile.png'),
        animations: 'disabled',
      })
    await search.fill('藍色與橙色')
    await expect(drawer.getByRole('button', { name: /活動圖片/ })).toBeVisible()
    await drawer.getByRole('button', { name: '清除搜尋', exact: true }).tap()
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
    await expect(tabs).toBeHidden()
    await expect(drawer).toHaveAttribute('data-open', 'true')
    await search.fill('油墨滾筒')
    const result = drawer.getByRole('button', { name: /工具說明/ })
    const highlight = result.locator('.sigil-layer-search-excerpt mark')
    await expect(highlight).toHaveText('油墨滾筒')
    await expect(tabs).toBeHidden()
    await expect(result).toContainText('常見問題')
    await expect(result).toBeInViewport({ ratio: 1 })
    await expect.poll(() => highlightedTextIsVisible(highlight)).toBe(true)
    const bounds = (await result.boundingBox())!
    expect(Math.min(bounds.height, bounds.width)).toBeGreaterThanOrEqual(44)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375)
    expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    if (testInfo.project.name === 'chromium')
      await page.screenshot({
        path: testInfo.outputPath('layer-search-mobile-detail.png'),
        animations: 'disabled',
      })

    await result.tap()
    await expect(tabs).toBeVisible()
    await expect(drawer.getByRole('tab', { name: '內容', exact: true })).toBeFocused()
    await expect(drawer.getByRole('textbox', { name: '內容', exact: true })).toHaveValue(text)
    await drawer.getByRole('button', { name: '圖層', exact: true }).tap()
    await expect(search).toHaveValue('油墨滾筒')
    await expect(result).toBeFocused()
    await expect(highlight).toHaveText('油墨滾筒')
    await drawer.getByRole('button', { name: '清除搜尋', exact: true }).tap()
    await expect(drawer.getByRole('treeitem', { name: '工具說明', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await close.tap()
    await expect(drawer).toHaveAttribute('data-open', 'false')
    const target = canvas(page).getByText(text, { exact: true })
    await expect(target).toHaveAttribute('data-sigil-selected', '1')
    await expect(target).toBeInViewport()
    await expect(save).toBeDisabled()
    expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(draft)
  })

  test('手機圖層搜尋在編輯後更新結果，原元件不再符合時返回搜尋欄', async ({ page }) => {
    await page.goto('/activity/')
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    const search = drawer.getByRole('searchbox', { name: '搜尋圖層', exact: true })
    await search.fill('親手完成一張')
    const result = drawer.getByRole('button', { name: /^活動說明/ })
    await result.press('Enter')
    const content = drawer.getByRole('textbox', { name: '內容', exact: true })
    await expect(content).toHaveValue(/親手完成一張/)
    const revised = '歡迎一起體驗版畫工作坊。'
    await content.fill(revised)
    await drawer.getByRole('button', { name: '圖層', exact: true }).tap()
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('親手完成一張')
    await expect(drawer.getByText('找不到符合的圖層', { exact: true })).toBeVisible()
    await expect(result).toHaveCount(0)
    await search.fill('版畫工作坊')
    await result.tap()
    await expect(content).toHaveValue(revised)
    await expect(canvas(page).getByText(revised, { exact: true })).toHaveAttribute(
      'data-sigil-selected',
      '1',
    )
  })

  test('折疊式 FAQ 在手機預覽可觸控展開與收合', async ({ page }, testInfo) => {
    await page.goto('/activity/')
    await page.getByRole('button', { name: '區塊', exact: true }).tap()
    const drawer = page.locator('[data-compact-panel="blocks"]')
    await drawer.getByRole('searchbox', { name: '搜尋區塊' }).fill('FAQ')
    await drawer.getByRole('button', { name: '插入 折疊式 FAQ', exact: true }).tap()
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(save).toBeDisabled()
    await page.getByRole('button', { name: '預覽', exact: true }).tap()
    const row = canvas(page).locator('details').first()
    const question = row.locator('summary')
    await expect(question).toHaveText('需要自備工具嗎？')
    await expect(row).toHaveJSProperty('open', false)
    const bounds = await question.boundingBox()
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    await question.tap()
    await expect(row).toHaveJSProperty('open', true)
    await canvas(page).locator('[data-faq-accordion]').scrollIntoViewIfNeeded()
    await expect(row.getByText('活動現場會提供所需工具與材料。')).toBeInViewport()
    expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)
    if (testInfo.project.name === 'chromium') {
      await page.screenshot({ path: testInfo.outputPath('faq-mobile-preview.png') })
    }
    await question.tap()
    await expect(row).toHaveJSProperty('open', false)
    await page.getByRole('button', { name: '編輯', exact: true }).tap()
    await expect(save).toBeDisabled()
  })

  test('手機抽屜複製樣式，保存後只在手機版套用', async ({ page }) => {
    await page.goto('/activity/')
    const source = canvas(page).locator('[data-sigil-id="activity-hero"]')
    const target = canvas(page).locator('[data-sigil-id="activity-info"]')
    const originalBackground = await target.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    )
    const sourceBackground = await source.evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(originalBackground).not.toBe(sourceBackground)
    await page.getByRole('button', { name: '圖層／設定', exact: true }).tap()
    const drawer = page.locator('[data-compact-panel="settings"]')
    await (await activityLayer(page, ['活動頁'], '主視覺')).tap()
    await drawer.getByRole('tab', { name: '樣式', exact: true }).tap()
    await drawer.getByRole('button', { name: '複製樣式', exact: true }).tap()
    await drawer.getByRole('button', { name: '圖層', exact: true }).tap()
    await (await activityLayer(page, ['活動頁'], '活動資訊')).tap()
    await drawer.getByRole('button', { name: '套用樣式', exact: true }).tap()
    await drawer.getByRole('button', { name: '關閉面板', exact: true }).tap()
    await expect(target).toHaveCSS('background-color', sourceBackground)
    await expect(target).toHaveCSS('padding', '24px')
    await expect(target.getByRole('heading', { name: '活動資訊', exact: true })).toBeVisible()
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    await expect(save).toBeDisabled()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload()
    await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'desktop')
    await expect(target).toHaveCSS('background-color', originalBackground)
    await page.getByRole('button', { name: '手機', exact: true }).tap()
    await expect(target).toHaveCSS('background-color', sourceBackground)
    await expect(target).toHaveCSS('padding', '24px')
  })

  test('在手機畫布指定位置新增區塊，選取後回到畫布', async ({ page }) => {
    await page.goto('/activity/')
    await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
    const heading = canvas(page).getByRole('heading', { name: '秋日設計工作坊' })
    await expect(heading).toBeInViewport()
    const headingBox = (await heading.boundingBox())!
    await page.touchscreen.tap(
      headingBox.x + headingBox.width / 2,
      headingBox.y + headingBox.height / 2,
    )
    const insertAfter = insertAfterSelection(page)
    await expect(insertAfter).toBeInViewport({ ratio: 1 })
    const bounds = (await insertAfter.boundingBox())!
    expect(Math.min(bounds.width, bounds.height)).toBeGreaterThanOrEqual(44)
    await insertAfter.tap()
    const drawer = page.locator('[data-compact-panel="blocks"]')
    await expect(drawer).toHaveAttribute('data-open', 'true')
    await expect(drawer.getByText(/活動標題/)).toBeVisible()
    await drawer.getByRole('button', { name: '插入 按鈕', exact: true }).tap()
    await expect(drawer).toHaveAttribute('data-open', 'false')
    const inserted = canvas(page).locator(
      '[data-sigil-id="activity-title"] + [data-sigil-selected]',
    )
    await expect(inserted).toHaveText('按鈕')
    await expect(inserted).toBeInViewport()
    await expect(page.getByRole('button', { name: '存檔', exact: true })).toBeEnabled()
  })

  test('直接開啟活動頁並從手機畫布編輯標題', async ({ page }) => {
    await page.goto('/activity/')
    await expect(page.locator('.sigil-app')).toHaveAttribute('data-layout', 'compact')
    await expect(canvas(page).locator('[data-sigil-id="activity-root"]')).toHaveCSS(
      'padding',
      '12px',
    )
    const heading = canvas(page).getByRole('heading', { name: '秋日設計工作坊' })
    await expect(heading).toBeInViewport()
    const box = (await heading.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await page.getByRole('button', { name: '編輯 活動標題', exact: true }).tap()
    const settings = page.locator('[data-compact-panel="settings"]')
    await expect(settings.getByRole('textbox', { name: '內容', exact: true })).toBeFocused()
    expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBe(375)
  })

  test('手機輕點照片更換，損毀檔案保留畫布照片與已存草稿', async ({ page }) => {
    await page.goto('/activity/')
    const photo = canvas(page).getByRole('img')
    await expect(photo).toHaveJSProperty('naturalWidth', 1200)
    await page.touchscreen.tap(...(await coverCenter(page)))
    const replace = page
      .getByRole('toolbar', { name: '元件操作' })
      .getByRole('button', { name: '更換圖片', exact: true })
    await expect(replace).toBeInViewport({ ratio: 1 })
    await replace.tap()
    await choosePhotoFile(page, photoFile)
    await expect(photo).toHaveJSProperty('naturalWidth', 3)
    const savedURL = (await photo.getAttribute('src'))!
    const save = page.getByRole('button', { name: '存檔', exact: true })
    await save.tap()
    await expect(page.locator('.sigil-status').getByRole('status')).toHaveText(
      '活動頁已儲存到此瀏覽器。',
    )
    const saved = await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))
    expect(saved).toBeTruthy()
    await replace.tap()
    const media = page.getByRole('dialog')
    await choosePhotoFile(page, {
      name: '損毀.png',
      mimeType: 'image/png',
      buffer: photoFile.buffer.subarray(0, 12),
    })
    await expect(media.getByRole('status').filter({ hasText: '無法讀取這張照片' })).toBeVisible()
    await expect(photo).toHaveAttribute('src', savedURL)
    await media.getByRole('button', { name: '關閉', exact: true }).tap()
    await expect(save).toBeDisabled()
    expect(await page.evaluate(() => localStorage.getItem('sigil-demo-activity-v1'))).toBe(saved)
    await page.reload()
    await expect(photo).toHaveAttribute('src', savedURL)
    await expect(photo).toHaveJSProperty('naturalWidth', 3)

    await page.getByRole('button', { name: '更多工具', exact: true }).tap()
    await page.getByRole('button', { name: '匯出', exact: true }).tap()
    const dialog = page.getByRole('dialog', { name: '匯出 HTML' })
    for (const control of [
      ...(await dialog.getByRole('button').all()),
      ...(await dialog.locator('summary').all()),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 })
      const bounds = (await control.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '下載 .html', exact: true }).tap()
    expect((await downloading).suggestedFilename()).toBe('sigil-page.html')
  })
})
