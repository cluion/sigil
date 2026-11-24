import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlockDefs, blockImage, marketingBlockDefs } from '@cluion/sigil-blocks'
import { findNode, type SigilDoc } from '@cluion/sigil-core'
import { activityTemplateTitle, createActivityDocument } from './activity-template'
import { createActivityDownload } from './activity-download'
import { createHttpAssetStore } from './http-asset-store'
import { createHttpProjectStore, HttpError } from './http-project-store'
import '../css/editor.css'

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing editor element: ${id}`)
  return element as T
}

const mount = required('sigil-root')
const pageKey = mount.dataset.pageKey!
const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')!.content
const status = required('page-status')
const createPanel = required('create-panel')
const editorGuide = required('editor-guide')
const workspaceTitle = required('workspace-title')
const pageOptions = required<HTMLDetailsElement>('page-options')
const createTitle = required<HTMLInputElement>('activity-name')
createTitle.defaultValue = activityTemplateTitle
const createButton = required<HTMLButtonElement>('create-page')
const reloadButton = required<HTMLButtonElement>('reload-page')
const backupButton = required<HTMLButtonElement>('backup-page')
const signIn = required('sign-in-again')
const store = createHttpProjectStore({ pageKey, csrfToken })
const assets = createHttpAssetStore({ csrfToken })
let app: SigilApp | undefined
let busy = false
let reloadRequired = false

function report(message: string, error = false, quiet = false): void {
  status.textContent = message
  status.dataset.error = String(error)
  status.dataset.quiet = String(quiet)
}

function reportError(error: unknown, operation: 'load' | 'create' | 'save'): void {
  signIn.hidden = true
  if (operation !== 'create' || (error instanceof HttpError && error.status === 409)) {
    pageOptions.open = true
  }
  if (error instanceof HttpError) {
    if (error.status === 409) {
      report(
        operation === 'create'
          ? '此頁已在另一個視窗建立。請按「重新載入」開啟已儲存的活動頁。'
          : '另一個視窗已更新此頁。你的修改仍保留在這裡；請先下載內容備份，再重新載入最新版本。',
        true,
      )
      return
    }
    if (error.status === 401 || error.status === 419) {
      report(app ? '登入已失效。請先下載內容備份，再重新登入。' : '請重新登入後再繼續。', true)
      signIn.hidden = false
      return
    }
    if (error.status === 422 || error.status === 413) {
      report(
        app
          ? '內容超出允許的格式或大小，尚未儲存。請下載備份並檢查內容，或請管理員協助。'
          : '無法建立這個範本，請聯絡管理員。',
        true,
      )
      return
    }
  }
  if (operation === 'load' || reloadRequired) {
    report(
      app
        ? '無法讀取頁面，現有內容仍保留。請先下載備份，再按「重新載入」取回最新版本。'
        : '無法讀取頁面。請檢查連線，再按「重新載入」。',
      true,
    )
    return
  }
  report(
    operation === 'create'
      ? '尚未確認活動頁已建立。請檢查連線，再按「建立活動頁」。'
      : '儲存失敗，修改仍保留。請檢查連線後再按「存檔」。',
    true,
  )
}

function setBusy(value: boolean): void {
  busy = value
  createTitle.disabled = value
  createButton.disabled = value
  reloadButton.disabled = value
  backupButton.disabled = !app
  backupButton.hidden = !app
  editorGuide.hidden = !app
}

function activityTitle(doc: SigilDoc): string {
  return findNode(doc.root, 'activity-title')?.content?.trim() || doc.meta?.title?.trim() || pageKey
}

function showTitle(title: string): void {
  workspaceTitle.textContent = title
  workspaceTitle.title = title
  document.title = `${title} — Sigil`
  app?.setDocumentTitle(title)
}

function createPageNavigation(): HTMLElement {
  const template = required<HTMLTemplateElement>('activity-switcher')
  const element = template.content.firstElementChild!.cloneNode(true) as HTMLDetailsElement
  const list = element.querySelector('ul')!
  const message = element.querySelector('p')!
  const directory = element.querySelector('a')!
  let request: AbortController | undefined
  element.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) guardNavigation(event)
  })
  element.addEventListener('toggle', async () => {
    request?.abort()
    if (!element.open) return
    const controller = new AbortController()
    request = controller
    list.replaceChildren()
    message.textContent = '正在讀取最近活動…'
    try {
      const response = await fetch(directory.href, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Activity list unavailable')
      const payload: unknown = await response.json()
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('pages' in payload) ||
        !Array.isArray(payload.pages)
      ) {
        throw new Error('Invalid activity list')
      }
      const items = document.createDocumentFragment()
      for (const entry of payload.pages) {
        if (
          !entry ||
          typeof entry.key !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(entry.key) ||
          typeof entry.title !== 'string'
        ) {
          throw new Error('Invalid activity summary')
        }
        const item = document.createElement('li')
        if (entry.key === pageKey) {
          item.setAttribute('aria-current', 'page')
          item.textContent = entry.title
        } else {
          const link = document.createElement('a')
          link.href = `/editor/${encodeURIComponent(entry.key)}`
          link.textContent = entry.title
          item.append(link)
        }
        items.append(item)
      }
      if (controller.signal.aborted || !element.isConnected) return
      list.replaceChildren(items)
      message.textContent = list.childElementCount ? '' : '尚未儲存活動頁。'
    } catch {
      if (!controller.signal.aborted && element.isConnected)
        message.textContent = '無法讀取最近活動，可開啟「所有活動頁」。'
    }
  })
  return element
}

function mountDocument(doc: SigilDoc): void {
  app?.destroy()
  app = createApp({
    mount,
    doc,
    store,
    assets,
    locale: 'zh',
    renderPageNavigation: createPageNavigation,
    messages: {
      zh: {
        'app.saved_msg': '',
        'app.export_hint':
          '下載的 HTML 會內嵌工作坊封面和媒體庫圖片，可離線開啟。其他圖片與複製的 HTML 片段保留原網址。',
        'app.export_fail':
          '圖片未能嵌入。請確認圖片可開啟，每張最多 4 MiB、整頁合計最多 16 MiB，再重試或依原網址下載。',
        'app.download_original_started':
          '已開始依原網址下載。使用相對網址的圖片須將 HTML 放回原網站的對應位置才能顯示。',
        'media.empty':
          '還沒有圖片。請上傳可公開的 PNG、JPEG 或 WebP，每張最多 4 MiB、長寬各最多 4096 px。',
        'media.upload_failed':
          '圖片未上傳。可重新選擇符合格式與尺寸的圖片，或確認連線後重試。支援 PNG、JPEG、WebP，每張最多 4 MiB、長寬各最多 4096 px。',
      },
      en: {
        'app.export_hint':
          'Downloaded HTML embeds the workshop cover and media library images for offline use. Other images and copied HTML fragments keep their original URLs.',
        'app.export_fail':
          'Images could not be embedded. Check that they are available and fit the limits of 4 MiB per image and 16 MiB per page. Retry, or download using the original URLs.',
        'app.download_original_started':
          'Download started with original URLs. Images with relative URLs need the HTML at the corresponding location on the original website.',
      },
    },
    getExportTitle: activityTitle,
    prepareDownload: createActivityDownload({
      origin: location.origin,
      coverUrl: '/workshop-printmaking.webp',
      laravelMedia: true,
    }),
    blocks: [
      ...basicBlockDefs.map((block) =>
        block.id === 'image'
          ? {
              ...block,
              create: () => blockImage(new URL('/placeholder.svg', location.origin).href),
            }
          : block,
      ),
      ...marketingBlockDefs,
    ],
    hooks: {
      afterSave: (saved) => {
        showTitle(activityTitle(saved))
        if (app?.isDirty()) report('已儲存送出的內容；仍有新的修改待儲存。')
        else report('頁面已儲存。', false, true)
      },
      onSaveError: (error) => reportError(error, 'save'),
    },
  })
  showTitle(activityTitle(doc))
  pageOptions.open = false
  createPanel.hidden = true
  backupButton.disabled = false
}

async function loadPage(): Promise<void> {
  if (busy) return
  if (app?.isSaving()) {
    report('正在儲存，請完成後再重新載入。')
    return
  }
  if (app?.isDirty() && !confirm('重新載入會放棄目前尚未儲存的修改。確定已備份並繼續？')) return
  setBusy(true)
  signIn.hidden = true
  createPanel.hidden = true
  report('正在讀取頁面…')
  // Keep the current instance available for backup if the request fails.
  mount.inert = true
  try {
    const doc = await store.load()
    reloadRequired = false
    if (doc) {
      mountDocument(doc)
      report('已載入儲存的頁面。', false, true)
    } else {
      app?.destroy()
      app = undefined
      createPanel.hidden = false
      pageOptions.open = false
      showTitle('新增活動頁')
      report('此頁尚未建立。', false, true)
    }
  } catch (error) {
    reloadRequired = true
    reportError(error, 'load')
  } finally {
    mount.inert = false
    setBusy(false)
  }
}

required<HTMLFormElement>('create-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  const title = createTitle.value.trim()
  if (!title) {
    createTitle.value = ''
    createTitle.reportValidity()
    return
  }
  setBusy(true)
  report('正在建立活動頁…')
  try {
    const doc = createActivityDocument(title)
    // Only show a clean editor after the server acknowledges the initial document.
    await store.save(doc)
    mountDocument(doc)
    report('活動頁已建立並儲存，可以開始編輯。', false, true)
  } catch (error) {
    reportError(error, 'create')
  } finally {
    setBusy(false)
  }
})

backupButton.addEventListener('click', () => {
  if (!app) return
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(app.toJSON(), null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${pageKey}-backup.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  report('已下載目前內容備份；備份不會改變伺服器的儲存版本。')
})

reloadButton.addEventListener('click', () => void loadPage())
function preventPendingExit(event: Event): boolean {
  if (!busy && !app?.isSaving()) return false
  event.preventDefault()
  report('操作尚未完成，請稍後再離開此頁。')
  return true
}

function guardNavigation(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return
  preventPendingExit(event)
}
required<HTMLAnchorElement>('activity-directory').addEventListener('click', guardNavigation)

required<HTMLFormElement>('logout-form').addEventListener('submit', (event) => {
  if (preventPendingExit(event)) return
  if (app?.isDirty() && !confirm('登出會離開尚未儲存的修改。確定已備份並登出？')) {
    event.preventDefault()
    return
  }
  app?.destroy()
})

void loadPage()
