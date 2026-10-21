#!/usr/bin/env node
/**
 * Browser smoke test for CMS navigation, filters, detail forms and mobile layout. Requires Node >=22.12 and Chrome.
 * Start the frontend first, then run `node scripts/cms-admin-smoke.mjs`.
 * All API responses and writes are mocked; no real credentials or records.
 * Optional: MAP_TEST_URL, CHROME_BIN, CHROME_NO_SANDBOX=1,
 * CDP_BASE_URL (reuse Chrome), MAP_TEST_MOBILE=0, MAP_TEST_SCREENSHOT.
 * Uses isolated API fixtures; never writes application records or sends notifications.
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


const csrfToken = 'cms-test-csrf'
const crops=[{id:'crop-wheat',code:'TRIGO',name:'Trigo',planting_months:[5,6],active:true},{id:'crop-soy',code:'SOJA',name:'Soja',planting_months:[9,10,11],active:true}]
const phenologyStages=[]
let soilSaved
const soilCondition={id:'soil-condition',key:'soil',label:'Agua en el suelo',variable:'soil_moisture_avg_pct',operator:'gte',threshold_value:50,unit:'%',aggregation:'daily',required:true,order_index:4,active:true}
const rule={id:'rule-1',crop_id:'crop-wheat',name:'Regla de prueba',version:'1',status:'DRAFT',crop_name:'Trigo',configuration:{}}
const knowledgeDocuments=[]
const polygon={type:'Polygon',coordinates:[[[-55.01,-25.01],[-55,-25.01],[-55,-25],[-55.01,-25],[-55.01,-25.01]]]}
const parcel={id:'parcel',name:'Parcela prueba',crop_id:'crop-wheat',producer_name:'Productor',producer_document:'1234567',planting_date:'2026-06-01',area_ha:100,geojson:polygon,active:true}
const agents=[
 {id:'agro-wheat',code:'AGRO_TRIGO',name:'Experto Trigo',category:'AGRO',category_label:'Agro',crop_id:'crop-wheat',crop_scope:'crop-wheat',crop_name:'Trigo',purpose:'RAG_CROP',provider:'EDGE',model:'gemma',active:true,knowledge_documents:[]},
 {id:'agro-soy',code:'AGRO_SOJA',name:'Experto Soja',category:'AGRO',category_label:'Agro',crop_id:'crop-soy',crop_scope:'crop-soy',crop_name:'Soja',purpose:'RAG_CROP',provider:'EDGE',model:'gemma',active:true,knowledge_documents:[]},
 {id:'data',code:'DATA',name:'Datos generales',category:'DATOS',category_label:'Datos',crop_id:null,crop_scope:'GENERAL',crop_name:'General',purpose:'WEATHER_ANALYSIS',provider:'EDGE',model:'gemma',active:true,knowledge_documents:[]},
]
let integration={id:'satellite',name:'Copernicus',provider:'COPERNICUS_DATA_SPACE',integration_type:'SATELLITE',active:true,timeout_seconds:30,retry_count:3,sync_frequency_minutes:60,non_sensitive_config:{client_id:'old-client',refresh_hours:24,custom_setting:'preserved'}}
let notificationSettings={active:false,timezone:'America/Asuncion',send_hour:6,contexts:[{station_id:'station',crop_code:'TRIGO',planting_date:'2026-06-01',label:'Aviso Trigo'}]}
let agentSaved, integrationSaved, notificationSaved, cropSaved, stageSaved, stageDeleted=false, rulesRequested=false
const user={id:'admin',name:'Prueba',email:'test@example.com',role:'superadmin'}
const mockErrors=[]
const networkErrors=[]
async function intercept(params){
 try {
  const url=new URL(params.request.url),path=url.pathname.replace(/^.*\/api\/v1/,'')
  let payload={},method=params.request.method
  if(!['GET','OPTIONS','HEAD'].includes(method)&&path!=='/auth/login')assert.equal(Object.entries(params.request.headers).find(([key])=>key.toLowerCase()==='x-csrf-token')?.[1],csrfToken)
  if(method==='OPTIONS')payload={}
  else if(path==='/auth/me'||path==='/auth/login')payload=user
  else if(path==='/auth/session')payload={user,refresh_available:false}
  else if(path==='/agents/model-options')payload={items:[{id:'gemma',label:'Gemma'}]}
  else if(path==='/agents')payload={items:agents}
  else if(/^\/agents\/[^/]+\/activity$/.test(path))payload={runs:[{id:'run-1',created_at:'2026-10-20T10:30:00Z',status:'COMPLETED',provider:'EDGE',model:'gemma',input_tokens:100,output_tokens:30,total_tokens:130,cost_usd:null,duration_ms:240}],summary:{runs:1,input_tokens:100,output_tokens:30,total_tokens:130,usage_reported_runs:1,cost_usd:null,cost_status:'not_configured'},scope:{kind:'latest_runs',limit:100,summary:'returned_runs_only'}}
  else if(path.startsWith('/agents/')){const row=agents.find(a=>a.id===path.split('/').pop());if(method==='PUT'){agentSaved=JSON.parse(params.request.postData);Object.assign(row,agentSaved)}payload=row}
  else if(path==='/public/crops')payload=crops
  else if(path==='/plots')payload={items:[parcel]}
  else if(path==='/plots/parcel')payload=parcel
  else if(path==='/plots/parcel/satellite')payload={id:'scene',captured_at:'2026-10-18T12:00:00Z',indices:{ndvi:0.65,ndmi:0.21,ndre:0.4},index_images:{ndvi:'/test-index.png',ndre:'/test-index.png'}}
  else if(path==='/knowledge/upload'){payload={id:'doc-1',title:'Manual técnico de prueba',crop_id:'crop-wheat',index_status:'PENDING'};knowledgeDocuments.push(payload)}
  else if(path==='/knowledge/documents')payload={items:knowledgeDocuments.filter(doc=>!url.searchParams.has('crop_id')||doc.crop_id===url.searchParams.get('crop_id'))}
  else if(path==='/knowledge/crops/crop-wheat/sync')payload={documents_count:knowledgeDocuments.length,status:'SYNCED'}
  else if(path==='/crops')payload={items:crops}
  else if(path.startsWith('/crops/')){const crop=crops.find(c=>c.id===path.split('/').pop());if(method==='PUT'){cropSaved=JSON.parse(params.request.postData);Object.assign(crop,cropSaved)}payload=crop}
  else if(path==='/phenology/stages'){if(method==='POST'){stageSaved=JSON.parse(params.request.postData);assert.equal(stageSaved.crop_id,'crop-wheat');payload={id:'stage-1',...stageSaved};phenologyStages.push(payload)}else{assert.equal(url.searchParams.get('crop_id'),'crop-wheat');assert.equal(url.searchParams.get('cycle_type'),'normal');payload={items:phenologyStages}}}
  else if(path==='/phenology/stages/stage-1'){const stage=phenologyStages.find(stage=>stage.id==='stage-1');if(method==='PUT'){stageSaved=JSON.parse(params.request.postData);Object.assign(stage,stageSaved);payload=stage}else if(method==='DELETE'){phenologyStages.splice(0,phenologyStages.length);stageDeleted=true;payload={ok:true}}}
  else if(path==='/stations')payload={items:[{id:'station',name:'Estación de prueba',latitude:-25,longitude:-55,influence_radius_m:5000,active:true}]}
  else if(path==='/integrations')payload={items:[integration]}
  else if(path==='/integrations/satellite'){if(method==='PUT'){integrationSaved=JSON.parse(params.request.postData);integration={...integration,...integrationSaved}}payload=integration}
  else if(path==='/rules'){assert.equal(url.searchParams.get('crop_id'),'crop-wheat');rulesRequested=true;payload={items:[rule]}}
  else if(path==='/rules/metadata/options')payload={variables:[{value:'soil_moisture_avg_pct',label:'Humedad del suelo',unit:'%'},{value:'soil_tension_avg_cb',label:'Tensión del suelo',unit:'cb'}],operators:[{value:'gt',label:'Mayor que'},{value:'gte',label:'Igual o mayor'},{value:'lte',label:'Igual o menor'},{value:'between',label:'Entre'}]}
  else if(path==='/rules/rule-1/detail')payload={conditions:[soilCondition],diseases:[]}
  else if(path==='/rules/rule-1/conditions/soil-condition'){soilSaved=JSON.parse(params.request.postData);Object.assign(soilCondition,soilSaved);payload=soilCondition}
  else if(path==='/notifications/settings'){if(method==='PUT'){notificationSaved=JSON.parse(params.request.postData);notificationSettings=notificationSaved}payload={settings:notificationSettings,stations:[{id:'station',name:'Estación de prueba'}],crops}}
  else if(path==='/audit')payload={items:[{id:'audit-1',actor_email:'admin@test.com',action:'UPDATE',entity_type:'agent'}]}
  else if(path==='/audit/audit-1')payload={id:'audit-1',actor_email:'admin@test.com',action:'UPDATE',before_data:{name:'Antes'},after_data:{name:'Después'}}
  else if(path==='/admin/jobs')payload=[]
  else if(path==='/admin/ai-runs')payload={items:[]}
  else if(path==='/knowledge/documents'||path==='/notifications/logs')payload={items:[]}
  await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:new URL(appUrl).origin},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'Content-Type,X-CSRF-Token'}],body:Buffer.from(JSON.stringify(payload)).toString('base64')})
 }catch(error){mockErrors.push(String(error));await send('Fetch.failRequest',{requestId:params.requestId,errorReason:'Failed'})}
}
async function menu(label){await evaluate(`[...document.querySelectorAll('aside a')].find(a=>a.textContent.trim()===${JSON.stringify(label)}).click()`)}
async function set(selector,value,event='input'){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control: '+${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))})()`)}
try{
 cdpBase=await startChrome();const target=await(await fetch(`${cdpBase}/json/new?about:blank`,{method:'PUT'})).json();targetId=target.id;socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const call=pending.get(m.id);if(!call)return;clearTimeout(call.timer);pending.delete(m.id);m.error?call.reject(new Error(m.error.message)):call.resolve(m.result)}else if(m.method==='Fetch.requestPaused')void intercept(m.params);else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded' && m.params.entry.level==='error')networkErrors.push(m.params.entry.text);else if(m.method==='Network.loadingFailed')networkErrors.push(m.params.errorText)})
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Network.setCookie',{name:'csrf_token',value:csrfToken,url:appUrl,path:'/',sameSite:'Lax'});await send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*'}]});await send('Page.navigate',{url:appUrl})
 await waitFor(()=>evaluate(`!!document.querySelector('input[type=email]')&&!!document.querySelector('#__nuxt')?.__vue_app__`),'hydrated login')
 await set('input[type=email]','test@example.com');await set('input[type=password]','test-only');await evaluate(`document.querySelector('form').requestSubmit()`)
 await waitFor(()=>evaluate(`!!document.querySelector('aside nav')`),'admin navigation')
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('aside nav a')].map(a=>a.textContent.trim())`),['Dashboard','Estaciones','Cultivos','Agentes','Integraciones','Aviso a productores','Eventos programados','Libreta de direcciones','Parcelas','Auditoría'])
 await menu('Agentes');await waitFor(()=>evaluate(`document.querySelectorAll('.record-link').length===3`),'agent list')
 await set('select[aria-label="Tipo de agente"]','AGRO','change');await set('select[aria-label="Cultivo"]','crop-wheat','change')
 await waitFor(()=>evaluate(`document.querySelectorAll('.record-link').length===1&&document.querySelector('.record-link').textContent==='Experto Trigo'`),'combined agent filters')
 await waitFor(()=>evaluate(`location.search.includes('category=AGRO')&&location.search.includes('crop_scope=crop-wheat')`),'filter URL')
 await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`document.querySelector('#field-name')?.value==='Experto Trigo'&&location.pathname.endsWith('/agentes/agro-wheat')`),'dynamic agent detail')
 assert.equal(await evaluate(`document.querySelector('#field-model').tagName`),'SELECT');
 await set('#field-name','Experto Trigo actualizado');await evaluate(`document.querySelector('.resource-editor').requestSubmit()`);await waitFor(()=>agentSaved,'agent save');assert.equal(agentSaved.name,'Experto Trigo actualizado');assert.equal(agentSaved.model,'gemma')
 await waitFor(()=>evaluate(`document.querySelector('.agent-activity')?.textContent.includes('130')`),'recorded agent usage');assert(await evaluate(`document.querySelector('.agent-activity').textContent.includes('Últimas 100 ejecuciones')`));assert(await evaluate(`document.querySelector('.agent-activity').textContent.includes('Costo no disponible')`))
 await evaluate(`document.querySelector('button[aria-label="Vista móvil"]').click()`);await waitFor(()=>evaluate(`document.querySelector('.admin-layout').classList.contains('admin-mobile-mode')`),'explicit admin mobile mode');assert.equal(await evaluate(`document.querySelector('button[aria-label="Vista móvil"]').getAttribute('aria-pressed')`),'true');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.admin-main')).marginLeft`),'0px');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.editor-grid')).gridTemplateColumns.split(' ').length`),1);assert(await evaluate(`document.querySelector('#field-name').offsetWidth>0&&document.querySelector('#field-model').offsetWidth>0`),'Mobile mode preserves the editable agent fields');await evaluate(`document.querySelector('button[aria-label="Abrir menú administrativo"]').click()`);await waitFor(()=>evaluate(`document.querySelector('aside').classList.contains('open')&&!document.querySelector('aside').inert`),'mobile drawer');assert.equal(await evaluate(`document.querySelectorAll('aside nav a').length`),10);await evaluate(`document.querySelector('aside button[aria-label="Cerrar menú"]').click()`);await evaluate(`document.querySelector('button[aria-label="Vista móvil"]').click()`);await waitFor(()=>evaluate(`!document.querySelector('.admin-layout').classList.contains('admin-mobile-mode')`),'standard admin mode restored')
 if(process.env.CMS_TEST_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.CMS_TEST_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 await menu('Cultivos');await waitFor(()=>evaluate(`document.querySelectorAll('.record-link').length===2`),'crop list');await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`document.querySelector('#field-name')?.value==='Trigo'`),'crop detail');assert.deepEqual(await evaluate(`[...document.querySelectorAll('.checkbox-options input:checked')].map(input=>Number(input.value))`),[5,6]);await evaluate(`[...document.querySelectorAll('.checkbox-options label')].find(label=>label.textContent.trim()==='Julio').querySelector('input').click()`);await evaluate(`document.querySelector('.resource-editor').requestSubmit()`);await waitFor(()=>cropSaved,'crop planting months save');assert.deepEqual(cropSaved.planting_months,[5,6,7]);await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['Documento técnico de prueba'],'manual.txt',{type:'text/plain'}));const input=document.querySelector('.crop-documents input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);await waitFor(()=>evaluate(`[...document.querySelectorAll('.crop-documents button')].some(b=>b.textContent==='Subir documentos')`),'crop upload action');await evaluate(`[...document.querySelectorAll('.crop-documents button')].find(b=>b.textContent==='Subir documentos').click()`);await waitFor(()=>evaluate(`document.querySelector('.crop-documents').textContent.includes('Manual técnico de prueba')`),'crop-owned document');await evaluate(`[...document.querySelectorAll('.detail-tabs button')].find(b=>b.textContent==='Calendario fenológico').click()`);await waitFor(()=>evaluate(`document.querySelector('.crop-phenology')?.textContent.includes('Este cultivo aún no tiene calendario')`),'empty crop calendar');await evaluate(`[...document.querySelectorAll('.crop-phenology button')].find(b=>b.textContent.includes('Agregar etapa')).click()`);assert.deepEqual(await evaluate(`[...document.querySelectorAll('.stage-editor input[type=number]')].map(input=>Number(input.value))`),[0,0,0,0]);await set('.stage-editor input[placeholder="Nombre de la etapa del cultivo"]','Etapa de prueba');await set('.stage-editor input[placeholder="Ej. V1"]','PRUEBA');await evaluate(`(()=>{const inputs=[...document.querySelectorAll('.stage-editor input[type=number]')];for(const[index,value]of [[0,1],[1,0],[2,15],[3,16]]){inputs[index].value=value;inputs[index].dispatchEvent(new Event('input',{bubbles:true}))}})()`);await evaluate(`document.querySelector('.stage-editor').requestSubmit()`);await waitFor(()=>stageSaved,'crop calendar create');assert.equal(stageSaved.crop_id,'crop-wheat');assert.equal(stageSaved.end_day,15);await waitFor(()=>evaluate(`document.querySelector('.stage-link')?.textContent==='Etapa de prueba'`),'created stage row');await evaluate(`document.querySelector('.stage-link').click()`);await set('.stage-editor input[placeholder="Nombre de la etapa del cultivo"]','Etapa actualizada');stageSaved=null;await evaluate(`document.querySelector('.stage-editor').requestSubmit()`);await waitFor(()=>stageSaved?.name==='Etapa actualizada','crop calendar edit');await waitFor(()=>evaluate(`document.querySelector('.stage-link')?.textContent==='Etapa actualizada'`),'updated stage row');await evaluate(`[...document.querySelectorAll('.crop-phenology table button')].find(button=>button.textContent.includes('Eliminar')).click()`);await waitFor(()=>evaluate(`!!document.querySelector('.overlay .btn-danger')`),'stage delete confirmation');await evaluate(`document.querySelector('.overlay .btn-danger').click()`);await waitFor(()=>stageDeleted,'crop calendar delete');await evaluate(`[...document.querySelectorAll('.detail-tabs button')].find(b=>b.textContent.includes('Reglas')).click()`);await waitFor(()=>rulesRequested,'crop rules scope')
 await waitFor(()=>evaluate(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Editar valores')`),'editable soil criterion')
 await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Editar valores').click()`)
 await waitFor(()=>evaluate(`!!document.querySelector('.soil-alternative')`),'alternative soil unit form')
 await evaluate(`document.querySelector('.cb-preset').click()`)
 assert(await evaluate(`document.querySelector('.soil-alternative input[inputmode=decimal]').value==='80'`))
 await set('.soil-alternative textarea','Criterio sintético de prueba; sin uso agronómico')
 await evaluate(`document.querySelector('form.modal-card.compact').requestSubmit()`)
 await waitFor(()=>soilSaved,'dual soil criterion save')
 assert.equal(soilSaved.unit,'%');assert.equal(soilSaved.threshold_value,50);assert.equal(soilSaved.soil_alternative.unit,'cb');assert.equal(soilSaved.soil_alternative.threshold_value,80);assert.equal(soilSaved.soil_alternative.operator,'gt')
 await menu('Integraciones');await waitFor(()=>evaluate(`document.querySelector('.record-link')?.textContent==='Copernicus'`),'integration list');await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`document.querySelector('#field-client_id')?.value==='old-client'`),'integration detail')
 await set('#field-client_id','updated-client');await set('#field-refresh_hours','12','change');await evaluate(`document.querySelector('.resource-editor').requestSubmit()`);await waitFor(()=>integrationSaved,'integration save');assert.equal(integrationSaved.integration_type,'SATELLITE');assert.equal(integrationSaved.non_sensitive_config.client_id,'updated-client');assert.equal(integrationSaved.non_sensitive_config.custom_setting,'preserved');assert.equal(Number(integrationSaved.non_sensitive_config.refresh_hours),12)
 await menu('Aviso a productores');await waitFor(()=>evaluate(`document.querySelector('.record-link')?.textContent==='Aviso Trigo'`),'notification list');await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`!!document.querySelector('.context-row input')`),'notification detail');await set('.context-row input','Aviso actualizado');await evaluate(`document.querySelector('main form').requestSubmit()`);await waitFor(()=>notificationSaved,'notification save');assert.equal(notificationSaved.contexts[0].label,'Aviso actualizado');assert.equal(notificationSaved.active,false)
 await menu('Parcelas');await waitFor(()=>evaluate(`document.querySelector('.record-link')?.textContent==='Parcela prueba'`),'parcel list');await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`[...document.querySelectorAll('.detail-tabs button')].some(b=>b.textContent==='Capas multiespectrales')`),'parcel detail');await evaluate(`[...document.querySelectorAll('.detail-tabs button')].find(b=>b.textContent==='Capas multiespectrales').click()`);await waitFor(()=>evaluate(`document.querySelector('.parcel-satellite-viewer')?.textContent.includes('NDRE')`),'admin multispectral layers')
 await menu('Auditoría');await waitFor(()=>evaluate(`document.querySelector('.record-link')?.textContent==='admin@test.com'`),'audit list');await evaluate(`document.querySelector('.record-link').click()`);await waitFor(()=>evaluate(`document.querySelector('pre')?.textContent.includes('Después')`),'audit detail');assert.equal(await evaluate(`document.querySelectorAll('.resource-editor').length`),0)
 assert.equal(mockErrors.length,0,mockErrors.join('\n'));assert.equal(exceptions.length,0,exceptions.join('\n'))
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(250);assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'Admin must fit mobile width')
 if(process.env.MAP_TEST_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(process.env.MAP_TEST_SCREENSHOT,Buffer.from(shot.data,'base64'))}
 console.log(JSON.stringify({ok:true,menu:true,combinedFilters:true,dynamicAgentEdit:true,cropScopedRules:true,integrationConfigPreserved:true,notificationEdit:true,auditReadOnly:true,mobile:true,cropDocumentUpload:true,modelSelector:true,adminParcelLayers:true,agentActivity:true,cropPlantingMonths:true,cropCalendarCrud:true,explicitMobileToggle:true,dualSoilCriterion:true}))
}catch(error){console.error(error);try{console.error(await evaluate(`({url:location.href,text:document.body.innerText.slice(0,2200)})`));console.error(exceptions,mockErrors,networkErrors)}catch{}process.exitCode=1}
finally{await cleanup()}
