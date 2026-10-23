import type { AssetItem, AssetStore } from '@cluion/sigil-core'
import { isRecord, isPersistentAssetUrl } from './document-validation'
import { HttpError } from './http-project-store'

function assertAsset(value: unknown): asserts value is AssetItem {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !isPersistentAssetUrl(value.url) ||
    (value.name !== undefined && typeof value.name !== 'string') ||
    (value.mimeType !== undefined && typeof value.mimeType !== 'string') ||
    (value.thumbUrl !== undefined && !isPersistentAssetUrl(value.thumbUrl))
  ) {
    throw new Error('Invalid asset response: expected an asset with a persistent HTTP URL')
  }
}

export function createHttpAssetStore(options: {
  csrfToken: string
  fetch?: typeof fetch
}): AssetStore {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)
  const endpoint = '/sigil/assets'

  return {
    async list() {
      const response = await request(endpoint, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new HttpError(response.status, 'List assets')
      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) throw new Error('Invalid asset list response')
      for (const asset of payload) assertAsset(asset)
      return payload
    },
    async upload(file) {
      const body = new FormData()
      body.set('file', file)
      const response = await request(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-CSRF-TOKEN': options.csrfToken,
        },
        // The browser supplies the multipart boundary and corresponding Content-Type.
        body,
      })
      if (!response.ok) throw new HttpError(response.status, 'Upload asset')
      const payload: unknown = await response.json()
      assertAsset(payload)
      return payload
    },
  }
}
