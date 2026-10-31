<script setup lang="ts">
import { Check, ChevronDown, ChevronLeft, ChevronRight, Droplets, Eye, EyeOff, Layers, Leaf, LocateFixed, Map as MapIcon, MapPinned, Maximize2, MousePointer2, Satellite, SlidersHorizontal } from 'lucide-vue-next'
import type { RegionalSnapshot } from '~/types/regionalMap'
import type { Map as LeafletMap } from 'leaflet'
import { recentImageryScenes, imagerySceneLabels } from '~/utils/imageryHistory'
import { stationDisplayColor } from '~/utils/stations'
import { streetBasemap, navigationOverlay } from '~/utils/mapBasemaps'
import { parcelDisplayColor } from '~/utils/parcelColors'
import type { Geometry, MapStation, MapParcel, SpectralVisualization } from '~/types/plots'
const satelliteBasemap = useSatelliteBasemap()
const props = defineProps<{
  modelValue: Geometry | null; stations: MapStation[]; parcels?: MapParcel[]; selectedParcelId?: string
  parcelColor?: string; selectionDisabled?: boolean; coverage?: number | null
  imagery?: SpectralVisualization & { captured_at: string; index_images?: Record<string,string|null> } | null
  imageryScenes?: {id:string;captured_at:string}[]; selectedImageryId?: string; imageryHistoryLoading?: boolean
  initialStationView?: boolean; stationClimate?: boolean; technical?: boolean; overview?: boolean; readOnly?: boolean; confirmClear?: boolean; beforeClear?:()=>Promise<boolean>; clearMessage?: string
}>()
const emit = defineEmits<{ 'update:modelValue':[geometry:Geometry|null]; drawn:[geometry:Geometry|null]; 'select-parcel':[id:string]; 'select-imagery':[id:string] }>()
const leafletMap=shallowRef<LeafletMap|null>(null)
const stationView=shallowRef<{active:boolean;snapshot:RegionalSnapshot|null;variable:string}>({active:false,snapshot:null,variable:''})
const stationMode=computed(()=>stationView.value.active)
const stationVariable=computed(()=>stationView.value.snapshot?.variables.find(v=>v.id===stationView.value.variable))
const displayedStations=computed(()=>stationMode.value?(stationView.value.snapshot?.stations||[]).filter(s=>Number.isFinite(s.values[stationView.value.variable])):props.stations)
const stationValues=computed(()=>{
 if(!stationMode.value||!stationVariable.value)return undefined
 const spec=stationVariable.value
 return Object.fromEntries((stationView.value.snapshot?.stations||[]).map(s=>{
  const value=s.values[stationView.value.variable]??null
  const ratio=value==null?0:Math.max(0,Math.min(1,(value-spec.minimum)/(spec.maximum-spec.minimum||1)))
  return [s.id,{value,unit:spec.unit,color:spec.palette[Math.round(ratio*(spec.palette.length-1))]||'#657b83'}]
 }))
})
const {apiUrl}=useApi()
const {dateOnly:sceneDate,zone:viewerZone}=useViewerTime()
const recentScenes=computed(()=>recentImageryScenes(props.imageryScenes||[]))
const sceneLabels=computed(()=>imagerySceneLabels(recentScenes.value,viewerZone.value))
const sceneLabel=(scene:{id?:string;captured_at:string})=>sceneLabels.value.get(scene.id||'')||sceneDate(scene.captured_at)
const imageryMonths=computed(()=>{
 const groups=new Map<string,{label:string;scenes:{id:string;captured_at:string}[]}>()
 for(const scene of recentScenes.value.slice(1)){
  const date=new Date(scene.captured_at);if(!Number.isFinite(date.getTime()))continue
  const label=new Intl.DateTimeFormat('es',{month:'long',year:'numeric',timeZone:viewerZone.value}).format(date)
  if(!groups.has(label))groups.set(label,{label,scenes:[]});groups.get(label)!.scenes.push(scene)
 }
 return [...groups.values()]
})
const componentElement=ref<HTMLElement|null>(null)
const editor=ref<{fitAllParcels:()=>void;useCurrentLocation:()=>Promise<void>;resize:()=>void}|null>(null)
const controlsOpen=ref(true),sidebarHidden=ref(false),controlsTab=ref<'map'|'copernicus'>('map')
const sidebarId=useId(),styleChoice=ref<'satellite'|'streets'>('satellite')
const showInfluence=ref(true),showLabels=ref(true),scrollZoomEnabled=ref(false),locating=ref(false)
const imageryIndex=ref('rgb'),imageryOpacity=ref(.75)
const availableImagery=computed(()=>Object.entries(props.imagery?.index_images||{}).filter(([,url])=>!!url).map(([key])=>key))
const activeLegend=computed(()=>props.imagery?.index_legends?.[imageryIndex.value])
const imageryNames:Record<string,string>={rgb:'Color real',ndvi:'NDVI',ndre:'NDRE',ndmi:'NDMI',ndwi:'NDWI',evi:'EVI',savi:'SAVI',gndvi:'GNDVI',nbr:'NBR',msi:'MSI',recl:'ReCl'}
const imageryLabels:Record<string,string>={rgb:'Color real',ndvi:'Vegetación',ndre:'Clorofila',ndmi:'Humedad vegetal',ndwi:'Agua en superficie',evi:'Vegetación densa',savi:'Vegetación y suelo',gndvi:'Verdor',nbr:'Cobertura vegetal',msi:'Señal de sequedad',recl:'Clorofila'}
const imageryIcon=(key:string)=>['ndmi','ndwi','msi'].includes(key)?Droplets:key==='rgb'?Satellite:Leaf
const basemapLabel=computed(()=>styleChoice.value==='streets'?'Calles':'Satélite abierto')
const basemap=computed(()=>styleChoice.value==='streets'?streetBasemap:satelliteBasemap)
function changeStyle(style:'satellite'|'streets'){styleChoice.value=style}
async function toggleSidebar(){sidebarHidden.value=!sidebarHidden.value;if(!sidebarHidden.value)controlsOpen.value=true;await nextTick();editor.value?.resize()}
function fitAllParcels(){editor.value?.fitAllParcels()}
async function locateMe(){locating.value=true;try{await editor.value?.useCurrentLocation()}finally{locating.value=false}}
function fullscreen(){if(!document.fullscreenElement)void componentElement.value?.requestFullscreen();else void document.exitFullscreen()}
function geometryChanged(value:Geometry|null){if(JSON.stringify(value)===JSON.stringify(props.modelValue))return;emit('update:modelValue',value);emit('drawn',value)}
watch(availableImagery,layers=>{if(!layers.includes(imageryIndex.value))imageryIndex.value=layers.includes('rgb')?'rgb':layers[0]||''})
onMounted(()=>{controlsOpen.value=window.matchMedia('(min-width:1024px)').matches})
</script>

