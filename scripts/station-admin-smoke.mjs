#!/usr/bin/env node
/**
 * Browser smoke test for station registration and dashboard. Requires Node >=22.12 and Chrome.
 * Start the frontend first, then run `node scripts/station-admin-smoke.mjs`.
 * All API responses and writes are mocked; no real credentials or records.
 * Optional: MAP_TEST_URL, CHROME_BIN, CHROME_NO_SANDBOX=1,
 * CDP_BASE_URL (reuse Chrome), MAP_TEST_MOBILE=0, MAP_TEST_SCREENSHOT.
 * Uses browser DOM and real mouse events; never creates a backend parcel.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.MAP_TEST_URL || 'http://localhost:3037/fecoclima-ia/admin/login'
const draftKey = 'fecoclima-parcel-draft'
const withoutWebGL = process.env.MAP_TEST_DISABLE_WEBGL === '1'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let chrome, profile, socket, targetId, cdpBase
const pending = new Map()
const events = new Map()
const exceptions = []
let sequence = 0

async function waitFor(check, description, timeout = 30_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await check()
      if (result) return result
    } catch (error) { lastError = error }
    await pause(150)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

async function startChrome() {
  if (process.env.CDP_BASE_URL) return process.env.CDP_BASE_URL.replace(/\/$/, '')
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
  let binary
  for (const candidate of candidates) {
    try { await access(candidate); binary = candidate; break } catch { /* next candidate */ }
  }
  assert(binary, 'Chrome not found. Set CHROME_BIN or CDP_BASE_URL.')
  profile = await mkdtemp(join(tmpdir(), 'fecoclima-map-smoke-'))
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ]
  if (process.env.CHROME_NO_SANDBOX === '1') args.unshift('--no-sandbox')
  if (withoutWebGL) args.push('--disable-webgl')
  chrome = spawn(binary, args, { stdio: 'ignore' })
  let launchError
  chrome.once('error', (error) => { launchError = error })
  const port = await waitFor(async () => {
    if (launchError) throw launchError
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`)
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { return null }
  }, 'Chrome debugger port', 15_000)
  return `http://127.0.0.1:${port}`
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15_000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression: `(async () => (${expression}))()`, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result?.value
}

async function cleanup() {
  if (socket?.readyState === WebSocket.OPEN) socket.close()
  for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new Error('Browser connection closed')) }
  pending.clear()
  if (targetId && cdpBase) {
    try { await fetch(`${cdpBase}/json/close/${targetId}`, { signal: AbortSignal.timeout(2000) }) } catch { /* Chrome may already have exited */ }
  }
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM')
    for (let attempt = 0; attempt < 20 && chrome.exitCode === null; attempt++) await pause(100)
    if (chrome.exitCode === null) chrome.kill('SIGKILL')
  }
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

