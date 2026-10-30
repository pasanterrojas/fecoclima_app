<script setup lang="ts">
import { Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Droplets, Eye, EyeOff, Layers, Leaf, LocateFixed, Map as MapIcon, MapPinned, Maximize2, MousePointer2, Satellite, SlidersHorizontal, Sparkles } from 'lucide-vue-next'
import { recentImageryScenes, imagerySceneLabels } from '~/utils/imageryHistory'
import { stationMapCoordinates, stationDisplayColor, weatherStationIconUrl } from '~/utils/stations'
import { openSatelliteBasemap, streetBasemap, navigationOverlay, rasterBasemapStyle, type RasterBasemap } from '~/utils/mapBasemaps'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Geoman, type GmOptionsPartial } from '@geoman-io/maplibre-geoman-free'
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Geometry, MapStation, MapParcel, SpectralVisualization } from '~/types/plots'
import { parcelDisplayColor, parcelMapCoordinates } from '~/utils/parcelColors'
import { detailSource, detailGlyphs, detailedNavigationLayers } from '~/utils/mapLabels'

maplibregl.setWorkerUrl(workerUrl)

const props = defineProps<{
  modelValue: Geometry | null
  stations: MapStation[]
  parcels?: MapParcel[]
  selectedParcelId?: string
  parcelColor?: string
  selectionDisabled?: boolean
  coverage?: number | null
  imagery?: SpectralVisualization & { captured_at: string; index_images?: Record<string, string | null> } | null
  imageryScenes?: { id: string; captured_at: string }[]
  selectedImageryId?: string
  imageryHistoryLoading?: boolean
  overview?: boolean
  readOnly?: boolean
  confirmClear?: boolean
  beforeClear?: () => Promise<boolean>
  clearMessage?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [geometry: Geometry | null]
  drawn: [geometry: Geometry | null]
  'select-parcel': [id: string]
  'select-imagery': [id: string]
}>()
const runtime = useRuntimeConfig()
const {dateOnly:sceneDate, zone:viewerZone}=useViewerTime()
const recentScenes = computed(() => recentImageryScenes(props.imageryScenes || []))
const sceneLabels = computed(() => imagerySceneLabels(recentScenes.value, viewerZone.value))
function sceneLabel(scene: { id?: string; captured_at: string }) {
  return sceneLabels.value.get(scene.id || '') || sceneDate(scene.captured_at)
}
const imageryMonths = computed(() => {
  const groups = new Map<string, { label: string; scenes: { id: string; captured_at: string }[] }>()
  const formatter = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: viewerZone.value })
  for (const scene of recentScenes.value.slice(1)) {
    const date = new Date(scene.captured_at)
    if (!Number.isFinite(date.getTime())) continue
    const label = formatter.format(date)
    if (!groups.has(label)) groups.set(label, { label, scenes: [] })
    groups.get(label)!.scenes.push(scene)
  }
  return [...groups.values()]
})
const { apiUrl } = useApi()
const componentElement = ref<HTMLElement | null>(null)
const mapElement = ref<HTMLElement | null>(null)
const mapError = ref('')
const mapLoaded = ref(false)
const editorReady = ref(false)
const compatibilityMode = ref(false)
const compatibilityMessage = ref('')
type BasemapChoice = 'satellite' | 'streets' | 'satellite-hd'
const styleChoice = ref<BasemapChoice>('satellite')
const hdBasemap = ref<RasterBasemap | null>(null)
const hdLoading = ref(false)
const hdError = ref('')
const drawing = ref(false)
const editing = ref(false)
const locating = ref(false)
const imageryIndex = ref('rgb')
const imageryOpacity = ref(0.75)
const controlsOpen = ref(false)
const sidebarHidden = ref(false)
const sidebarId = useId()
async function toggleSidebar() {
  sidebarHidden.value = !sidebarHidden.value
  if (!sidebarHidden.value) controlsOpen.value = true
  await nextTick()
  map?.resize()
}
onMounted(() => { controlsOpen.value = window.matchMedia('(min-width: 1024px)').matches })
const controlsTab = ref<'map' | 'copernicus'>('map')
const activeLegend = computed(() => props.imagery?.index_legends?.[imageryIndex.value])
const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/liberty'
const showInfluence = ref(true)
const showLabels = ref(true)
const scrollZoomEnabled = ref(false)
const clearConfirmation = ref(false)
let clearingPolygon = false
const labelsError = ref('')
const detailedLabels = ref(true)
const detailFailed = ref(false)
function applyNavigationOverlay() {
  if (!map || !mapLoaded.value) return
  if (!map.getSource(navigationOverlay.id)) {
    map.addSource(navigationOverlay.id, { type: 'raster', tiles: [navigationOverlay.tiles], tileSize: 256, maxzoom: navigationOverlay.maxZoom, attribution: navigationOverlay.attribution })
    map.addLayer({ id: navigationOverlay.id, type: 'raster', source: navigationOverlay.id, paint: { 'raster-fade-duration': 0 } })
  }
  if (!map.getSource(detailSource)) {
    map.setGlyphs(detailGlyphs)
    map.addSource(detailSource, { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org/">OpenFreeMap</a>' })
    for (const layer of detailedNavigationLayers()) map.addLayer(layer)
  }
  const visible = showLabels.value && styleChoice.value !== 'streets'
  map.setLayoutProperty(navigationOverlay.id, 'visibility', visible && (!detailedLabels.value || detailFailed.value) ? 'visible' : 'none')
  for (const layer of detailedNavigationLayers()) if (map.getLayer(layer.id)) map.setLayoutProperty(layer.id, 'visibility', visible && detailedLabels.value && !detailFailed.value ? 'visible' : 'none')
}
watch(showLabels, applyNavigationOverlay)
watch(detailedLabels, applyNavigationOverlay)
watch(scrollZoomEnabled, enabled => { if (enabled) map?.scrollZoom.enable(); else map?.scrollZoom.disable() })
function applyInfluenceVisibility() {
  for (const layer of ['station-zone-fill', 'station-zone-outline']) {
    if (map?.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', showInfluence.value ? 'visible' : 'none')
  }
}
watch(showInfluence, applyInfluenceVisibility)
const areaHectares = computed(() => {
  const polygon = asGeometry(props.modelValue)
  if (!polygon) return null
  const polygons = polygon.type === 'Polygon' ? [polygon.coordinates] : polygon.coordinates
  // Área esférica aproximada; suficiente como orientación visual, no para catastro.
  const ringArea = (ring: number[][]) => {
    let sum = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!
      const [aLng, aLat] = a
      const [bLng, bLat] = b
      sum += ((bLng! - aLng!) * Math.PI / 180) * (2 + Math.sin(aLat! * Math.PI / 180) + Math.sin(bLat! * Math.PI / 180))
    }
    return Math.abs(sum * 6378137 * 6378137 / 2)
  }
  return polygons.reduce((total, polygon) => total + (polygon.length ? ringArea(polygon[0] as number[][]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring as number[][]), 0) : 0), 0) / 10000
})
const hasTilesKey = computed(() => /^[A-Za-z0-9_-]{20,64}$/.test(String(runtime.public.mapTilerKey || '').trim()))
const compatibilityEditor = ref<{fitAllParcels:()=>void;useCurrentLocation:()=>void | Promise<void>} | null>(null)
let fittedParcelOverview = false
let stationMarkers: maplibregl.Marker[] = []
const imageryNames: Record<string, string> = { rgb: 'Color real', ndvi: 'NDVI', ndre: 'NDRE', ndmi: 'NDMI', ndwi: 'NDWI', evi: 'EVI', savi: 'SAVI', gndvi: 'GNDVI', nbr: 'NBR', msi: 'MSI', recl: 'ReCl' }
const imageryLabels: Record<string, string> = { rgb: 'Color real', ndvi: 'Vegetación', ndre: 'Clorofila', ndmi: 'Humedad vegetal', ndwi: 'Agua en superficie', evi: 'Vegetación densa', savi: 'Vegetación y suelo', gndvi: 'Verdor', nbr: 'Cobertura vegetal', msi: 'Señal de sequedad', recl: 'Clorofila' }
const imageryIcon = (key: string) => ['ndmi', 'ndwi', 'msi'].includes(key) ? Droplets : key === 'rgb' ? Satellite : Leaf
const basemapLabel = computed(() => styleChoice.value === 'streets' ? 'Calles' : styleChoice.value === 'satellite-hd' ? 'Satélite HD' : 'Satélite')
const availableImagery = computed(() => Object.entries(props.imagery?.index_images || {}).filter(([, url]) => !!url).map(([key]) => key))
let map: MapLibreMap | null = null
let geoman: Geoman | null = null
let resizeObserver: ResizeObserver | null = null
let mapLoadTimer: ReturnType<typeof setTimeout> | null = null
let fallbackAttempted = false
let mapDestroyed = false
let lastPublished = ''
let syncingGeometry = false
let draftSyncTask: Promise<void> = Promise.resolve()

const geomanOptions: GmOptionsPartial = {
  settings: { controlsPosition: 'top-right', controlsUiEnabledByDefault: false },
  controls: {
    draw: { polygon: { title: 'Dibujar parcela', uiEnabled: !props.readOnly && !props.overview } },
    edit: {
      change: { title: 'Editar vértices', uiEnabled: !props.readOnly && !props.overview },
      delete: { title: 'Eliminar geometría', uiEnabled: !props.readOnly && !props.overview && !props.confirmClear },
    },
  },
  layerStyles: {
    polygon: {
      gm_main: [
        { type: 'fill', paint: { 'fill-color': '#facc15', 'fill-opacity': 0.3, 'fill-outline-color': '#eab308' } },
        { type: 'line', paint: { 'line-color': '#eab308', 'line-width': 3, 'line-opacity': 1 } },
      ],
      gm_temporary: [
        { type: 'fill', paint: { 'fill-color': '#facc15', 'fill-opacity': 0.2, 'fill-outline-color': '#eab308' } },
        { type: 'line', paint: { 'line-color': '#eab308', 'line-width': 2, 'line-opacity': 0.9 } },
      ],
    },
  },
}

const compatibleBasemap = computed(() => styleChoice.value === 'streets' ? streetBasemap : styleChoice.value === 'satellite-hd' && hdBasemap.value ? hdBasemap.value : openSatelliteBasemap)

function mapStyle(style: BasemapChoice) {
  if (style === 'satellite-hd' && hdBasemap.value) return rasterBasemapStyle(hdBasemap.value)
  return style === 'streets' ? openFreeMapStyle : rasterBasemapStyle(openSatelliteBasemap)
}

function mapRequest(resourceUrl: string) {
  const apiOrigin = new URL(String(runtime.public.apiBase || '/api/v1'), window.location.origin).origin
  return {
    url: new URL(resourceUrl, window.location.origin).href,
    credentials: new URL(resourceUrl, window.location.origin).origin === apiOrigin ? 'include' as const : 'same-origin' as const,
  }
}

function fallbackStyle() { return rasterBasemapStyle(streetBasemap) }

function locateMe() {
  if (compatibilityMode.value) { void compatibilityEditor.value?.useCurrentLocation(); return }
  if (!map || !navigator.geolocation) {
    mapError.value = 'Su navegador no permite acceder a la ubicación.'
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locating.value = false
      mapError.value = ''
      map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 15, essential: true })
    },
    () => { locating.value = false; mapError.value = 'No se pudo obtener su ubicación. Revise el permiso de ubicación del navegador.' },
    { enableHighAccuracy: true, timeout: 12000 },
  )
}

