#!/usr/bin/env node
/**
 * Browser smoke test for the public map. Requires Node >=22.12 and Chrome.
 * Start the app first, then run `pnpm test:map`.
 * Optional: MAP_TEST_URL, CHROME_BIN, CHROME_NO_SANDBOX=1,
 * CDP_BASE_URL (reuse Chrome), MAP_TEST_MOBILE=0, MAP_TEST_SCREENSHOT.
 * Uses browser DOM and real mouse events; never creates a backend parcel.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.MAP_TEST_URL || 'http://localhost:3037/fecoclima-ia'
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
    '--headless=new', '--ignore-certificate-errors', '--no-first-run', '--no-default-browser-check',
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

async function reload() {
  // Page.reload resolves before navigation; wait for the new document, otherwise
  // readiness could accidentally pass against the previous page's canvas.
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { events.delete('Page.loadEventFired'); reject(new Error('Reload did not finish')) }, 30_000)
    events.set('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await send('Page.reload', { ignoreCache: true })
  await loaded
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression: `(async () => (${expression}))()`, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result?.value
}

async function ready() {
  return waitFor(() => evaluate(`(() => {
    const shell=document.querySelector('.world-map-shell');
    const draw=[...(shell?.querySelectorAll('.map-tools button')||[])].find(b=>/Dibujar parcela|Editar vértices|Terminar edición/.test(b.textContent));
    return shell?.querySelector('.leaflet-container .leaflet-tile-pane') && draw && !draw.disabled;
  })()`),'Leaflet map and drawing controls',45000)
}

async function mouse(type, point, params = {}) {
  await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, ...params })
}

async function click(point) {
  await mouse('mouseMoved', point)
  await mouse('mousePressed', point, { button: 'left', clickCount: 1 })
  await mouse('mouseReleased', point, { button: 'left', clickCount: 1 })
  await pause(200)
}

async function clickButton(text) {
  const point = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.world-map-shell .map-tools button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})
    if (!button || button.disabled) return null
    const r = button.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  assert(point, `Enabled map button not found: ${text}`)
  await click(point)
}

async function savedDraft() {
  return evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(draftKey)}) || 'null')`)
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

try {
  cdpBase = await startChrome()
  // Own tab = isolated sessionStorage, including when reusing a developer browser.
  const response = await fetch(`${cdpBase}/json/new?about:blank`, { method: 'PUT' })
  assert(response.ok, 'Could not create browser test tab')
  const target = await response.json()
  targetId = target.id
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const call = pending.get(message.id)
      if (!call) return
      clearTimeout(call.timer)
      pending.delete(message.id)
      if (message.error) call.reject(new Error(message.error.message))
      else call.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    }
    if (message.method && events.has(message.method)) {
      events.get(message.method)()
      events.delete(message.method)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  if (withoutWebGL) await send('Page.addScriptToEvaluateOnNewDocument', { source: `const originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:originalGetContext.call(this,type,...args)}` })
  await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: appUrl })
  await ready()
  assert(await evaluate(`document.querySelector('[aria-label="Tipo de mapa"] button.active')?.textContent.trim()==='Satélite'`),'Satellite is the default')
  assert.equal(await evaluate(`document.querySelectorAll('.world-map-shell canvas').length`),0,'Map uses no WebGL canvas')
  await evaluate(`document.querySelector('.world-map-shell').scrollIntoView({block:'center'})`)
  await pause(400)
  await clickButton('Dibujar parcela')
  const points=await evaluate(`(()=>{const r=document.querySelector('.world-map-shell .leaflet-container').getBoundingClientRect();return [[.25,.3],[.7,.3],[.7,.6],[.25,.6]].map(([x,y])=>({x:r.x+r.width*x,y:r.y+r.height*y}))})()`)
  for(const point of [...points,points[0]])await click(point)
  const drawn=await waitFor(async()=>{const draft=await savedDraft();return draft?.geojson&&draft},'persisted drawn polygon')
  const ring=drawn.geojson.coordinates[0]
  assert.deepEqual(ring[0],ring.at(-1),'Closed GeoJSON ring')
  assert(ring.every(point=>point.every(Number.isFinite)))
  await clickButton('Editar vértices')
  await waitFor(()=>evaluate(`document.querySelectorAll('.leaflet-editing-icon').length>=4`),'editable Leaflet vertices')
  const vertex=await evaluate(`(()=>{const r=document.querySelector('.leaflet-editing-icon').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await mouse('mouseMoved',vertex)
  await mouse('mousePressed',vertex,{button:'left',clickCount:1})
  for(let step=1;step<=6;step++){await mouse('mouseMoved',{x:vertex.x+step*4,y:vertex.y+step*3},{button:'left',buttons:1});await pause(40)}
  await mouse('mouseReleased',{x:vertex.x+24,y:vertex.y+18},{button:'left',clickCount:1})
  await clickButton('Terminar edición')
  const edited=await waitFor(async()=>{const draft=await savedDraft();return draft?.geojson&&JSON.stringify(draft.geojson)!==JSON.stringify(drawn.geojson)&&draft},'edited vertex saved')
  await evaluate(`[...document.querySelectorAll('[aria-label="Tipo de mapa"] button')].find(b=>b.textContent.includes('Calles')).click()`)
  await pause(500)
  assert.deepEqual((await savedDraft()).geojson,edited.geojson,'Changing the background preserves geometry')
  await reload();await ready()
  assert.deepEqual((await savedDraft()).geojson,edited.geojson,'Reload preserves geometry')
  await evaluate(`document.querySelector('.world-map-shell').scrollIntoView({block:'center'})`);await pause(300)
  await clickButton('Borrar polígono')
  await waitFor(()=>evaluate(`!!document.querySelector('[role="dialog"]')`),'parcel deletion confirmation')
  await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
  await waitFor(async()=>await savedDraft()===null,'deleted draft')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await reload();await ready()
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'No mobile horizontal overflow')
  assert(await evaluate(`!!document.querySelector('.mobile-dock a[href="/fecoclima-ia/mapa"]')`),'Map navigation on mobile')
  if(process.env.MAP_TEST_SCREENSHOT){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.MAP_TEST_SCREENSHOT,Buffer.from(result.data,'base64'))}
  assert.equal(exceptions.length,0,exceptions.join('\n'))
  console.log(JSON.stringify({ok:true,leaflet:true,webglDisabled:withoutWebGL,satelliteDefault:true,drawing:true,vertexDrag:true,basemapPreservesGeometry:true,restoration:true,deletion:true,mobile:true,uncaughtExceptions:exceptions.length},null,2))

} catch (error) {
  console.error(`Map smoke failed: ${error.message}`)
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      const state = await evaluate(`({ loading: document.querySelector('.map-loading')?.textContent, error: document.querySelector('.map-error')?.textContent, canvases: document.querySelectorAll('.world-map-shell canvas').length, editors: document.querySelectorAll('.geoman-controls').length, draft: !!sessionStorage.getItem(${JSON.stringify(draftKey)}) })`)
      console.error(JSON.stringify(state, null, 2))
    } catch { /* Preserve the original failure. */ }
  }
  process.exitCode = 1
} finally {
  await cleanup()
}
