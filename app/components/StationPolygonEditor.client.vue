<script setup lang="ts">
import { stationMapCoordinates, stationDisplayColor, weatherStationIconUrl } from '~/utils/stations'
import { navigationOverlay, type RasterBasemap } from '~/utils/mapBasemaps'
import {
  CircleDot,
  Crosshair,
  LocateFixed,
  MapPinned,
  Maximize2,
  MousePointer2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import { parcelDisplayColor, parcelMapCoordinates } from '~/utils/parcelColors'
import type { MapStation, MapParcel } from '~/types/plots'

type Coordinate = [number, number]
type GeoJsonGeometry = { type: 'Polygon'; coordinates: Coordinate[][] }
type GeoJsonFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: GeoJsonGeometry }
type EditorMode = 'navigate' | 'draw'

type SearchResult = {
  place_id: number | string
  display_name: string
  lat: string
  lon: string
  type?: string
  boundingbox?: [string, string, string, string]
}

const props = withDefaults(defineProps<{
  compactControls?: boolean
  parcelMode?: boolean
  scrollZoom?: boolean
  modelValue?: Record<string, any> | string | null
  latitude?: number | string | null
  longitude?: number | string | null
  radius?: number | string | null
  initialZoom?: number
  stations?: MapStation[]
  parcels?: MapParcel[]
  selectedParcelId?: string
  selectionDisabled?: boolean
  polygonColor?: string
  showInfluence?: boolean
  overlayUrl?: string | null
  overlayOpacity?: number
  basemap?: RasterBasemap
  labelsBasemap?: RasterBasemap | null
  confirmClear?: boolean
  beforeClear?: () => Promise<boolean>
  clearMessage?: string
  pointMode?: boolean
  readOnly?: boolean
}>(), {
  parcelMode: false,
  scrollZoom: true,
  modelValue: null,
  latitude: null,
  longitude: null,
  radius: 750,
  initialZoom: 14,
  stations: () => [],
  parcels: () => [],
  showInfluence: true,
  overlayUrl: null,
  overlayOpacity: 0.78,
  basemap: () => useSatelliteBasemap(),
  labelsBasemap: () => navigationOverlay,
  pointMode: false,
  readOnly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: GeoJsonFeature | null]
  'update:latitude': [value: number]
  'update:longitude': [value: number]
  'basemap-error': []
  'select-parcel': [id: string]
}>()

const mapRef = ref<HTMLElement | null>(null)
const width = ref(620)
const height = ref(390)
const zoom = ref(props.initialZoom)
const clearConfirmation = ref(false)
let clearingPolygon = false
const points = ref<Coordinate[]>([])
const rawGeoJson = ref('')
const parseError = ref('')
const mode = ref<EditorMode>('navigate')
const viewCenter = ref<Coordinate>([-57.6359, -25.3007])
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searchLoading = ref(false)
const searchError = ref('')
const locating = ref(false)
const locationMessage = ref('')
const isPanning = ref(false)

let syncingFromProps = false
let internalCoordinateUpdate = false
let pointerState: {
  pointerId: number
  startX: number
  startY: number
  startCenterWorld: { x: number; y: number }
  moved: boolean
  vertexIndex: number | null
  parcelId: string | null
} | null = null

const fallbackCenter: Coordinate = [-57.6359, -25.3007]

function numeric(value: unknown, fallback: number): number {
  if (value == null || String(value).trim() === '') return fallback
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function validLatitude(value: unknown): number | null {
  const parsed = numeric(value, Number.NaN)
  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90 ? parsed : null
}

function validLongitude(value: unknown): number | null {
  const parsed = numeric(value, Number.NaN)
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 ? parsed : null
}

const stationCoordinate = computed<Coordinate>(() => {
  const latitude = validLatitude(props.latitude)
  const longitude = validLongitude(props.longitude)
  return longitude !== null && latitude !== null ? [longitude, latitude] : fallbackCenter
})

const hasStationCoordinates = computed(() => validLatitude(props.latitude) !== null && validLongitude(props.longitude) !== null)
const centerLatitude = computed(() => viewCenter.value[1])
const centerLongitude = computed(() => viewCenter.value[0])

function clampLatitude(value: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, value))
}