function retryMap() {
  if (compatibilityMode.value) {
    // Removing the CPU editor from the DOM lets the element watcher create
    // exactly one new MapLibre instance (only after its container exists).
    compatibilityMode.value = false
    compatibilityMessage.value = ''
    mapError.value = ''
    fallbackAttempted = false
    return
  }
  if (!map) {
    initializeMap()
    return
  }
  mapError.value = ''
  mapLoaded.value = false
  fallbackAttempted = false
  void (async () => {
    try {
      const previousEditor = geoman
      geoman = null
      await previousEditor?.destroy({ removeSources: true })
      editorReady.value = false
      map?.setStyle(mapStyle(styleChoice.value), { diff: false })
      startMapLoadTimer()
    } catch {
      useCompatibleMap('No fue posible reiniciar el mapa avanzado. Puede seguir trabajando en el mapa compatible.')
    }
  })()
}

function asGeometry(value: unknown): Geometry | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { type?: string; coordinates?: unknown; geometry?: unknown }
  const source = candidate.type === 'Feature' ? candidate.geometry : candidate
  if (!source || typeof source !== 'object') return null
  const geometry = source as { type?: string; coordinates?: unknown }
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null
  if (!Array.isArray(geometry.coordinates)) return null
  return { type: geometry.type, coordinates: geometry.coordinates as Geometry['coordinates'] }
}

