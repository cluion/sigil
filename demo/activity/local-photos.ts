import { createId, type AssetItem } from '@cluion/sigil-core'
import { isRecord } from '../../examples/laravel/resources/js/document-validation'

const MiB = 1024 * 1024
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp']
const invalidPhoto = '無法讀取這張照片。請重新選擇有效的 PNG、JPEG 或 WebP。'
const storageError = '無法使用本機照片庫。請確認瀏覽器允許網站儲存資料後再試。'

export class PhotoError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

interface Photo extends AssetItem {
  size: number
  name: string
  mimeType: string
}

function headerType(header: string): string | undefined {
  if (header.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png'
  if (header.startsWith('\xff\xd8\xff')) return 'image/jpeg'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'
}

function checkedPhotos(records: unknown[]): Photo[] {
  return records.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.mimeType !== 'string' ||
      !mimeTypes.includes(item.mimeType) ||
      typeof item.size !== 'number' ||
      !Number.isInteger(item.size) ||
      item.size <= 0 ||
      item.size > 2 * MiB ||
      typeof item.url !== 'string'
    )
      throw new PhotoError('本機照片資料無法讀取，原有資料已保留。')
    const prefix = `data:${item.mimeType};base64,`
    const encoded = item.url.slice(prefix.length)
    if (
      !item.url.startsWith(prefix) ||
      encoded.length !== Math.ceil(item.size / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    )
      throw new PhotoError('本機照片資料無法讀取，原有資料已保留。')
    const header = atob(encoded.slice(0, 16))
    if (headerType(header) !== item.mimeType)
      throw new PhotoError('本機照片資料無法讀取，原有資料已保留。')
    return { id: item.id, name: item.name, mimeType: item.mimeType, url: item.url, size: item.size }
  })
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sigil-workshop-photos', 2)
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains('photos')
        ? request.transaction!.objectStore('photos')
        : request.result.createObjectStore('photos', { keyPath: 'id' })
      if (!store.indexNames.contains('size')) store.createIndex('size', 'size')
    }
    request.onerror = () => reject(new PhotoError(storageError, true))
    let blocked = false
    request.onblocked = () => {
      blocked = true
      reject(new PhotoError('其他分頁正在使用本機照片庫。請關閉其他工作坊分頁後再試。', true))
    }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) db.close()
      else {
        db.onversionchange = () => db.close()
        resolve(db)
      }
    }
  })
}

function query<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withPhotos<T>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  let db: IDBDatabase | undefined
  try {
    db = await openLibrary()
    const transaction = db.transaction('photos', mode)
    const committed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    const [result] = await Promise.all([use(transaction.objectStore('photos')), committed])
    return result
  } catch (error) {
    if (error instanceof PhotoError) throw error
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      throw new PhotoError('瀏覽器的儲存空間不足，照片尚未加入。請釋出空間後再試。', true)
    throw new PhotoError(storageError, true)
  } finally {
    db?.close()
  }
}

function imageType(file: Uint8Array): string | undefined {
  const type = headerType(String.fromCharCode(...file.subarray(0, 12)))
  const matches = (offset: number, bytes: number[]) =>
    bytes.every((byte, i) => file[offset + i] === byte)
  if (
    type === 'image/png' &&
    matches(file.length - 12, [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
  )
    return 'image/png'
  if (type === 'image/jpeg' && matches(file.length - 2, [255, 217])) return 'image/jpeg'
  if (type === 'image/webp' && new DataView(file.buffer).getUint32(4, true) + 8 === file.length)
    return 'image/webp'
}

async function readPhoto(file: File): Promise<Photo> {
  if (file.size > 2 * MiB) throw new PhotoError('單張照片最多 2 MiB，請選擇較小的圖片。')
  if (file.type && !mimeTypes.includes(file.type))
    throw new PhotoError('請選擇 PNG、JPEG 或 WebP 圖片。')
  const mimeType = imageType(new Uint8Array(await file.arrayBuffer()))
  if (!mimeType || (file.type && file.type !== mimeType)) throw new PhotoError(invalidPhoto)
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reader.onabort = () => reject(new PhotoError(invalidPhoto))
    reader.readAsDataURL(file.slice(0, file.size, mimeType))
  })
  await verifyPixels(url)
  return { id: createId(), name: file.name, mimeType, size: file.size, url }
}

async function verifyPixels(url: string): Promise<void> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new PhotoError(invalidPhoto))
    image.src = url
  })
  if (image.naturalWidth > 4096 || image.naturalHeight > 4096)
    throw new PhotoError('照片的寬與高各最多 4096 像素，請縮小後再加入。')
  try {
    await image.decode()
  } catch {
    throw new PhotoError(invalidPhoto)
  }
}

export function listPhotos(): Promise<Photo[]> {
  return withPhotos('readonly', async (store) => checkedPhotos(await query(store.getAll())))
}

export async function photosById(ids: string[]): Promise<Photo[]> {
  const photos = await withPhotos('readonly', async (store) => {
    const rows = await Promise.all([...new Set(ids)].map((id) => query(store.get(id))))
    if (rows.includes(undefined)) throw new PhotoError('草稿參照的本機照片已不存在。')
    return checkedPhotos(rows)
  })
  for (const photo of photos) await verifyPixels(photo.url)
  return photos
}

export async function photosForUrls(urls: string[]): Promise<Photo[]> {
  const wanted = new Set(urls)
  const sizes = new Set<number>()
  for (const url of wanted) {
    const prefix = /^data:image\/(?:jpeg|png|webp);base64,/.exec(url)?.[0]
    if (!prefix) throw new PhotoError('請從素材庫加入裝置照片後再存檔。')
    const padding = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0
    const size = ((url.length - prefix.length) * 3) / 4 - padding
    if (!Number.isInteger(size) || size <= 0 || size > 2 * MiB)
      throw new PhotoError('請從素材庫加入裝置照片後再存檔。')
    sizes.add(size)
  }
  const photos = await withPhotos('readonly', async (store) => {
    const rows = await Promise.all(
      [...sizes].map((size) => query(store.index('size').getAll(size))),
    )
    return checkedPhotos(
      rows
        .flat()
        .filter((item) => isRecord(item) && typeof item.url === 'string' && wanted.has(item.url)),
    )
  })
  for (const photo of photos) await verifyPixels(photo.url)
  return photos
}

export async function addPhoto(file: File): Promise<Photo> {
  const photo = await readPhoto(file)
  return withPhotos('readwrite', async (store) => {
    // Duplicate lookup and insertion share a write transaction across tabs.
    const photos = checkedPhotos(await query(store.index('size').getAll(photo.size)))
    const duplicate = photos.find((item) => item.url === photo.url)
    if (duplicate) return duplicate
    await query(store.add(photo))
    return photo
  })
}