function lonLatToWorld([longitude, latitude]: Coordinate, level = zoom.value): { x: number; y: number } {
  const scale = 256 * 2 ** level
  const boundedLatitude = clampLatitude(latitude)
  const sin = Math.sin((boundedLatitude * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function worldToLonLat(x: number, y: number, level = zoom.value): Coordinate {
  const scale = 256 * 2 ** level
  const longitude = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n))
  return [Number(longitude.toFixed(7)), Number(clampLatitude(latitude).toFixed(7))]
}

const centerWorld = computed(() => lonLatToWorld(viewCenter.value))
const viewportTopLeft = computed(() => ({
  x: centerWorld.value.x - width.value / 2,
  y: centerWorld.value.y - height.value / 2,
}))

function rasterTiles(basemap: RasterBasemap) {
  const nativeZoom = Math.min(zoom.value, basemap.maxZoom)
  const scale = 2 ** (zoom.value - nativeZoom)
  const size = 256 * scale
  const center = lonLatToWorld(viewCenter.value, nativeZoom)
  const left = center.x - width.value / (2 * scale)
  const top = center.y - height.value / (2 * scale)
  const startX = Math.floor(left / 256), startY = Math.floor(top / 256)
  const endX = Math.floor((left + width.value / scale) / 256)
  const endY = Math.floor((top + height.value / scale) / 256)
  const count = 2 ** nativeZoom
  const rows: Array<{ key: string; url: string; left: number; top: number; size: number }> = []
  for (let y = startY; y <= endY; y += 1) {
    if (y < 0 || y >= count) continue
    for (let x = startX; x <= endX; x += 1) {
      const wrappedX = ((x % count) + count) % count
      rows.push({
        key: `${basemap.id}-${nativeZoom}-${x}-${y}`,
        url: basemap.tiles.replace('{z}', String(nativeZoom)).replace('{x}', String(wrappedX)).replace('{y}', String(y)),
        left: (x * 256 - left) * scale, top: (y * 256 - top) * scale, size,
      })
    }
  }
  return rows
}
const tiles = computed(() => rasterTiles(props.basemap))
const labelTiles = computed(() => props.labelsBasemap ? rasterTiles(props.labelsBasemap) : [])

function pointToScreen(point: Coordinate): { x: number; y: number } {
  const world = lonLatToWorld(point)
  return { x: world.x - viewportTopLeft.value.x, y: world.y - viewportTopLeft.value.y }
}

const screenPoints = computed(() => points.value.map((point, index) => ({ ...pointToScreen(point), index })))
const polygonPoints = computed(() => screenPoints.value.map(item => `${item.x},${item.y}`).join(' '))
const stationScreen = computed(() => pointToScreen(stationCoordinate.value))
const stationOverlays = computed(() => props.stations.map((station, index) => {
  const geometry = station.influence_geojson
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates || []
  const path = (polygons as number[][][][]).flatMap(polygon => polygon.map(ring => ring.map((coordinate, i) => {
    const point = pointToScreen(coordinate as Coordinate)
    return `${i ? 'L' : 'M'}${point.x},${point.y}`
  }).join(' ') + ' Z')).join(' ')
  return {
    id: station.id, name: station.name, color: stationDisplayColor(station, index), path,
    point: station.longitude != null && station.latitude != null ? pointToScreen([station.longitude, station.latitude]) : null,
  }
}))
const parcelOverlays = computed(()=>props.parcels.filter(parcel=>parcel.geojson?.coordinates).map((parcel,index)=>{
  const geometry=parcel.geojson
  const polygons=geometry.type==='Polygon' ? [geometry.coordinates] : geometry.coordinates
  const path=(polygons as number[][][][]).map(polygon=>polygon.map(ring=>ring.map((coordinate,i)=>{
    const point=pointToScreen(coordinate as Coordinate)
    return `${i?'L':'M'}${point.x},${point.y}`
  }).join(' ')+' Z').join(' ')).join(' ')
  return {id:parcel.id,name:parcel.name,color:parcelDisplayColor(parcel,index),path,selected:parcel.id===props.selectedParcelId}
}))
let fittedParcelOverview=false
function fitAllParcels(){
  const coordinates=parcelMapCoordinates(props.parcels)
  if(coordinates.length){fitCoordinates(coordinates,80);fittedParcelOverview=true}
}
defineExpose({fitAllParcels,useCurrentLocation})

const overlayBounds = computed(() => {
  if (!points.value.length) return null
  const west = Math.min(...points.value.map(point => point[0]))
  const east = Math.max(...points.value.map(point => point[0]))
  const south = Math.min(...points.value.map(point => point[1]))
  const north = Math.max(...points.value.map(point => point[1]))
  const topLeft = pointToScreen([west, north]), bottomRight = pointToScreen([east, south])
  return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
})

function featureFromPoints(value: Coordinate[]): GeoJsonFeature | null {
  if (value.length < 3) return null
  const ring = [...value]
  const first = ring[0]!
  const last = ring[ring.length - 1]!
  if (!last || last[0] !== first[0] || last[1] !== first[1]) ring.push([...first] as Coordinate)
  return {
    type: 'Feature',
    properties: { source: 'station_influence_cms' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

function extractPoints(value: Record<string, any> | string | null | undefined): Coordinate[] {
  if (!value) return []
  let parsed: any = value
  if (typeof value === 'string') {
    if (!value.trim()) return []
    parsed = JSON.parse(value)
  }
  const geometry = parsed?.type === 'Feature' ? parsed.geometry : parsed
  const ringSource = geometry?.type === 'Polygon'
    ? geometry.coordinates?.[0]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates?.[0]?.[0]
      : null
  if (!Array.isArray(ringSource)) return []
  const ring = ringSource
    .filter((item: unknown) => Array.isArray(item) && item.length >= 2)
    .map((item: any[]) => [Number(item[0]), Number(item[1])] as Coordinate)
    .filter((item: Coordinate) => Number.isFinite(item[0]) && Number.isFinite(item[1]) && item[0] >= -180 && item[0] <= 180 && item[1] >= -90 && item[1] <= 90)
  if (ring.length > 1) {
    const first = ring[0]!
    const last = ring[ring.length - 1]!
    if (first[0] === last[0] && first[1] === last[1]) ring.pop()
  }
  return ring
}

function publish() {
  if (syncingFromProps) return
  const feature = featureFromPoints(points.value)
  rawGeoJson.value = feature ? JSON.stringify(feature, null, 2) : ''
  emit('update:modelValue', feature)
}

function setStationCoordinate(coordinate: Coordinate, message = 'Ubicación de la estación actualizada.') {
  const [longitude, latitude] = coordinate
  internalCoordinateUpdate = true
  emit('update:latitude', Number(latitude.toFixed(7)))
  emit('update:longitude', Number(longitude.toFixed(7)))
  viewCenter.value = [longitude, latitude]
  locationMessage.value = message
  window.setTimeout(() => { internalCoordinateUpdate = false }, 0)
}

function addPointFromClient(clientX: number, clientY: number) {
  if (!mapRef.value) return
  const bounds = mapRef.value.getBoundingClientRect()
  const worldX = viewportTopLeft.value.x + clientX - bounds.left
  const worldY = viewportTopLeft.value.y + clientY - bounds.top
  points.value.push(worldToLonLat(worldX, worldY))
  parseError.value = ''
  publish()
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (target.closest('button, input, a, .search-results')) return
  const vertex = target.closest('[data-vertex-index]')
  pointerState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startCenterWorld: lonLatToWorld(viewCenter.value),
    moved: false,
    parcelId: target.closest('[data-parcel-id]')?.getAttribute('data-parcel-id') || null,
    vertexIndex: vertex && !props.readOnly ? Number(vertex.getAttribute('data-vertex-index')) : null,
  }
  isPanning.value = mode.value === 'navigate'
  mapRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return
  if (pointerState.vertexIndex != null && mapRef.value) {
    const bounds = mapRef.value.getBoundingClientRect()
    points.value[pointerState.vertexIndex] = worldToLonLat(viewportTopLeft.value.x + event.clientX - bounds.left, viewportTopLeft.value.y + event.clientY - bounds.top)
    pointerState.moved = true
    return
  }
  if (mode.value !== 'navigate') return
  const deltaX = event.clientX - pointerState.startX
  const deltaY = event.clientY - pointerState.startY
  if (Math.abs(deltaX) + Math.abs(deltaY) > 4) pointerState.moved = true
  viewCenter.value = worldToLonLat(
    pointerState.startCenterWorld.x - deltaX,
    pointerState.startCenterWorld.y - deltaY,
  )
}

function onPointerUp(event: PointerEvent) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return
  const state = pointerState
  pointerState = null
  isPanning.value = false
  try { mapRef.value?.releasePointerCapture(event.pointerId) } catch { /* no-op */ }
  if (state.vertexIndex != null) publish()
  else if (state.parcelId && !state.moved && mode.value==='navigate' && !props.selectionDisabled) emit('select-parcel',state.parcelId)
  else if (props.pointMode && !state.moved) {
    const bounds = mapRef.value!.getBoundingClientRect()
    setStationCoordinate(worldToLonLat(viewportTopLeft.value.x + event.clientX - bounds.left, viewportTopLeft.value.y + event.clientY - bounds.top), 'Punto seleccionado en el mapa.')
  }
  else if (mode.value === 'draw' && !state.moved) addPointFromClient(event.clientX, event.clientY)
}

function undo() {
  points.value.pop()
  publish()
}

function clearPolygon() {
  if (props.confirmClear) { clearConfirmation.value = true; return }
  confirmClearPolygon()
}
async function confirmClearPolygon() {
  clearConfirmation.value = false
  if (clearingPolygon) return
  clearingPolygon = true
  try {
    if (props.beforeClear && !await props.beforeClear()) return
    points.value = []
    parseError.value = ''
    publish()
  } finally { clearingPolygon = false }
}

function createRadiusPolygon() {
  const coordinate = hasStationCoordinates.value
    ? stationCoordinate.value
    : ([...viewCenter.value] as Coordinate)
  if (!hasStationCoordinates.value) {
    setStationCoordinate(coordinate, 'Se usó el centro visible como ubicación de la estación.')
  }
  const radius = Math.max(10, numeric(props.radius, 750))
  const [longitude, latitude] = coordinate
  const coordinates: Coordinate[] = []
  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2
    const north = Math.cos(angle) * radius
    const east = Math.sin(angle) * radius
    const latitudeOffset = north / 111_320
    const longitudeOffset = east / (111_320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)))
    coordinates.push([Number((longitude + longitudeOffset).toFixed(7)), Number((latitude + latitudeOffset).toFixed(7))])
  }
  points.value = coordinates
  parseError.value = ''
  publish()
  fitPolygon()
}