function stationFeatures() {
  const features = props.stations.flatMap((station, index) => {
    const geometry = asGeometry(station.influence_geojson)
    return geometry
      ? [{
          type: 'Feature' as const,
          properties: { id: station.id, name: station.name, color: stationDisplayColor(station, index) },
          geometry,
        }]
      : []
  })
  return { type: 'FeatureCollection' as const, features }
}

function stationPointFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: props.stations
      .filter((station) => station.longitude != null && station.latitude != null)
      .map((station, index) => ({
        type: 'Feature' as const,
        properties: { id: station.id, name: station.name, color: stationDisplayColor(station, index) },
        geometry: { type: 'Point' as const, coordinates: [Number(station.longitude), Number(station.latitude)] },
      })),
  }
}

function publishSnapshot() {
  if (syncingGeometry) return
  const feature = geoman?.features.exportGeoJson({ allowedShapes: ['polygon'] }).features[0]
  const geometry = feature ? asGeometry(feature.geometry) : null
  const serialized = geometry ? JSON.stringify(geometry) : ''
  if (serialized === lastPublished) return
  lastPublished = serialized
  emit('update:modelValue', geometry)
  emit('drawn', geometry)
}

function setDraftFromProps(): Promise<void> {
  const editor=geoman
  draftSyncTask=draftSyncTask.catch(()=>undefined).then(async()=>{
    if(!editor?.loaded || editor!==geoman)return
    const geometry=asGeometry(props.modelValue)
    const serialized=geometry ? JSON.stringify(geometry) : ''
    if(serialized===lastPublished)return
    syncingGeometry=true
    try{
      await editor.features.deleteAll()
      if(editor!==geoman)return
      if(geometry){
        await editor.features.importGeoJsonFeature({type:'Feature',properties:{shape:'polygon'},geometry:geometry as never})
        if(editor!==geoman)return
        if(serialized===JSON.stringify(asGeometry(props.modelValue)))fitGeometry(geometry)
      }
      lastPublished=serialized
      drawing.value=false
      applyParcelColor()
    }finally{if(editor===geoman)syncingGeometry=false}
  })
  return draftSyncTask
}

function fitGeometry(geometry: Geometry) {
  if (!map) return
  const coordinates: number[][] = []
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      coordinates.push(value as number[])
      return
    }
    value.forEach(visit)
  }
  visit(geometry.coordinates)
  if (coordinates.length < 3) return
  const lngs = coordinates.map((point) => point[0]!)
  const lats = coordinates.map((point) => point[1]!)
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 90, maxZoom: 15, duration: 800 },
  )
}

function fitAllParcels() {
  if (compatibilityMode.value) { compatibilityEditor.value?.fitAllParcels(); return }
  const points = parcelMapCoordinates(props.parcels || [])
  if (!map || !points.length) return
  map.fitBounds([[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],
    [Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]], {padding:90,maxZoom:16,duration:600})
  fittedParcelOverview = true
}

function applyParcelColor() {
  if (!map || !mapLoaded.value || !props.parcelColor) return
  const color = parcelDisplayColor({map_color:props.parcelColor})
  for (const layer of map.getStyle().layers || []) {
    if (!('source' in layer) || !['gm_main','gm_temporary'].includes(String(layer.source))) continue
    if (layer.type === 'fill') map.setPaintProperty(layer.id,'fill-color',color)
    if (layer.type === 'line') map.setPaintProperty(layer.id,'line-color',color)
  }
}

function addParcelLayers() {
  if (!map || !mapLoaded.value) return
  const data = {type:'FeatureCollection',features:(props.parcels || []).filter(parcel=>asGeometry(parcel.geojson)).map((parcel,index)=>({
    type:'Feature',id:parcel.id,geometry:parcel.geojson,
    properties:{id:parcel.id,name:parcel.name,color:parcelDisplayColor(parcel,index),selected:parcel.id===props.selectedParcelId},
  }))}
  if (map.getSource('saved-parcels')) (map.getSource('saved-parcels') as GeoJSONSource).setData(data as never)
  else {
    map.addSource('saved-parcels',{type:'geojson',data:data as never})
    map.addLayer({id:'saved-parcel-fill',type:'fill',source:'saved-parcels',paint:{'fill-color':['get','color'],'fill-opacity':['case',['get','selected'],0.05,0.16]}})
    map.addLayer({id:'saved-parcel-line',type:'line',source:'saved-parcels',paint:{'line-color':['get','color'],'line-width':['case',['get','selected'],4,2.5]}})
  }
  // Parcel names stay in the legend below the map so imagery remains unobstructed.
  if (!fittedParcelOverview && (props.parcels?.length || 0)>1 && editorReady.value) fitAllParcels()
}

