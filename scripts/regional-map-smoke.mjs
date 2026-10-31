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

const appUrl = process.env.MAP_TEST_URL || 'http://localhost:3037/fecoclima-ia/mapa'
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

const esriBasemap=process.env.MAP_TEST_BASEMAP==='esri'
const calls=[]
const geometry={type:'Polygon',coordinates:[[[-55.3,-25.3],[-54.7,-25.3],[-54.7,-24.7],[-55.3,-24.7],[-55.3,-25.3]]]}
const station={id:'station-1',name:'Estación abierta',latitude:-25,longitude:-55,influence_geojson:geometry,influence_radius_m:30000,values:{temperature:27,rain:39,humidity:null},statuses:{temperature:'AVAILABLE',rain:'AVAILABLE',humidity:'NOT_REPORTED'},coverage_pct:{temperature:100,rain:100,humidity:0},latest_at:'2026-10-30T12:00:00Z',stale:false,altitude_m:100}
const fixtureStations=[station,{...station,id:'station-2',name:'Segunda estación',longitude:-54.6,latitude:-24.8},{...station,id:'station-3',name:'Tercera estación',longitude:-55.3,latitude:-24.5},{...station,id:'station-missing',name:'Estación sin sensor',values:{temperature:null,rain:null,humidity:null}}]
const snapshot={reference_at:'2026-10-30T12:00:00Z',from:'2026-10-27T12:00:00Z',window_hours:72,stations:fixtureStations,variables:[{id:'temperature',label:'Temperatura del aire',unit:'°C',minimum:10,maximum:40,available_stations:3,palette:['#2d668f','#bfdb91','#bd654e']},{id:'rain',label:'Lluvia acumulada (72 h)',unit:'mm',minimum:0,maximum:100,available_stations:3,palette:['#2d668f','#bfdb91','#bd654e']},{id:'humidity',label:'Humedad del aire',unit:'%',minimum:0,maximum:100,available_stations:2,palette:['#2d668f','#bfdb91','#bd654e']}],method:'IDW limitado a influencia',limitations:[],source_refresh:[]}
let gets=0
async function intercept(event){
 const url=new URL(event.request.url),path=url.pathname.split('/api/v1')[1]||'';calls.push({path,method:event.request.method,url:event.request.url})
 let value={},status=200,contentType='application/json'
 if(url.hostname==='services.arcgisonline.com'){contentType='image/png'}
 else if(path==='/public/stations')value=fixtureStations
 else if(path==='/public/parcels/browser-session')value={browser_id:'11111111-1111-4111-8111-111111111111',access_token:'fixture',limit:3}
 else if(path==='/public/parcels')value={items:[]}
 else if(path==='/public/map/analyses')value={job_id:'fixture-job',status:'PENDING'}
 else if(path==='/public/map/analyses/fixture-job')value=++gets===1?{job_id:'fixture-job',status:'RUNNING'}:{job_id:'fixture-job',status:'COMPLETED',snapshot}
 else if(path.includes('/terrain/slope/')){status=503;value={detail:'Fuente temporalmente no disponible'}}

 else if(path.endsWith('.png')){contentType='image/png'}
 else if(path==='/public/map/rivers')value={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[-55.1,-25.1],[-54.9,-24.9]]},properties:{name:'Río de prueba'}}]}
 const body=contentType==='image/png'?'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=':Buffer.from(JSON.stringify(value)).toString('base64')
 await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:contentType},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Methods',value:'GET,POST,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'Content-Type,X-Parcel-Access,X-Parcel-Session,X-CSRF-Token'}],body})
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

  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Fetch.requestPaused')void intercept(message.params).catch(error=>exceptions.push(String(error)))})
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*'},...(process.env.MAP_TEST_MOCK_TILES==='1'?[{urlPattern:'*services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/*'}]:[])]})
  await send('Page.navigate',{url:appUrl})
  await waitFor(()=>evaluate(`document.querySelectorAll('.regional-map .leaflet-marker-icon').length===4`),'station locations without analysis')
  assert.equal(calls.filter(c=>c.path==='/public/map/analyses'&&c.method==='POST').length,0,'No source refresh on opening')
  assert(await evaluate(`document.querySelector('.regional-map .leaflet-tile').src.includes('${esriBasemap?'World_Imagery/MapServer/tile/':'s2cloudless_3857'}')`),'Configured satellite default')
  assert.equal(await evaluate(`document.querySelectorAll('.regional-map canvas').length`),0)
  await evaluate(`document.querySelector('.analyze').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.map-panel').textContent.includes('3 de 4 estaciones')`),'72-hour snapshot')
  await waitFor(()=>calls.some(c=>c.path.includes('/tiles/temperature/')),'climate PNG layer')
  await waitFor(()=>evaluate(`document.querySelector('[data-station-value="station-1"]')?.textContent.includes('27')`),'measured values shown on map markers')
  assert(await evaluate(`!document.querySelector('[data-station-value="station-missing"]')&&!document.querySelector('.regional-map').textContent.includes('Sin lectura')`),'Stations without readings are omitted')
  assert(calls.some(c=>c.url.includes('domain=regional')&&c.url.includes('scale=relative')),'Default view compares regional differences')
  await evaluate(`document.querySelector('.leaflet-marker-icon').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.map-panel dl')?.textContent.includes('39')`),'station readings after clicking marker')
  await evaluate(`(()=>{const select=[...document.querySelectorAll('.map-panel select')].find(s=>[...s.options].some(o=>o.value==='rain'));select.value='rain';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await waitFor(()=>evaluate(`document.querySelector('[data-station-value="station-1"]')?.textContent.includes('39')`),'changing variable updates map values')
  assert(await evaluate(`![...document.querySelectorAll('.map-panel select option')].some(o=>o.value==='humidity')`),'Variables with fewer than 3 stations are hidden')
  assert(!calls.some(c=>c.path.includes('/tiles/humidity/')),'Missing sensor never produces a zero-valued raster')
  await evaluate(`(()=>{const select=[...document.querySelectorAll('.map-panel select')].find(s=>[...s.options].some(o=>o.value==='hillshade'));select.value='slope';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await waitFor(()=>evaluate(`document.querySelector('.layer-notice')?.textContent.includes('temporalmente')`),'terrain outage keeps map available')
  assert(await evaluate(`!!document.querySelector('.regional-map .leaflet-container')`))
  await evaluate(`(()=>{const label=[...document.querySelectorAll('.map-panel label')].find(l=>l.textContent.includes('Ríos principales'));label.querySelector('input').click()})()`)
  await waitFor(()=>calls.some(c=>c.path.startsWith('/public/map/rivers')),'open river layer')
  for(let attempt=0;attempt<8;attempt++){await evaluate(`document.querySelector('.regional-map .leaflet-control-zoom-in').click()`);await pause(400)}
  assert(!calls.some(c=>c.path.startsWith('/public/map/imagery')),'Zoom keeps the clear general basemap without detailed imagery requests')
  assert(await evaluate(`!document.querySelector('.detail-status')`),'No detailed coverage or mosaic controls')
  assert(await evaluate(`!!document.querySelector('img.leaflet-tile[src*="${esriBasemap?'World_Imagery/MapServer/tile/':'s2cloudless_3857'}"]')`),'General satellite basemap remains visible when zooming')
  assert.equal(calls.filter(c=>c.path==='/public/map/analyses'&&c.method==='POST').length,1)
  assert(!calls.some(c=>/maptiler/i.test(c.url)),'No MapTiler service')
  assert(await evaluate(`document.querySelector('.leaflet-control-attribution').textContent.includes('${esriBasemap?'Esri':'EOxCloudless'}')`),'Selected basemap keeps its required attribution')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await reload()
  await waitFor(()=>evaluate(`!!document.querySelector('.map-panel dl')||document.querySelector('.map-panel').textContent.includes('3 de 4 estaciones')`),'restored analysis after reload')
  assert.equal(calls.filter(c=>c.path==='/public/map/analyses'&&c.method==='POST').length,1,'Reload reuses snapshot without refreshing sources')
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'Mobile map fits the viewport')
  assert.equal(exceptions.length,0,exceptions.join('\n'))
  if(process.env.MAP_TEST_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.MAP_TEST_SCREENSHOT,Buffer.from(shot.data,'base64'))}
  console.log(JSON.stringify({ok:true,webglDisabled:withoutWebGL,stations:true,snapshot72h:true,clickStation:true,missingSensor:true,terrainOutage:true,rivers:true,restoreWithoutSync:true,mobile:true,uncaughtExceptions:0},null,2))
} catch(error){console.error(error);if(socket?.readyState===WebSocket.OPEN)console.error(await evaluate(`document.body.innerText.slice(-4000)`));process.exitCode=1}finally{await cleanup()}
