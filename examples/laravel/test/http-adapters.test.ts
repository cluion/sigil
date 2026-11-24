import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SigilDoc } from '@cluion/sigil-core'
import { createHttpProjectStore, HttpError } from '../resources/js/http-project-store'
import { createHttpAssetStore } from '../resources/js/http-asset-store'
import { createActivityDownload } from '../resources/js/activity-download'

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

describe('activity HTML download images', () => {
  const origin = 'https://workshop.test'
  const path = '/sigil/media/04a8d055-e70f-4f84-9c47-e53bd2312172'
  const cover = '/workshop-printmaking.webp'
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
    'base64',
  )
  const coverBytes = readFileSync(new URL('../public/workshop-printmaking.webp', import.meta.url))
  const pngData = 'data:image/png;base64,' + png.toString('base64')
  const signal = () => new AbortController().signal

  function page(sources: string[]): SigilDoc {
    return {
      version: 1,
      root: {
        id: 'root',
        type: 'section',
        children: sources.map((src, i) => ({
          id: 'pic-' + i,
          type: 'image',
          attributes: { src, alt: '工作坊照片' },
          responsiveStyles: { mobile: { width: '100%' } },
        })),
      },
    }
  }
  function prepare(request: typeof fetch) {
    return createActivityDownload({ origin, coverUrl: cover, laravelMedia: true, fetch: request })
  }
  function imageResponse(bytes: Uint8Array<ArrayBufferLike>, mime: string, status = 200) {
    return new Response(new Uint8Array(bytes), { status, headers: { 'Content-Type': mime } })
  }

  beforeEach(() =>
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() })),
  )
  afterEach(() => vi.unstubAllGlobals())

  it('embeds managed photos once per URL, preserves order, responsive styles and the original document', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse(png, 'image/png'))
      .mockResolvedValueOnce(imageResponse(coverBytes, 'image/webp'))
    const external = 'https://images.example.org/flyer.png'
    const input = page([path, external, origin + path, cover, '/placeholder.svg'])
    const original = structuredClone(input)
    const abort = signal()
    const result = await prepare(request)(input, abort)
    expect(request.mock.calls).toEqual(
      [origin + path, origin + cover].map((url) => [
        url,
        {
          mode: 'same-origin',
          credentials: 'omit',
          redirect: 'error',
          signal: abort,
        },
      ]),
    )
    expect(input).toEqual(original)
    const images = result.root.children!
    expect(images[4]!.attributes!.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    const expected = [
      pngData,
      external,
      pngData,
      'data:image/webp;base64,' + coverBytes.toString('base64'),
      images[4]!.attributes!.src,
    ]
    expect(result).toEqual(page(expected as string[]))
  })

  it('does not request unrelated same-origin routes, user URLs or src attributes of other elements', async () => {
    const request = vi.fn<typeof fetch>()
    const input = page([
      '/activities',
      '/sigil/media/not-a-uuid',
      path + '?preview=1',
      'https://external.test' + path,
      'https://user@workshop.test' + path,
      '//workshop.test' + path,
      'data:image/png;base64,AA==',
      'blob:https://workshop.test/id',
    ])
    input.root.children!.push({
      id: 'link',
      type: 'button',
      tagName: 'a',
      attributes: { src: path, href: path },
    })
    expect(await prepare(request)(input, signal())).toEqual(input)
    expect(request).not.toHaveBeenCalled()
  })

  it('the local demo fetches only its configured bundled cover', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(imageResponse(coverBytes, 'image/webp'))
    const bundled = '/assets/photo-abcdef.webp'
    const input = page([path, '/placeholder.svg', cover, pngData, bundled])
    const result = await createActivityDownload({
      origin,
      coverUrl: origin + bundled,
      fetch: request,
    })(input, signal())
    expect(request.mock.calls.map(([url]) => url)).toEqual([origin + bundled])
    expect(result.root.children!.slice(0, 4)).toEqual(input.root.children!.slice(0, 4))
  })

  it('embeds hidden images which HTML retains, and ignores children which void tags omit', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse(coverBytes, 'image/webp'))
      .mockResolvedValueOnce(imageResponse(png, 'image/png'))
    const input = page([cover, path])
    input.root.children![0]!.hidden = true
    input.root.children!.push(
      {
        id: 'hidden-group',
        type: 'section',
        hidden: true,
        children: [{ id: 'hidden-picture', type: 'image', attributes: { src: path } }],
      },
      {
        id: 'void-tag',
        type: 'section',
        tagName: 'hr',
        children: [{ id: 'omitted-picture', type: 'image', attributes: { src: cover } }],
      },
    )
    const expected = structuredClone(input)
    expected.root.children![0]!.attributes!.src =
      'data:image/webp;base64,' + coverBytes.toString('base64')
    expected.root.children![1]!.attributes!.src = pngData
    expected.root.children![2]!.children![0]!.attributes!.src = pngData
    expect(await prepare(request)(input, signal())).toEqual(expected)
    expect(request.mock.calls.map(([url]) => url)).toEqual([origin + cover, origin + path])
  })

  it.each([
    [() => imageResponse(png, 'image/png', 404), 'Invalid image response'],
    [() => imageResponse(png, 'image/png', 206), 'Invalid image response'],
    [() => imageResponse(png, 'image/svg+xml'), 'Invalid image response'],
    [() => imageResponse(png, 'image/jpeg'), 'Image type mismatch'],
    [
      () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'image/png' } }),
      'Image type mismatch',
    ],
    [
      () => Object.defineProperty(imageResponse(png, 'image/png'), 'redirected', { value: true }),
      'Invalid image response',
    ],
  ] as const)(
    'rejects failed, partial, redirected or mislabeled image responses (%#)',
    async (make, reason) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(make())
      await expect(prepare(request)(page([path]), signal())).rejects.toThrow(reason)
    },
  )

  it('an invalid raster fails decoding and a later download can retry without changing the input', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Undecodable pixels'))
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => imageResponse(png, 'image/png'))
    const input = page([path]),
      download = prepare(request)
    await expect(download(input, signal())).rejects.toThrow('Undecodable pixels')
    expect(input).toEqual(page([path]))
    expect(await download(input, signal())).toEqual(page([pngData]))
  })

  it('counts actual streamed bytes and repeated uses towards the output budget', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024)
    bytes.set(png)
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => imageResponse(bytes, 'image/png'))
    // Five references to a single 4 MiB file would expand to over 16 MiB before Base64.
    await expect(prepare(request)(page(Array(5).fill(path)), signal())).rejects.toThrow('limit')
    expect(request).toHaveBeenCalledOnce()
    const canceled = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1))
        },
        cancel: canceled,
      }),
      { headers: { 'Content-Type': 'image/png', 'Content-Length': '1' } },
    )
    request.mockResolvedValueOnce(response)
    await expect(prepare(request)(page([path]), signal())).rejects.toThrow('limit')
    expect(canceled).toHaveBeenCalledOnce()
  })

  it('cancellation skips future requests and releases a pending response stream', async () => {
    const abort = new AbortController()
    let reading!: () => void
    const started = new Promise<void>((resolve) => {
      reading = resolve
    })
    const canceled = vi.fn()
    const stream = new ReadableStream(
      {
        pull() {
          reading()
        },
        cancel: canceled,
      },
      { highWaterMark: 0 },
    )
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'image/png' } }))
    const job = prepare(request)(page([path, cover]), abort.signal)
    await started
    abort.abort()
    await expect(job).rejects.toMatchObject({ name: 'AbortError' })
    expect(canceled).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledOnce()
    await expect(prepare(request)(page([path]), abort.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(request).toHaveBeenCalledOnce()
  })
})

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
  it('offers another file for invalid uploads and leaves network failures retryable', () => {
    const store = createHttpAssetStore({ csrfToken: 'csrf' })
    expect(store.uploadAccept).toBe('image/png,image/jpeg,image/webp')
    for (const status of [413, 422]) {
      const feedback = store.describeUploadError!(new HttpError(status, 'Upload asset'))
      expect(feedback?.retryable).toBe(false)
      expect(feedback?.message).toContain('圖片')
    }
    expect(store.describeUploadError!(new TypeError('Network failure'))).toBeUndefined()
  })

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