function addStationLayers() {
  if (!map || !mapLoaded.value) return
  const polygons = stationFeatures()
  const points = stationPointFeatures()
  if (map.getSource('station-zones')) {
    ;(map.getSource('station-zones') as GeoJSONSource).setData(polygons as never)
  } else {
    map.addSource('station-zones', { type: 'geojson', data: polygons as never })
    map.addLayer({
      id: 'station-zone-fill',
      type: 'fill',
      source: 'station-zones',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
    })
    map.addLayer({
      id: 'station-zone-outline',
      type: 'line',
      source: 'station-zones',
      paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.95 },
    })
  }
  applyInfluenceVisibility()
  stationMarkers.forEach(marker => marker.remove())
  stationMarkers = props.stations.filter(station => station.longitude != null && station.latitude != null).map(station => {
    const index = props.stations.indexOf(station)
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'weather-station-marker'
    element.setAttribute('aria-label', `Estación meteorológica ${station.name}`)
    element.title = station.name
    const icon = document.createElement('img')
    icon.src = weatherStationIconUrl
    icon.alt = ''
    icon.width = 40
    icon.height = 50
    element.appendChild(icon)
    const label = document.createElement('span')
    label.textContent = station.name
    label.style.borderLeft = `3px solid ${stationDisplayColor(station, index)}`
    element.appendChild(label)
    element.addEventListener('click', () => map?.flyTo({center:[station.longitude!, station.latitude!],zoom:14}))
    return new maplibregl.Marker({element, anchor:'bottom'}).setLngLat([station.longitude!, station.latitude!]).addTo(map!)
  })
}

function addImageryLayer() {
  if (!map || !mapLoaded.value) return
  if (map.getLayer('copernicus-index')) map.removeLayer('copernicus-index')
  if (map.getSource('copernicus-index')) map.removeSource('copernicus-index')
  const url = props.imagery?.index_images?.[imageryIndex.value]
  const geometry = asGeometry(props.modelValue)
  if (!url || !geometry) return
  const coordinates: number[][] = []
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      coordinates.push(value as number[])
      return
    }
    value.forEach(visit)
  }
  visit(geometry.coordinates)
  if (!coordinates.length) return
  const west = Math.min(...coordinates.map((point) => point[0]!))
  const east = Math.max(...coordinates.map((point) => point[0]!))
  const south = Math.min(...coordinates.map((point) => point[1]!))
  const north = Math.max(...coordinates.map((point) => point[1]!))
  map.addSource('copernicus-index', {
    type: 'image',
    url: apiUrl(url),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
  })
  map.addLayer({ id: 'copernicus-index', type: 'raster', source: 'copernicus-index', paint: { 'raster-opacity': imageryOpacity.value } }, map.getLayer(navigationOverlay.id) ? navigationOverlay.id : undefined)
}

async function createGeoman() {
  if (!map) return
  const currentMap = map
  editorReady.value = false
  editing.value = false
  const previousEditor = geoman
  geoman = null
  await previousEditor?.destroy({ removeSources: true })
  if (map !== currentMap || mapDestroyed || compatibilityMode.value) return
  draftSyncTask = Promise.resolve()
  syncingGeometry = false
  const editor = new Geoman(currentMap, geomanOptions)
  geoman = editor
  geoman.mapAdapter.on('gm:create', async (event) => {
    if (geoman !== editor || event.shape !== 'polygon' || syncingGeometry) return
    // A public consultation has one parcel; drawing again replaces its outline.
    syncingGeometry = true
    try {
      const features = geoman?.features.exportGeoJson({ allowedShapes: ['polygon'] }).features || []
      for (const feature of features) {
        if (feature.id != null && feature.id !== event.feature.id) await geoman?.features.delete(feature.id)
      }
    } finally {
      syncingGeometry = false
    }
    await geoman?.disableDraw()
    await geoman?.enableGlobalEditMode()
    drawing.value = false
    publishSnapshot()
  })
  editor.mapAdapter.on('gm:editend', () => { if (geoman === editor) publishSnapshot() })
  editor.mapAdapter.on('gm:remove', () => { if (geoman === editor) publishSnapshot() })
  editor.mapAdapter.on('gm:globaldrawmodetoggled', (event) => { if (geoman === editor) drawing.value = event.enabled })
  editor.mapAdapter.on('gm:globaleditmodetoggled', (event) => { if (geoman === editor) editing.value = event.enabled })
  try {
    await editor.waitForGeomanLoaded()
    if (geoman !== editor || map !== currentMap) return
    lastPublished = ''
    await setDraftFromProps()
    if (geoman === editor && map === currentMap) {
      editorReady.value = true
      applyParcelColor()
      addParcelLayers()
    }
  } catch (error) {
    // A style change cancels its old editor; that cancellation is not a GPU failure.
    if (geoman !== editor || map !== currentMap || mapDestroyed || compatibilityMode.value) return
    throw error
  }
}

function clearMapLoadTimer() {
  if (mapLoadTimer) clearTimeout(mapLoadTimer)
  mapLoadTimer = null
}

async function completeMapLoad() {
  try {
    // La proyección Mercator mantiene estable la edición sobre polígonos agrícolas.
    mapLoaded.value = true
    addStationLayers()
    addImageryLayer()
    applyNavigationOverlay()
    addParcelLayers()
    clearMapLoadTimer()
    if (props.overview) {
      fitStations()
      return
    }
    // Un worker de dibujo lento no debe dejar bloqueado el mapa base.
    void createGeoman().catch((error) => {
      if (mapDestroyed || compatibilityMode.value) return
      console.error('[FECOCLIMA IA] No se pudo iniciar el editor de polígonos.', error)
      useCompatibleMap('El mapa avanzado no permitió editar el polígono. Se activó el editor compatible.')
    })
  } catch (error) {
    console.error('[FECOCLIMA IA] No se pudo preparar el mapa.', error)
    useCompatibleMap('El mapa avanzado no pudo inicializarse. Se activó el editor compatible.')
  }
}

/**
 * Emergency fallback: use the existing SVG/HTML map editor when MapLibre, its
 * worker, a provider style or WebGL fail. The producer can still draw and edit
 * the parcel without needing a GPU or a MapTiler key.
 */
function useCompatibleMap(message: string) {
  if (compatibilityMode.value || mapDestroyed) return
  compatibilityMessage.value = message
  clearMapLoadTimer()
  resizeObserver?.disconnect()
  resizeObserver = null
  mapLoaded.value = false
  editorReady.value = false
  drawing.value = false
  editing.value = false
  mapError.value = ''
  compatibilityMode.value = true
  stationMarkers.forEach(marker => marker.remove())
  stationMarkers = []
  const previousMap = map
  const previousGeoman = geoman
  map = null
  geoman = null
  if (previousGeoman) {
    void previousGeoman.destroy({ removeSources: true })
      .catch(() => undefined)
      .finally(() => { try { previousMap?.remove() } catch { /* disposed */ } })
  } else {
    try { previousMap?.remove() } catch { /* disposed */ }
  }
}