function applyRawGeoJson() {
  try {
    const parsed = extractPoints(rawGeoJson.value)
    if (parsed.length < 3) throw new Error('El GeoJSON necesita un Polygon o MultiPolygon con al menos tres vértices.')
    points.value = parsed
    parseError.value = ''
    publish()
    fitPolygon()
  } catch (exception: any) {
    parseError.value = exception?.message || 'GeoJSON inválido.'
  }
}

function changeZoom(delta: number) {
  zoom.value = Math.max(3, Math.min(19, zoom.value + delta))
}

function onWheel(event: WheelEvent) {
  // For the public parcel map, let the browser scroll the page normally.
  if (!props.scrollZoom) return
  event.preventDefault()
  changeZoom(event.deltaY < 0 ? 1 : -1)
}

function fitCoordinates(coordinates: Coordinate[], padding = 70) {
  if (!coordinates.length) return
  if (coordinates.length === 1) {
    viewCenter.value = [...coordinates[0]!] as Coordinate
    zoom.value = Math.max(zoom.value, 15)
    return
  }
  for (let candidate = 19; candidate >= 3; candidate -= 1) {
    const world = coordinates.map(item => lonLatToWorld(item, candidate))
    const minX = Math.min(...world.map(item => item.x))
    const maxX = Math.max(...world.map(item => item.x))
    const minY = Math.min(...world.map(item => item.y))
    const maxY = Math.max(...world.map(item => item.y))
    if (maxX - minX <= Math.max(80, width.value - padding * 2) && maxY - minY <= Math.max(80, height.value - padding * 2)) {
      zoom.value = candidate
      viewCenter.value = worldToLonLat((minX + maxX) / 2, (minY + maxY) / 2, candidate)
      return
    }
  }
}

