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
    const shell = document.querySelector('.world-map-shell')
    const canvas = shell?.querySelector('canvas.maplibregl-canvas')
    const draw = [...(shell?.querySelectorAll('.map-tools button') || [])].find(b => /Dibujar parcela|Editar vértices|Terminar edición/.test(b.textContent))
    const counts = { canvases: shell?.querySelectorAll('canvas.maplibregl-canvas').length, editors: shell?.querySelectorAll('.geoman-controls').length }
    return canvas?.width && !shell.querySelector('.map-loading') && draw && !draw.disabled && counts.canvases === 1 && counts.editors === 1 ? counts : false
  })()`), 'map canvas and ready Geoman controls', 45_000)
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

async function compatibleReady() {
  return waitFor(() => evaluate(`!!document.querySelector('.world-map-shell.compatibility-mode .map-tile') && !document.querySelector('.world-map-shell .map-loading')`), 'CPU map without WebGL')
}

async function compatibilityTest() {
  await compatibleReady()
  assert(await evaluate(`document.querySelector('.compatibility-mode .coordinate-summary').textContent.includes('-25.300700')`), 'Missing coordinates must keep the initial view in Paraguay, not at 0,0')
  await evaluate(`(()=>{document.querySelector('.world-map-shell').scrollIntoView({block:'start'}); [...document.querySelectorAll('.editor-toolbar button')].find(b=>b.textContent.includes('Dibujar polígono')).click()})()`)
  await pause(400)
  const points = await evaluate(`(()=>{const r=document.querySelector('.compatibility-mode .map').getBoundingClientRect();return [[.4,.35],[.65,.35],[.65,.6],[.4,.6]].map(([x,y])=>({x:r.x+r.width*x,y:r.y+r.height*y}))})()`)
  for (const point of points) await click(point)
  const drawn = await waitFor(async()=>{const draft=await savedDraft();return draft?.geojson && draft}, 'CPU polygon session')
  const vertex = await evaluate(`(()=>{const r=document.querySelector('.compatibility-mode [data-vertex-index="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await mouse('mousePressed',vertex,{button:'left',clickCount:1})
  for(let step=1;step<=5;step++){await mouse('mouseMoved',{x:vertex.x+step*4,y:vertex.y+step*2},{button:'left',buttons:1});await pause(30)}
  await mouse('mouseReleased',{x:vertex.x+20,y:vertex.y+10},{button:'left',clickCount:1})
  const edited=await waitFor(async()=>{const draft=await savedDraft();return draft?.geojson && JSON.stringify(draft.geojson)!==JSON.stringify(drawn.geojson) && draft},'CPU vertex editing')
  await reload()
  await compatibleReady()
  assert.deepEqual((await savedDraft()).geojson,edited.geojson)
  await waitFor(()=>evaluate(`document.querySelectorAll('.compatibility-mode [data-vertex-index]').length>=3`),'CPU polygon restoration')
  await evaluate(`[...document.querySelectorAll('.editor-toolbar button')].find(b=>b.textContent.includes('Limpiar')).click()`)
  await waitFor(()=>evaluate(`!!document.querySelector('[role="dialog"]')`),'CPU deletion warning')
  await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
  await waitFor(async()=>await savedDraft()===null,'CPU polygon deletion')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await reload()
  await compatibleReady()
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'CPU mobile horizontal overflow')
  assert.equal(await evaluate(`document.querySelectorAll('.world-map-shell canvas').length`),0)
  assert.equal(exceptions.length,0,'CPU map must not throw browser errors')
  console.log(JSON.stringify({ok:true,webgl:false,compatibleMap:true,drawing:true,vertexDrag:true,restoration:true,deletion:true,mobile:true,uncaughtExceptions:0},null,2))
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
  if (withoutWebGL) {
    await compatibilityTest()
  } else {
  await ready()
  assert(await evaluate(`document.querySelector('.map-tools [aria-label="Tipo de mapa"] button.active')?.textContent==='Satélite'`),'Satellite background is the initial public basemap')
  await evaluate(`document.querySelector('.world-map-shell').scrollIntoView({ block: 'center' })`)
  await pause(400)
  await clickButton('Dibujar parcela')
  const drawing = await evaluate(`(() => {
    const r = document.querySelector('.world-map-shell canvas.maplibregl-canvas').getBoundingClientRect()
    return {
      points: [[.43,.36],[.67,.36],[.67,.56],[.43,.56]].map(([x,y]) => ({x:r.x+r.width*x, y:r.y+r.height*y})),
      firstVertexOffset: { x:r.width*(.43-.5), y:r.height*(.36-.5) }
    }
  })()`)
  const { points } = drawing
  for (const point of [...points, points[0]]) await click(point)
  const drawn = await waitFor(async () => {
    const draft = await savedDraft()
    return draft?.geojson && draft
  }, 'drawn polygon in sessionStorage')
  const ring = drawn.geojson.type === 'Polygon' ? drawn.geojson.coordinates[0] : drawn.geojson.coordinates[0][0]
  assert(ring.length >= 4, 'Drawn polygon needs a closed ring')
  assert.deepEqual(ring[0], ring.at(-1), 'Drawn ring must be closed')
  assert(ring.every((point) => point.length >= 2 && point.every(Number.isFinite)), 'Coordinates must be finite')
  const areaText = await evaluate(`document.querySelector('.parcel-area-summary')?.textContent || ''`)
  assert(areaText.includes('Superficie de su parcela'), 'Parcel surface area card is visible; numeric coverage is checked by the mocked workspace smoke')

  // Creation enters edit mode; drag the first real vertex at its screen position.
  await waitFor(() => evaluate(`!![...document.querySelectorAll('.map-tools button')].find(b => b.textContent.trim() === 'Terminar edición')`), 'automatic vertex editing')
  // Coverage notices may move the map in the document after creation.
  await pause(1000)
  await evaluate(`document.querySelector('.world-map-shell').scrollIntoView({ block: 'center' })`)
  await pause(300)
  const vertex = await evaluate(`(() => {
    const r = document.querySelector('.world-map-shell canvas.maplibregl-canvas').getBoundingClientRect()
    // MapLibre keeps the camera center and pixel scale when its canvas resizes.
    return { x: r.x + r.width / 2 + ${drawing.firstVertexOffset.x}, y: r.y + r.height / 2 + ${drawing.firstVertexOffset.y} }
  })()`)
  await mouse('mouseMoved', vertex)
  await mouse('mousePressed', vertex, { button: 'left', clickCount: 1 })
  for (let step = 1; step <= 6; step++) {
    await mouse('mouseMoved', { x: vertex.x + step * 4, y: vertex.y + step * 3 }, { button: 'left', buttons: 1 })
    await pause(50)
  }
  await mouse('mouseReleased', { x: vertex.x + 24, y: vertex.y + 18 }, { button: 'left', clickCount: 1 })
  const edited = await waitFor(async () => {
    const draft = await savedDraft()
    return draft?.geojson && JSON.stringify(draft.geojson) !== JSON.stringify(drawn.geojson) && draft
  }, 'dragged vertex persisted to sessionStorage')

  await clickButton('Pantalla completa')
  await waitFor(()=>evaluate(`document.fullscreenElement?.classList.contains('world-map-component')`),'fullscreen map with its controls')
  await evaluate(`document.querySelector('.map-tool-button.clear').click()`)
  await waitFor(()=>evaluate(`document.fullscreenElement?.contains(document.querySelector('[role="dialog"]'))`),'confirmation is visible inside fullscreen')
  await evaluate(`document.querySelector('[role="dialog"] .btn-light').click()`)
  await evaluate(`document.exitFullscreen()`)
  await waitFor(()=>evaluate(`!document.fullscreenElement`),'return from fullscreen')
  await reload()
  const restored = await ready()
  assert.deepEqual((await savedDraft())?.geojson, edited.geojson, 'Reload must preserve the edited geometry')
  await waitFor(() => evaluate(`!!document.querySelector('.parcel-area-summary')`), 'restored parcel area')
  await evaluate(`document.querySelector('.world-map-shell').scrollIntoView({ block: 'center' })`)
  await pause(300)
  await clickButton('Borrar polígono')
  await waitFor(()=>evaluate(`!!document.querySelector('[role="dialog"]')`),'deletion warning')
  await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
  await waitFor(async () => (await savedDraft()) === null, 'deleted draft removed from sessionStorage')
  assert.equal(await evaluate(`document.querySelector('.parcel-area-summary') === null`), true, 'Deleting must clear the parcel area')

  let mobile
  if (process.env.MAP_TEST_MOBILE !== '0') {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await reload()
    await ready()
    mobile = await evaluate(`({ viewport: innerWidth, width: document.documentElement.scrollWidth, canvas: document.querySelector('.world-map-shell canvas.maplibregl-canvas').width })`)
    assert(mobile.width <= mobile.viewport + 1, 'Mobile layout must not overflow horizontally')
    assert(mobile.viewport <= 391, 'Mobile viewport must remain at 390px')
  }
  if (process.env.MAP_TEST_SCREENSHOT) {
    const result = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(process.env.MAP_TEST_SCREENSHOT, Buffer.from(result.data, 'base64'))
  }
  assert.equal(exceptions.length, 0, `Uncaught browser exceptions: ${exceptions.length}`)
  console.log(JSON.stringify({ ok: true, mapReady: true, drawing: true, satelliteDefault: true, fullscreen: true, surfaceArea: areaText.trim(), vertexDrag: true, reload: restored, deletion: true, mobile, uncaughtExceptions: exceptions.length }, null, 2))
  }
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