function startMapLoadTimer() {
  clearMapLoadTimer()
  mapLoadTimer = setTimeout(() => {
    if (mapLoaded.value || compatibilityMode.value || mapDestroyed) return
    if (!fallbackAttempted) {
      void fallbackToDemoMap()
      return
    }
    useCompatibleMap('El mapa avanzado tardó demasiado en cargar. Se activó automáticamente el mapa compatible para que pueda seguir delimitando su parcela.')
  }, 10000)
}

async function fallbackToDemoMap() {
  if (!map || fallbackAttempted || compatibilityMode.value || mapDestroyed) return
  fallbackAttempted = true
  // Keep a deadline active even if destroying the previous editor stalls.
  startMapLoadTimer()
  mapLoaded.value = false
  editorReady.value = false
  drawing.value = false
  editing.value = false
  const currentMap = map
  const currentGeoman = geoman
  geoman = null
  try {
    await currentGeoman?.destroy({ removeSources: true })
    if (map !== currentMap || compatibilityMode.value || mapDestroyed) return
    const failedStyle = styleChoice.value
    styleChoice.value = failedStyle === 'satellite-hd' ? 'satellite' : 'streets'
    mapError.value = failedStyle === 'satellite-hd'
      ? 'MapTiler no permitió cargar la imagen HD. Se muestra el fondo satelital abierto.'
      : failedStyle === 'satellite' ? 'El fondo satelital abierto no respondió. Puede reintentarlo o continuar en el mapa de calles.' : ''
    currentMap.setStyle(failedStyle === 'satellite-hd' ? mapStyle('satellite') : fallbackStyle(), { diff: false })
    startMapLoadTimer()
  } catch {
    useCompatibleMap('No fue posible cargar el mapa satelital. Se activó el mapa compatible para continuar.')
  }
}

async function setDrawing(enabled: boolean) {
  if (!geoman) return
  drawing.value = enabled
  if (enabled) {
    await geoman.disableGlobalEditMode()
    await geoman.enableDraw('polygon')
  } else {
    await geoman.disableDraw()
  }
}

async function toggleEditing() {
  if (!geoman) return
  drawing.value = false
  await geoman.disableDraw()
  if (geoman.globalEditModeEnabled()) await geoman.disableGlobalEditMode()
  else await geoman.enableGlobalEditMode()
}

function requestClearPolygon() {
  if (props.confirmClear) clearConfirmation.value = true
  else void clearPolygon()
}

async function clearPolygon() {
  clearConfirmation.value = false
  if (clearingPolygon) return
  clearingPolygon = true
  try {
    if (props.beforeClear && !await props.beforeClear()) return
    syncingGeometry = true
    try {
      await geoman?.disableDraw()
      await geoman?.disableGlobalEditMode()
      await geoman?.features.deleteAll()
    } finally {
      syncingGeometry = false
    }
    drawing.value = false
    lastPublished = ''
    emit('update:modelValue', null)
    emit('drawn', null)
  } finally { clearingPolygon = false }
}

async function changeStyle(style: BasemapChoice) {
  if (style === 'satellite-hd' && !hasTilesKey.value) return
  if (hdLoading.value) return
  if (style === 'satellite-hd' && !hdBasemap.value) {
    hdLoading.value = true
    hdError.value = ''
    try {
      const metadata = await $fetch<{tiles:string[]; maxzoom?:number; attribution?:string}>('https://api.maptiler.com/tiles/satellite-v4/tiles.json', {query:{key:String(runtime.public.mapTilerKey).trim()}})
      if (!metadata.tiles?.[0]) throw new Error('Sin teselas HD')
      hdBasemap.value = {id:'maptiler-satellite-hd',tiles:metadata.tiles[0],maxZoom:metadata.maxzoom || 20,credit:'© MapTiler · imágenes HD',creditUrl:'https://www.maptiler.com/copyright/',attribution:metadata.attribution || '© MapTiler'}
    } catch {
      hdError.value = 'El proveedor de imágenes HD no está disponible. Se conserva el fondo abierto.'
      return
    } finally { hdLoading.value = false }
  }
  if (compatibilityMode.value) { styleChoice.value = style; return }
  if (!map || style === styleChoice.value) return
  const feature = geoman?.features.exportGeoJson({ allowedShapes: ['polygon'] }).features[0]
  const current = feature ? asGeometry(feature.geometry) : null
  if (current) {
    lastPublished = JSON.stringify(current)
    emit('update:modelValue', current)
  }
  const previousEditor = geoman
  geoman = null
  await previousEditor?.destroy({ removeSources: true })
  editorReady.value = false
  mapLoaded.value = false
  mapError.value = ''
  fallbackAttempted = false
  styleChoice.value = style
  map.setStyle(mapStyle(style), { diff: false })
  startMapLoadTimer()
}

function fullscreen() {
  const container = componentElement.value
  if (container && !document.fullscreenElement) void container.requestFullscreen()
  else if (document.fullscreenElement) void document.exitFullscreen()
}

function compatibleGeometryChanged(value: unknown) {
  const geometry = asGeometry(value)
  emit('update:modelValue', geometry)
  emit('drawn', geometry)
}

function fitStations() {
  if (!map || !props.overview || !mapLoaded.value) return
  const points = stationMapCoordinates(props.stations)
  if (!points.length) return
  map.fitBounds([
    [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1]))],
    [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1]))],
  ], { padding: 90, maxZoom: 10, duration: 500 })
}

function supportsWebGL2() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    return !!context
  } catch { return false }
}