<template>
  <div ref="componentElement" class="world-map-component" :class="{ 'menu-hidden': sidebarHidden, 'station-view': stationMode }">
    <div class="map-layout-toolbar">
      <button type="button" class="map-menu-toggle" :aria-controls="sidebarId" :aria-expanded="!sidebarHidden" :aria-label="sidebarHidden ? 'Mostrar menú lateral' : 'Ocultar menú y ampliar mapa'" :title="sidebarHidden ? 'Volver a mostrar los controles y las parcelas' : 'Ocultar el menú para usar todo el ancho del mapa'" @click="toggleSidebar">
        <ChevronRight v-if="sidebarHidden" aria-hidden="true" /><ChevronLeft v-else aria-hidden="true" />
        <span>{{ sidebarHidden ? 'Mostrar menú' : 'Ampliar mapa' }}</span>
      </button>
    </div>
    <div v-show="!sidebarHidden" :id="sidebarId" class="map-sidebar-controls">
    <details class="map-controls-menu unified-map-controls" :open="controlsOpen" @toggle="controlsOpen = ($event.target as HTMLDetailsElement).open">
      <summary>
        <span class="controls-menu-title"><span class="controls-title-icon"><SlidersHorizontal aria-hidden="true" /></span><span><strong>{{stationMode?'Vista estaciones':'Controles del mapa'}}</strong><small>{{stationMode?'Valores de las últimas 72 horas':'Vista del mapa · Capas Copernicus'}}</small></span></span>
        <span class="controls-current"><span>{{ stationMode ? stationVariable?.label : basemapLabel }}<template v-if="!stationMode && imageryIndex && availableImagery.length"> · {{ imageryNames[imageryIndex] }}</template></span><ChevronDown class="controls-chevron" aria-hidden="true" /></span>
      </summary>
      <div class="controls-body">
        <div v-show="!stationMode" class="controls-tabs" role="group" aria-label="Controles del mapa y Copernicus">
          <button type="button" :class="{ active: controlsTab === 'map' }" :aria-pressed="controlsTab === 'map'" @click="controlsTab = 'map'"><MapIcon aria-hidden="true" /><span>Vista del mapa</span></button>
          <button type="button" :class="{ active: controlsTab === 'copernicus' }" :aria-pressed="controlsTab === 'copernicus'" @click="controlsTab = 'copernicus'"><Layers aria-hidden="true" /><span>Capas Copernicus</span><span v-if="availableImagery.length" class="layer-count">{{ availableImagery.length }}</span></button>
        </div>
        <section v-show="controlsTab === 'map'" class="map-controls-content" aria-label="Vista y navegación del mapa">
          <div v-show="!stationMode" class="controls-section basemap-section">
            <h3><MapIcon aria-hidden="true" /> Fondo del mapa</h3>
            <div class="map-tool-group" role="group" aria-label="Tipo de mapa">
              <button type="button" :class="{active:styleChoice === 'satellite'}" :aria-pressed="styleChoice === 'satellite'" @click="changeStyle('satellite')"><Satellite aria-hidden="true" /><span>Satélite</span></button>
              <button type="button" :class="{active:styleChoice === 'streets'}" :aria-pressed="styleChoice === 'streets'" @click="changeStyle('streets')"><MapIcon aria-hidden="true" /><span>Calles</span></button>
            </div>
            <div class="navigation-actions">
              <button type="button" class="map-tool-button location-toggle" :disabled="locating" @click="locateMe"><LocateFixed aria-hidden="true" /><span>{{ locating ? 'Ubicando…' : 'Mi ubicación' }}</span></button>
              <button type="button" class="map-tool-button" @click="fullscreen"><Maximize2 aria-hidden="true" /><span>Pantalla completa</span></button>
            </div>
          </div>
          <div class="controls-section visibility-section">
            <h3><Eye aria-hidden="true" /> {{stationMode?'Vista estaciones':'Qué mostrar'}}</h3>
            <div v-show="!stationMode" class="visibility-options">
              <button type="button" class="map-tool-button influence-toggle" :class="{active:showInfluence}" :aria-pressed="showInfluence" @click="showInfluence = !showInfluence"><MapPinned aria-hidden="true" /><span>Cobertura de estaciones</span><span class="control-switch" aria-hidden="true" /></button>
              <button v-if="styleChoice !== 'streets'" type="button" class="map-tool-button labels-toggle" :class="{active:showLabels}" :aria-pressed="showLabels" @click="showLabels = !showLabels"><MapIcon aria-hidden="true" /><span>Nombres y caminos</span><span class="control-switch" aria-hidden="true" /></button>
              <button type="button" class="map-tool-button scroll-toggle" :class="{active:scrollZoomEnabled}" :aria-pressed="scrollZoomEnabled" @click="scrollZoomEnabled = !scrollZoomEnabled"><MousePointer2 aria-hidden="true" /><span>Zoom con la rueda</span><span class="control-switch" aria-hidden="true" /></button>
            </div>
            <StationClimateOverlay v-if="stationClimate" :map="leafletMap" @view-change="stationView=$event" />
          </div>
        </section>
        <section v-show="!stationMode && controlsTab === 'copernicus'" class="imagery-tools" aria-label="Capas multiespectrales Copernicus">
        <label v-if="imageryScenes !== undefined" class="map-scene-selector">
          <span><Satellite aria-hidden="true" /> Fecha de la imagen</span>
          <select class="select" aria-label="Imagen satelital del mapa" :value="selectedImageryId === recentScenes[0]?.id ? '' : selectedImageryId || ''" :disabled="!recentScenes.length || selectionDisabled" @change="emit('select-imagery', ($event.target as HTMLSelectElement).value)">
            <option value="">{{ recentScenes.length ? `Más reciente · ${sceneLabel(recentScenes[0]!)}` : imageryHistoryLoading ? 'Consultando fechas…' : 'Sin imágenes disponibles' }}</option>
            <optgroup v-for="month in imageryMonths" :key="month.label" :label="month.label">
              <option v-for="scene in month.scenes" :key="scene.id" :value="scene.id">{{ sceneLabel(scene) }}</option>
            </optgroup>
          </select>
          <small>Últimas 3 imágenes disponibles, por fecha de captura. Si coinciden en día, se muestra la hora de su dispositivo. La imagen elegida se usará al pulsar Analizar.</small>
        </label>
          <template v-if="availableImagery.length">
            <div class="imagery-controls">
              <div class="layer-selection-heading"><h3><Layers aria-hidden="true" /> Qué quiere observar</h3><small v-if="imagery">Imagen del {{ sceneLabel(imagery) }}</small></div>
              <div class="imagery-options" role="group" aria-label="Índice satelital">
                <button type="button" :class="{active:!imageryIndex}" :aria-pressed="!imageryIndex" data-layer="none" @click="imageryIndex=''"><EyeOff aria-hidden="true" /><span><b>Sin capa</b><small>Solo el mapa de fondo</small></span><Check v-if="!imageryIndex" class="layer-check" aria-hidden="true" /></button>
                <button v-for="key in availableImagery" :key="key" type="button" :data-layer="key" :class="{active:imageryIndex===key}" :aria-pressed="imageryIndex===key" @click="imageryIndex=key"><component :is="imageryIcon(key)" aria-hidden="true" /><span><b>{{ imageryLabels[key] || key.toUpperCase() }}</b><small>{{ key === 'rgb' ? 'Vista natural' : imageryNames[key] || key.toUpperCase() }}</small></span><Check v-if="imageryIndex===key" class="layer-check" aria-hidden="true" /></button>
              </div>
              <label class="imagery-opacity"><span>Visibilidad de la capa</span><input v-model.number="imageryOpacity" :disabled="!imageryIndex" type="range" min="0" max="1" step="0.05" aria-label="Opacidad de la capa Copernicus"><output>{{Math.round(imageryOpacity*100)}}%</output></label>
              <small class="opacity-help">Reduzca la visibilidad para ver el mapa debajo de la capa.</small>
            </div>
            <SpectralLegend v-if="activeLegend" :legend="activeLegend" :index-name="imageryIndex" :grid="imagery?.visual_grid" :technical="technical" />
            <p v-else-if="imageryIndex && imageryIndex !== 'rgb'" class="legacy-scale-note">Esta imagen conserva su escala anterior. Actualice las fuentes para usar los rangos del cliente.</p>
          </template>
          <div v-else class="layers-empty" role="status"><Satellite aria-hidden="true" /><div><strong>{{ imageryHistoryLoading ? 'Preparando las capas de su parcela' : 'Las capas aparecerán aquí' }}</strong><p>{{ imageryHistoryLoading ? 'Puede seguir explorando el mapa mientras se completan las imágenes.' : 'Delimite su parcela y consulte las imágenes de Copernicus para elegir qué observar.' }}</p></div></div>
        </section>
      </div>
    </details>
    <div v-if="parcels?.length" v-show="!stationMode" class="saved-parcel-legend" aria-label="Parcelas en el mapa">
      <b>Mis parcelas</b><button v-for="(parcel,index) in parcels" :key="parcel.id" type="button" :disabled="selectionDisabled" :aria-pressed="parcel.id===selectedParcelId" :data-parcel-choice="parcel.id" @click="emit('select-parcel',parcel.id)"><i :style="{backgroundColor:parcelDisplayColor(parcel,index)}"/>{{parcel.name}}</button>
      <button v-if="parcels.length>1" type="button" @click="fitAllParcels">Ver todas las parcelas</button>
    </div>
    </div>
    <div class="world-map-shell leaflet-world-shell">
      <LeafletParcelEditor ref="editor" :initial-station-view="initialStationView" :model-value="modelValue" :stations="displayedStations" :station-values="stationValues" :parcels="parcels" :selected-parcel-id="selectedParcelId" :polygon-color="parcelColor" :selection-disabled="stationMode||selectionDisabled" :show-influence="!stationMode&&showInfluence" :scroll-zoom="scrollZoomEnabled" :read-only="stationMode||overview||readOnly" :basemap="basemap" :labels-basemap="showLabels&&styleChoice!=='streets'?navigationOverlay:null" :confirm-clear="confirmClear" :before-clear="beforeClear" :clear-message="clearMessage" :overlay-url="!stationMode&&imagery?.index_images?.[imageryIndex]?apiUrl(imagery.index_images[imageryIndex]!):null" :overlay-opacity="imageryOpacity" @map-ready="leafletMap=$event" @update:model-value="geometryChanged" @select-parcel="emit('select-parcel',$event)" />

    </div>
  </div>