function fitPolygon() {
  if (points.value.length) fitCoordinates(points.value)
}

function centerOnStation() {
  viewCenter.value = [...stationCoordinate.value] as Coordinate
  zoom.value = Math.max(zoom.value, 15)
}

function useMapCenter() {
  setStationCoordinate(viewCenter.value, 'El centro del mapa quedó guardado como ubicación de la estación.')
}

function parseCoordinateSearch(value: string): Coordinate | null {
  const match = value.trim().match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*[,;\s]\s*([+-]?\d+(?:[.,]\d+)?)\s*$/)
  if (!match) return null
  const latitude = Number(match[1]!.replace(',', '.'))
  const longitude = Number(match[2]!.replace(',', '.'))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [longitude, latitude]
}

async function searchPlace() {
  const query = searchQuery.value.trim()
  searchResults.value = []
  searchError.value = ''
  locationMessage.value = ''
  if (query.length < 3) {
    searchError.value = 'Escriba al menos tres caracteres o coordenadas como -26.1585, -55.2722.'
    return
  }
  const coordinate = parseCoordinateSearch(query)
  if (coordinate) {
    setStationCoordinate(coordinate, 'Coordenadas encontradas y aplicadas a la estación.')
    zoom.value = 16
    return
  }
  searchLoading.value = true
  try {
    const result = await $fetch<SearchResult[]>('https://nominatim.openstreetmap.org/search', {
      query: {
        q: query,
        format: 'jsonv2',
        addressdetails: 1,
        limit: 6,
        'accept-language': 'es',
      },
    })
    searchResults.value = Array.isArray(result) ? result : []
    if (!searchResults.value.length) searchError.value = 'No se encontraron lugares. Pruebe con localidad, distrito y departamento.'
  } catch (exception: any) {
    searchError.value = exception?.message || 'No fue posible consultar el buscador de OpenStreetMap.'
  } finally {
    searchLoading.value = false
  }
}