const stations = []
let captured
const csrfToken = 'station-smoke-csrf'
let csrfChecks = 0
async function intercept(params) {
  const path = new URL(params.request.url).pathname.replace(/^.*\/api\/v1/, '')
  let payload = {}
  if (!['GET', 'HEAD', 'OPTIONS'].includes(params.request.method) && path !== '/auth/login') {
    const header = Object.entries(params.request.headers).find(([key]) => key.toLowerCase() === 'x-csrf-token')?.[1]
    assert.equal(header, csrfToken, `Missing or incorrect CSRF token for ${path}`)
    csrfChecks++
  }
  if (path === '/auth/login' || path === '/auth/me') payload = {id:'admin', email:'test@example.com', name:'Prueba', role:'superadmin'}
  else if (path === '/auth/session') payload = {user:{id:'admin',name:'Prueba',email:'test@example.com',role:'superadmin'},refresh_available:false}
  else if (path === '/stations/location/resolve') payload = {latitude:-26.1585,longitude:-55.2722,altitude_m:320,country:'Paraguay',department:'Alto Paraná',district:'Raúl Peña',locality:'Centro',warnings:[],sources:[]}
  else if (path === '/stations' && params.request.method === 'POST') {captured = JSON.parse(params.request.postData);payload={...captured,id:'station-test',code:'EST-TEST'};stations.push(payload)}
  else if (path === '/stations') payload = {items:stations,limit:250,offset:0}
  else if (path === '/stations/station-test') payload = stations[0]
  else if (path === '/admin/ai-runs') payload={completed_24h:0,fallback_24h:0,items:[]}
  else if (path === '/admin/jobs') payload=[]
  await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'Content-Type,X-CSRF-Token'}],body:Buffer.from(JSON.stringify(payload)).toString('base64')})
}
try {
  cdpBase = await startChrome()
  const target = await (await fetch(`${cdpBase}/json/new?about:blank`,{method:'PUT'})).json()
  targetId=target.id;socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data)
    if(m.id){const call=pending.get(m.id);if(!call)return;clearTimeout(call.timer);pending.delete(m.id);m.error?call.reject(new Error(m.error.message)):call.resolve(m.result)}
    else if(m.method==='Fetch.requestPaused')void intercept(m.params).catch(console.error)
    else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)
  })
  await send('Page.enable');await send('Runtime.enable')
  await send('Network.setCookie', { name: 'csrf_token', value: csrfToken, url: appUrl, path: '/', sameSite: 'Lax' })
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*'}]})
  await send('Page.navigate',{url:appUrl})
  await waitFor(()=>evaluate(`!!document.querySelector('input[type=email]') && !!document.querySelector('#__nuxt')?.__vue_app__`),'hydrated login')
  await evaluate(`(()=>{const e=document.querySelector('input[type=email]'),p=document.querySelector('input[type=password]');e.value='test@example.com';e.dispatchEvent(new Event('input',{bubbles:true}));p.value='test-only';p.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit()})()`)
  await waitFor(()=>evaluate(`!!document.querySelector('.station-overview .world-map-shell')`),'dashboard station map')
  await evaluate(`document.querySelector('.station-overview a').click()`)
  await waitFor(()=>evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Nueva estación')`),'station list')
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Nueva estación').click()`)
  await waitFor(()=>evaluate(`!!document.querySelector('.station-form .map-tile')`),'station point editor')
  await evaluate(`(()=>{const form=document.querySelector('.station-form');const set=(selector,value)=>{const e=form.querySelector(selector);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}))};set('input[placeholder="Ej. Raúl Peña"]','Estación de prueba');set('input[type=url]','https://fecoclima.fecoprod.com.py/clima/api/estacion/lectura-guid-por-periodo/C2694D32-5A4B-48C0-A3B6-8345D9E4935B/2026/1/6');set('input[aria-label="URL de Google Maps o coordenadas"]','https://www.google.com/maps/@-26.1585,-55.2722,400m')})()`)
  await pause(100)
  await evaluate(`[...document.querySelectorAll('.station-form button')].find(b=>b.textContent.includes('Obtener ubicación')).click()`)
  await waitFor(()=>evaluate(`document.querySelector('.station-form').textContent.includes('Ubicación y altitud completadas')`),'location response')
  assert(await evaluate(`[...document.querySelectorAll('.location-fields input')].some(i=>i.value==='Alto Paraná')`))
  assert(await evaluate(`[...document.querySelectorAll('.location-fields input')].some(i=>i.value==='320')`))
  await evaluate(`(()=>{const color=document.querySelector('.station-form input[type=color]');color.value='#9b5de5';color.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await evaluate(`document.querySelector('.station-form').requestSubmit()`)
  await waitFor(()=>captured,'station save')
  assert.equal(captured.integration_config.map_color,'#9b5de5')
  assert.equal(captured.integration_config.soil_moisture_unit,'cb','Known Raúl Peña defaults to documented cb unless explicitly edited')
  assert(csrfChecks >= 2, 'Location lookup and station save must carry CSRF')
  assert.equal(captured.code,null);assert.equal(captured.latitude,-26.1585);assert.equal(captured.influence_radius_m,5000);assert.equal(captured.active,true);assert.equal(captured.source_type,'FECOCLIMA_API')
  await waitFor(()=>evaluate(`location.pathname.endsWith('/estaciones/station-test') && document.querySelector('.station-form')`),'saved station detail')
  await evaluate(`document.querySelector('.back-link').click()`)
  await waitFor(()=>evaluate(`!document.querySelector('.station-form') && document.querySelector('table').textContent.includes('Estación de prueba')`),'saved station list')
  await evaluate(`[...document.querySelectorAll('aside a')].find(a=>a.textContent.includes('Dashboard')).click()`)
  await waitFor(()=>evaluate(`document.querySelector('.station-overview')?.textContent.includes('1 estaciones')`),'dashboard refresh')
  await waitFor(()=>evaluate(`(() => {const shell=document.querySelector('.station-overview .world-map-shell');return shell && !shell.querySelector('.map-loading') && !!shell.querySelector('canvas.maplibregl-canvas,.map-tile')})()`),'dashboard map rendering',45000)
  assert.equal(exceptions.length,0,exceptions.join('\n'))
  console.log(JSON.stringify({ok:true,loginMocked:true,stationForm:true,mapsImport:true,optionalCode:true,save:true,dashboard:true,uncaughtExceptions:0}))
} catch(error){console.error(error);try{console.error(await evaluate(`({url:location.href,text:document.body.innerText.slice(0,2500),vue:!!document.querySelector('#__nuxt')?.__vue_app__,nuxt:!!window.$nuxt,scripts:[...document.scripts].map(s=>s.src)})`));console.error(exceptions)}catch{}process.exitCode=1}
finally{await cleanup()}
