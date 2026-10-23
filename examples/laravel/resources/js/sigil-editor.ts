import { createApp, type SigilApp } from '@cluion/sigil-app'
import { basicBlockDefs, blockImage, marketingBlockDefs } from '@cluion/sigil-blocks'
import type { SigilDoc } from '@cluion/sigil-core'
import { createActivityDocument } from './activity-template'
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
const createButton = required<HTMLButtonElement>('create-page')
const reloadButton = required<HTMLButtonElement>('reload-page')
const backupButton = required<HTMLButtonElement>('backup-page')
const signIn = required('sign-in-again')
const store = createHttpProjectStore({ pageKey, csrfToken })
const assets = createHttpAssetStore({ csrfToken })
let app: SigilApp | undefined
let busy = false

function report(message: string, error = false): void {
  status.textContent = message
  status.dataset.error = String(error)
}

function reportError(error: unknown, operation: 'load' | 'save'): void {
  signIn.hidden = true
  if (error instanceof HttpError) {
    if (error.status === 409) {
      report(
        '另一個視窗已更新此頁。你的修改仍保留在這裡；請先下載內容備份，再重新載入最新版本。',
        true,
      )
      return
    }
    if (error.status === 401 || error.status === 419) {
      report('登入已失效。請先下載內容備份，再重新登入。', true)
      signIn.hidden = false
      return
    }
    if (error.status === 422 || error.status === 413) {
      report('內容超出允許的格式或大小，尚未儲存。請下載備份並檢查內容，或請管理員協助。', true)
      return
    }
  }
  report(
    operation === 'load'
      ? '無法讀取頁面，現有內容仍保留。請先下載備份，成功重新載入後才能再儲存。'
      : '儲存失敗，修改仍保留。請檢查連線後再按「儲存」。',
    true,
  )
}

function setBusy(value: boolean): void {
  busy = value
  createButton.disabled = value
  reloadButton.disabled = value
  backupButton.disabled = !app
}

function mountDocument(doc: SigilDoc): void {
  app?.destroy()
  app = createApp({
    mount,
    doc,
    store,
    assets,
    locale: 'zh',
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
      afterSave: () =>
        report(app?.isDirty() ? '已儲存送出的內容；仍有新的修改待儲存。' : '頁面已儲存。'),
      onSaveError: (error) => reportError(error, 'save'),
    },
  })
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
  report('正在讀取頁面…')
  // Keep the current instance available for backup if the request fails.
  mount.inert = true
  try {
    const doc = await store.load()
    if (doc) {
      mountDocument(doc)
      report('已載入儲存的頁面。')
    } else {
      app?.destroy()
      app = undefined
      createPanel.hidden = false
      report('此頁尚未建立。')
    }
  } catch (error) {
    reportError(error, 'load')
  } finally {
    mount.inert = false
    setBusy(false)
  }
}

createButton.addEventListener('click', async () => {
  if (busy) return
  setBusy(true)
  report('正在建立活動頁…')
  try {
    const doc = createActivityDocument()
    // Only show a clean editor after the server acknowledges the initial document.
    await store.save(doc)
    mountDocument(doc)
    report('活動頁已建立並儲存，可以開始編輯。')
  } catch (error) {
    reportError(error, 'save')
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
required<HTMLFormElement>('logout-form').addEventListener('submit', (event) => {
  if (busy || app?.isSaving()) {
    event.preventDefault()
    report('操作尚未完成，請稍後再登出。')
    return
  }
  if (app?.isDirty() && !confirm('登出會離開尚未儲存的修改。確定已備份並登出？')) {
    event.preventDefault()
    return
  }
  app?.destroy()
})

void loadPage()