function selectSearchResult(result: SearchResult) {
  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  setStationCoordinate([longitude, latitude], 'Lugar seleccionado y aplicado a la estación.')
  searchQuery.value = result.display_name
  searchResults.value = []
  zoom.value = 16
}

function useCurrentLocation() {
  searchError.value = ''
  locationMessage.value = ''
  if (!navigator.geolocation) {
    searchError.value = 'Este navegador no ofrece geolocalización.'
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setStationCoordinate(
        [position.coords.longitude, position.coords.latitude],
        `Ubicación del dispositivo aplicada con precisión aproximada de ${Math.round(position.coords.accuracy)} m.`,
      )
      zoom.value = 17
      locating.value = false
    },
    (error) => {
      searchError.value = error.message || 'No fue posible obtener la ubicación del dispositivo.'
      locating.value = false
    },
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
  )
}

function syncModel(value: Record<string, any> | string | null | undefined) {
  try {
    syncingFromProps = true
    const nextPoints = extractPoints(value)
    if (JSON.stringify(nextPoints) === JSON.stringify(points.value)) return
    points.value = nextPoints
    const feature = featureFromPoints(points.value)
    rawGeoJson.value = feature ? JSON.stringify(feature, null, 2) : ''
    parseError.value = ''
    nextTick(() => {
      if (points.value.length) fitPolygon()
      else if (hasStationCoordinates.value) centerOnStation()
    })
  } catch {
    points.value = []
    rawGeoJson.value = typeof value === 'string' ? value : ''
    parseError.value = 'No se pudo interpretar el polígono guardado.'
  } finally {
    syncingFromProps = false
  }
}

watch(() => props.modelValue, value => syncModel(value), { immediate: true, deep: true })
watch(
  () => [props.longitude, props.latitude] as const,
  ([longitudeValue, latitudeValue]) => {
    if (internalCoordinateUpdate) return
    const longitude = validLongitude(longitudeValue)
    const latitude = validLatitude(latitudeValue)
    if (longitude !== null && latitude !== null) viewCenter.value = [longitude, latitude]
  },
)

function fitOverview() {
  if (!props.readOnly || !mapRef.value) return
  const coordinates = stationMapCoordinates(props.stations)
  if (coordinates.length) { fitCoordinates(coordinates, 100); zoom.value = Math.min(zoom.value, 10) }
}
watch(()=>props.parcels,()=>{if(mapRef.value && !fittedParcelOverview && props.parcels.length>1)nextTick(fitAllParcels)}, {deep:true,flush:'post'})
watch(() => props.stations, fitOverview, { deep: true, flush: 'post' })

// Nuxt can mount a .client component before its client-only template exists.
// Follow the actual element so sizing also reconnects when the view is remounted.
const stopObservingMap = watch(mapRef, (element, _previous, onCleanup) => {
  if (!element) return
  const updateSize = () => {
    width.value = element.clientWidth || 620
    height.value = element.clientHeight || 390
  }
  updateSize()
  nextTick(()=>{if(!fittedParcelOverview && props.parcels.length>1)fitAllParcels()})
  const observer = new ResizeObserver(updateSize)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
  if (props.readOnly) fitOverview()
  else if (points.value.length) fitPolygon()
  else if (hasStationCoordinates.value) centerOnStation()
}, { flush: 'post' })

onBeforeUnmount(() => {
  stopObservingMap()
  pointerState = null
  isPanning.value = false
})
</script>

