#!/usr/bin/env node
/** Exercise the real useApi composable with simulated browser/SSR cookies. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../app/composables/useApi.ts', import.meta.url), 'utf8')
function setup({ client = true, name = 'csrf_token', cookie = '', handler } = {}) {
  const calls = []
  let browserCookie = cookie
  const readonlyCookie = Object.freeze({ value: 'stale-ssr-token' })
  const document = {}
  Object.defineProperty(document, 'cookie', {
    get: () => browserCookie,
    set: () => { throw new Error('The API client must never overwrite server-issued cookies') },
  })
  const context = {
    exports: {}, Headers, URL, document,
    require: () => ({ parcelSessionId: () => '00000000-0000-4000-8000-000000000001', registerSessionParcel: () => {}, chatBrowserId: () => '00000000-0000-4000-8000-000000000002' }),
    useResponseHeader: () => ({ value: [] }),
    useRuntimeConfig: () => ({ public: { csrfCookieName: name, apiBase: '/api/v1' } }),
    useCookie: (_name, options) => { assert.equal(options.readonly, true); return readonlyCookie },
    useRequestHeaders: () => ({ cookie }),
    useRequestURL: () => new URL('https://example.com/fecoclima-ia/admin'),
    $fetch: async (path, options) => { calls.push({ path, ...options, headers: new Headers(options.headers) }); return handler ? handler(path, options, value => { browserCookie = value }) : { ok: true } },
  }
  context.$fetch.raw = async (path, options) => ({_data: await context.$fetch(path, options), headers: new Headers()})
  const code = ts.transpileModule(source.replaceAll('import.meta.client', String(client)).replaceAll('import.meta.server', String(!client)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, context)
  return { api: context.exports.useApi(), calls, setCookie: value => { browserCookie = value } }
}
const browser = setup({ cookie: 'csrf_token=first-token' })
await browser.api.request('/stations', { method: 'POST' })
assert.equal(browser.calls.at(-1).headers.get('X-CSRF-Token'), 'first-token')
// Login/refresh or another tab can rotate the token after the composable mounted.
browser.setCookie('csrf_token=rotated-token')
await browser.api.request('/stations/1', { method: 'PUT' })
assert.equal(browser.calls.at(-1).headers.get('X-CSRF-Token'), 'rotated-token')
await browser.api.request('/stations')
assert.equal(browser.calls.at(-1).headers.get('X-CSRF-Token'), null)
await browser.api.request('/parcels/analyses/example/chat')
assert.equal(browser.calls.at(-1).headers.get('X-Chat-Browser'), '00000000-0000-4000-8000-000000000002')
await browser.api.request('/parcels/analyses/example/chat', { method: 'POST' })
assert.equal(browser.calls.at(-1).headers.get('X-Chat-Browser'), '00000000-0000-4000-8000-000000000002')
await browser.api.request('/stations')
assert.equal(browser.calls.at(-1).headers.get('X-Chat-Browser'), null)
await browser.api.request('/public/parcel-imagery', { method: 'POST' })
assert.equal(browser.calls.at(-1).headers.get('X-Parcel-Session'), '00000000-0000-4000-8000-000000000001')
await browser.api.request('/public/parcel-imagery/preview-id')
assert.equal(browser.calls.at(-1).headers.get('X-Parcel-Session'), '00000000-0000-4000-8000-000000000001')
await browser.api.request('/public/parcel-imagery/preview-id/images/observation/image.jpg?token=grant')
assert.equal(browser.calls.at(-1).headers.get('X-Parcel-Session'), null)
browser.setCookie('')
await browser.api.request('/auth/login', { method: 'POST' })
assert.equal(browser.calls.at(-1).headers.get('X-CSRF-Token'), null)
const custom = setup({ name: 'fecoclima_csrf_token', cookie: 'csrf_token=other-app; fecoclima_csrf_token=correct-token' })
await custom.api.request('/stations', { method: 'POST' })
assert.equal(custom.calls.at(-1).headers.get('X-CSRF-Token'), 'correct-token')
const server = setup({ client: false, cookie: 'access_token=session; csrf_token=server-token' })
await server.api.request('/auth/session')
assert.equal(server.calls.at(-1).headers.get('cookie'), 'access_token=session; csrf_token=server-token')
assert.equal(server.calls.at(-1).baseURL, 'https://example.com/api/v1')
console.log('CSRF OK: fresh cookies, rotation, custom name, missing cookie, read-only cookies, SSR forwarding.')

let refreshes = 0
let validSession = false
const expired = setup({ cookie: 'csrf_token=before-refresh', handler: async (path, options, setCookie) => {
  if (path === '/auth/refresh') {
    refreshes++
    await new Promise(resolve => setTimeout(resolve, 20))
    validSession = true
    setCookie('csrf_token=after-refresh')
    return { role: 'superadmin' }
  }
  if (!validSession) { const error = new Error('Expired'); error.response = {status:401}; throw error }
  assert.equal(options.headers.get('X-CSRF-Token'), 'after-refresh')
  return { ok: true }
} })
await Promise.all([expired.api.request('/stations',{method:'POST'}), expired.api.request('/agents',{method:'PUT'})])
assert.equal(refreshes,1,'Concurrent 401 responses must share one refresh')
let blockedCalls=0
const forbidden=setup({handler:async()=>{blockedCalls++;const error=new Error('Forbidden');error.response={status:403};throw error}})
await assert.rejects(()=>forbidden.api.request('/stations',{method:'POST'}))
assert.equal(blockedCalls,1,'A 403 must not refresh or bypass CSRF')
console.log('SESSION OK: concurrent expiry renews once, retries with fresh CSRF, 403 is preserved.')
