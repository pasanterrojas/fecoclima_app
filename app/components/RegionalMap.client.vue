<script setup lang="ts">
import type * as Leaflet from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import type { MapStation, MapParcel } from '~/types/plots'
import type { RegionalAnalysis, RegionalSnapshot } from '~/types/regionalMap'
import { streetBasemap, navigationOverlay } from '~/utils/mapBasemaps'
import { MapPin, Layers, Mountain, CloudSun, RefreshCw } from 'lucide-vue-next'
const satelliteBasemap = useSatelliteBasemap()
const publicApi=useApi(), parcelApi=usePublicParcelApi()
const stations=ref<MapStation[]>([]), parcels=ref<MapParcel[]>([]), snapshot=ref<RegionalSnapshot|null>(null), job=ref('')
const busy=ref(false), loading=ref(true), error=ref(''), layerError=ref(''), riverError=ref(''), parcelError=ref('')
const domain=ref('regional'),relative=ref(true),showClimate=ref(true)
const variable=ref('temperature'), terrain=ref(''), base=ref('satellite'), labels=ref(true), influence=ref(false), showParcels=ref(true), rivers=ref(false), altitude=ref(false), opacity=ref(.65), selected=ref('')
const editor=ref<{fitAllParcels:()=>void}>()
let L: typeof Leaflet, map: Leaflet.Map|undefined, terrainLayer: Leaflet.TileLayer|undefined, climateLayer: Leaflet.TileLayer|undefined, riverLayer: Leaflet.GeoJSON|undefined
let poll: ReturnType<typeof setTimeout>|undefined, riverDelay: ReturnType<typeof setTimeout>|undefined, disposed=false, riverGeneration=0
const variables=computed(()=>(snapshot.value?.variables||[]).filter(v=>v.available_stations>=3))
watch(variables, options=>{if(!options.some(v=>v.id===variable.value))variable.value=options[0]?.id||''})
const currentVariable=computed(()=>variables.value.find(v=>v.id===variable.value))
const visibleStations=computed(()=>snapshot.value?stations.value.filter(s=>Number.isFinite(snapshot.value?.stations.find(row=>row.id===s.id)?.values[variable.value])):stations.value)
watch(visibleStations, rows=>{if(selected.value&&!rows.some(s=>s.id===selected.value))selected.value=''})
const currentStation=computed(()=>snapshot.value?.stations.find(s=>s.id===selected.value))
const stationName=computed(()=>stations.value.find(s=>s.id===selected.value)?.name)
const legendRange=computed(()=>({low:relative.value?currentVariable.value?.minimum:currentVariable.value?.absolute_minimum??currentVariable.value?.minimum,high:relative.value?currentVariable.value?.maximum:currentVariable.value?.absolute_maximum??currentVariable.value?.maximum}))
const comparison=computed(()=>snapshot.value?.stations.filter(s=>s.values[variable.value]!=null).slice().sort((a,b)=>a.values[variable.value]!-b.values[variable.value]!)||[])
function valueColor(value:number){const low=legendRange.value.low??0,high=legendRange.value.high??1;const colors=currentVariable.value?.palette||['#1764c0','#f5c400','#c51b32'];const index=Math.round(Math.max(0,Math.min(1,(value-low)/(high-low||1)))*(colors.length-1));return colors[index]||'#657b83'}
const stationValues=computed(()=>Object.fromEntries((snapshot.value?.stations||[]).map(s=>{const value=s.values[variable.value]??null;return[s.id,{value,unit:currentVariable.value?.unit||'',color:value==null?'#657b83':valueColor(value)}]})))
const terrainOptions=[{id:'hillshade',label:'Relieve sombreado'},{id:'altitude',label:'Altitud',range:'0–1500 m',colors:'#4b8655,#d8d496,#ad8859,#f4f1e6'},{id:'slope',label:'Pendiente',range:'0–45°',colors:'#e6f0c5,#efcb67,#dc8258,#a54558'},{id:'aspect',label:'Orientación de la ladera',range:'N · E · S · O · N',colors:'#4771a8,#73b9a5,#e0c878,#c97d83,#4771a8'}]
const currentTerrain=computed(()=>terrainOptions.find(t=>t.id===terrain.value))
const time=(value:string)=>new Date(value).toLocaleString('es-PY',{dateStyle:'short',timeStyle:'short'})
const number=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('es-PY',{maximumFractionDigits:2})
const statusText:Record<string,string>={PARTIAL_BOUNDARY:'El acumulado usa las lecturas disponibles; quedan tramos sin medir al inicio o al final de la ventana. No se ha estimado lluvia para esos tramos.',NOT_REPORTED:'Esta estación no entrega este sensor.',INCOMPATIBLE_UNIT:'El sensor de suelo usa otra unidad.',INCOMPLETE_HISTORY:'Faltan registros para comparar las 72 horas.',STALE:'Las lecturas de esta estación no están al día.',AGGREGATION_UNCONFIRMED:'Falta confirmar cómo entrega los acumulados.',COUNTER_INCONSISTENT:'El contador requiere revisión.',MISSING_COUNTER_BASELINE:'Falta la lectura inicial del contador.'}
function friendly(exception:unknown,fallback:string) { const detail=(exception as {data?:{detail?:unknown}})?.data?.detail;return typeof detail==='string'?detail:fallback }
async function mountedMap(instance:Leaflet.Map) {
  const loaded=await import('leaflet');if(disposed)return;L=loaded.default||loaded;map=instance
  map.on('moveend',scheduleRivers);updateTerrain();updateClimate()
}
function updateTerrain() {
  if(!map||!L)return
  terrainLayer?.remove();terrainLayer=undefined;layerError.value=''
  if(terrain.value)terrainLayer=L.tileLayer(publicApi.apiUrl(`/public/map/terrain/${terrain.value}/{z}/{x}/{y}.png`),{maxZoom:21,maxNativeZoom:14,opacity:opacity.value,pane:'terrainPane',attribution:'Relieve © <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen y proveedores</a>'}).on('tileerror',()=>{layerError.value='El relieve no está disponible temporalmente. Puede seguir usando el mapa.'}).addTo(map)
}
function updateClimate() {
  if(!map||!L)return
  climateLayer?.remove();climateLayer=undefined;layerError.value=''
  if(showClimate.value&&job.value&&snapshot.value&&(currentVariable.value?.available_stations||0)>=3)climateLayer=L.tileLayer(publicApi.apiUrl(`/public/map/analyses/${job.value}/tiles/${variable.value}/{z}/{x}/{y}.png?altitude=${altitude.value&&variable.value==='temperature'}&domain=${domain.value}&scale=${relative.value?'relative':'absolute'}&v=7`),{maxZoom:21,maxNativeZoom:14,opacity:opacity.value,pane:'climatePane',attribution:'Estimación FECOCLIMA · estaciones, últimas 72 h'}).on('tileerror',()=>{layerError.value='No se pudo cargar toda la capa. Intente sin corrección por altitud o vuelva a analizar.'}).addTo(map)
}
function scheduleRivers(){if(riverDelay)clearTimeout(riverDelay);if(rivers.value)riverDelay=setTimeout(loadRivers,500)}
async function loadRivers() {
  const generation=++riverGeneration;riverLayer?.remove();riverLayer=undefined;riverError.value=''
  if(!map||!rivers.value)return
  const bounds=map.getBounds(),west=Math.max(-180,bounds.getWest()),east=Math.min(180,bounds.getEast()),south=Math.max(-85,bounds.getSouth()),north=Math.min(85,bounds.getNorth())
  if(east-west>15||north-south>15){riverError.value='Acérquese para ver los ríos principales.';return}
  try {
    const data=await publicApi.request<GeoJsonObject>(`/public/map/rivers?${new URLSearchParams({west:String(west),east:String(east),south:String(south),north:String(north)})}`)
    if(disposed||generation!==riverGeneration||!rivers.value||!map)return
    riverLayer=L.geoJSON(data,{style:{color:'#24b8f3',weight:2,opacity:.9},onEachFeature(feature,layer){const label=document.createElement('span');label.textContent=feature.properties?.name||'Río';layer.bindTooltip(label)}}).addTo(map)
  }catch(exception){if(generation===riverGeneration&&!disposed)riverError.value=friendly(exception,'Los ríos no están disponibles temporalmente.')}
}
function rememberJob(){try{localStorage.setItem('fecoclima-regional-map-job',job.value)}catch{}}
async function checkJob() {
  try {
    const result=await parcelApi.request<RegionalAnalysis>(`/public/map/analyses/${job.value}`)
    if(disposed)return
    if(result.status==='COMPLETED'&&result.snapshot){snapshot.value=result.snapshot;stations.value=result.snapshot.stations;busy.value=false;updateClimate();rememberJob();return}
    if(['FAILED','CANCELLED'].includes(result.status)){busy.value=false;error.value=result.message||'No se pudo completar el análisis.';return}
    poll=setTimeout(checkJob,2500)
  }catch(exception){if(!disposed){busy.value=false;error.value=friendly(exception,'No se pudo consultar el análisis. Vuelva a intentarlo.')}}
}
async function analyze() {
  if(busy.value)return
  error.value='';busy.value=true
  try {const result=await parcelApi.request<RegionalAnalysis>('/public/map/analyses',{method:'POST'});if(disposed)return;job.value=result.job_id;snapshot.value=null;updateClimate();rememberJob();await checkJob()}
  catch(exception){if(!disposed){busy.value=false;error.value=friendly(exception,'No se pudo iniciar el análisis. Intente de nuevo.')}}
}
onMounted(async()=>{
  const results=await Promise.allSettled([publicApi.request<MapStation[]>('/public/stations'),parcelApi.request<{items:MapParcel[]}>('/parcels')])
  if(disposed)return
  if(results[0].status==='fulfilled'){stations.value=results[0].value;await nextTick();editor.value?.fitAllParcels()}else error.value='No se pudieron cargar las estaciones.'
  if(results[1].status==='fulfilled')parcels.value=results[1].value.items;else parcelError.value='No se pudieron cargar sus parcelas.'
  loading.value=false
  try {const previous=localStorage.getItem('fecoclima-regional-map-job');if(previous){job.value=previous;busy.value=true;await checkJob()}}catch{}
})
watch(terrain,updateTerrain);watch([variable,altitude,domain,relative,showClimate],updateClimate)
watch(opacity,value=>{terrainLayer?.setOpacity(value);climateLayer?.setOpacity(value)})
watch(rivers,loadRivers)
onBeforeUnmount(()=>{disposed=true;riverGeneration++;if(poll)clearTimeout(poll);if(riverDelay)clearTimeout(riverDelay);map?.off('moveend',scheduleRivers)})
function mapReady(instance:Leaflet.Map){instance.createPane('terrainPane').style.zIndex='310';instance.createPane('climatePane').style.zIndex='320';mountedMap(instance)}
</script>
<template>
  <section class="regional-map">
    <header class="map-heading"><div><h1 class="page-title">Mapa</h1><p class="page-subtitle">Estaciones, relieve y las últimas 72 horas en el territorio.</p></div><button class="btn btn-primary analyze" :disabled="busy||loading" @click="analyze"><RefreshCw :class="{spin:busy}"/>{{busy?'Analizando estaciones…':'Analizar últimas 72 h'}}</button></header>
    <p v-if="error" class="notice error" role="alert">{{error}}</p>
    <p v-if="busy" class="notice" role="status">Estamos consultando todas las estaciones activas. Puede seguir explorando el mapa.</p>
    <div class="map-workspace">
      <aside class="map-panel" aria-label="Capas del mapa">
        <section><h2><Layers/>Capas</h2><label class="field">Fondo<select v-model="base" class="select"><option value="satellite">Satélite abierto</option><option value="street">Calles</option></select></label><label><input v-model="labels" type="checkbox">Nombres y caminos</label><label><input v-model="influence" type="checkbox">Áreas de influencia</label><label v-if="snapshot"><input v-model="showClimate" type="checkbox">Clima por colores</label><label><input v-model="showParcels" type="checkbox">Mis parcelas</label><small v-if="showParcels&&!parcels.length">{{parcelError||'No hay parcelas guardadas en este navegador.'}}</small><label><input v-model="rivers" type="checkbox">Ríos principales</label><small v-if="rivers">Natural Earth · escala regional; no incluye todos los arroyos.</small><p v-if="riverError" class="muted small" role="status">{{riverError}}</p></section>
        <section><h2><Mountain/>Relieve</h2><label class="field">Parámetro<select v-model="terrain" class="select"><option value="">Sin capa de relieve</option><option v-for="option in terrainOptions" :key="option.id" :value="option.id">{{option.label}}</option></select></label><template v-if="currentTerrain?.colors"><div class="color-scale" :style="{background:`linear-gradient(to right,${currentTerrain.colors})`}"/><small>{{currentTerrain.range}}</small></template><small v-if="terrain">Elevación de Mapzen. El detalle depende del modelo de terreno de la zona.</small></section>
        <section><h2><CloudSun/>Clima · 72 horas</h2><p v-if="!snapshot" class="muted small">Pulse «Analizar» para comparar las estaciones y ver las diferencias por color.</p><template v-else><small>Del {{time(snapshot.from)}} al {{time(snapshot.reference_at)}}</small><p v-if="!variables.length" class="notice">Ninguna variable tiene al menos tres estaciones con lecturas comparables.</p><label v-else class="field">Variable<select v-model="variable" class="select"><option v-for="v in variables" :key="v.id" :value="v.id">{{v.label}} · {{v.available_stations}} estaciones</option></select></label><template v-if="currentVariable"><div class="color-scale" :style="{background:`linear-gradient(to right,${currentVariable.palette.join(',')})`}"/><div class="scale-values"><span>{{number(legendRange.low)}} {{currentVariable.unit}}</span><span>{{number(legendRange.high)}} {{currentVariable.unit}}</span></div><small>{{currentVariable.available_stations}} de {{stations.length}} estaciones con registros comparables.</small><label><input v-model="relative" type="checkbox">Resaltar diferencias entre estaciones</label><small v-if="relative">Escala de esta ventana; de menor a mayor valor, según los colores de esta variable.</small><small v-if="currentVariable.available_stations>1&&currentVariable.spread!=null">Diferencia regional: {{number(currentVariable.spread)}} {{currentVariable.unit}}.<template v-if="currentVariable.small_difference"> Los valores son muy parecidos.</template></small><p v-if="!currentVariable.available_stations" class="notice">Esta variable no tiene cobertura suficiente. Elija otra para seguir explorando.</p></template><label class="field">Área de comparación<select v-model="domain" class="select"><option value="regional">Tendencia entre estaciones</option><option value="influence">Solo áreas de influencia</option></select></label><label v-if="variable==='temperature'"><input v-model="altitude" type="checkbox">Ajustar temperatura por altitud</label><small v-if="altitude&&variable==='temperature'">Experimental: −0,65 °C/100 m, donde la estación tiene altitud registrada.</small><small>{{domain==='regional'?'Capa continua entre estaciones, con bordes suaves. Cuanto más lejos de una estación, más transparente y menos confiable es la estimación.':'Se colorean únicamente las zonas de influencia con lecturas válidas.'}} Las áreas sin color no significan cero.</small><small>{{['rain','et'].includes(variable)?'Acumulado registrado en las últimas 72 horas, a la frecuencia del sensor.':'Promedio de las últimas 72 horas.'}} Es una estimación entre estaciones, no una medición de cada punto.</small></template></section>
        <section v-if="comparison.length"><h2>Comparar estaciones</h2><button v-for="s in comparison" :key="s.id" type="button" class="comparison-row" :class="{chosen:selected===s.id}" @click="selected=s.id"><i :style="{background:valueColor(s.values[variable]!)}"/><span>{{s.name}}</span><b>{{number(s.values[variable])}} {{currentVariable?.unit}}</b></button></section><section v-if="terrain||snapshot"><label class="field">Intensidad de las capas<input v-model.number="opacity" type="range" min="0.15" max="1" step="0.05"></label></section>
        <section v-if="selected"><h2><MapPin/>{{stationName}}</h2><template v-if="currentStation"><dl><template v-for="v in variables" :key="v.id"><dt>{{v.label}}</dt><dd>{{number(currentStation.values[v.id])}}<span v-if="currentStation.values[v.id]!=null"> {{v.unit}}</span></dd></template></dl><small v-if="currentStation.statuses[variable]!=='AVAILABLE'">{{statusText[currentStation.statuses[variable]||'']||'Lectura pendiente de revisión.'}}</small><small>Última lectura: {{currentStation.latest_at?time(currentStation.latest_at):'Sin registro reciente'}}.</small></template><small v-else>Pulse «Analizar» para consultar sus lecturas.</small></section>
      </aside>
      <div class="map-canvas"><LeafletParcelEditor ref="editor" read-only :stations="visibleStations" :parcels="showParcels?parcels:[]" :show-influence="influence" :station-values="stationValues" :basemap="base==='satellite'?satelliteBasemap:streetBasemap" :labels-basemap="base==='satellite'&&labels?navigationOverlay:null" @map-ready="mapReady" @select-station="selected=$event"/><div class="map-badge">{{visibleStations.length}} estaciones{{snapshot?' con lectura':''}}</div><p v-if="layerError" class="layer-notice" role="status">{{layerError}}</p></div>
    </div>
    <p class="map-note">{{ satelliteBasemap.id === 'esri-world-imagery' ? 'Fondo satelital Esri World Imagery.' : 'Fondo satelital histórico despejado para navegar.' }} Las imágenes recientes y las capas del cultivo siguen en «Mi parcela».</p>
  </section>
