import { createApp } from '@cluion/sigil-app'
import { basicBlockDefs, blockImage, marketingBlockDefs } from '@cluion/sigil-blocks'
import { findNode, type ProjectStore, type SigilDoc } from '@cluion/sigil-core'
import {
  activityTemplateTitle,
  createActivityDocument,
} from '../../examples/laravel/resources/js/activity-template'
import { addPhoto, listPhotos, PhotoError } from './local-photos'
import { decodeDraft, encodeDraft } from './photo-draft'
import { createActivityDownload } from '../../examples/laravel/resources/js/activity-download'
import '../../examples/laravel/resources/css/editor.css'

const key = 'sigil-demo-activity-v1'
const coverUrl = new URL('../../examples/laravel/public/workshop-printmaking.webp', import.meta.url)
  .href
const feedback = document.querySelector<HTMLElement>('.host-feedback')!
const status = document.getElementById('page-status')!
const workspaceTitle = document.getElementById('workspace-title')!
let savedJSON: string | null = null
let storageWarning = ''

class DraftError extends Error {}

const store = {
  async load() {
    try {
      savedJSON = localStorage.getItem(key)
    } catch {
      storageWarning = '此瀏覽器無法讀取本機草稿。仍可試作及匯出 HTML，本次修改無法存檔。'
      return null
    }
    if (savedJSON === null) return null
    try {
      return await decodeDraft(savedJSON)
    } catch (error) {
      storageWarning =
        error instanceof PhotoError
          ? `${error.message} 已開啟範例，原草稿會保留，本次修改無法存檔。`
          : '原草稿格式無法開啟，已保留原資料。你可以編輯範例並匯出 HTML，本次修改無法存檔。'
      return null
    }
  },
  async save(doc) {
    if (storageWarning) throw new DraftError(storageWarning)
    let next: string
    try {
      next = await encodeDraft(doc)
    } catch (error) {
      if (error instanceof PhotoError) throw error
      throw new DraftError(
        '這份草稿的格式或大小超出活動頁範例可儲存的範圍。請調整內容或匯出 HTML。',
      )
    }
    function commit(): void {
      if (localStorage.getItem(key) !== savedJSON) {
        throw new DraftError('本機草稿已變更，請先匯出目前的修改，再重新載入草稿。')
      }
      localStorage.setItem(key, next)
      savedJSON = next
    }
    if (navigator.locks) await navigator.locks.request(key, commit)
    else commit()
  },
} satisfies ProjectStore

function activityTitle(doc: SigilDoc): string {
  return (
    findNode(doc.root, 'activity-title')?.content?.trim() ||
    doc.meta?.title ||
    activityTemplateTitle
  )
}

function reportError(message: string): void {
  status.textContent = message
  feedback.hidden = false
}

async function openActivity(): Promise<void> {
  const doc = (await store.load()) ?? createActivityDocument(activityTemplateTitle, coverUrl)
  if (storageWarning) {
    reportError(storageWarning)
    document.getElementById('storage-guide')!.hidden = true
  }
  const app = createApp({
    mount: '#sigil-root',
    doc,
    store,
    assets: {
      async list() {
        const cover = { id: 'workshop-cover', url: coverUrl, name: '工作坊版畫照片' }
        try {
          return [cover, ...(await listPhotos())]
        } catch {
          reportError(storageWarning || '本機照片庫無法讀取，目前可選用範例照片。')
          return [cover]
        }
      },
      upload: addPhoto,
      uploadAccept: 'image/png,image/jpeg,image/webp',
      describeUploadError(error) {
        return error instanceof PhotoError
          ? { message: error.message, retryable: error.retryable }
          : { message: '未能把照片加入此瀏覽器。請確認本機儲存空間可用後再試。', retryable: true }
      },
    },
    blocks: [
      ...basicBlockDefs.map((block) =>
        block.id === 'image' ? { ...block, create: () => blockImage(coverUrl) } : block,
      ),
      ...marketingBlockDefs,
    ],
    messages: {
      zh: {
        'app.saved_msg': '活動頁已儲存到此瀏覽器。',
        'app.export_hint':
          '下載的 HTML 會內嵌工作坊封面與自選照片，可離線開啟。其他圖片保留原網址。',
        'app.export_fail':
          '封面未能嵌入。請確認可連到此網站，且要嵌入的圖片每張最多 4 MiB、全頁合計最多 16 MiB，再重試或依原網址下載。',
        'app.download_original_started':
          '已開始依原網址下載。使用相對網址的圖片須將 HTML 放回原網站的對應位置才能顯示。',
        'media.upload': '加入裝置照片',
        'media.uploading': '正在加入照片…',
        'media.retry_upload': '再試一次',
      },
      en: {
        'app.export_hint':
          'Downloaded HTML embeds the workshop cover and your device photos for offline use. Other images keep their original URLs.',
        'app.export_fail':
          'The workshop cover could not be embedded. Check your connection and retry, or download using its original URL. Embedding supports up to 4 MiB per image and 16 MiB per page.',
        'app.download_original_started':
          'Download started with original URLs. Images with relative URLs need the HTML at the corresponding location on the original website.',
      },
    },
    getExportTitle: activityTitle,
    prepareDownload: createActivityDownload({ origin: location.origin, coverUrl }),
    hooks: {
      afterSave(saved) {
        feedback.hidden = true
        showTitle(saved)
      },
      onSaveError(error) {
        reportError(
          error instanceof DraftError || error instanceof PhotoError
            ? error.message
            : '未能儲存草稿。請確認瀏覽器允許網站儲存資料，並有足夠空間。',
        )
      },
    },
  })

  function showTitle(documentSnapshot: SigilDoc): void {
    const title = activityTitle(documentSnapshot)
    workspaceTitle.textContent = title
    workspaceTitle.title = title
    document.title = `${title} — Sigil`
    app.setDocumentTitle(title)
  }

  showTitle(doc)
}

document.getElementById('reload-page')!.addEventListener('click', () => location.reload())
void openActivity().catch(() => {
  reportError('無法開啟活動頁。請重新載入後再試。')
})