<template>
  <div class="polygon-editor">
    <div v-if="!pointMode && !readOnly" class="place-search">
      <form class="search-form" @submit.prevent="searchPlace">
        <Search />
        <input
          v-model="searchQuery"
          type="search"
          autocomplete="off"
          placeholder="Buscar localidad, finca o coordenadas: -26.1585, -55.2722"
          aria-label="Buscar ubicación en el mapa"
        >
        <button type="submit" class="btn btn-primary" :disabled="searchLoading">
          {{ searchLoading ? 'Buscando…' : 'Buscar' }}
        </button>
      </form>
      <div v-if="searchResults.length" class="search-results">
        <button v-for="result in searchResults" :key="result.place_id" type="button" @click="selectSearchResult(result)">
          <MapPinned />
          <span>{{ result.display_name }}</span>
        </button>
      </div>
      <p v-if="searchError" class="field-error">{{ searchError }}</p>
      <p v-else-if="locationMessage" class="location-message">{{ locationMessage }}</p>
    </div>

    <div class="editor-toolbar">
      <div v-if="!pointMode && !readOnly" class="mode-switch" aria-label="Modo del mapa">
        <button type="button" :class="{ active: mode === 'navigate' }" @click="mode = 'navigate'">
          <MousePointer2 /> Navegar
        </button>
        <button type="button" :class="{ active: mode === 'draw' }" @click="mode = 'draw'">
          <Pencil /> Dibujar polígono
        </button>
      </div>
      <button v-if="!compactControls" type="button" class="map-action" title="Usar la ubicación del dispositivo" :disabled="locating" @click="useCurrentLocation">
        <LocateFixed /> {{ locating ? 'Ubicando…' : 'Mi ubicación' }}
      </button>
      <button v-if="!readOnly && !compactControls" type="button" class="map-action" title="Guardar el centro visible como ubicación de la estación" @click="useMapCenter">
        <Crosshair /> {{ parcelMode ? "Centrar parcela aquí" : "Fijar estación aquí" }}
      </button>
      <button v-if="!pointMode && !readOnly && !compactControls" type="button" class="map-action" title="Crear un área aproximada con el radio configurado" @click="createRadiusPolygon">
        <CircleDot /> Área por radio
      </button>
      <button v-if="!pointMode && !readOnly" type="button" class="map-action" :disabled="!points.length" @click="undo"><Undo2 /> Deshacer</button>
      <button v-if="!pointMode && !readOnly" type="button" class="map-action danger" :disabled="!points.length" @click="clearPolygon"><Trash2 /> Limpiar</button>
      <span v-if="!pointMode && !readOnly" class="vertex-count">{{ points.length }} vértices</span>
    </div>

    <div
      ref="mapRef"
      class="map"
      :class="{ 'is-drawing': mode === 'draw', 'is-panning': isPanning }"
      role="application"
      aria-label="Editor navegable del polígono de influencia"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <img
        v-for="tile in tiles"
        :key="tile.key"
        class="map-tile"
        :src="tile.url"
        @error="emit('basemap-error')"
        alt=""
        draggable="false"
        :style="{ left: `${tile.left}px`, top: `${tile.top}px`, width: `${tile.size}px`, height: `${tile.size}px` }"
      >
      <svg class="overlay" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" aria-hidden="true">
        <g v-for="station in stationOverlays" :key="station.id">
          <path v-if="showInfluence && station.path" :d="station.path" :fill="station.color" fill-opacity="0.2" :stroke="station.color" stroke-width="2" fill-rule="evenodd" />

        </g>
        <image v-if="overlayUrl && overlayBounds" :href="overlayUrl" v-bind="overlayBounds" preserveAspectRatio="none" :opacity="overlayOpacity" />
        <g v-for="parcel in parcelOverlays" :key="`parcel-${parcel.id}`"><path :d="parcel.path" :data-parcel-id="parcel.id" :fill="parcel.color" :fill-opacity="parcel.selected ? 0.05 : 0.16" :stroke="parcel.color" :stroke-width="parcel.selected ? 4 : 2.5" fill-rule="evenodd" :style="{pointerEvents:'visiblePainted',cursor:selectionDisabled?'default':'pointer'}"><title>{{parcel.name}}</title></path></g>
        <polygon v-if="screenPoints.length >= 3" :style="polygonColor ? {stroke:polygonColor,fill:polygonColor,fillOpacity:0.08} : {}" :points="polygonPoints" class="polygon-shape" />
        <polyline v-else-if="screenPoints.length >= 2" :points="polygonPoints" class="polygon-line" :style="polygonColor ? {stroke:polygonColor} : {}" />
        <circle v-for="item in screenPoints" :key="item.index" :data-vertex-index="item.index" :cx="item.x" :cy="item.y" r="7" class="vertex" />
        <g v-for="station in stationOverlays" :key="`marker-${station.id}`"><g v-if="station.point" class="weather-station-symbol" :transform="`translate(${station.point.x-20},${station.point.y-50})`"><title>{{ station.name }}</title><image :href="weatherStationIconUrl" width="40" height="50"/><text x="44" y="28" :fill="station.color" stroke="white" stroke-width="3" paint-order="stroke" font-size="12" font-weight="700">{{ station.name }}</text></g></g>
        <image v-if="hasStationCoordinates && !stations.length" :href="weatherStationIconUrl" :x="stationScreen.x-20" :y="stationScreen.y-50" width="40" height="50" />
      </svg>
      <div class="center-crosshair" aria-hidden="true"><span /><span /></div>
      <div class="zoom-controls">
        <button type="button" title="Acercar" @click.stop="changeZoom(1)"><ZoomIn /></button>
        <button type="button" title="Alejar" @click.stop="changeZoom(-1)"><ZoomOut /></button>
        <button type="button" title="Centrar en la estación" @click.stop="centerOnStation"><Crosshair /></button>
        <button type="button" title="Mostrar todo el polígono" :disabled="!points.length" @click.stop="fitPolygon"><Maximize2 /></button>
      </div>
      <div class="map-hint">
        <MousePointer2 v-if="mode === 'navigate'" />
        <Pencil v-else />
        <span v-if="pointMode">Arrastre para navegar. Haga clic en el punto de la estación.</span>
        <span v-else-if="mode === 'navigate'">Arrastre para recorrer el mapa y use la rueda para acercar.</span>
        <span v-else>Haga clic en los límites del terreno. Use “Navegar” cuando necesite mover el mapa.</span>
      </div>
      <img v-for="tile in labelTiles" :key="tile.key" class="map-tile labels-tile" :src="tile.url" alt="" draggable="false" :style="{left: `${tile.left}px`, top: `${tile.top}px`, width: `${tile.size}px`, height: `${tile.size}px`}" />
      <a v-if="labelsBasemap" class="osm-credit labels-credit" :href="labelsBasemap.creditUrl" target="_blank" rel="noopener" @pointerdown.stop>{{ labelsBasemap.credit }}</a>
      <a class="osm-credit" :href="basemap.creditUrl" target="_blank" rel="noopener" @pointerdown.stop>{{ basemap.credit }}</a>
    </div>

    <div class="coordinate-summary">
      <MapPinned />
      Centro visible: {{ centerLatitude.toFixed(6) }}, {{ centerLongitude.toFixed(6) }} · zoom {{ zoom }}
      <template v-if="hasStationCoordinates">
        · {{ parcelMode ? "Referencia" : "Estación" }}: {{ stationCoordinate[1].toFixed(6) }}, {{ stationCoordinate[0].toFixed(6) }}
      </template>
    </div>

    <div v-if="!pointMode && !readOnly" class="workflow-help">
      <b>Flujo recomendado:</b> busque la zona → navegue hasta el terreno → active <b>Dibujar polígono</b> y marque sus límites → guarde {{ parcelMode ? "la parcela" : "la estación" }}.
    </div>

    <details v-if="!pointMode && !readOnly" class="advanced">
      <summary>Edición avanzada de GeoJSON</summary>
      <textarea v-model="rawGeoJson" class="textarea raw-json" rows="8" placeholder='{"type":"Feature","geometry":{"type":"Polygon","coordinates":[...]}}' />
      <button type="button" class="btn btn-light apply-json" @click="applyRawGeoJson"><RotateCcw /> Aplicar GeoJSON</button>
      <p v-if="parseError" class="field-error">{{ parseError }}</p>
    </details>
  </div>
    <ConfirmationModal :open="clearConfirmation" title="¿Borrar el polígono?" :message="clearMessage || 'Se borrará el polígono y se limpiarán los widgets de esta consulta.'" @cancel="clearConfirmation = false" @confirm="confirmClearPolygon" />
