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

const appUrl = process.env.MAP_TEST_URL || 'http://localhost:3037/fecoclima-ia'
const draftKey = 'fecoclima-parcel-draft'
const withoutWebGL = process.env.MAP_TEST_DISABLE_WEBGL === '1'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let chrome, profile, socket, targetId, cdpBase
const pending = new Map()
const events = new Map()
const exceptions = []
let sequence = 0
let cancelledTileRequests = 0
let photoChatPosts = 0

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

async function reloadPage() {
 const previous=await evaluate('window.__fecoclimaSmokeDocument')
 await send('Page.reload',{ignoreCache:true})
 await waitFor(()=>evaluate(`!!window.__fecoclimaSmokeDocument && window.__fecoclimaSmokeDocument!==${JSON.stringify(previous)}`),'new browser document after reload')
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

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15_000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? {sessionId} : {}) }))
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

const polygon = {type:'Polygon',coordinates:[[[-57.65,-25.31],[-57.62,-25.31],[-57.62,-25.29],[-57.65,-25.31]]]}
const station = {id:'station-1',name:'Estación prueba',map_color:'#9b5de5',latitude:-25.3,longitude:-57.63,influence_geojson:polygon}
const user = {id:'user-1',name:'Productor de prueba',email:'test@example.com',role:'productor'}
const draft = {name:'Lote Norte',producer_name:'Productor de prueba',producer_document:'1234567',crop_id:'crop-1',planting_date:'2026-09-01',geojson:polygon}
const spectralLegend={version:'client-annex-v1',source:'Anexo técnico del cliente',classes:[{label:'≤ 0,3',color:'#FF2200'},{label:'> 0,3 a 0,4',color:'#FF9900'},{label:'> 0,4 a 0,5',color:'#FFFF00'},{label:'> 0,5 a 0,6',color:'#7AAB00'},{label:'> 0,6',color:'#006100'}]}
const reclLegend={...spectralLegend,formula:'B07 / B05 − 1',classes:spectralLegend.classes.map((entry,index)=>({...entry,label:index===0?'≤ 1':index===4?'> 4':`> ${index} a ${index+1}`}))}
const spectralScene={index_legends:{ndvi:spectralLegend,recl:reclLegend},index_visual_versions:{ndvi:'client-annex-v1',recl:'client-annex-v1'},visual_grid:{output_resolution_m:5,native_resolution_m:[10,20]},id:'scene-test',captured_at:'2026-10-19T12:00:00Z',ndvi:0.25,indices:{ndvi:0.25,recl:4.5},index_images:{ndvi:'/public/test-scene/ndvi.png',recl:'/public/test-scene/ndvi.png'},image_available:false}
const spectralHistory=[spectralScene,{...spectralScene,id:'scene-before',captured_at:'2026-10-19T11:00:00Z',ndvi:0.45,indices:{ndvi:0.45}},{...spectralScene,id:'scene-september',captured_at:'2026-09-28T12:00:00Z'},{...spectralScene,id:'scene-expired',captured_at:'2026-09-20T12:00:00Z'}]
const newestSpectralScene={...spectralScene,id:'scene-newest',captured_at:'2026-10-20T12:00:00Z',ndvi:0.65,indices:{ndvi:0.65}}
const csrf = 'parcel-test-csrf'
let extraParcels=[],selectedLoads=[]
let parcel, deletedParcel, deleteCalls=0, failDelete=false, analyses=0, creations=0, refreshes=0, expired=false, authCalls=0, offline=false, previousSession
const interpretations=[]
let previewRequests=0
let forcedPreviewRequests=0, satelliteRefreshes=0
let selectedPeriod=72
let selectedAnalysisScene=spectralScene
const analysisObservationIds=[]
const analysisPeriods=[]
const interpretationPeriods=[]
let labelResponses=0
let hdTested=false
function snapshot(){
 const alert={level:'MODERADA',conditions_met:3,conditions_total:6,confidence_pct:99,completion_percentage:100,conditions:[{key:'humidity',label:'Humedad relativa',status:'met',value:85,unit:'%'}],diseases:[]}
 const row={station_id:station.id,hours:72,samples:72,expected_samples:72,completeness_pct:100,values:{},rule_values:{},alert,quality:{completion_percentage:100,record_completeness_percentage:100,variable_completeness_percentage:100,missing_variables:[],outliers:0}}
 return {id:`analysis-${analyses}`,plot_id:parcel.id,created_at:'2026-10-19T12:05:00Z',reference_at:'2026-10-19T12:00:00Z',agent_results:{},context:{alert_scale:'six-conditions-v2',plot:parcel,crop:{id:'crop-1',code:'TRIGO',name:'Trigo'},station_influences:[{station_id:station.id,name:station.name,coverage_pct:100,distance_m:1250}],spatial_coverage_pct:100,raw_readings:[{station_id:station.id,name:station.name,reading:{sampled_at:'2026-10-19T12:00:00Z',temperature_c:25,humidity_pct:85,soil_moisture_pct:analyses===2?null:69,soil_temperature_c:22,rain_mm:2},sensor_units:{soil_moisture_pct:'cb'},soil_tension:analyses===2?null:{value:69,unit:'cb',position_pct:34.5,band_index:3,label:'Suelo seco',description:'Revise el suelo.',bands:[{min:0,max:10,label:'Suelo saturado',description:'Agua abundante',color:'#48a6d5'},{min:60,max:100,label:'Suelo seco',description:'Revise humedad',color:'#f49a40'}]}}],selected_window_hours:selectedPeriod,windows:{[selectedPeriod]:{hours:selectedPeriod,stations:[{...row,hours:selectedPeriod}],level:'MODERADA',representative_alert:alert}},phenology:{stage_name:'Vegetativo',days_after_planting:48,stage_progress_pct:45,timeline:[]},satellite:selectedAnalysisScene,satellite_selection:{mode:'selected',observation_id:selectedAnalysisScene.id},radar:null,inspection_point:{latitude:-25.3,longitude:-57.63,maps_url:'https://www.google.com/maps'},forecast:{status:'NOT_AVAILABLE',days:[]},historical_regression:[],limitations:[]}}
}
async function intercept(params,sessionId){
 const sessionSend=(method,params)=>send(method,params,sessionId)
 const rawPath=new URL(params.request.url).pathname.replace(/^.*\/api\/v1/,'')
 const path=rawPath.replace(/^\/public\/parcels(?=\/|$)/,'/parcels')
 if(path.startsWith('/auth/'))authCalls++
 const method=params.request.method
 if(process.env.MAP_TEST_MOCK_TILES==='1' && new URL(params.request.url).hostname==='tiles.maps.eox.at'){
  await sessionSend('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Access-Control-Allow-Origin',value:'*'}],body:params.request.url.includes('overlay_')?'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=':'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGNgWJXyH4xhDABEeAg1bIW/fgAAAABJRU5ErkJggg=='});return
 }
 if(path==='/tiles/satellite-v4/tiles.json'){
  const metadata={tiles:['http://localhost:8000/api/v1/public/test-scene/ndvi.png?z={z}&x={x}&y={y}'],maxzoom:20,attribution:'Proveedor de prueba'}
  await sessionSend('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin}],body:Buffer.from(JSON.stringify(metadata)).toString('base64')});return
 }
 if(path==='/public/test-scene/ndvi.png'&&method==='GET'){
  await sessionSend('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin},{name:'Access-Control-Allow-Credentials',value:'true'}],body:'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGNgWJXyH4xhDABEeAg1bIW/fgAAAABJRU5ErkJggg=='});return
 }
 let result={}, status=200
 if(method==='OPTIONS')result={}
 else if(path==='/parcels/browser-session')result={browser_id:'11111111-1111-4111-8111-111111111111',access_token:'public-test-browser-capability',limit:3}
 else if(path==='/auth/session')result={user,refresh_available:false}
 else if(path==='/auth/refresh'){refreshes++;expired=false;result=user}
 else if(path==='/public/stations')result=[station]
 else if(path==='/public/crops')result=[{id:'crop-1',code:'TRIGO',name:'Trigo'}]
 else if(path==='/public/parcel-imagery' && method==='POST'){previewRequests++;if(new URL(params.request.url).searchParams.get('force')==='true')forcedPreviewRequests++;await pause(1400);assert(Object.keys(params.request.headers).some(key=>key.toLowerCase()==='x-parcel-session'));result={id:'preview-1',status:'PROCESSING',history:forcedPreviewRequests?[newestSpectralScene,...spectralHistory]:[],satellite:forcedPreviewRequests?newestSpectralScene:null,area_ha:50,message:'Buscando una escena útil.'}}
 else if(path==='/public/parcel-imagery/preview-1' && method==='GET')result={id:'preview-1',status:'AVAILABLE',history:forcedPreviewRequests?[newestSpectralScene,...spectralHistory]:spectralHistory,satellite:forcedPreviewRequests?newestSpectralScene:spectralScene,area_ha:50,message:'Escena de prueba disponible.'}
 else if(path==='/public/parcel-coverage')result={area_ha:50,coverage_pct:100,eligible:true,station_influences:[{station_id:station.id,name:station.name,coverage_pct:100}]}
 else if(path==='/parcels' && method==='GET'){if(offline){status=503;result={detail:'Sin conexión de prueba'}}else if(expired){status=401;result={detail:'Sesión no autenticada'}}else result={items:[parcel,...extraParcels].filter(Boolean),session_quota:{count:[parcel,...extraParcels].filter(Boolean).length,limit:3}}}
 else if(/^\/parcels\/[^/]+$/.test(path)&&method==='DELETE'){
  if(failDelete){status=503;result={detail:'Borrado no disponible temporalmente'}}
  else {const id=path.split('/').pop();deleteCalls++;if(parcel?.id===id){deletedParcel=parcel;parcel=null}else extraParcels=extraParcels.filter(row=>row.id!==id);result={ok:true}}
 }
 else if(/^\/parcels\/[^/]+$/.test(path)&&method==='PUT'){
  const id=path.split('/').pop(),updated={...[parcel,...extraParcels].find(row=>row.id===id),...JSON.parse(params.request.postData)}
  if(parcel.id===id)parcel=updated;else extraParcels=extraParcels.map(row=>row.id===id?updated:row)
  result=updated
 }
 else if(path==='/parcels' && method==='POST'){
  const session=Object.entries(params.request.headers).find(([key])=>key.toLowerCase()==='x-parcel-session')?.[1]
  assert.match(session,/^[0-9a-f-]{36}$/i)
  if(previousSession)assert.equal(session,previousSession)
  previousSession=session;creations++
  parcel={...JSON.parse(params.request.postData),id:'parcel-1',browser_session_id:session,area_ha:50,latitude:-25.3,longitude:-57.63}
  result=parcel
 }
 else if(path.endsWith('/satellite/history'))result={items:spectralHistory}
 else if(path.endsWith('/satellite/refresh') && method==='POST'){satelliteRefreshes++;result={status:'PROCESSING'}}
 else if(path.endsWith('/satellite-status'))result={status:'AVAILABLE',satellite:null,message:'Datos de prueba disponibles'}
 else if(path.endsWith('/refresh'))result={status:'NO_JOBS'}
 else if(path.endsWith('/analyses')){const body=JSON.parse(params.request.postData);selectedPeriod=body.window_hours;assert([60,72,96,120].includes(selectedPeriod));selectedAnalysisScene=[newestSpectralScene,...spectralHistory].find(scene=>scene.id===body.satellite_observation_id);assert(selectedAnalysisScene,'Analysis must receive the selected observation ID');analysisObservationIds.push(body.satellite_observation_id);analysisPeriods.push(selectedPeriod);analyses++;const current=snapshot();if(analyses>=2)await pause(1800);result=current}
 else if(path.endsWith('/analyses/latest')){
  const id=path.split('/')[2];selectedLoads.push(id)
  if(process.env.MAP_TEST_MULTI_PARCEL==='1'&&extraParcels.length){
   const row=[parcel,...extraParcels].find(item=>item.id===id),value=snapshot()
   result={...value,id:`saved-analysis-${id}`,plot_id:id,context:{...value.context,plot:row}}
  } else result=parcel && parcel.id===id ? snapshot() : null
  if(offline){status=503;result={detail:'Sin conexión de prueba'}}
 }

 else if(path.endsWith('/alert-rules'))result={items:[]}
 else if(path.endsWith('/chat')){
  result={messages:[]}
  if(method==='POST'){
   photoChatPosts++
   const multipart=params.request.postData || ''
   assert(multipart.includes('name="images"'),'Photo included in multipart request')
   assert(multipart.includes('cultivo-grande.jpg'),'Large camera photo optimized to JPEG')
   const contentLength=Object.entries(params.request.headers).find(([key])=>key.toLowerCase()==='content-length')?.[1]
   if(contentLength)assert(Number(contentLength)<4*1024*1024,'Prepared request stays below upload limit')
   await pause(300)
   if(photoChatPosts===1){status=413;result={detail:'Error de tamaño simulado para comprobar reintento'}}
   else result={images_processed:true,messages:[{role:'user',content:'Así está mi cultivo'},{role:'assistant',content:'Recibí la fotografía.'}]}
  }
 }
 else if(path.endsWith('/interpret')){const {purpose,window_hours,view_mode}=JSON.parse(params.request.postData);interpretations.push(purpose);interpretationPeriods.push(window_hours);assert.equal(window_hours,selectedPeriod);result={purpose,window_hours,view_mode,status:'completed',markdown:`Agente ${purpose}: interpretación verificada`,sources:[]}}
 if(rawPath.startsWith('/public/parcels') && !path.endsWith('/browser-session') && method!=='OPTIONS'){
  assert.equal(Object.entries(params.request.headers).find(([key])=>key.toLowerCase()==='x-parcel-access')?.[1],'public-test-browser-capability')
 }
 await sessionSend('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'Content-Type,X-CSRF-Token,X-Parcel-Session,X-Parcel-Access,X-Chat-Browser'}],body:Buffer.from(JSON.stringify(result)).toString('base64')})
}
try {
 cdpBase=await startChrome()
 const target=await(await fetch(`${cdpBase}/json/new?about:blank`,{method:'PUT'})).json()
 targetId=target.id;socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
 socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data)
  if(message.id){const call=pending.get(message.id);if(!call)return;clearTimeout(call.timer);pending.delete(message.id);message.error?call.reject(new Error(message.error.message)):call.resolve(message.result)}
  else if(message.method==='Fetch.requestPaused')void intercept(message.params,message.sessionId).catch(error=>{if(/Invalid InterceptionId/.test(String(error)))cancelledTileRequests++;else exceptions.push(String(error));send('Fetch.failRequest',{requestId:message.params.requestId,errorReason:'Failed'},message.sessionId).catch(()=>{})})
  else if(message.method==='Network.responseReceived'&&(/overlay_bright_3857|tiles.openfreemap.org\/(?:planet|fonts)/.test(message.params.response.url))&&message.params.response.status===200)labelResponses++
  else if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
  else if(message.method==='Runtime.consoleAPICalled'&&process.env.MAP_TEST_DEBUG)console.error('Browser:',JSON.stringify(message.params.args.map(arg=>arg.value||arg.preview?.properties||arg.description)).replace(/https?:[^\s"\\]+/g,'[URL]'))
 })
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
 await send('Emulation.setTimezoneOverride',{timezoneId:'America/Costa_Rica'})
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__fecoclimaSmokeDocument=crypto.randomUUID()'})
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false})
 // Deliberately run with no account, refresh or CSRF cookies.
 const {identifier:draftScriptId}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`document.cookie='fecoclima_parcel_session=00000000-0000-4000-8000-000000000001; Path=/; SameSite=Lax';localStorage.setItem('fecoclima-session-parcels:00000000-0000-4000-8000-000000000001','["deleted-1","deleted-2","deleted-3"]');sessionStorage.setItem('fecoclima-parcel-draft',${JSON.stringify(JSON.stringify(draft))})`})
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*'},{urlPattern:'*api.maptiler.com/tiles/satellite-v4/tiles.json*'},...(process.env.MAP_TEST_MOCK_TILES==='1'?[{urlPattern:'*tiles.maps.eox.at/wmts/*'}]:[])]})
 await send('Page.navigate',{url:appUrl})
 await waitFor(()=>evaluate(`!!document.querySelector('.analyze-map') && !document.querySelector('.analyze-map').disabled`),'restored parcel and coverage')
 await waitFor(()=>evaluate(`!!document.querySelector('.imagery-preview-status .satellite-loading')`),'modern loading appears immediately for polygon imagery')
 assert(await evaluate(`document.querySelector('.imagery-preview-status').getAttribute('aria-busy')==='true'`),'Satellite loading announces busy state')
 assert(await evaluate(`document.querySelector('.analyze-map').textContent.trim()==='Análisis IA' && !document.querySelector('.last-analysis-time')`),'Initial analysis action is concise and has no fabricated timestamp')
 assert(await evaluate(`!document.body.innerText.includes('Ingresar para analizar')&&!document.body.innerText.includes('Inicie sesión como productor')`),'The public portal never asks for a login')
 assert(await evaluate(`(()=>{const menu=document.querySelector('.map-frame .map-controls-menu'),map=document.querySelector('.map-frame .world-map-shell');const sidebar=menu.closest('.map-sidebar-controls').getBoundingClientRect(),canvas=map.getBoundingClientRect();return menu.open && sidebar.right<=canvas.left && Math.abs(sidebar.width*3-canvas.width)<10})()`),'Compact controls occupy three columns beside the nine-column map')
 const mapWidthBeforeHiding=await evaluate(`document.querySelector('.map-frame .world-map-shell').getBoundingClientRect().width`)
 const draftBeforeHiding=await evaluate(`sessionStorage.getItem('fecoclima-parcel-draft')`)
 await evaluate(`document.querySelector('.map-frame .map-menu-toggle').click()`)
 await waitFor(()=>evaluate(`document.querySelector('.map-frame .world-map-shell').getBoundingClientRect().width>${mapWidthBeforeHiding}*1.25 && getComputedStyle(document.querySelector('.map-frame .map-sidebar-controls')).display==='none'`),'Hide menu expands map to full width')
 assert(await evaluate(`document.querySelector('.map-frame .map-menu-toggle').getAttribute('aria-expanded')==='false' && document.querySelector('.map-frame .map-menu-toggle').textContent.includes('Mostrar menú')`),'Restore menu button stays available')
 assert.equal(await evaluate(`sessionStorage.getItem('fecoclima-parcel-draft')`),draftBeforeHiding,'Map expansion preserves the polygon draft')
 assert(await evaluate(`document.querySelector('.map-frame .map-menu-toggle').getBoundingClientRect().right<=document.querySelector('.map-frame .world-map-shell').getBoundingClientRect().left`),'Collapsed controls leave a restore tab on the left edge')
 if(process.env.MAP_TEST_EXPANDED_MAP_SCREENSHOT){await evaluate(`(()=>{document.querySelector('.map-frame').scrollIntoView({block:'start'});window.scrollBy(0,-90)})()`);await pause(200);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_EXPANDED_MAP_SCREENSHOT,Buffer.from(shot.data,'base64'))}

 await evaluate(`document.querySelector('.map-frame .map-menu-toggle').click()`)
 await waitFor(()=>evaluate(`Math.abs(document.querySelector('.map-frame .world-map-shell').getBoundingClientRect().width-${mapWidthBeforeHiding})<2 && getComputedStyle(document.querySelector('.map-frame .map-sidebar-controls')).display!=='none'`),'Show menu restores three/nine column layout')
 await evaluate(`document.querySelector('.map-frame .map-controls-menu').open=true`)
 await waitFor(()=>previewRequests>0,'satellite request starts at polygon drawing')
 await waitFor(()=>evaluate(`!document.querySelector('.new-parcel-button').disabled && document.querySelector('.parcel-selector small').textContent.includes('0/3')`),'server ignores three deleted IDs left in browser cache')
 await waitFor(()=>evaluate(`document.querySelector('.satellite-loading strong')?.textContent.includes('Preparando sus capas')`),'loading persists while Copernicus background job processes')
 await waitFor(()=>evaluate(`!!document.querySelector('.map-frame .imagery-tools')`),'Copernicus layers panel')
 await waitFor(()=>evaluate(`!!document.querySelector('.spectral-history canvas')`),'historical spectral chart')
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.map-frame .map-scene-selector optgroup')].map(group=>group.label)`),['octubre de 2026','septiembre de 2026'])
 assert(await evaluate(`document.querySelectorAll('.map-frame .map-scene-selector option').length===3 && !document.querySelector('.map-frame option[value="scene-expired"]')`),'Only the latest three downloaded scenes appear in controls')
 assert(await evaluate(`(()=>{const options=[...document.querySelectorAll('.map-frame .map-scene-selector option')];return options[0].textContent.includes('19 oct') && options[1].textContent.includes('19 oct') && options[0].textContent.split(' · ').slice(1).join(' · ')!==options[1].textContent && options[0].textContent.includes('UTC') && options[1].textContent.includes('UTC')})()`),'Same-day acquisitions display distinct capture times in the viewer timezone')
 await evaluate(`(()=>{const select=document.querySelector('.map-frame .map-scene-selector select');select.value='scene-before';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await waitFor(()=>evaluate(`document.querySelector('.spectral-meta').textContent.includes('19 oct') && document.querySelector('.spectral-value strong').textContent.includes('0,45')`),'historical scene updates capture date and indices')
 assert.equal(analyses,0,'Changing imagery is visual and does not run AI analysis')
 await evaluate(`document.querySelector('.latest-imagery-button').click()`)
 await waitFor(()=>forcedPreviewRequests===1,'latest preview query bypasses recent completed work')
 await waitFor(()=>evaluate(`!document.querySelector('.latest-imagery-button').disabled && document.querySelector('.map-frame .map-scene-selector select').value==='' && document.querySelector('.spectral-meta').textContent.includes('20 oct') && document.querySelector('.spectral-value strong').textContent.includes('0,65')`),'latest query returns map to newest scene and values')
 assert(await evaluate(`document.querySelectorAll('.map-frame .map-scene-selector option').length===3 && !document.querySelector('.map-frame option[value="scene-september"]')`),'A new scene replaces the oldest visible scene')
 assert(await evaluate(`(()=>{const left=document.querySelector('[aria-labelledby="parcel-crop-heading"]'),right=document.querySelector('[aria-labelledby="parcel-owner-heading"]');return left.textContent.includes('Superficie')&&left.textContent.includes('Cultivo')&&left.textContent.includes('Fecha de siembra')&&right.textContent.includes('Nombre de parcela')&&right.textContent.includes('Cédula')&&right.getBoundingClientRect().left>left.getBoundingClientRect().left})()`),'Agronomy and producer data occupy separate columns')
 assert(await evaluate(`document.querySelector('.coverage-status.covered').getBoundingClientRect().height<30`),'Coverage success is discreet')
 if(process.env.MAP_TEST_CONTROLS_MAP_SCREENSHOT){await evaluate(`(()=>{document.querySelector('.map-frame').scrollIntoView({block:'start'});window.scrollBy(0,-90)})()`);await pause(200);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_CONTROLS_MAP_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 await evaluate(`[...document.querySelectorAll('.map-frame .controls-tabs button')].find(button=>button.textContent.includes('Capas Copernicus')).click()`)
 assert(await evaluate(`(()=>{const panel=document.querySelector('.map-frame .imagery-tools').getBoundingClientRect(),canvas=document.querySelector('.map-frame .world-map-shell').getBoundingClientRect();return !!document.querySelector('.map-frame .map-controls-menu .imagery-tools') && panel.right<=canvas.left})()`),'Copernicus remains in the compact sidebar beside the map')
 await waitFor(()=>evaluate(`document.querySelectorAll('.map-frame .spectral-legend li').length===5`),'five fixed client classes displayed')
 assert(await evaluate(`document.querySelector('.map-frame .spectral-legend li i').style.backgroundColor==='rgb(255, 34, 0)' && document.querySelector('.map-frame .spectral-legend').textContent.includes('0,6')`),'Legend uses client HEX colors and boundaries')
 assert(await evaluate(`document.querySelector('.map-frame .index-explanation').textContent.includes('vegetación activa')`),'Legend explains NDVI in producer language')
 await evaluate(`document.querySelector('.map-frame .imagery-options button[data-layer="recl"]').click()`)
 await waitFor(()=>evaluate(`document.querySelector('.map-frame .spectral-legend li:last-child span').textContent==='> 4' && document.querySelector('.map-frame .spectral-legend').textContent.includes('B07 / B05')`),'ReCl corrected fifth class and formula')
 await evaluate(`document.querySelector('.map-frame .imagery-options button[data-layer="ndvi"]').click()`)
 await evaluate(`(()=>{const range=document.querySelector('.map-frame .imagery-opacity input');range.value='0.35';range.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await waitFor(()=>evaluate(`document.querySelector('.map-frame .imagery-opacity output').textContent==='35%'`),'layer opacity control')
 if(withoutWebGL)assert(await evaluate(`document.querySelector('.map-frame svg.overlay image[opacity]').getAttribute('opacity')==='0.35'`),'CPU renderer applies the same opacity')
 await evaluate(`document.querySelector('.map-frame .imagery-options button[data-layer="none"]').click()`)
 assert(await evaluate(`document.querySelector('.map-frame .imagery-opacity input').disabled`),'No-layer mode disables opacity')
 if(withoutWebGL)assert(await evaluate(`!document.querySelector('.map-frame svg.overlay image[opacity]')`),'No-layer mode removes the imagery overlay')
 await evaluate(`document.querySelector('.map-frame .imagery-options button[data-layer="ndvi"]').click()`)
 assert(await evaluate(`!document.querySelector('.map-frame .imagery-opacity input').disabled && document.querySelector('.map-frame .imagery-opacity output').textContent==='35%'`),'Selecting a layer restores its visibility setting')

 if(!withoutWebGL){
  await waitFor(()=>evaluate(`[...document.querySelectorAll('.map-frame .map-tools button')].some(button=>button.textContent.includes('Editar vértices')&&!button.disabled)`),'restored geometry ready in the WebGL editor');await pause(1000)
  assert(await evaluate(`document.querySelector('.map-frame .map-tool-group button.active')?.textContent.trim()==='Satélite' || (${process.env.MAP_TEST_MULTI_PARCEL==='1'} && !!document.querySelector('.map-frame .map-error.map-warning'))`),'Map preserves satellite or clearly reports the external provider fallback')
  assert(await evaluate(`!document.querySelector('.map-frame .map-error') || (${process.env.MAP_TEST_MULTI_PARCEL==='1'} && !!document.querySelector('.map-frame .map-error.map-warning'))`),'Map remains usable when an external background needs its fallback')
 }
 if(process.env.MAP_TEST_SETUP_SCREENSHOT){await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});await evaluate(`(()=>{document.querySelector('.map-frame').scrollIntoView({block:'start'});window.scrollBy(0,-90)})()`);await pause(300);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_SETUP_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 await evaluate(`[...document.querySelectorAll('.map-frame .controls-tabs button')].find(button=>button.textContent.includes('Vista del mapa')).click()`)
 await evaluate(`(()=>{const select=document.querySelector('.analysis-period');select.value='96';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 assert.equal(analyses,0,'Changing the period does not trigger analysis')
 assert(await evaluate(`document.querySelector('.scroll-toggle').getAttribute('aria-pressed')==='false'`))
 await evaluate(`document.querySelector('.scroll-toggle').click()`)
 await pause(100)
 assert(await evaluate(`(()=>{const target=document.querySelector('.map-frame canvas.maplibregl-canvas')||document.querySelector('.map-frame .polygon-editor .map');const event=new WheelEvent('wheel',{deltaY:-120,clientX:target.getBoundingClientRect().left+100,clientY:target.getBoundingClientRect().top+100,bubbles:true,cancelable:true});target.dispatchEvent(event);return event.defaultPrevented})()`),'Enabled wheel is handled by the map')
 await evaluate(`document.querySelector('.scroll-toggle').click()`)
 assert(await evaluate(`document.querySelector('.scroll-toggle').getAttribute('aria-pressed')==='false'`))
 assert(await evaluate(`(()=>{const icon=document.querySelector('.weather-station-marker img')||document.querySelector('.weather-station-symbol image');return (icon?.getAttribute('src')||icon?.getAttribute('href'))==='/fecoclima-estacion-marcador.svg'})()`),'Client supplied station marker is used')
 if(withoutWebGL || process.env.MAP_TEST_MULTI_PARCEL!=='1')await waitFor(()=>labelResponses>0,'real labels/roads tiles loaded')
 assert(await evaluate(`!!document.querySelector('.weather-station-marker,.weather-station-symbol')`),'Station uses a weather icon')
 assert(await evaluate(`(()=>{const label=document.querySelector('.weather-station-marker span');return label ? label.style.borderLeftColor==='rgb(155, 93, 229)' : document.querySelector('.weather-station-symbol text').getAttribute('fill')==='#9b5de5'})()`),'Station label retains the configured influence color')
 if(withoutWebGL){
  assert(await evaluate(`document.querySelectorAll('.map-frame .labels-tile').length>0`))
  await evaluate(`document.querySelector('.labels-toggle').click()`)
  await waitFor(()=>evaluate(`document.querySelectorAll('.map-frame .labels-tile').length===0`),'labels hidden independently of imagery')
  await evaluate(`document.querySelector('.labels-toggle').click()`)
 }
 if(process.env.MAP_TEST_FORCE_HD==='1')assert(await evaluate(`(()=>{const config=document.querySelector('#__nuxt').__vue_app__?.config.globalProperties.$nuxt?.$config;if(!config)return false;config.public.mapTilerKey='fixture-public-maptiler-key';return true})()`),'Test runtime can expose the HD selector without a real API key')
 if(await evaluate(`[...document.querySelectorAll('.map-frame [aria-label="Tipo de mapa"] button')].some(button=>button.textContent.trim()==='Satélite HD')`)){
  await evaluate(`[...document.querySelectorAll('.map-frame [aria-label="Tipo de mapa"] button')].find(button=>button.textContent.trim()==='Satélite HD').click()`)
  await waitFor(()=>evaluate(`[...document.querySelectorAll('.map-frame [aria-label="Tipo de mapa"] button.active')].some(button=>button.textContent.trim()==='Satélite HD')`),'HD tiles metadata works in current renderer')
  assert(await evaluate(`!!document.querySelector('.maptiler-logo')`),'HD attribution includes provider logo')
  await evaluate(`[...document.querySelectorAll('.map-frame [aria-label="Tipo de mapa"] button')].find(button=>button.textContent.trim()==='Satélite').click()`)
  if(!withoutWebGL)await waitFor(()=>evaluate(`[...document.querySelectorAll('.map-frame .map-tools button')].some(button=>button.textContent.includes('Editar vértices')&&!button.disabled)`),'editor restored after HD change')
  hdTested=true
 }
 await waitFor(()=>evaluate(`!document.querySelector('.analyze-map').disabled`),'coverage validation settled after switching basemaps')
 await evaluate(`(()=>{const select=document.querySelector('.map-frame .map-scene-selector select');select.value='scene-before';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await waitFor(()=>evaluate(`document.querySelector('.spectral-meta').textContent.includes('19 oct')`),'older image selected before the first AI run')
 await evaluate(`document.querySelector('.analyze-map').click()`)
 await waitFor(()=>interpretations.length===4,'all specialist agents and orchestrator')
 await waitFor(()=>evaluate(`document.body.innerText.includes('Agente ORCHESTRATOR: interpretación verificada')`),'orchestrator widget')
 assert.equal(interpretations[3],'ORCHESTRATOR')
 assert.deepEqual(interpretations,['RAG_CROP','WEATHER_ANALYSIS','SATELLITE_ANALYSIS','ORCHESTRATOR'])
 assert.deepEqual(interpretationPeriods,[96,96,96,96])
 await evaluate(`(()=>{const select=document.querySelector('.map-frame .map-scene-selector select');select.value='scene-before';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await waitFor(()=>evaluate(`document.querySelector('.spectral-meta').textContent.includes('19 oct')`),'saved parcel supports historical scenes')
 await evaluate(`document.querySelector('.latest-imagery-button').click()`)
 await waitFor(()=>satelliteRefreshes===1,'saved parcel requests satellite-only refresh')
 await waitFor(()=>evaluate(`!document.querySelector('.latest-imagery-button').disabled && document.querySelector('.spectral-meta').textContent.includes('19 oct')`),'saved parcel returns to latest scene')
 assert.equal(interpretations.length,4,'Historical imagery and latest-scene lookup keep the analysis intact')
 assert(await evaluate(`(()=>{const left=document.querySelector('.alert-summary').getBoundingClientRect(),right=document.querySelector('.alert-evaluation').getBoundingClientRect();return right.left>left.right})()`),'Alert summary and evaluation use two columns')
 assert(await evaluate(`document.querySelector('.diagnosis-timeframes').textContent.includes('96 horas')&&document.querySelector('.diagnosis-timeframes').textContent.includes('3 días')`),'Observed and future horizons are distinct')
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.steps-flow>.widget>.widget-kicker .widget-title')].map(el=>el.textContent.trim().split(' · ')[0])`),['1. Condiciones actuales','2. Tipo de alerta','3. Estado fenológico','4. Análisis de la IA','5. Predicción','6. Chatbot'])
 assert(await evaluate(`document.querySelector('.analyze-map').textContent.trim()==='Nuevo análisis IA' && document.querySelector('.last-analysis-time time').getAttribute('datetime')==='2026-10-19T12:05:00Z'`),'Completed analysis shows its action and actual creation timestamp')
 assert(await evaluate(`!!document.querySelector('.analysis-results-card>.snapshot-line') && document.querySelectorAll('.analysis-results-card .steps-flow>.widget').length===6`),'Situation decorates the card containing all six widgets')
 assert(await evaluate(`!!document.querySelector('.workspace-heading .parcel-selector + .parcel-alerts-button') && document.querySelector('.parcel-alerts-button').getAttribute('href').includes('parcela=')`),'Compact alerts action sits next to the parcel selector')
 assert(await evaluate(`!document.querySelector('.parcel-workspace .viewer-time-note') && document.querySelector('footer .footer-time-zone').textContent.includes('Hora de su dispositivo')`),'Device timezone and explanation live in the footer')
 const analysisCallsBeforeCollapsing=analyses
 for(let number=1;number<=6;number++){
  await evaluate(`document.querySelectorAll('.widget-collapse-toggle')[${number-1}].click()`)
  assert(await evaluate(`(()=>{const button=document.querySelectorAll('.widget-collapse-toggle')[${number-1}],body=document.getElementById(button.getAttribute('aria-controls'));return button.getAttribute('aria-expanded')==='false' && getComputedStyle(body).display==='none' && button.getBoundingClientRect().height>=44})()`),`Widget ${number} collapses while keeping its accessible heading available`)
  await evaluate(`document.querySelectorAll('.widget-collapse-toggle')[${number-1}].click()`)
  assert(await evaluate(`(()=>{const button=document.querySelectorAll('.widget-collapse-toggle')[${number-1}];return button.getAttribute('aria-expanded')==='true' && getComputedStyle(document.getElementById(button.getAttribute('aria-controls'))).display!=='none'})()`),`Widget ${number} reopens`)
 }
 await evaluate(`[...document.querySelectorAll('.widget-collapse-toggle')].forEach(button=>button.click())`)
 assert(await evaluate(`(()=>{const widgets=[...document.querySelectorAll('.steps-flow>.widget')],heights=widgets.map(widget=>widget.getBoundingClientRect().height),insets=widgets.map(widget=>widget.querySelector('.widget-collapse-toggle').getBoundingClientRect().top-widget.getBoundingClientRect().top);return Math.max(...heights)-Math.min(...heights)<1 && Math.max(...insets)-Math.min(...insets)<1})()`),'All six collapsed widgets have equal heights and header insets, including alert and chat')
 await evaluate(`[...document.querySelectorAll('.widget-collapse-toggle')].forEach(button=>button.click())`)
 assert.equal(analyses,analysisCallsBeforeCollapsing,'Collapsing widgets does not rerun the analysis')
 await evaluate(`document.querySelectorAll('.widget-collapse-toggle')[5].click()`)
 assert(await evaluate(`!document.querySelector('.diagnosis .field-review')`),'No routine location link without a recommendation')
 await evaluate(`document.querySelector('.guidance-chat button').click()`)
 assert(await evaluate(`document.querySelectorAll('.widget-collapse-toggle')[5].getAttribute('aria-expanded')==='true' && document.activeElement?.id==='parcel-question' && document.querySelector('#parcel-question').value.includes('priorizar')`),'Guidance opens chat with an editable question')
 await evaluate(`(()=>{const input=document.querySelector('#parcel-question');input.value='Mi consulta pendiente';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.guidance-chat button').click()})()`)
 assert(await evaluate(`document.querySelector('#parcel-question').value==='Mi consulta pendiente'`),'Guidance preserves an existing chat draft')
 assert.equal(photoChatPosts,0,'Opening the chat does not send a message')
 await evaluate(`(()=>{const input=document.querySelector('#parcel-question');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 if(withoutWebGL)await waitFor(()=>evaluate(`document.querySelector('.compatibility-mode .overlay')?.querySelectorAll('g path[fill-rule="evenodd"]:not([data-parcel-id])').length>0`),'CPU influence polygons')
 const draftBefore=await evaluate(`sessionStorage.getItem('fecoclima-parcel-draft')`)
 await evaluate(`document.querySelector('.influence-toggle').click()`)
 await waitFor(()=>evaluate(`document.querySelector('.influence-toggle').getAttribute('aria-pressed')==='false'`),'hidden influence state')
 if(withoutWebGL)await waitFor(()=>evaluate(`document.querySelector('.compatibility-mode .overlay')?.querySelectorAll('g path[fill-rule="evenodd"]:not([data-parcel-id])').length===0`),'hidden CPU influence polygons')
 assert.equal(await evaluate(`sessionStorage.getItem('fecoclima-parcel-draft')`),draftBefore)

 // An instant changes its displayed clock, never its values, age or selected period.
 await waitFor(()=>evaluate(`document.querySelector('.station-identity p')?.textContent.includes('6:00') && document.querySelector('.station-identity p')?.textContent.includes('UTC-6')`),'station reading shown in device Costa Rica time')
 assert(await evaluate(`document.querySelector('.soil-visible .tension-card small').textContent.includes('6:00') && document.querySelector('.soil-visible .tension-card small').textContent.includes('UTC-6')`),'soil reading uses the same local instant and offset')
 assert(await evaluate(`document.querySelector('.reading-timezone').textContent.includes('Costa Rica')`),'zone is explained to the producer')
 const beforeZone={analyses,creations,period:selectedPeriod,condition:await evaluate(`document.querySelector('.condition-meter').textContent`),planting:await evaluate(`document.querySelector('.parcel-setup-column input[type=date]').value`)}
 await send('Emulation.setTimezoneOverride',{timezoneId:'America/Asuncion'})
 await evaluate(`window.dispatchEvent(new Event('focus'))`)
 await waitFor(()=>evaluate(`document.querySelector('.station-identity p')?.textContent.includes('9:00') && document.querySelector('.station-identity p')?.textContent.includes('UTC-3')`),'same reading shown in device Paraguay time')
 assert.equal(analyses,beforeZone.analyses);assert.equal(creations,beforeZone.creations);assert.equal(selectedPeriod,beforeZone.period)
 assert.equal(await evaluate(`document.querySelector('.condition-meter').textContent`),beforeZone.condition)
 assert.equal(await evaluate(`document.querySelector('.parcel-setup-column input[type=date]').value`),beforeZone.planting)
 await send('Emulation.setTimezoneOverride',{timezoneId:'America/Costa_Rica'})
 await evaluate(`window.dispatchEvent(new Event('focus'))`)
 await waitFor(()=>evaluate(`document.querySelector('.soil-visible .tension-card small').textContent.includes('UTC-6')`),'soil and station clocks react to viewer zone without another analysis')
 assert.equal(refreshes,0,'Public workflows never refresh a CMS account');assert.equal(authCalls,0,'Public workflows never request account authentication')
 assert(await evaluate(`document.querySelector('.tension-card').textContent.includes('69')`))
 assert(await evaluate(`document.querySelector('.condition-meter').textContent.includes('3 de 6')`))
 await waitFor(()=>evaluate(`document.querySelector('.parcel-area-summary').textContent.includes('50 ha')`),'polygon surface measurement')
 assert(previewRequests>0,'Imagery is requested before AI analysis')
 assert(await evaluate(`document.querySelector('.station-identity').textContent.includes('Estación prueba')`))
 await evaluate(`[...document.querySelectorAll('summary')].find(el=>el.textContent.includes('calidad de datos')).click()`);assert(await evaluate(`document.body.innerText.includes('Calidad de datos')`))
 await waitFor(()=>evaluate(`!document.querySelector('.analyze-map').disabled`),'analysis ready to repeat')
 await evaluate(`(()=>{const select=document.querySelector('.analysis-period');select.value='60';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await pause(400)
 assert.equal(analyses,1,'Selecting a new period waits for Analizar')
 assert.equal(interpretations.length,4,'Selecting a new period makes no AI calls')
 assert(await evaluate(`document.querySelector('.analyzed-period').textContent.includes('96')`),'Saved widgets keep their actual period until a new analysis')
 await evaluate(`document.querySelector('.analyze-map').click()`)
 await waitFor(()=>evaluate(`!!document.querySelector('.analysis-progress') && !document.querySelector('.steps-flow')`),'old widgets cleared during new analysis')
 assert(await evaluate(`document.querySelector('.analysis-stages').textContent.includes('Sincronizar estaciones')`),'New analysis displays staged progress')
 if(process.env.MAP_TEST_LOADING_SCREENSHOT){await evaluate(`document.querySelector('.analysis-progress').scrollIntoView({block:'center'})`);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_LOADING_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 await waitFor(()=>interpretations.length===8,'second analysis with same parcel')
 await waitFor(()=>evaluate(`!!document.querySelector('.steps-flow')&&!document.querySelector('.analysis-progress')`),'all new widgets ready')
 assert.deepEqual(analysisPeriods,[96,60])
 assert.deepEqual(analysisObservationIds,['scene-before','scene-test'],'Each AI run receives exactly the chosen image')
 assert.deepEqual(interpretationPeriods,[96,96,96,96,60,60,60,60])
 assert(await evaluate(`document.querySelector('.analyzed-period').textContent.includes('60')`))
 assert(await evaluate(`document.querySelector('.current-conditions .tension-card.unavailable')?.textContent.includes('Sin lectura disponible en cb')`),'Missing cb reading keeps the soil scale visible without fabricating a value')
 assert.equal(parcel.id,'parcel-1');assert.equal(analyses,2);assert.equal(creations,1)
 assert(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('fecoclima-session-parcels:')).some(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)))==='["parcel-1"]')`),'Repeated parcel must count once')
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await evaluate(`document.querySelector('.map-frame .map-controls-menu').open=true`)
 await evaluate(`[...document.querySelectorAll('.map-frame .controls-tabs button')].find(button=>button.textContent.includes('Capas Copernicus')).click()`)
 assert(await evaluate(`(()=>{const panel=document.querySelector('.map-frame .map-controls-menu');return panel.getBoundingClientRect().width<=innerWidth && [...panel.querySelectorAll('button')].filter(button=>button.getClientRects().length).every(button=>button.getBoundingClientRect().height>=44)})()`),'Unified layer controls fit mobile and preserve touch targets')
 if(process.env.MAP_TEST_UNIFIED_MOBILE_SCREENSHOT){await evaluate(`(()=>{document.querySelector('.map-frame').scrollIntoView({block:'start'});window.scrollBy(0,-90)})()`);await pause(200);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_UNIFIED_MOBILE_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 await evaluate(`[...document.querySelectorAll('.map-frame .controls-tabs button')].find(button=>button.textContent.includes('Vista del mapa')).click()`)
 await evaluate(`document.querySelector('input[aria-label="Vista móvil"]').click()`)
 await pause(300)
 assert.equal(await evaluate(`document.querySelectorAll('.steps-flow>.widget').length`),6)
 assert.equal(await evaluate(`[...document.querySelectorAll('.steps-flow>.widget')].filter(el=>getComputedStyle(el).display==='none').length`),0,'Mobile mode keeps all six results')
 assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+2`),'No horizontal document overflow on smartphone')
 await evaluate(`document.querySelector('input[aria-label="Vista móvil"]').click()`)
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false})
 const clearExpression=withoutWebGL?`[...document.querySelectorAll('.map-frame .editor-toolbar button')].find(button=>button.textContent.includes('Limpiar')).click()`:`document.querySelector('.map-frame .map-tool-button.clear').click()`
 await evaluate(clearExpression)
 await waitFor(()=>evaluate(`!!document.querySelector('[role="dialog"]')`),'polygon deletion confirmation')
 assert(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('widgets')&&!!document.querySelector('.steps-flow')`),'Warning appears before clearing widgets')
 await evaluate(`document.querySelector('[role="dialog"] .btn-light').click()`)
 assert(await evaluate(`!!document.querySelector('.steps-flow')`),'Cancel keeps the analysis visible')
 await evaluate(`document.querySelector('.analyze-map').click()`)
 await waitFor(()=>analyses===3,'third calculation pending before deleting polygon')
 await evaluate(clearExpression)
 await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
 await waitFor(()=>evaluate(`!document.querySelector('.steps-flow')&&!sessionStorage.getItem('fecoclima-parcel-draft')`),'confirmed deletion clears widgets and polygon draft')
 await pause(2200)
 assert.equal(deleteCalls,1,'Borrar polígono deletes its saved parcel')
 assert.equal(parcel,null)
 assert(await evaluate(`document.querySelector('.parcel-selector small').textContent.includes('0/3') && !document.querySelector('.new-parcel-button').disabled`),'Deleting the polygon frees the quota immediately')
 assert(await evaluate(`!document.querySelector('.steps-flow')&&!document.querySelector('.analysis-progress')`),'A late analysis response does not restore cleared widgets or loading state')
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:draftScriptId})
 await reloadPage()
 await waitFor(()=>evaluate(`!!document.querySelector('.analyze-map')&&!document.querySelector('.map-loading')`),'reload after deletion')
 await pause(400)
 assert(await evaluate(`!document.querySelector('.steps-flow')&&!sessionStorage.getItem('fecoclima-parcel-draft')`),'Deleted draft stays clear after reload until saved parcel is selected')
 if(process.env.MAP_TEST_MULTI_PARCEL==='1'){
  await waitFor(()=>evaluate(`!!document.querySelector('.parcel-selector')`),'authenticated parcel controls after reload')
  assert(await evaluate(`(()=>{const selector=document.querySelector('.parcel-selector'),views=document.querySelector('.view-switch');return selector.closest('.workspace-heading')===views.closest('.workspace-heading')})()`),'Parcel selector sits beside view controls')
  await waitFor(()=>evaluate(`!!document.querySelector('.new-parcel-button') && !document.querySelector('.new-parcel-button').disabled`),'new parcel button hydrated and ready')
  await evaluate(`document.querySelector('.new-parcel-button').click()`)
  await waitFor(()=>evaluate(`!!document.querySelector('.parcel-modal .world-map-component')`),'new parcel modal uses the full WorldParcelMap')
  await waitFor(()=>evaluate(`!!document.querySelector('.parcel-modal .compatibility-mode') || [...document.querySelectorAll('.parcel-modal .map-tools button')].some(button=>button.textContent.includes('Dibujar parcela')&&!button.disabled)`),'modal drawing controls ready')
  assert(await evaluate(`!!document.querySelector('.parcel-modal [aria-label="Tipo de mapa"]') && !!document.querySelector('.parcel-modal input[type="color"]')`),'Modal offers the same map layers and color selection')
  await evaluate(`[...document.querySelectorAll('.parcel-modal button')].find(button=>button.textContent==='Cancelar').click()`)
  parcel={...deletedParcel}
  extraParcels=[2,3].map((number)=>({...parcel,id:`parcel-${number}`,name:`Lote ${number}`,map_color:number===2?'#6366f1':'#f59e0b',browser_session_id:previousSession,geojson:{type:'Polygon',coordinates:polygon.coordinates.map(ring=>ring.map(([lng,lat])=>[lng+(number-1)*0.06,lat]))}}))
  await reloadPage()
  await waitFor(()=>evaluate(`document.querySelectorAll('.map-frame [data-parcel-choice]').length===3`),'all three saved parcels displayed')
  await waitFor(()=>evaluate(`document.querySelector('.new-parcel-button').disabled`),'three parcel browser quota preserved')
  if(withoutWebGL)await waitFor(()=>evaluate(`document.querySelectorAll('.map-frame [data-parcel-id]').length===3`),'all three polygon shapes in CPU renderer')
  else await waitFor(()=>evaluate(`document.querySelectorAll('.map-frame [data-map-parcel-id]').length===3`),'all three polygon features in MapLibre')
  await evaluate(`[...document.querySelectorAll('.map-frame .saved-parcel-legend button')].find(button=>button.textContent==='Ver todas las parcelas').click()`)
  await pause(1000)
  const target=await evaluate(withoutWebGL?`(()=>{const path=document.querySelector('.map-frame [data-parcel-id="parcel-2"]'),box=path.getBoundingClientRect();return {x:box.x+box.width*.75,y:box.y+box.height*.6}})()`:`(()=>{const box=document.querySelector('.map-frame [data-map-parcel-id=\"parcel-2\"]').getBoundingClientRect();return {x:box.x+box.width/2,y:box.bottom+10}})()`)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1})
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="Seleccionar parcela"]').value==='parcel-2' && document.querySelector('.snapshot-line')?.textContent.includes('Situación')`),'click polygon selects its stored analysis')
  assert(selectedLoads.includes('parcel-2'))
  const beforeColor=analyses
  await evaluate(`(()=>{const input=document.querySelector('[aria-label="Color de la parcela seleccionada"]');input.value='#fb7185';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await waitFor(()=>extraParcels[0].map_color==='#fb7185','parcel color saved to API')
  await waitFor(()=>evaluate(`document.querySelector('[data-parcel-choice="parcel-2"] i').style.backgroundColor==='rgb(251, 113, 133)'`),'saved color reflected in map legend')
  assert.equal(analyses,beforeColor,'Selecting or recoloring a parcel never runs a new analysis')
  await evaluate(`document.querySelector('.configure-parcel-button').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.parcel-modal input[type="color"]').value==='#fb7185' && !!document.querySelector('.parcel-modal .world-map-component')`),'editing reuses same map and persisted color')
  await evaluate(`[...document.querySelectorAll('.parcel-modal button')].find(button=>button.textContent==='Cancelar').click()`)
  // A rejected delete keeps the polygon and analysis; a successful delete frees one place.
  failDelete=true
  await evaluate(`document.querySelector('.delete-parcel-button').click()`)
  await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
  await waitFor(()=>evaluate(`document.body.innerText.includes('Borrado no disponible temporalmente')`),'failed deletion displayed')
  assert(await evaluate(`!!document.querySelector('.steps-flow') && document.querySelector('[aria-label="Seleccionar parcela"]').value==='parcel-2'`),'Failed deletion preserves saved selection and widgets')
  failDelete=false
  await evaluate(`document.querySelector('.delete-parcel-button').click()`)
  await evaluate(`document.querySelector('[role="dialog"] .btn-danger').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.parcel-selector small').textContent.includes('2/3') && !document.querySelector('.new-parcel-button').disabled`),'header deletion frees a place')
  assert.equal(extraParcels.length,1)
  assert(await evaluate(`!document.querySelector('.steps-flow')`),'Header deletion clears widgets')
  // An admin deletion outside this browser must also reset the quota on returning.
  deletedParcel=parcel;parcel=null;extraParcels=[]
  await evaluate(`window.dispatchEvent(new Event('focus'))`)
  await waitFor(()=>evaluate(`document.querySelector('.parcel-selector small').textContent.includes('0/3') && document.querySelectorAll('.parcel-selector option').length===1`),'admin deletions reconciled without browser restart')
  // Preparing a new polygon in the modal must not persist a parcel until Analyze.
  const beforeDraft=creations
  await waitFor(()=>evaluate(`!!document.querySelector('.new-parcel-button') && !document.querySelector('.new-parcel-button').disabled`),'new parcel button hydrated and ready')
  await evaluate(`document.querySelector('.new-parcel-button').click()`)
  await waitFor(()=>evaluate(`!!document.querySelector('.parcel-modal .compatibility-mode') || [...document.querySelectorAll('.parcel-modal .map-tools button')].some(button=>button.textContent.includes('Dibujar parcela')&&!button.disabled)`),'new modal map ready')
  await waitFor(()=>evaluate(`!!document.querySelector('.parcel-modal select option[value="crop-1"]')`),'crop options ready before preparing parcel')
  await evaluate(`(()=>{const fields={'Nombre de la parcela':'Lote preparado','Nombre del productor':'Productor de prueba','Cédula de identidad (CI)':'1234567','Cultivo':'crop-1','Fecha de siembra':'2026-09-01'};for(const [name,value] of Object.entries(fields)){const label=[...document.querySelectorAll('.parcel-modal label')].find(label=>label.querySelector('.label')?.textContent.trim()===name);const input=label.querySelector('input,select');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}})()`)
  await evaluate(`(()=>{const selector=${JSON.stringify(withoutWebGL?'.parcel-modal .editor-toolbar button':'.parcel-modal .map-tools button')};[...document.querySelectorAll(selector)].find(button=>button.textContent.includes(${JSON.stringify(withoutWebGL?'Dibujar polígono':'Dibujar parcela')})).click();document.querySelector('.parcel-modal .world-map-shell').scrollIntoView({block:'center'})})()`)
  await pause(400)
  const draftPoints=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(withoutWebGL?'.parcel-modal .map':'.parcel-modal canvas.maplibregl-canvas')}).getBoundingClientRect();return [[.43,.38],[.65,.38],[.65,.58],[.43,.58]].map(([x,y])=>({x:box.x+box.width*x,y:box.y+box.height*y}))})()`)
  for(const point of (withoutWebGL?draftPoints:[...draftPoints,draftPoints[0]])){
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
   await pause(80)
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
   await pause(200)
  }
  await waitFor(()=>evaluate(`document.querySelector('.parcel-modal .map-tool-button.clear') || document.querySelector('.parcel-modal .compatibility-summary')?.textContent.includes('Área aproximada')`),'modal polygon completed')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.parcel-modal .form-fields input:invalid,.parcel-modal .form-fields select:invalid')].map(input=>({label:input.closest('label').textContent.trim(),message:input.validationMessage}))`),[],'Parcel form values are valid before submitting')
  await evaluate(`document.querySelector('.parcel-modal .actions button[type="submit"]').click()`)
  await waitFor(()=>evaluate(`!document.querySelector('.parcel-modal') && document.querySelector('.parcel-area-summary')?.textContent.includes('50 ha')`),'prepared polygon returns to main workspace')
  assert.equal(creations,beforeDraft,'Preparing a polygon does not create a saved parcel')
  assert(await evaluate(`document.querySelector('.parcel-selector small').textContent.includes('0/3')`),'Draft does not consume a place')
  await waitFor(()=>evaluate(`!document.querySelector('.analyze-map').disabled`),'draft ready for first analysis')
  await evaluate(`document.querySelector('.analyze-map').click()`)
  await waitFor(()=>creations===beforeDraft+1 && analyses===4,'first analysis persists the prepared parcel')
  await waitFor(()=>evaluate(`!!document.querySelector('.steps-flow') && !document.querySelector('.analysis-progress')`),'prepared parcel analysis completed')
  assert(await evaluate(`document.querySelector('.parcel-selector small').textContent.includes('1/3')`),'First analysis consumes exactly one place')
  const savedAnalyses=analyses
  await reloadPage()
  await waitFor(()=>evaluate(`!!document.querySelector('.steps-flow') && document.querySelector('.parcel-selector small').textContent.includes('1/3')`),'anonymous parcel widgets persist after reload')
  assert.equal(analyses,savedAnalyses,'Restoring widgets never creates another analysis')
  offline=true
  await reloadPage()
  await waitFor(()=>evaluate(`!!document.querySelector('.steps-flow')`),'browser cached widgets survive API unavailability')
  offline=false
  if(process.env.MAP_TEST_MULTI_SCREENSHOT){await evaluate(`window.scrollTo(0,0)`);await pause(300);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_MULTI_SCREENSHOT,Buffer.from(shot.data,'base64'))}
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(300)
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+2`),'Multi-parcel controls fit mobile width')
  await waitFor(()=>evaluate(`!!document.querySelector('.map-frame .map-controls-menu') && !!document.querySelector('.map-frame .world-map-shell')`),'restored map controls ready on mobile')
  await evaluate(`document.querySelector('.map-frame .map-controls-menu').open=true`)
  assert(await evaluate(`(()=>{const menu=document.querySelector('.map-frame .map-controls-menu');const box=menu.getBoundingClientRect();return box.width<=window.innerWidth && [...menu.querySelectorAll('button')].filter(button=>button.getClientRects().length).every(button=>button.getBoundingClientRect().height>=44)})()`),'Map menu fits mobile with touch targets')
  assert(await evaluate(`document.querySelector('.map-frame .world-map-shell${withoutWebGL?' .map':''}').getBoundingClientRect().height>=420`),'Mobile map remains large enough to interact')
  if(process.env.MAP_TEST_MOBILE_SCREENSHOT){await evaluate(`(()=>{document.querySelector('.map-frame').scrollIntoView({block:'start'});window.scrollBy(0,-90)})()`);await pause(250);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_MOBILE_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 }
 if(process.env.MAP_TEST_CHAT_PHOTO==='1'){
  await evaluate(`(()=>{const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGNgWJXyH4xhDABEeAg1bIW/fgAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([png,new Uint8Array(9*1024*1024)],'cultivo-grande.png',{type:'image/png'}));const input=document.querySelector('.wa-file-picker input[accept^="image/"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));const text=document.querySelector('#parcel-question');text.value='Así está mi cultivo';text.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await waitFor(()=>evaluate(`!document.querySelector('.wa-send').disabled`),'photo ready to send')
  await evaluate(`document.querySelector('.wa-send').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.wa-compose .wa-error')?.textContent.includes('Error de tamaño simulado')`),'upload error visible inside chat')
  assert(await evaluate(`document.querySelector('#parcel-question').value==='Así está mi cultivo' && document.querySelectorAll('.wa-selected .wa-chip').length===1`),'Failed upload preserves draft and photograph')
  await evaluate(`document.querySelector('.wa-send').click()`)
  await waitFor(()=>evaluate(`document.querySelector('.chat-history').textContent.includes('Recibí la fotografía.')`),'retry delivers photo response')
  assert.equal(photoChatPosts,2,'One request per click, including retry')
  assert(await evaluate(`!document.querySelector('.wa-compose .wa-error') && !document.querySelector('.wa-selected')`),'Successful upload clears selected photo and inline error')
 }
 assert.equal(authCalls,0,'Anonymous portal never touches CMS auth');assert.equal(exceptions.length,0,exceptions.join('\n'))
 if(process.env.MAP_TEST_SCREENSHOT && await evaluate(`!!document.querySelector('.steps-flow')`)){await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await evaluate(`document.querySelector('.steps-flow').scrollIntoView()`);await pause(200);const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_SCREENSHOT,Buffer.from(screenshot.data,'base64'))}
 console.log(JSON.stringify({ok:true,cancelledTileRequests,multiParcel:process.env.MAP_TEST_MULTI_PARCEL==='1',backgroundTilesMocked:process.env.MAP_TEST_MOCK_TILES==='1'&&withoutWebGL,hdInCurrentRenderer:hdTested,labels:true,scrollToggle:true,alertColumns:true,distinctHorizons:true,deleteConfirmation:true,clearedWidgets:true,staleResponseIgnored:true,stagedLoading:true,selectedPeriodOnly:true,noCallsUntilAnalyze:true,sixSteps:true,setupColumns:true,discreetCoverage:true,unifiedMapAndLayers:true,layerOpacity:true,clientLegend:true,reclLayer:true,spectralHistory:true,fourThematicCalls:true,influenceToggle:true,identity:true,viewerTimezone:true,unchangedAnalysisOnZoneChange:true,anonymousAccess:true,noAccountRequests:true,browserWidgetCache:true,groupedMapControls:true,parcelReused:true,quotaFreedByDeletion:true,quotaReconciledAfterAdminDeletion:true,satelliteLoading:true,producerIndexExplanation:true,creationOnlyOnAnalyze:true,soilTension:true,trafficLight:true,qualityWidget:true,specialistsBeforeOrchestrator:true,uncaughtExceptions:0}))
}catch(error){console.error(error);try{console.error(await evaluate(`({url:location.href,text:document.body.innerText.slice(-4000)})`));console.error(exceptions)}catch{}process.exitCode=1}
finally{await cleanup()}
