import { readFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { expect, test, type APIRequestContext } from '@playwright/test'

const credentials = { email: 'editor@sigil.test', password: 'Sigil-e2e-only-password-2026' }
const headers = { Accept: 'application/json' }
const document = JSON.parse(
  readFileSync(new URL('../tests/Fixtures/valid-documents/activity.json', import.meta.url), 'utf8'),
)

async function login(request: APIRequestContext, email = credentials.email): Promise<string> {
  const loginPage = await request.get('/login')
  const token = (await loginPage.text()).match(/name="_token" value="([^"]+)"/)?.[1]
  expect(token).toBeTruthy()
  const response = await request.post('/login', {
    form: { ...credentials, email, _token: token! },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(302)
  const editor = await request.get('/editor/http-check')
  const csrf = (await editor.text()).match(/name="csrf-token" content="([^"]+)"/)?.[1]
  expect(csrf).toBeTruthy()
  return csrf!
}

test('真 HTTP：CSRF 拒絕缺失／錯誤 token，owner 隔離與非法文件不覆寫', async ({
  request,
  playwright,
  baseURL,
}) => {
  const missingLogin = await request.post('/login', { form: credentials, headers })
  expect(missingLogin.status()).toBe(419)
  const csrf = await login(request)
  const path = '/sigil/pages/http-security'
  const data = { baseRevision: 0, doc: document }
  for (const token of [undefined, 'invalid-csrf-token']) {
    const rejected = await request.put(path, {
      data,
      headers: { ...headers, ...(token ? { 'X-CSRF-TOKEN': token } : {}) },
    })
    expect(rejected.status()).toBe(419)
  }
  const authorizedHeaders = { ...headers, 'X-CSRF-TOKEN': csrf }
  const created = await request.put(path, { data, headers: authorizedHeaders })
  expect(created.status()).toBe(201)
  const original = await (await request.get(path, { headers })).json()
  const injected = structuredClone(document)
  injected.root.attributes = { onclick: 'alert(1)' }
  const rejected = await request.put(path, {
    data: { baseRevision: 1, doc: injected },
    headers: authorizedHeaders,
  })
  expect(rejected.status()).toBe(422)
  expect(await (await request.get(path, { headers })).json()).toEqual(original)

  const other = await playwright.request.newContext({ baseURL })
  try {
    const otherCsrf = await login(other, 'other@sigil.test')
    expect((await other.get(path, { headers })).status()).toBe(404)
    const otherCreated = await other.put(path, {
      data,
      headers: { ...headers, 'X-CSRF-TOKEN': otherCsrf },
    })
    expect(otherCreated.status()).toBe(201)
    expect(await (await request.get(path, { headers })).json()).toEqual(original)
  } finally {
    await other.dispose()
  }
  expect((await request.post('/logout', { headers })).status()).toBe(419)
  expect(
    (await request.post('/logout', { headers: authorizedHeaders, maxRedirects: 0 })).status(),
  ).toBe(302)
  expect((await request.get(path, { headers })).status()).toBe(401)
})

function pngOverTwoMiB(): Buffer {
  function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type), data])
    const length = Buffer.alloc(4)
    const checksum = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  const dimensions = Buffer.alloc(13)
  dimensions.writeUInt32BE(1024, 0)
  dimensions.writeUInt32BE(1024, 4)
  dimensions[8] = 8
  dimensions[9] = 2 // RGB, no alpha; each row starts with the no-filter byte.
  const rows = Buffer.alloc(1024 * (1024 * 3 + 1), 255)
  for (let row = 0; row < 1024; row++) rows[row * (1024 * 3 + 1)] = 0
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', dimensions),
    chunk('IDAT', deflateSync(rows, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test('真 HTTP：超過 2 MiB 的合法 PNG 可保存並公開讀取原始 bytes', async ({
  request,
  playwright,
  baseURL,
}) => {
  const csrf = await login(request)
  const bytes = pngOverTwoMiB()
  expect(bytes.length).toBeGreaterThan(2 * 1024 * 1024)
  expect(bytes.length).toBeLessThan(4 * 1024 * 1024)
  const uploaded = await request.post('/sigil/assets', {
    headers: { ...headers, 'X-CSRF-TOKEN': csrf },
    multipart: { file: { name: 'large-valid.png', mimeType: 'image/png', buffer: bytes } },
  })
  expect(uploaded.status()).toBe(201)
  const asset = await uploaded.json()
  const anonymous = await playwright.request.newContext({ baseURL })
  try {
    expect((await anonymous.get('/sigil/assets', { headers })).status()).toBe(401)
    const image = await anonymous.get(asset.url)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
    expect(image.headers()['x-content-type-options']).toBe('nosniff')
    expect(await image.body()).toEqual(bytes)
  } finally {
    await anonymous.dispose()
  }
})
