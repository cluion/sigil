import type { ProjectStore } from '@cluion/sigil-core'
import { assertDocument, isRecord } from './document-validation'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(`${operation} failed: HTTP ${status}`)
    this.name = 'HttpError'
  }
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
}

export function createHttpProjectStore(options: {
  pageKey: string
  csrfToken: string
  fetch?: typeof fetch
}): ProjectStore {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)
  const endpoint = `/sigil/pages/${encodeURIComponent(options.pageKey)}`
  let revision: number | null = null
  let loadGeneration = 0

  return {
    async load() {
      // A failed refresh must never leave an earlier revision available for a blind write.
      const generation = ++loadGeneration
      revision = null
      const response = await request(endpoint, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (response.status === 404) {
        if (generation !== loadGeneration) throw new Error('Page load was superseded')
        revision = 0
        return null
      }
      if (response.status !== 200) throw new HttpError(response.status, 'Load page')
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !isRevision(payload.revision)) {
        throw new Error('Invalid page response: expected a positive revision and document')
      }
      assertDocument(payload.doc)
      if (generation !== loadGeneration) throw new Error('Page load was superseded')
      revision = payload.revision
      return payload.doc
    },
    async save(doc) {
      if (revision === null) throw new Error('Load the page successfully before saving')
      const generation = loadGeneration
      const response = await request(endpoint, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': options.csrfToken,
        },
        body: JSON.stringify({ baseRevision: revision, doc }),
      })
      if (response.status !== 200 && response.status !== 201) {
        throw new HttpError(response.status, 'Save page')
      }
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !isRevision(payload.revision)) {
        throw new Error('Invalid save response: expected a positive revision')
      }
      // A later load owns the base, even when this earlier write has now been acknowledged.
      if (generation === loadGeneration) revision = payload.revision
    },
  }
}
