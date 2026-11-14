import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { SigilDoc } from '@cluion/sigil-core'
import { createHttpProjectStore, HttpError } from '../resources/js/http-project-store'
import { createHttpAssetStore } from '../resources/js/http-asset-store'

const doc: SigilDoc = {
  version: 1,
  root: {
    id: 'page-root',
    type: 'section',
    children: [
      {
        id: 'title',
        type: 'text',
        tagName: 'h1',
        content: '活動 <2026> — 原始文字',
        attributes: { title: 'A & B', 'aria-label': '標題' },
        style: { color: '#112233', padding: '16px' },
      },
    ],
  },
  meta: { title: '測試頁', device: 'desktop', updatedAt: '2026-10-23T04:05:06.000Z' },
  stylesheets: [
    { id: 'brand', rules: '.brand:hover { color: rgba(0, 0, 0, 0.5); padding: 16px; }' },
  ],
}
const asset = {
  id: 'asset-1',
  url: '/sigil/assets/asset-1/content',
  name: '圖.png',
  mimeType: 'image/png',
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setupProject() {
  const request = vi.fn<typeof fetch>()
  const store = createHttpProjectStore({
    pageKey: 'campaign / 2026',
    csrfToken: 'csrf',
    fetch: request,
  })
  return { request, store }
}

describe('Laravel HTTP ProjectStore', () => {
  it.each(['activity', 'basic', 'official-marketing', 'edited-metadata'])(
    'loads the shared %s document fixture without changing any fields',
    async (name) => {
      const fixture: unknown = JSON.parse(
        readFileSync(
          new URL(`../tests/Fixtures/valid-documents/${name}.json`, import.meta.url),
          'utf8',
        ),
      )
      const { request, store } = setupProject()
      request.mockResolvedValueOnce(json({ revision: 1, doc: fixture }))
      await expect(store.load()).resolves.toEqual(fixture)
    },
  )

  it('validates and preserves loaded documents while encoding keys and disabling GET caching', async () => {
    const { request, store } = setupProject()
    request.mockResolvedValueOnce(json({ revision: 4, doc }))

    await expect(store.load()).resolves.toEqual(doc)
    expect(request).toHaveBeenCalledExactlyOnceWith('/sigil/pages/campaign%20%2F%202026', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  })

  it('forbids writes before a completed load', async () => {
    const { request, store } = setupProject()
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).not.toHaveBeenCalled()
    let resolve!: (response: Response) => void
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const loading = store.load()
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledOnce()
    resolve(json({ revision: 1, doc }))
    await loading
  })

  it('uses base revision zero after a confirmed 404 and advances it after a 201 creation response', async () => {
    const { request, store } = setupProject()
    request
      .mockResolvedValueOnce(json(null, 404))
      .mockResolvedValueOnce(json({ revision: 1 }, 201))
      .mockResolvedValueOnce(json({ revision: 2 }))
    await expect(store.load()).resolves.toBeNull()
    await store.save(doc)
    await store.save(doc)
    expect(request.mock.calls[1]).toEqual([
      '/sigil/pages/campaign%20%2F%202026',
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': 'csrf',
        },
        body: JSON.stringify({ baseRevision: 0, doc }),
      },
    ])
    expect(JSON.parse(request.mock.calls[2]![1]!.body as string).baseRevision).toBe(1)
  })

  it.each([401, 403, 500])('HTTP %s load failures never permit a blind write', async (status) => {
    const { request, store } = setupProject()
    request.mockResolvedValueOnce(json({}, status))
    await expect(store.load()).rejects.toMatchObject({ name: 'HttpError', status })
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledOnce()
  })

  it('network and JSON parsing failures do not initialize a revision', async () => {
    const { request, store } = setupProject()
    const failure = new Error('network unavailable')
    request.mockRejectedValueOnce(failure).mockResolvedValueOnce(new Response('not JSON'))
    await expect(store.load()).rejects.toBe(failure)
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    await expect(store.load()).rejects.toThrow()
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('invalidates an earlier revision when refreshing the document fails', async () => {
    const { request, store } = setupProject()
    request.mockResolvedValueOnce(json({ revision: 4, doc })).mockResolvedValueOnce(json({}, 500))
    await store.load()
    await expect(store.load()).rejects.toBeInstanceOf(HttpError)
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not let a late earlier GET restore write permission after a newer load fails', async () => {
    const { request, store } = setupProject()
    let resolve!: (response: Response) => void
    request
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValueOnce(json({}, 500))
    const earlier = store.load()
    await expect(store.load()).rejects.toBeInstanceOf(HttpError)
    resolve(json({ revision: 4, doc }))
    await expect(earlier).rejects.toThrow('superseded')
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('acknowledges an earlier PUT without restoring write permission after a newer failed load', async () => {
    const { request, store } = setupProject()
    let resolve!: (response: Response) => void
    request
      .mockResolvedValueOnce(json({ revision: 4, doc }))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValueOnce(json({}, 500))
    await store.load()
    const saving = store.save(doc)
    await expect(store.load()).rejects.toBeInstanceOf(HttpError)
    resolve(json({ revision: 5 }))
    await expect(saving).resolves.toBeUndefined()
    await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
    expect(request).toHaveBeenCalledTimes(3)
  })

  it.each([409, 500])(
    'rejects HTTP %s without advancing revision or reloading automatically',
    async (status) => {
      const { request, store } = setupProject()
      request
        .mockResolvedValueOnce(json({ revision: 4, doc }))
        .mockResolvedValueOnce(json({ revision: 99 }, status))
        .mockResolvedValueOnce(json({ revision: 5 }))
      await store.load()
      await expect(store.save(doc)).rejects.toMatchObject({ name: 'HttpError', status })
      await store.save(doc)
      expect(
        request.mock.calls
          .slice(1)
          .map(([, init]) => JSON.parse(init!.body as string).baseRevision),
      ).toEqual([4, 4])
      expect(request.mock.calls.slice(1).map(([, init]) => init!.method)).toEqual(['PUT', 'PUT'])
    },
  )

  it.each([0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid loaded revision %s and keeps writes disabled',
    async (revision) => {
      const { request, store } = setupProject()
      request.mockResolvedValueOnce(json({ revision, doc }))
      await expect(store.load()).rejects.toThrow('Invalid page response')
      await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
      expect(request).toHaveBeenCalledOnce()
    },
  )

  it.each([{}, null, { revision: 0 }, { revision: '6' }])(
    'rejects invalid successful PUT shape %j without advancing the base',
    async (payload) => {
      const { request, store } = setupProject()
      request
        .mockResolvedValueOnce(json({ revision: 5, doc }))
        .mockResolvedValueOnce(json(payload))
        .mockResolvedValueOnce(json({ revision: 6 }))
      await store.load()
      await expect(store.save(doc)).rejects.toThrow('Invalid save response')
      await store.save(doc)
      expect(JSON.parse(request.mock.calls[2]![1]!.body as string).baseRevision).toBe(5)
    },
  )

  it.each([
    { version: 2, root: doc.root },
    { version: 1, root: [] },
    { version: 1, root: { id: 'r', type: 'section', children: [{ id: 'r', type: 'text' }] } },
    { version: 1, root: { id: 'r', type: 'text', tagName: 'script' } },
    { version: 1, root: { id: 'r', type: 'text', attributes: { onclick: 'alert(1)' } } },
    { version: 1, root: { id: 'r', type: 'text', attributes: { href: 'javascript:alert(1)' } } },
    { version: 1, root: { id: 'r', type: 'image', attributes: { src: 'data:text/html,payload' } } },
    {
      version: 1,
      root: { id: 'r', type: 'text', style: { background: 'url(https://example.com)' } },
    },
    { version: 1, root: { id: 'r', type: 'shortcode', shortcode: { name: 'unknown', props: {} } } },
    { version: 1, root: { id: 'r', type: 'rich-text', content: '<img onerror="alert(1)">' } },
    { version: 1, root: { id: 'r', type: 'text', attributes: [] } },
    { version: 1, root: { id: 'r\n', type: 'text' } },
    { version: 1, root: { id: 'r', type: 'text', attributes: { 'data-label\n': 'x' } } },
    { version: 1, root: { id: 'r', type: 'text' }, meta: { device: ['desktop'] } },
    {
      version: 1,
      root: { id: 'r', type: 'text' },
      stylesheets: [{ id: 'bad', rules: '@import "https://example.com";' }],
    },
  ])(
    'rejects unsafe or malformed document %j before mounting or permitting saves',
    async (invalidDoc) => {
      const { request, store } = setupProject()
      request.mockResolvedValueOnce(json({ revision: 1, doc: invalidDoc }))
      await expect(store.load()).rejects.toThrow('Invalid document')
      await expect(store.save(doc)).rejects.toThrow('Load the page successfully')
      expect(request).toHaveBeenCalledOnce()
    },
  )
})

describe('Laravel HTTP AssetStore', () => {
  it('validates the list and requests uncached same-origin JSON', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json([asset]))
    const store = createHttpAssetStore({ csrfToken: 'csrf', fetch: request })
    await expect(store.list()).resolves.toEqual([asset])
    expect(request).toHaveBeenCalledExactlyOnceWith('/sigil/assets', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  })

  it('uploads the original file as multipart with CSRF, leaving Content-Type to the browser', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json(asset, 201))
    const store = createHttpAssetStore({ csrfToken: 'csrf', fetch: request })
    const file = new File(['png'], '圖.png', { type: 'image/png' })
    await expect(store.upload!(file)).resolves.toEqual(asset)
    const [url, init] = request.mock.calls[0]!
    expect(url).toBe('/sigil/assets')
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    const headers = new Headers(init!.headers)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf')
    expect(headers.has('Content-Type')).toBe(false)
    expect(init!.body).toBeInstanceOf(FormData)
    expect((init!.body as FormData).get('file')).toBe(file)
  })

  it.each([403, 422, 500])('rejects HTTP %s from either asset endpoint', async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, status))
      .mockResolvedValueOnce(json({}, status))
    const store = createHttpAssetStore({ csrfToken: 'csrf', fetch: request })
    await expect(store.list()).rejects.toMatchObject({ name: 'HttpError', status })
    await expect(store.upload!(new File(['x'], 'x.png'))).rejects.toMatchObject({
      name: 'HttpError',
      status,
    })
  })

  it.each([
    null,
    {},
    [{ ...asset, id: 1 }],
    [{ ...asset, name: 1 }],
    [{ ...asset, url: 'blob:https://example.com/temporary' }],
    [{ ...asset, url: 'data:image/png;base64,AAAA' }],
    [{ ...asset, url: 'javascript:alert(1)' }],
    [{ ...asset, thumbUrl: 'data:image/png;base64,AAAA' }],
  ])('rejects malformed or nonpersistent asset list %j', async (payload) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json(payload))
    const store = createHttpAssetStore({ csrfToken: 'csrf', fetch: request })
    await expect(store.list()).rejects.toThrow('Invalid asset')
  })

  it('rejects a successful upload with a temporary URL instead of acknowledging a persistent asset', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...asset, url: 'blob:temporary' }, 201))
    const store = createHttpAssetStore({ csrfToken: 'csrf', fetch: request })
    await expect(store.upload!(new File(['x'], 'x.png'))).rejects.toThrow('Invalid asset')
  })
})