function initializeMap() {
  if (!mapElement.value || map) return
  if (!supportsWebGL2()) {
    useCompatibleMap('Su navegador no dispone de aceleración gráfica para el mapa avanzado. Se activó el editor compatible.')
    return
  }
  styleChoice.value = props.overview ? 'streets' : 'satellite'
  try {
    map = new maplibregl.Map({
      container: mapElement.value,
      style: mapStyle(styleChoice.value),
      center: [-57.5, -25.3],
      zoom: props.overview ? 1 : 6,
      minZoom: 1,
      maxZoom: 20,
      attributionControl: false,
      cooperativeGestures: false,
      // Page scrolling must remain available while the pointer is over the map.
      // The NavigationControl still supplies +/- zoom buttons.
      scrollZoom: scrollZoomEnabled.value,
      transformRequest: mapRequest,
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('click', event => {
      if (!map?.getLayer('saved-parcel-fill') || drawing.value || props.selectionDisabled) return
      const feature = map.queryRenderedFeatures(event.point,{layers:['saved-parcel-fill']})[0]
      if (feature?.properties?.id) emit('select-parcel',String(feature.properties.id))
    })
    map.on('mousemove', event => {
      if (!map?.getLayer('saved-parcel-fill') || drawing.value) return
      map.getCanvas().style.cursor = !props.selectionDisabled && map.queryRenderedFeatures(event.point,{layers:['saved-parcel-fill']}).length ? 'pointer' : ''
    })
    const instance = map
    map.on('style.load', () => {
      if (map === instance && !compatibilityMode.value) void completeMapLoad()
    })
    startMapLoadTimer()
    map.on('error', (event) => {
      if (!event.error || map !== instance || mapDestroyed || compatibilityMode.value) return
      // Do not print the provider URL: it may contain the MapTiler token.
      const status = Number((event.error as { status?: number }).status || 0)
      const description = String(event.error.message || '')
      const sourceId = (event as typeof event & { sourceId?: string }).sourceId || ''
      if (sourceId === detailSource || /openfreemap.*(?:planet|fonts)/i.test(description)) {
        detailFailed.value = true
        labelsError.value = 'El detalle ampliado no respondió. Se conservan los nombres básicos.'
        applyNavigationOverlay()
        return
      }
      if (sourceId === navigationOverlay.id || /overlay_bright_3857/.test(description)) {
        labelsError.value = 'Los nombres y calles no respondieron. Puede seguir usando el satélite.'
        return
      }
      // Replacing a scene/style can abort its previous image request normally.
      if ((event.error as { name?: string }).name === 'AbortError') return
      if (sourceId.startsWith('copernicus') || /\/satellite\/|\/parcel-imagery\//i.test(description)) {
        mapError.value = 'No se pudo cargar esta capa Copernicus. El fondo del mapa sigue disponible.'
        return
      }
      const basemapError = /maptiler|openfreemap|openstreetmap|maps\.eox|style\.json|raster|tile.*(?:load|fail)/i.test(description)
      console.warn('[FECOCLIMA IA] No se pudo cargar un recurso del mapa', {
        status: status || 'no disponible', source: sourceId || 'estilo',
        detail: description.replace(/https?:\/\/\S+/gi, '[recurso externo]'),
      })
      if (!fallbackAttempted && (basemapError || !mapLoaded.value || status === 401 || status === 403)) {
        void fallbackToDemoMap()
        return
      }
      if (fallbackAttempted && (basemapError || !mapLoaded.value)) {
        useCompatibleMap('Los mapas avanzados no respondieron. Se habilitó automáticamente el mapa compatible.')
        return
      }
      // A failing satellite-index image should never disable the base map.
      if (!mapLoaded.value) useCompatibleMap('No fue posible preparar el mapa avanzado. Se habilitó el mapa compatible.')
    })
    map.on('webglcontextlost', () => {
      if (map === instance) useCompatibleMap('Se interrumpió la aceleración gráfica. El mapa compatible está disponible para continuar.')
    })
    resizeObserver = new ResizeObserver(() => map?.resize())
    resizeObserver.observe(mapElement.value)
  } catch (error) {
    if (/webgl|gpu/i.test(String(error))) {
      useCompatibleMap('La aceleración gráfica falló. Se activó automáticamente el mapa compatible.')
      return
    }
    console.error('[FECOCLIMA IA] No se pudo crear el mapa.', error)
    useCompatibleMap('No se pudo crear el mapa avanzado. Se activó el mapa compatible.')
  }
}

// Nuxt mounts the content of a .client component after its mounted hooks.
// Wait for the actual template element instead of abandoning initialization
// when the first mounted hook runs before that element exists.
watch(mapElement, (element) => {
  if (element) initializeMap()
}, { flush: 'post', immediate: true })

watch(() => props.stations, () => { addStationLayers(); fitStations() }, { deep: true })
watch(() => [props.parcels,props.selectedParcelId,props.selectionDisabled], addParcelLayers, {deep:true})
watch(() => props.parcelColor,applyParcelColor)
watch(() => props.modelValue, () => setDraftFromProps(), { deep: true })
watch(() => [props.imagery, props.modelValue, imageryIndex.value], () => addImageryLayer(), { deep: true })
watch(imageryOpacity, (opacity) => { if (map?.getLayer('copernicus-index')) map.setPaintProperty('copernicus-index', 'raster-opacity', opacity) })
watch(availableImagery, (layers) => {
  if (!layers.includes(imageryIndex.value)) imageryIndex.value = layers.includes('rgb') ? 'rgb' : layers[0] || ''
})
onBeforeUnmount(() => {
  mapDestroyed = true
  clearMapLoadTimer()
  resizeObserver?.disconnect()
  stationMarkers.forEach(marker => marker.remove())
  stationMarkers = []
  const previousMap = map
  const previousGeoman = geoman
  map = null
  geoman = null
  if (previousGeoman) {
    void previousGeoman.destroy({ removeSources: true })
      // Route replacement/HMR can dispose the style before the editor finishes.
      // Map.remove still releases the canvas, workers and remaining controls.
      .catch(() => undefined)
      .finally(() => previousMap?.remove())
  } else previousMap?.remove()
})
</script>

<template>
  <div ref="componentElement" class="world-map-component" :class="{ 'menu-hidden': sidebarHidden }">
    <div class="map-layout-toolbar">
      <button type="button" class="map-menu-toggle" :aria-controls="sidebarId" :aria-expanded="!sidebarHidden" :aria-label="sidebarHidden ? 'Mostrar menú lateral' : 'Ocultar menú y ampliar mapa'" :title="sidebarHidden ? 'Volver a mostrar los controles y las parcelas' : 'Ocultar el menú para usar todo el ancho del mapa'" @click="toggleSidebar">
        <ChevronRight v-if="sidebarHidden" aria-hidden="true" /><ChevronLeft v-else aria-hidden="true" />
        <span>{{ sidebarHidden ? 'Mostrar menú' : 'Ampliar mapa' }}</span>
      </button>
    </div>
    <div v-show="!sidebarHidden" :id="sidebarId" class="map-sidebar-controls">
    <details class="map-controls-menu unified-map-controls" :open="controlsOpen" @toggle="controlsOpen = ($event.target as HTMLDetailsElement).open">
      <summary>
        <span class="controls-menu-title"><span class="controls-title-icon"><SlidersHorizontal aria-hidden="true" /></span><span><strong>Controles del mapa</strong><small>Vista del mapa · Capas Copernicus</small></span></span>
        <span class="controls-current"><span>{{ basemapLabel }}<template v-if="imageryIndex && availableImagery.length"> · {{ imageryNames[imageryIndex] }}</template></span><ChevronDown class="controls-chevron" aria-hidden="true" /></span>
      </summary>
      <div class="controls-body">
        <div class="controls-tabs" role="group" aria-label="Controles del mapa y Copernicus">
          <button type="button" :class="{ active: controlsTab === 'map' }" :aria-pressed="controlsTab === 'map'" @click="controlsTab = 'map'"><MapIcon aria-hidden="true" /><span>Vista del mapa</span></button>
          <button type="button" :class="{ active: controlsTab === 'copernicus' }" :aria-pressed="controlsTab === 'copernicus'" @click="controlsTab = 'copernicus'"><Layers aria-hidden="true" /><span>Capas Copernicus</span><span v-if="availableImagery.length" class="layer-count">{{ availableImagery.length }}</span></button>
        </div>
        <section v-show="controlsTab === 'map'" class="map-controls-content" aria-label="Vista y navegación del mapa">
          <div class="controls-section basemap-section">
            <h3><MapIcon aria-hidden="true" /> Fondo del mapa</h3>
            <div class="map-tool-group" role="group" aria-label="Tipo de mapa">
              <button type="button" :class="{active:styleChoice === 'satellite'}" :aria-pressed="styleChoice === 'satellite'" @click="changeStyle('satellite')"><Satellite aria-hidden="true" /><span>Satélite</span></button>
              <button v-if="hasTilesKey" type="button" :disabled="hdLoading" :class="{active:styleChoice === 'satellite-hd'}" :aria-pressed="styleChoice === 'satellite-hd'" @click="changeStyle('satellite-hd')"><Sparkles aria-hidden="true" /><span>{{ hdLoading ? 'Conectando HD…' : 'Satélite HD' }}</span></button>
              <button type="button" :class="{active:styleChoice === 'streets'}" :aria-pressed="styleChoice === 'streets'" @click="changeStyle('streets')"><MapIcon aria-hidden="true" /><span>Calles</span></button>
            </div>
            <div class="navigation-actions">
              <button type="button" class="map-tool-button location-toggle" :disabled="locating || (!mapLoaded && !compatibilityMode)" @click="locateMe"><LocateFixed aria-hidden="true" /><span>{{ locating ? 'Ubicando…' : 'Mi ubicación' }}</span></button>
              <button type="button" class="map-tool-button" @click="fullscreen"><Maximize2 aria-hidden="true" /><span>Pantalla completa</span></button>
            </div>
          </div>
          <div class="controls-section visibility-section">
            <h3><Eye aria-hidden="true" /> Qué mostrar</h3>
            <div class="visibility-options">
              <button type="button" class="map-tool-button influence-toggle" :class="{active:showInfluence}" :aria-pressed="showInfluence" @click="showInfluence = !showInfluence"><MapPinned aria-hidden="true" /><span>Cobertura de estaciones</span><span class="control-switch" aria-hidden="true" /></button>
              <button v-if="styleChoice !== 'streets'" type="button" class="map-tool-button labels-toggle" :class="{active:showLabels}" :aria-pressed="showLabels" @click="showLabels = !showLabels"><MapIcon aria-hidden="true" /><span>Nombres y caminos</span><span class="control-switch" aria-hidden="true" /></button>
              <button v-if="!compatibilityMode && styleChoice !== 'streets' && showLabels" class="map-tool-button detail-toggle" type="button" :class="{active:detailedLabels}" :aria-pressed="detailedLabels" @click="detailedLabels = !detailedLabels"><Compass aria-hidden="true" /><span>Más referencias</span><span class="control-switch" aria-hidden="true" /></button>
              <button type="button" class="map-tool-button scroll-toggle" :class="{active:scrollZoomEnabled}" :aria-pressed="scrollZoomEnabled" @click="scrollZoomEnabled = !scrollZoomEnabled"><MousePointer2 aria-hidden="true" /><span>Zoom con la rueda</span><span class="control-switch" aria-hidden="true" /></button>
            </div>
            <small>{{ scrollZoomEnabled ? 'Use la rueda para acercar y alejar; arrastre para moverse.' : 'Arrastre para moverse. La rueda desplaza la página.' }}</small>
          </div>
          <span v-if="labelsError && showLabels" class="labels-warning" role="status">{{ labelsError }}</span>
          <span v-if="hdError" class="labels-warning" role="status">{{ hdError }}</span>
          <a v-if="styleChoice === 'satellite-hd'" class="maptiler-logo" href="https://www.maptiler.com/" target="_blank" rel="noopener"><img src="/maptiler-logo.svg" width="100" height="28" alt="MapTiler" /></a>
        </section>
        <section v-show="controlsTab === 'copernicus'" class="imagery-tools" aria-label="Capas multiespectrales Copernicus">
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
            <SpectralLegend v-if="activeLegend" :legend="activeLegend" :index-name="imageryIndex" :grid="imagery?.visual_grid" />
            <p v-else-if="imageryIndex && imageryIndex !== 'rgb'" class="legacy-scale-note">Esta imagen conserva su escala anterior. Actualice las fuentes para usar los rangos del cliente.</p>
          </template>
          <div v-else class="layers-empty" role="status"><Satellite aria-hidden="true" /><div><strong>{{ imageryHistoryLoading ? 'Preparando las capas de su parcela' : 'Las capas aparecerán aquí' }}</strong><p>{{ imageryHistoryLoading ? 'Puede seguir explorando el mapa mientras se completan las imágenes.' : 'Delimite su parcela y consulte las imágenes de Copernicus para elegir qué observar.' }}</p></div></div>
        </section>
      </div>
    </details>
    <div v-if="parcels?.length" class="saved-parcel-legend" aria-label="Parcelas en el mapa">
      <b>Mis parcelas</b><button v-for="(parcel,index) in parcels" :key="parcel.id" type="button" :disabled="selectionDisabled" :aria-pressed="parcel.id===selectedParcelId" :data-parcel-choice="parcel.id" @click="emit('select-parcel',parcel.id)"><i :style="{backgroundColor:parcelDisplayColor(parcel,index)}"/>{{parcel.name}}</button>
      <button v-if="parcels.length>1" type="button" @click="fitAllParcels">Ver todas las parcelas</button>
    </div>
    </div>
    <div class="world-map-shell" :class="{ 'compatibility-mode': compatibilityMode }">
    <template v-if="compatibilityMode">
      <div class="compatibility-notice" role="status">
        <span>{{ compatibilityMessage || (overview ? 'Mapa de estaciones en modo compatible.' : 'Mapa compatible: puede navegar, dibujar y mover los vértices.') }}</span>
        <button type="button" class="map-tool-button" @click="retryMap">Probar mapa avanzado</button>
      </div>
      <StationPolygonEditor
        ref="compatibilityEditor"
        :parcels="parcels"
        :selected-parcel-id="selectedParcelId"
        :polygon-color="parcelColor"
        :selection-disabled="selectionDisabled"
        @select-parcel="emit('select-parcel',$event)"
        parcel-mode
        compact-controls
        :scroll-zoom="scrollZoomEnabled"
        :initial-zoom="overview ? 2 : 6"
        :read-only="overview || readOnly"
        :model-value="modelValue"
        :stations="stations"
        :show-influence="showInfluence"
        :basemap="compatibleBasemap"
        :labels-basemap="showLabels && styleChoice !== 'streets' ? navigationOverlay : null"
        :confirm-clear="confirmClear"
        :before-clear="beforeClear"
        :clear-message="clearMessage"
        :overlay-opacity="imageryOpacity"
        :overlay-url="imagery?.index_images?.[imageryIndex] ? apiUrl(imagery.index_images[imageryIndex]!) : null"
        @basemap-error="styleChoice === 'satellite-hd' && changeStyle('satellite')"
        @update:model-value="compatibleGeometryChanged"
      />
      <div class="compatibility-summary">
        <strong v-if="areaHectares != null">Área aproximada: {{ areaHectares.toLocaleString('es-PY', { maximumFractionDigits: 2 }) }} ha</strong>
        <span v-if="coverage != null">Cobertura meteorológica: {{ coverage.toFixed(1) }}%</span>
        <span v-for="(station, index) in stations" :key="station.id"><i :style="{ background: stationDisplayColor(station, index) }" />{{ station.name }}</span>
      </div>
    </template>
    <template v-else>
    <div ref="mapElement" class="world-map" aria-label="Mapa interactivo para delimitar la parcela" />
    <p v-if="!mapLoaded && !mapError" class="map-loading" role="status">Cargando mapa…</p>
    <div class="map-tools">
      <button v-if="!overview && !readOnly" class="map-tool-button" :disabled="!editorReady" :class="{ active: drawing || editing }" @click="modelValue ? toggleEditing() : setDrawing(!drawing)">
        {{ drawing ? 'Cancelar dibujo' : modelValue ? editing ? 'Terminar edición' : 'Editar vértices' : mapLoaded && !editorReady ? 'Preparando dibujo…' : 'Dibujar parcela' }}
      </button>
      <button v-if="modelValue && !readOnly" class="map-tool-button clear" @click="requestClearPolygon">Borrar polígono</button>
    </div>
    <div class="map-legend" aria-label="Áreas de influencia de estaciones">
      <b>Cobertura de estaciones</b>
      <span v-if="!stations.length">No hay estaciones activas configuradas.</span>
      <span v-for="(station, index) in stations" :key="station.id" class="legend-row">
        <i :style="{ backgroundColor: stationDisplayColor(station, index) }" />
        <span>{{ station.name }}<em v-if="!asGeometry(station.influence_geojson)">Sin área de cobertura definida</em></span>
      </span>
      <small>{{ overview ? 'Estaciones inactivas en gris' : parcelColor ? 'Límites de parcela con el color elegido' : 'Parcela delimitada en amarillo' }}</small>
     </div>
    <p class="map-provider-note">{{ styleChoice === 'satellite' ? 'Fondo EOX · mosaico histórico 2016/2017. Escena reciente e índices: Copernicus.' : styleChoice === 'satellite-hd' ? 'Fondo HD · MapTiler. Escena agrícola e índices: Copernicus.' : 'Calles · OpenFreeMap / OpenStreetMap.' }}</p>
    <p v-if="drawing && mapLoaded" class="map-instructions">Marque las esquinas de su parcela. Para finalizar, toque el primer punto.</p>
    <div v-if="mapError" class="map-error" :class="{ 'map-warning': fallbackAttempted && mapLoaded }" role="status">{{ mapError }} <button type="button" @click="retryMap">Reintentar</button></div>
    <div v-if="coverage != null" class="map-coverage-chip">
      Cobertura {{ coverage.toFixed(1) }}%
    </div>
    </template>
  </div>
    <ConfirmationModal :open="clearConfirmation" title="¿Borrar el polígono?" :message="clearMessage || 'Se borrará el polígono y se limpiarán los widgets de esta consulta.'" @cancel="clearConfirmation = false" @confirm="clearPolygon" />
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