</template>
<style scoped>
.map-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:20px}.analyze{white-space:nowrap}.analyze svg{width:18px}.map-workspace{display:grid;grid-template-columns:300px minmax(0,1fr);border:1px solid #d9e4e8;border-radius:15px;overflow:hidden;background:#fff}.map-panel{padding:0 18px;max-height:750px;overflow:auto;background:#f8fbfa}.map-panel section{padding:18px 0;border-bottom:1px solid #dde7e5}.map-panel h2{font-size:.9rem;display:flex;gap:8px;align-items:center;margin:0 0 13px;color:#185463}.map-panel h2 svg{width:18px;height:18px}.map-panel label{display:flex;align-items:center;gap:8px;font-size:.84rem;margin:10px 0}.map-panel .field{display:grid;gap:7px}.map-panel input[type=checkbox]{accent-color:#227b8b;width:16px;height:16px}.map-panel small{display:block;line-height:1.5;font-size:.74rem;color:#567078;margin:6px 0}.map-panel .select{font-size:.8rem;width:100%;padding:8px}.color-scale{height:10px;border-radius:5px;margin-top:12px}.scale-values{display:flex;justify-content:space-between;font-size:.73rem;margin-top:5px;color:#42616b}.map-canvas{position:relative;min-width:0}.map-canvas :deep(.map){height:750px;border-radius:0}.map-badge{position:absolute;top:12px;right:12px;z-index:450;background:#fffefaed;border:1px solid #d5e6df;border-radius:8px;padding:8px 10px;font-size:.75rem;font-weight:650;pointer-events:none}.layer-notice{position:absolute;bottom:32px;left:20px;right:20px;z-index:450;background:#fff4dd;padding:12px;border-radius:8px;font-size:.8rem}.map-note{color:#677e86;font-size:.76rem;margin-top:12px}.notice{background:#edf5f4;padding:12px;border-radius:8px;font-size:.82rem}.notice.error{background:#fff0e9;color:#914a2f}dl{display:grid;grid-template-columns:1fr auto;gap:7px;font-size:.76rem}dt,dd{margin:0}dd{font-weight:700}.spin{animation:spin 1.5s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:850px){.map-workspace{grid-template-columns:240px minmax(0,1fr)}.map-panel{padding:0 12px}}@media(max-width:650px){.map-heading{align-items:stretch;flex-direction:column}.map-workspace{display:flex;flex-direction:column}.map-panel{max-height:350px}.map-canvas :deep(.map){height:520px}.map-badge{font-size:.68rem;max-width:65%}}
</style>

<style scoped>.comparison-row{display:flex;align-items:center;gap:7px;width:100%;padding:8px 4px;border:0;border-bottom:1px solid #dce8e7;background:transparent;text-align:left;font-size:.75rem;cursor:pointer}.comparison-row i{width:10px;height:10px;flex-shrink:0;border:1px solid #99aebb;border-radius:50%}.comparison-row span{flex:1;min-width:0}.comparison-row b{white-space:nowrap}.comparison-row:hover,.comparison-row.chosen{background:#e8f2ef}</style>