</template>

<style scoped>
.polygon-editor{display:block}.place-search{position:relative;margin-bottom:10px}.search-form{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 5px 5px 11px;border:1px solid var(--fc-border);border-radius:11px;background:#fff}.search-form>svg{width:18px;color:var(--fc-primary)}.search-form input{height:38px;border:0;outline:0;background:transparent;color:var(--fc-text);font:inherit}.search-form .btn{height:38px}.search-results{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 5px);max-height:260px;overflow:auto;border:1px solid var(--fc-border);border-radius:10px;background:#fff;box-shadow:0 14px 35px rgba(0,35,62,.18)}.search-results button{display:flex;width:100%;align-items:flex-start;gap:9px;padding:11px 12px;border:0;border-bottom:1px solid var(--fc-border);background:#fff;color:var(--fc-text);text-align:left;font-size:.78rem;line-height:1.35}.search-results button:last-child{border-bottom:0}.search-results button:hover{background:var(--fc-surface-muted)}.search-results svg{flex:0 0 17px;width:17px;color:var(--fc-primary)}.location-message{margin:7px 2px 0;color:var(--fc-success);font-size:.76rem}.editor-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-bottom:8px}.mode-switch{display:inline-flex;padding:3px;border:1px solid var(--fc-border);border-radius:9px;background:var(--fc-surface-muted)}.mode-switch button{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:var(--fc-text-muted);font-weight:800;font-size:.75rem}.mode-switch button.active{background:#fff;color:var(--fc-primary);box-shadow:0 2px 7px rgba(0,45,75,.11)}.mode-switch svg,.map-action svg{width:15px}.map-action{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--fc-border);border-radius:8px;background:#fff;color:var(--fc-primary);font-weight:800;font-size:.75rem}.map-action.danger{color:var(--fc-danger)}.map-action:disabled,.zoom-controls button:disabled{opacity:.4}.vertex-count{margin-left:auto;color:var(--fc-text-muted);font-size:.75rem}.map{position:relative;width:100%;height:390px;overflow:hidden;border:1px solid var(--fc-border);border-radius:12px;background:#dce8d7;cursor:grab;isolation:isolate;touch-action:none;user-select:none}.map.is-panning{cursor:grabbing}.map.is-drawing{cursor:crosshair}.map-tile{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none;z-index:0}.overlay{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.polygon-shape{fill:rgba(0,113,172,.22);stroke:var(--fc-primary);stroke-width:3;vector-effect:non-scaling-stroke}.polygon-line{fill:none;stroke:var(--fc-primary);stroke-width:3;stroke-dasharray:7 5;vector-effect:non-scaling-stroke}.vertex{fill:#fff;stroke:var(--fc-primary);stroke-width:3;vector-effect:non-scaling-stroke}.station-point{fill:rgba(0,113,172,.28);stroke:#fff;stroke-width:3;vector-effect:non-scaling-stroke}.station-core{fill:var(--fc-primary)}.center-crosshair{position:absolute;z-index:3;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none}.center-crosshair span{position:absolute;background:rgba(0,68,129,.75);box-shadow:0 0 0 1px rgba(255,255,255,.85)}.center-crosshair span:first-child{left:10px;top:0;width:2px;height:22px}.center-crosshair span:last-child{left:0;top:10px;width:22px;height:2px}.zoom-controls{position:absolute;z-index:4;top:10px;right:10px;display:grid;border-radius:8px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,.18)}.zoom-controls button{display:grid;place-items:center;width:36px;height:36px;border:0;border-bottom:1px solid var(--fc-border);background:#fff;color:var(--fc-primary)}.zoom-controls button:last-child{border:0}.zoom-controls svg{width:18px}.map-hint{position:absolute;z-index:4;left:10px;bottom:10px;display:flex;align-items:center;gap:6px;max-width:calc(100% - 130px);padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.93);color:var(--fc-primary);font-size:.72rem;font-weight:800;box-shadow:0 2px 9px rgba(0,0,0,.12);pointer-events:none}.map-hint svg{flex:0 0 15px}.osm-credit{position:absolute;z-index:4;right:5px;bottom:4px;padding:2px 4px;background:rgba(255,255,255,.8);color:#31556d;font-size:.61rem}.coordinate-summary{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:7px;color:var(--fc-text-muted);font-size:.74rem}.coordinate-summary svg{width:15px}.workflow-help{margin-top:9px;padding:9px 11px;border-radius:9px;background:#eef7fb;color:#31556d;font-size:.76rem;line-height:1.4}.advanced{margin-top:9px;padding:10px;border:1px solid var(--fc-border);border-radius:9px;background:var(--fc-surface-muted)}.advanced summary{cursor:pointer;color:var(--fc-primary);font-weight:800;font-size:.78rem}.raw-json{margin-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem}.apply-json{margin-top:8px}.apply-json svg{width:16px}.field-error{margin:7px 2px 0;color:var(--fc-danger);font-size:.76rem}@media(max-width:720px){.search-form{grid-template-columns:auto minmax(0,1fr)}.search-form .btn{grid-column:1/-1;width:100%}.map{height:330px}.vertex-count{width:100%;margin-left:0}.map-hint{max-width:calc(100% - 20px);bottom:30px}.mode-switch{width:100%}.mode-switch button{flex:1;justify-content:center}}@media(max-width:480px){.editor-toolbar>.map-action{flex:1;justify-content:center}.coordinate-summary{line-height:1.45}}
.vertex { pointer-events: all; cursor: move; }
</style>

<style scoped>.labels-tile{z-index:3}.labels-credit{bottom:20px}</style>

<style scoped>
@media(max-width:700px){.editor-toolbar{gap:7px}.editor-toolbar button{min-height:44px}.map{height:clamp(420px,60dvh,560px)!important;min-height:420px}.search-input{min-width:0}.coordinate-summary{overflow-wrap:anywhere}}
</style>