</template>

<style scoped>

.saved-parcel-legend{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px;border:1px solid #d5e4ee;border-radius:12px;background:#f6fafc;font-size:.76rem}.saved-parcel-legend>b{margin-right:4px;color:var(--fc-primary)}.saved-parcel-legend button{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #d5e4ee;border-radius:8px;background:white;color:var(--fc-text);cursor:pointer}.saved-parcel-legend button[aria-pressed=true]{border-color:var(--fc-primary);box-shadow:0 0 0 1px var(--fc-primary)}.saved-parcel-legend i{width:12px;height:12px;border-radius:4px}.saved-parcel-legend button:disabled{opacity:.6}

.world-map-shell{position:relative;isolation:isolate;min-height:560px;height:min(70vh,760px);overflow:hidden;border:1px solid #a9c5d8;border-radius:20px;background:#dbeaf3;box-shadow:0 16px 40px #15334a20}.world-map{position:absolute;inset:0}.map-tools{position:absolute;top:16px;left:16px;z-index:4;display:flex;flex-wrap:wrap;gap:8px;max-width:min(620px,calc(100% - 32px))}.map-tool-group{display:flex;padding:4px;gap:3px;border-radius:11px;background:#fff;box-shadow:0 3px 15px #15334a33}.map-tool-group button,.map-tool-button{min-height:40px;padding:8px 12px;border:0;border-radius:8px;background:#fff;color:#15334a;font-weight:750;box-shadow:0 3px 15px #15334a33}.map-tool-group button.active,.map-tool-button.active{color:#fff;background:#004481}.map-tool-group button:disabled{opacity:.5}.map-tool-button.clear{color:#9b2424}.map-legend{position:absolute;z-index:3;left:16px;bottom:18px;display:grid;gap:7px;max-width:min(270px,calc(100% - 32px));max-height:38%;overflow:auto;padding:14px 16px;border:1px solid #ffffffb8;border-radius:14px;background:#fffffff0;box-shadow:0 5px 20px #15334a25;font-size:.84rem}.legend-row{display:flex;align-items:center;gap:8px}.legend-row i{width:12px;height:12px;flex:0 0 12px;border:1px solid #15334a60;border-radius:50%}.map-legend small{padding-top:4px;border-top:1px solid #d8e4ed;color:#667b8b}.map-provider-note,.map-error,.map-coverage-chip,.map-loading{position:absolute;z-index:3;right:16px;bottom:18px;max-width:min(340px,calc(100% - 32px));margin:0;padding:10px 13px;border-radius:10px;background:#fff;color:#15334a;font-size:.82rem;box-shadow:0 4px 15px #15334a28}.map-loading{top:50%;bottom:auto;left:50%;right:auto;transform:translate(-50%,-50%);font-weight:750}.map-provider-note{bottom:62px}.map-error{bottom:62px;color:#8b2525}.map-instructions{position:absolute;z-index:3;left:16px;bottom:180px;padding:10px 12px;border-radius:10px;background:#fff;color:#15334a;font-size:.85rem;box-shadow:0 3px 12px #15334a33}.map-error button{display:block;margin-top:7px;padding:5px 10px;border:1px solid #8b2525;border-radius:7px;background:#fff;color:#8b2525;font-weight:700}.map-coverage-chip{top:16px;bottom:auto;right:62px;font-weight:800;color:#004481}.world-map-shell:fullscreen{width:100vw;height:100vh;border-radius:0}@media(max-width:700px){.world-map-shell{min-height:480px;height:64vh;border-radius:14px}.map-tools{top:10px;left:10px;gap:6px}.map-tool-group button,.map-tool-button{min-height:38px;padding:7px 9px;font-size:.8rem}.map-legend{left:10px;bottom:10px;max-width:185px;padding:10px 11px;font-size:.75rem}.map-provider-note,.map-error{right:10px;bottom:10px;max-width:calc(100% - 215px);padding:8px;font-size:.7rem}.map-provider-note,.map-error{bottom:10px}.map-coverage-chip{top:10px;right:10px}}
.legend-row em { display: block; margin-top: 2px; color: #667b8b; font-size: .72rem; font-style: normal; }
.map-error.map-warning { color: #31566f; }
.map-warning button { color: #31566f; border-color: #9bbbd0; }
.world-map-shell.compatibility-mode { height: auto; min-height: 0; padding: 12px; overflow: visible; }
.compatibility-notice { margin: 0 0 12px; padding: 10px; border-radius: 8px; background: #eef7fb; color: #31566f; font-size: .85rem; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.compatibility-notice .map-tool-button { min-height:36px; font-size:.8rem; border:1px solid #b6cedf; box-shadow:none; }
.compatibility-summary { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 12px; color: #31566f; font-size: .85rem; }
.compatibility-summary span { display: flex; align-items: center; gap: 6px; }
.compatibility-summary i { width: 10px; height: 10px; border-radius: 50%; }

</style>



<style scoped>
.imagery-opacity{display:flex;flex-basis:100%;align-items:center;justify-content:space-between;gap:12px;font-size:.75rem;font-weight:700;color:#31566f}.imagery-opacity input{flex:1;accent-color:#176536;max-width:220px}@media(max-width:700px){.map-provider-note{max-width:160px}}.world-map-shell{background:linear-gradient(130deg,#c9e3ed,#e7f0e3)}
</style>

<style scoped>
.world-map-component{display:grid;gap:10px;min-width:0}.map-tools{right:64px;max-width:none}.map-tools .map-tool-group{flex-wrap:wrap;max-width:100%}.world-map-component:fullscreen{height:100dvh;grid-template-rows:minmax(0,1fr) auto;padding:12px;background:var(--fc-surface-muted)}.world-map-component:fullscreen .world-map-shell{height:100%!important;min-height:0}.imagery-tools{position:static;display:block;max-width:none;max-height:none;overflow:visible;padding:0;border:1px solid #d1e2ee;border-radius:14px;background:#fff;box-shadow:0 3px 12px #0044810b;backdrop-filter:none}.imagery-controls{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:0 15px 15px}.imagery-options{display:flex;flex-wrap:wrap;gap:6px}.imagery-tools button{min-height:36px;padding:7px 10px;border:1px solid #c8d7e2;border-radius:8px;background:#fff;color:var(--fc-text);font-size:.75rem;font-weight:700}.imagery-tools button.active{background:var(--fc-primary);border-color:var(--fc-primary);color:#fff}.imagery-opacity{flex-basis:auto;flex:1;max-width:380px;min-width:min(100%,260px);gap:10px;white-space:nowrap}.imagery-opacity input{min-width:70px;max-width:none;accent-color:var(--fc-primary)}.imagery-opacity output{min-width:36px;text-align:right;color:var(--fc-primary)}.compatible-basemaps{position:static;margin-bottom:12px;width:fit-content;box-shadow:none;border:1px solid #d1e2ee}.map-coverage-chip{top:auto;right:16px;bottom:20px;font-size:.72rem;font-weight:600;box-shadow:none;background:#ffffffdd}.map-provider-note{bottom:66px;font-size:.7rem;max-width:250px}
@media(max-width:700px){.imagery-tools{max-width:none;max-height:none}.imagery-controls{padding:0 11px 12px;gap:14px}.imagery-opacity{max-width:none;width:100%}.map-provider-note{bottom:56px;right:10px;max-width:170px}.map-coverage-chip{top:auto;bottom:15px;right:10px}.compatible-basemaps{margin-bottom:10px}}
</style>

<style scoped>
.navigation-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:4px 0}.navigation-controls .map-tool-button{box-shadow:none;border:1px solid #d1e2ee;min-height:36px;font-size:.75rem}.navigation-controls small,.labels-warning{font-size:.74rem;color:var(--fc-text-muted)}.labels-warning{width:100%;color:#946000}.world-map-component:fullscreen{grid-template-rows:minmax(0,1fr) auto auto}
</style>

<style scoped>
:deep(.weather-station-marker){display:flex;align-items:center;gap:5px;padding:0;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 2px 4px #132b4860)}:deep(.weather-station-marker span){max-width:160px;padding:4px 7px;border-radius:6px;background:#fffffff2;color:#16496c;font-size:11px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}:deep(.weather-station-marker img){flex-shrink:0}
</style>

<style scoped>:deep(.weather-station-marker){display:block;width:40px;height:50px}:deep(.weather-station-marker span){position:absolute;left:45px;top:9px}:deep(.weather-station-marker img){display:block}</style>

<style scoped>
.map-scene-selector{display:grid;gap:7px;flex:1 1 100%;min-width:0;padding:13px;border:1px solid #d1e2ee;border-radius:12px;background:#f4f9fc}.map-scene-selector>span{font-size:.8rem;font-weight:750;color:var(--fc-primary)}.map-scene-selector select{width:100%;max-width:420px;min-width:0;min-height:44px}.map-scene-selector small{line-height:1.5}@media(max-width:700px){.map-scene-selector{grid-column:1/-1}}
.map-controls-menu{min-width:0;border:1px solid #cddfe9;border-radius:15px;background:#fff;overflow:hidden}.map-controls-menu>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:12px 16px;list-style:none;cursor:pointer;color:var(--fc-primary);font-size:.83rem;font-weight:750}.map-controls-menu>summary::-webkit-details-marker{display:none}.controls-menu-title{display:flex;align-items:center;gap:9px}.map-controls-menu>summary>span:last-child{color:var(--fc-text-muted);font-size:.75rem}.map-controls-content{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:0 15px 15px}.map-controls-content .map-tool-button,.map-controls-content .map-tool-group{box-shadow:none;border:1px solid #d1e2ee}.map-controls-content button{cursor:pointer;min-height:44px}.map-controls-content small{width:100%;color:var(--fc-text-muted);font-size:.75rem}.map-controls-content .labels-warning{flex-basis:100%}.map-tools{max-width:calc(100% - 80px);right:auto}.world-map-component:fullscreen{display:flex;flex-direction:column}.world-map-component:fullscreen .map-controls-menu{flex-shrink:0;max-height:40dvh;overflow:auto}.world-map-component:fullscreen .world-map-shell{flex:1}.world-map-component:fullscreen .imagery-tools{max-height:35dvh;overflow:auto}
@media(max-width:700px){.world-map-shell:not(.compatibility-mode){height:clamp(420px,62dvh,580px);min-height:420px}.map-controls-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:0 11px 12px;gap:8px}.map-controls-content .map-tool-group{grid-column:1/-1;display:flex;flex-wrap:wrap;justify-content:stretch}.map-controls-content .map-tool-group button{flex:1}.map-controls-content .map-tool-button{width:100%;min-width:0;white-space:normal;text-align:center;line-height:1.35}.map-controls-content .detail-toggle,.map-controls-content small,.map-controls-content .labels-warning{grid-column:1/-1}.map-controls-menu>summary{padding:11px 12px}.map-controls-menu summary>span:last-child{white-space:nowrap}.map-tools{top:10px;left:10px;gap:6px}.map-tools .map-tool-button{min-height:44px}.map-legend{max-height:125px;max-width:165px;font-size:.69rem;padding:8px}.map-legend small{display:none}.map-provider-note{max-width:145px;font-size:.65rem}.world-map-component{width:100%;max-width:100%}}
</style>

<style scoped>
.unified-map-controls{border:1px solid #cedee7;border-radius:19px;background:#fff;box-shadow:0 5px 22px #173f5310;overflow:hidden}
.map-sidebar-controls{display:grid;gap:10px;min-width:0}
.world-map-component:fullscreen .map-sidebar-controls{flex-shrink:0;max-height:45dvh;overflow:auto}
.world-map-component:fullscreen .map-sidebar-controls .map-controls-menu{max-height:none;overflow:visible}
.unified-map-controls>summary{gap:14px;padding:16px 18px;background:linear-gradient(110deg,#f3f8fb,#f4faf6);min-height:76px}
.controls-title-icon{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:12px;background:#e1edf5;color:#165c83}
.controls-title-icon svg{width:21px;height:21px}.controls-menu-title>span:last-child{display:grid;gap:4px}.controls-menu-title strong{font-size:.93rem;color:#174b68}.controls-menu-title small{font-size:.73rem;font-weight:450;color:#68808d}
.controls-current{display:flex;align-items:center;gap:13px;min-width:0;text-align:right;font-weight:600;line-height:1.5}.controls-chevron{flex:0 0 18px;width:18px;height:18px;transition:transform .18s}.unified-map-controls[open] .controls-chevron{transform:rotate(180deg)}
.controls-body{padding:14px 16px 16px}.controls-tabs{display:flex;gap:5px;width:fit-content;max-width:100%;padding:4px;margin-bottom:16px;border:1px solid #dce7ed;border-radius:13px;background:#f1f6f9}
.controls-tabs button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 17px;border:1px solid transparent;border-radius:10px;background:transparent;color:#587584;font-size:.82rem;font-weight:700;cursor:pointer}
.controls-tabs button.active{border-color:#d4e2e9;background:#fff;color:#145876;box-shadow:0 2px 5px #15334a0c}.controls-tabs svg{width:18px;height:18px;flex-shrink:0}.controls-tabs button:last-child.active{color:#176c58}.layer-count{display:grid;place-items:center;min-width:23px;height:22px;padding:0 5px;border-radius:7px;background:#e4f1e9;color:#23745b;font-size:.68rem}
.unified-map-controls .map-controls-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:start;gap:18px;padding:0}
.controls-section{display:grid;gap:12px;min-width:0;padding:15px;border:1px solid #e0e9ee;border-radius:14px;background:#fbfdfe}.controls-section h3,.layer-selection-heading h3{display:flex;align-items:center;gap:7px;margin:0;color:#476778;font-size:.76rem;font-weight:750}.controls-section h3 svg,.layer-selection-heading h3 svg{width:16px;height:16px}
.unified-map-controls .map-tool-group{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:5px;width:100%;padding:4px;border:1px solid #dce7ed;border-radius:11px;background:#edf3f7;box-shadow:none}
.unified-map-controls .map-tool-group button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:46px;padding:8px 10px;border:1px solid transparent;background:transparent;box-shadow:none;font-size:.78rem;line-height:1.4;cursor:pointer}.unified-map-controls .map-tool-group button.active{border-color:#1c6083;background:#165d82;color:#fff;box-shadow:0 2px 4px #174f7320}.unified-map-controls .map-tool-group svg{width:17px;height:17px;flex-shrink:0}
.navigation-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.unified-map-controls .map-tool-button{display:flex;align-items:center;gap:9px;min-height:46px;padding:10px 11px;border:1px solid #d8e5ed;border-radius:10px;background:#fff;color:#335e75;font-size:.75rem;font-weight:650;box-shadow:none;text-align:left;line-height:1.4;white-space:normal;cursor:pointer}.unified-map-controls .map-tool-button svg{width:17px;height:17px;flex:0 0 17px}.unified-map-controls .map-tool-button:disabled{opacity:.5;cursor:wait}
.visibility-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.unified-map-controls .visibility-options .map-tool-button.active{border-color:#bed6df;background:#f0f7fa;color:#215f7b}.control-switch{position:relative;flex:0 0 26px;width:26px;height:16px;margin-left:auto;border-radius:20px;background:#d7e1e7}.control-switch:after{content:'';position:absolute;top:3px;left:3px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #15334a26;transition:transform .15s}.visibility-options [aria-pressed=true] .control-switch{background:#277a91}.visibility-options [aria-pressed=true] .control-switch:after{transform:translateX(10px)}
.unified-map-controls .map-controls-content small{font-size:.7rem;line-height:1.5;color:#6e8490}.unified-map-controls .labels-warning{grid-column:1/-1}
.unified-map-controls .imagery-tools{margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;max-height:none;overflow:visible}
.unified-map-controls .map-scene-selector{gap:7px;margin-bottom:15px;padding:12px 14px;border:1px solid #dbe8e0;background:#f5faf6}.map-scene-selector>span{display:flex;align-items:center;gap:7px}.map-scene-selector>span svg{width:17px;height:17px}.unified-map-controls .map-scene-selector small{font-size:.72rem;color:#6b8074}.unified-map-controls .map-scene-selector select{max-width:100%;background-color:#fff}
.unified-map-controls .imagery-controls{display:grid;grid-template-columns:minmax(0,1fr);justify-content:stretch;align-items:stretch;width:100%;gap:12px;padding:0}.layer-selection-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.layer-selection-heading h3{color:#396c58}.layer-selection-heading>small{font-size:.71rem;color:#70867a}
.unified-map-controls .imagery-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px}
.unified-map-controls .imagery-options button{display:flex;align-items:center;gap:9px;position:relative;min-height:65px;padding:11px 12px;border:1px solid #dce8e1;border-radius:12px;background:#fff;color:#537367;text-align:left;cursor:pointer;transition:background .15s,border-color .15s}.unified-map-controls .imagery-options button>svg{width:20px;height:20px;flex:0 0 20px}.imagery-options button>span{display:grid;gap:4px;min-width:0}.imagery-options b{font-size:.76rem;line-height:1.35;font-weight:700}.imagery-options small{font-size:.65rem;line-height:1.4;font-weight:500;opacity:.8}.unified-map-controls .imagery-options button.active{border-color:#398663;background:#edf8ef;color:#236747;box-shadow:inset 0 0 0 1px #39866335}.unified-map-controls .imagery-options .layer-check{width:15px;height:15px;flex-basis:15px;margin-left:auto;color:#2c7b50}
.unified-map-controls .imagery-opacity{display:grid;grid-template-columns:auto minmax(80px,1fr) 40px;align-items:center;gap:14px;min-width:0;width:100%;max-width:none;margin-top:2px;padding:12px 14px;border:1px solid #e1ebe5;border-radius:11px;background:#f7faf8;color:#3b6853;white-space:normal;font-size:.75rem}.unified-map-controls .imagery-opacity input{width:100%;height:28px;max-width:none;accent-color:#347d59;cursor:pointer}.unified-map-controls .imagery-opacity input:disabled{opacity:.4;cursor:default}.unified-map-controls .imagery-opacity output{color:#2a7050;font-variant-numeric:tabular-nums}.opacity-help{margin-top:-4px;font-size:.69rem;color:#758b7d}
.unified-map-controls :deep(.spectral-legend){margin-top:14px;border:1px solid #e2ebe5;border-radius:12px;background:#f7fbf8}.legacy-scale-note{margin:12px 0 0;font-size:.75rem;line-height:1.5;color:#6b7e72}.layers-empty{display:flex;align-items:center;gap:13px;padding:18px;border:1px dashed #c9ddd0;border-radius:13px;background:#f8fbf9;color:#5a7869}.layers-empty>svg{flex:0 0 25px;width:25px;height:25px}.layers-empty strong{font-size:.8rem}.layers-empty p{margin:5px 0 0;font-size:.74rem;line-height:1.6}
.unified-map-controls button:focus-visible,.unified-map-controls>summary:focus-visible,.unified-map-controls select:focus-visible,.unified-map-controls input:focus-visible{outline:3px solid #438db7;outline-offset:3px}.unified-map-controls button:hover:not(:disabled):not(.active){border-color:#a8c7d3;background:#f6fafc}
@media(max-width:900px){.unified-map-controls .map-controls-content{grid-template-columns:minmax(0,1fr)}.unified-map-controls .imagery-options{grid-template-columns:repeat(3,minmax(0,1fr))}.visibility-options{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.unified-map-controls>summary{min-height:72px;padding:12px;gap:9px}.controls-title-icon{flex-basis:34px;width:34px;height:34px;border-radius:10px}.controls-menu-title{gap:8px}.controls-menu-title strong{font-size:.82rem}.controls-menu-title small{font-size:.66rem;line-height:1.5}.controls-current>span{display:none}.controls-current{gap:0}.controls-body{padding:11px}.controls-tabs{width:100%;margin-bottom:12px;box-sizing:border-box}.controls-tabs button{flex:1;padding:9px 7px;gap:6px;font-size:.75rem}.controls-tabs svg{width:16px;height:16px}.layer-count{min-width:20px;height:20px}.controls-section{padding:12px;gap:10px}.unified-map-controls .map-controls-content{padding:0;gap:11px}.unified-map-controls .map-tool-group{display:grid;grid-column:auto}.unified-map-controls .map-tool-group button{padding:7px 5px;font-size:.72rem;gap:5px}.unified-map-controls .map-tool-group button>svg{width:15px;height:15px;flex-basis:15px}.unified-map-controls .map-tool-button{font-size:.72rem;padding:9px 8px;gap:7px}.visibility-section small{grid-column:auto}.unified-map-controls .imagery-options{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.unified-map-controls .imagery-options button{min-height:68px;padding:10px 8px;gap:7px}.imagery-options b{font-size:.72rem}.unified-map-controls .imagery-options .layer-check{flex-basis:13px;width:13px;height:13px}.unified-map-controls .imagery-opacity{grid-template-columns:1fr 40px;gap:5px 8px;padding:11px}.imagery-opacity>span{grid-column:1/-1}.unified-map-controls .map-scene-selector select{font-size:16px}.unified-map-controls .layers-empty{padding:14px}}
@media(prefers-reduced-motion:reduce){.controls-chevron,.control-switch:after,.unified-map-controls .imagery-options button{transition:none}}
</style>

<style scoped>
@media(min-width:1024px){
  .world-map-component{--map-workspace-height:clamp(600px,76vh,820px);display:grid;grid-template-columns:minmax(0,1fr) 36px minmax(0,3fr);gap:8px;align-items:start}
  .map-sidebar-controls{grid-column:1;grid-row:1;min-width:0;max-height:var(--map-workspace-height);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#c7dbe2 transparent;gap:8px}
  .world-map-shell{grid-column:3;grid-row:1;min-width:0;width:100%;height:var(--map-workspace-height);min-height:600px}
  .world-map-component.menu-hidden{grid-template-columns:36px minmax(0,1fr)}
  .world-map-component.menu-hidden>.world-map-shell{grid-column:2}
  .map-sidebar-controls .unified-map-controls{border-radius:14px}
  .map-sidebar-controls .unified-map-controls>summary{min-height:58px;padding:10px;gap:7px}
  .map-sidebar-controls .controls-title-icon{flex-basis:30px;width:30px;height:30px;border-radius:9px}
  .map-sidebar-controls .controls-title-icon svg{width:17px;height:17px}
  .map-sidebar-controls .controls-menu-title{gap:7px}.map-sidebar-controls .controls-menu-title strong{font-size:.78rem}.map-sidebar-controls .controls-menu-title small{font-size:.63rem;line-height:1.4}
  .map-sidebar-controls .controls-current>span{display:none}
  .map-sidebar-controls .controls-body{padding:10px}
  .map-sidebar-controls .controls-tabs{width:100%;box-sizing:border-box;gap:3px;padding:3px;margin-bottom:10px}
  .map-sidebar-controls .controls-tabs button{flex:1;min-width:0;min-height:36px;padding:6px 5px;gap:5px;font-size:.68rem;line-height:1.4}.map-sidebar-controls .controls-tabs svg{width:15px;height:15px}.map-sidebar-controls .layer-count{min-width:18px;height:18px;padding:0 3px;font-size:.6rem}
  .map-sidebar-controls .unified-map-controls .map-controls-content{grid-template-columns:minmax(0,1fr);gap:10px}
  .map-sidebar-controls .controls-section{padding:10px;gap:9px}.map-sidebar-controls .controls-section h3,.map-sidebar-controls .layer-selection-heading h3{font-size:.7rem}
  .map-sidebar-controls .unified-map-controls .map-tool-group{padding:3px;gap:3px}.map-sidebar-controls .unified-map-controls .map-tool-group button{min-height:34px;padding:6px 4px;gap:4px;font-size:.67rem}.map-sidebar-controls .unified-map-controls .map-tool-group svg{width:14px;height:14px;flex-basis:14px}
  .map-sidebar-controls .navigation-actions{gap:6px}.map-sidebar-controls .unified-map-controls .map-tool-button{min-height:34px;padding:6px 8px;gap:7px;font-size:.68rem}.map-sidebar-controls .unified-map-controls .map-tool-button svg{width:15px;height:15px;flex-basis:15px}
  .map-sidebar-controls .visibility-options{grid-template-columns:minmax(0,1fr);gap:6px}.map-sidebar-controls .unified-map-controls .map-controls-content small{font-size:.64rem}
  .map-sidebar-controls .unified-map-controls .map-scene-selector{padding:10px;margin-bottom:11px;gap:6px}.map-sidebar-controls .map-scene-selector>span{font-size:.72rem}.map-sidebar-controls .unified-map-controls .map-scene-selector select{min-height:36px;padding:7px 9px;font-size:.73rem}.map-sidebar-controls .unified-map-controls .map-scene-selector small{font-size:.64rem}
  .map-sidebar-controls .unified-map-controls .imagery-controls{gap:9px}.map-sidebar-controls .layer-selection-heading>small{font-size:.63rem}
  .map-sidebar-controls .unified-map-controls .imagery-options{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.map-sidebar-controls .unified-map-controls .imagery-options button{min-height:50px;padding:7px;gap:6px}.map-sidebar-controls .imagery-options b{font-size:.66rem}.map-sidebar-controls .imagery-options small{font-size:.59rem}.map-sidebar-controls .unified-map-controls .imagery-options button>svg{width:16px;height:16px;flex-basis:16px}.map-sidebar-controls .unified-map-controls .imagery-options .layer-check{width:12px;height:12px;flex-basis:12px}
  .map-sidebar-controls .unified-map-controls .imagery-opacity{grid-template-columns:minmax(0,1fr) 34px;padding:9px;gap:3px 8px;font-size:.68rem}.map-sidebar-controls .imagery-opacity>span{grid-column:1/-1}.map-sidebar-controls .opacity-help{font-size:.62rem;line-height:1.5}
  .map-sidebar-controls :deep(.spectral-legend){padding:10px;margin-top:10px}.map-sidebar-controls :deep(.legend-heading){font-size:.68rem}.map-sidebar-controls :deep(.legend-heading span),.map-sidebar-controls :deep(.spectral-legend p),.map-sidebar-controls :deep(.spectral-legend small){font-size:.64rem;line-height:1.5}.map-sidebar-controls :deep(.spectral-legend li){font-size:.62rem}
  .map-sidebar-controls .saved-parcel-legend{padding:9px;gap:6px;font-size:.68rem}.map-sidebar-controls .saved-parcel-legend button{min-height:32px;padding:6px 8px;font-size:.68rem}
}
@media(max-width:1023px){
  .world-map-component{display:flex;flex-direction:column;gap:12px}
  .world-map-shell{order:0}.map-sidebar-controls{order:1;max-height:none;overflow:visible}
}
</style>

<style scoped>
.map-layout-toolbar{grid-column:1/-1;grid-row:1;order:-1;display:flex;justify-content:flex-end;min-width:0}
.map-menu-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 11px;border:1px solid #c9dce7;border-radius:10px;background:#fff;color:#215d7a;font-size:.75rem;font-weight:700;line-height:1.4;cursor:pointer;box-shadow:0 2px 7px #163b5308}
.map-menu-toggle svg{width:17px;height:17px;flex-shrink:0}.map-menu-toggle:hover{border-color:#7caec4;background:#f0f7fb}.map-menu-toggle:focus-visible{outline:3px solid #438db7;outline-offset:3px}
.menu-hidden .map-menu-toggle{border-color:#99bfce;background:#edf6fa}
@media(max-width:1023px){.map-menu-toggle{min-height:44px}}
@media(min-width:1024px){
  .map-layout-toolbar{grid-column:2;grid-row:1;align-self:stretch;align-items:flex-start;justify-content:center;padding-top:12px}
  .menu-hidden>.map-layout-toolbar{grid-column:1}
  .map-menu-toggle{width:36px;min-height:48px;padding:8px;border-radius:11px;background:#f1f7fa;border-color:#bfd5e0;box-shadow:0 2px 8px #163b530c}
  .map-menu-toggle svg{width:20px;height:20px}
  .map-menu-toggle>span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
}
</style>

<style scoped>.leaflet-world-shell{height:auto;min-height:0;padding:10px}.leaflet-world-shell :deep(.map){height:clamp(430px,65vh,760px)}.leaflet-coverage{display:block;padding:8px;color:#446175}</style>

<style scoped>.leaflet-world-shell :deep(.leaflet-editor){height:100%}.leaflet-world-shell :deep(.map){height:100%;min-height:0;border-radius:0}</style>

<style scoped>.station-view .visibility-section{grid-column:1/-1}</style>
