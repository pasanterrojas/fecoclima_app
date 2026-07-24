<script setup lang="ts">
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
  modelValue?: Record<string, any> | string | null
  latitude?: number | string | null
  longitude?: number | string | null
  radius?: number | string | null
}>(), {
  modelValue: null,
  latitude: null,
  longitude: null,
  radius: 750,
})

const emit = defineEmits<{
  'update:modelValue': [value: GeoJsonFeature | null]
  'update:latitude': [value: number]
  'update:longitude': [value: number]
}>()

const mapRef = ref<HTMLElement | null>(null)
const width = ref(620)
const height = ref(390)
const zoom = ref(14)
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

let resizeObserver: ResizeObserver | null = null
let syncingFromProps = false
let internalCoordinateUpdate = false
let pointerState: {
  pointerId: number
  startX: number
  startY: number
  startCenterWorld: { x: number; y: number }
  moved: boolean
} | null = null

const fallbackCenter: Coordinate = [-57.6359, -25.3007]

function numeric(value: unknown, fallback: number): number {
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

const tiles = computed(() => {
  const startX = Math.floor(viewportTopLeft.value.x / 256)
  const startY = Math.floor(viewportTopLeft.value.y / 256)
  const endX = Math.floor((viewportTopLeft.value.x + width.value) / 256)
  const endY = Math.floor((viewportTopLeft.value.y + height.value) / 256)
  const count = 2 ** zoom.value
  const rows: Array<{ key: string; url: string; left: number; top: number }> = []
  for (let y = startY; y <= endY; y += 1) {
    if (y < 0 || y >= count) continue
    for (let x = startX; x <= endX; x += 1) {
      const wrappedX = ((x % count) + count) % count
      rows.push({
        key: `${zoom.value}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${zoom.value}/${wrappedX}/${y}.png`,
        left: x * 256 - viewportTopLeft.value.x,
        top: y * 256 - viewportTopLeft.value.y,
      })
    }
  }
  return rows
})

function pointToScreen(point: Coordinate): { x: number; y: number } {
  const world = lonLatToWorld(point)
  return { x: world.x - viewportTopLeft.value.x, y: world.y - viewportTopLeft.value.y }
}

const screenPoints = computed(() => points.value.map((point, index) => ({ ...pointToScreen(point), index })))
const polygonPoints = computed(() => screenPoints.value.map(item => `${item.x},${item.y}`).join(' '))
const stationScreen = computed(() => pointToScreen(stationCoordinate.value))

function featureFromPoints(value: Coordinate[]): GeoJsonFeature | null {
  if (value.length < 3) return null
  const ring = [...value]
  const first = ring[0]
  const last = ring[ring.length - 1]
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
    const first = ring[0]
    const last = ring[ring.length - 1]
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
  pointerState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startCenterWorld: lonLatToWorld(viewCenter.value),
    moved: false,
  }
  isPanning.value = mode.value === 'navigate'
  mapRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!pointerState || pointerState.pointerId !== event.pointerId || mode.value !== 'navigate') return
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
  if (mode.value === 'draw' && !state.moved) addPointFromClient(event.clientX, event.clientY)
}

function undo() {
  points.value.pop()
  publish()
}

function clearPolygon() {
  points.value = []
  parseError.value = ''
  publish()
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
  changeZoom(event.deltaY < 0 ? 1 : -1)
}

function fitCoordinates(coordinates: Coordinate[], padding = 70) {
  if (!coordinates.length) return
  if (coordinates.length === 1) {
    viewCenter.value = [...coordinates[0]] as Coordinate
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
  const latitude = Number(match[1].replace(',', '.'))
  const longitude = Number(match[2].replace(',', '.'))
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
    points.value = extractPoints(value)
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

onMounted(() => {
  if (!mapRef.value) return
  const updateSize = () => {
    if (!mapRef.value) return
    width.value = mapRef.value.clientWidth || 620
    height.value = mapRef.value.clientHeight || 390
  }
  updateSize()
  resizeObserver = new ResizeObserver(updateSize)
  resizeObserver.observe(mapRef.value)
  if (points.value.length) fitPolygon()
  else if (hasStationCoordinates.value) centerOnStation()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="polygon-editor">
    <div class="place-search">
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
      <div class="mode-switch" aria-label="Modo del mapa">
        <button type="button" :class="{ active: mode === 'navigate' }" @click="mode = 'navigate'">
          <MousePointer2 /> Navegar
        </button>
        <button type="button" :class="{ active: mode === 'draw' }" @click="mode = 'draw'">
          <Pencil /> Dibujar polígono
        </button>
      </div>
      <button type="button" class="map-action" title="Usar la ubicación del dispositivo" :disabled="locating" @click="useCurrentLocation">
        <LocateFixed /> {{ locating ? 'Ubicando…' : 'Mi ubicación' }}
      </button>
      <button type="button" class="map-action" title="Guardar el centro visible como ubicación de la estación" @click="useMapCenter">
        <Crosshair /> Fijar estación aquí
      </button>
      <button type="button" class="map-action" title="Crear un área aproximada con el radio configurado" @click="createRadiusPolygon">
        <CircleDot /> Área por radio
      </button>
      <button type="button" class="map-action" :disabled="!points.length" @click="undo"><Undo2 /> Deshacer</button>
      <button type="button" class="map-action danger" :disabled="!points.length" @click="clearPolygon"><Trash2 /> Limpiar</button>
      <span class="vertex-count">{{ points.length }} vértices</span>
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
      @wheel.prevent="onWheel"
    >
      <img
        v-for="tile in tiles"
        :key="tile.key"
        class="map-tile"
        :src="tile.url"
        alt=""
        draggable="false"
        :style="{ left: `${tile.left}px`, top: `${tile.top}px` }"
      >
      <svg class="overlay" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" aria-hidden="true">
        <polygon v-if="screenPoints.length >= 3" :points="polygonPoints" class="polygon-shape" />
        <polyline v-else-if="screenPoints.length >= 2" :points="polygonPoints" class="polygon-line" />
        <circle v-for="item in screenPoints" :key="item.index" :cx="item.x" :cy="item.y" r="5" class="vertex" />
        <circle v-if="hasStationCoordinates" :cx="stationScreen.x" :cy="stationScreen.y" r="9" class="station-point" />
        <circle v-if="hasStationCoordinates" :cx="stationScreen.x" :cy="stationScreen.y" r="3" class="station-core" />
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
        <span v-if="mode === 'navigate'">Arrastre para recorrer el mapa, use la rueda para acercar y el buscador para cambiar de zona.</span>
        <span v-else>Haga clic en los límites del terreno. Use “Navegar” cuando necesite mover el mapa.</span>
      </div>
      <a class="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" @pointerdown.stop>© OpenStreetMap</a>
    </div>

    <div class="coordinate-summary">
      <MapPinned />
      Centro visible: {{ centerLatitude.toFixed(6) }}, {{ centerLongitude.toFixed(6) }} · zoom {{ zoom }}
      <template v-if="hasStationCoordinates">
        · Estación: {{ stationCoordinate[1].toFixed(6) }}, {{ stationCoordinate[0].toFixed(6) }}
      </template>
    </div>

    <div class="workflow-help">
      <b>Flujo recomendado:</b> busque la zona → navegue hasta la parcela → pulse <b>Fijar estación aquí</b> → active <b>Dibujar polígono</b> y marque sus límites → guarde la estación.
    </div>

    <details class="advanced">
      <summary>Edición avanzada de GeoJSON</summary>
      <textarea v-model="rawGeoJson" class="textarea raw-json" rows="8" placeholder='{"type":"Feature","geometry":{"type":"Polygon","coordinates":[...]}}' />
      <button type="button" class="btn btn-light apply-json" @click="applyRawGeoJson"><RotateCcw /> Aplicar GeoJSON</button>
      <p v-if="parseError" class="field-error">{{ parseError }}</p>
    </details>
  </div>
</template>

<style scoped>
.polygon-editor{display:block}.place-search{position:relative;margin-bottom:10px}.search-form{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 5px 5px 11px;border:1px solid var(--fc-border);border-radius:11px;background:#fff}.search-form>svg{width:18px;color:var(--fc-primary)}.search-form input{height:38px;border:0;outline:0;background:transparent;color:var(--fc-text);font:inherit}.search-form .btn{height:38px}.search-results{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 5px);max-height:260px;overflow:auto;border:1px solid var(--fc-border);border-radius:10px;background:#fff;box-shadow:0 14px 35px rgba(0,35,62,.18)}.search-results button{display:flex;width:100%;align-items:flex-start;gap:9px;padding:11px 12px;border:0;border-bottom:1px solid var(--fc-border);background:#fff;color:var(--fc-text);text-align:left;font-size:.78rem;line-height:1.35}.search-results button:last-child{border-bottom:0}.search-results button:hover{background:var(--fc-surface-muted)}.search-results svg{flex:0 0 17px;width:17px;color:var(--fc-primary)}.location-message{margin:7px 2px 0;color:var(--fc-success);font-size:.76rem}.editor-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-bottom:8px}.mode-switch{display:inline-flex;padding:3px;border:1px solid var(--fc-border);border-radius:9px;background:var(--fc-surface-muted)}.mode-switch button{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:var(--fc-text-muted);font-weight:800;font-size:.75rem}.mode-switch button.active{background:#fff;color:var(--fc-primary);box-shadow:0 2px 7px rgba(0,45,75,.11)}.mode-switch svg,.map-action svg{width:15px}.map-action{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--fc-border);border-radius:8px;background:#fff;color:var(--fc-primary);font-weight:800;font-size:.75rem}.map-action.danger{color:var(--fc-danger)}.map-action:disabled,.zoom-controls button:disabled{opacity:.4}.vertex-count{margin-left:auto;color:var(--fc-text-muted);font-size:.75rem}.map{position:relative;width:100%;height:390px;overflow:hidden;border:1px solid var(--fc-border);border-radius:12px;background:#dce8d7;cursor:grab;isolation:isolate;touch-action:none;user-select:none}.map.is-panning{cursor:grabbing}.map.is-drawing{cursor:crosshair}.map-tile{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none;z-index:0}.overlay{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.polygon-shape{fill:rgba(0,113,172,.22);stroke:var(--fc-primary);stroke-width:3;vector-effect:non-scaling-stroke}.polygon-line{fill:none;stroke:var(--fc-primary);stroke-width:3;stroke-dasharray:7 5;vector-effect:non-scaling-stroke}.vertex{fill:#fff;stroke:var(--fc-primary);stroke-width:3;vector-effect:non-scaling-stroke}.station-point{fill:rgba(0,113,172,.28);stroke:#fff;stroke-width:3;vector-effect:non-scaling-stroke}.station-core{fill:var(--fc-primary)}.center-crosshair{position:absolute;z-index:3;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none}.center-crosshair span{position:absolute;background:rgba(0,68,129,.75);box-shadow:0 0 0 1px rgba(255,255,255,.85)}.center-crosshair span:first-child{left:10px;top:0;width:2px;height:22px}.center-crosshair span:last-child{left:0;top:10px;width:22px;height:2px}.zoom-controls{position:absolute;z-index:4;top:10px;right:10px;display:grid;border-radius:8px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,.18)}.zoom-controls button{display:grid;place-items:center;width:36px;height:36px;border:0;border-bottom:1px solid var(--fc-border);background:#fff;color:var(--fc-primary)}.zoom-controls button:last-child{border:0}.zoom-controls svg{width:18px}.map-hint{position:absolute;z-index:4;left:10px;bottom:10px;display:flex;align-items:center;gap:6px;max-width:calc(100% - 130px);padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.93);color:var(--fc-primary);font-size:.72rem;font-weight:800;box-shadow:0 2px 9px rgba(0,0,0,.12);pointer-events:none}.map-hint svg{flex:0 0 15px}.osm-credit{position:absolute;z-index:4;right:5px;bottom:4px;padding:2px 4px;background:rgba(255,255,255,.8);color:#31556d;font-size:.61rem}.coordinate-summary{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:7px;color:var(--fc-text-muted);font-size:.74rem}.coordinate-summary svg{width:15px}.workflow-help{margin-top:9px;padding:9px 11px;border-radius:9px;background:#eef7fb;color:#31556d;font-size:.76rem;line-height:1.4}.advanced{margin-top:9px;padding:10px;border:1px solid var(--fc-border);border-radius:9px;background:var(--fc-surface-muted)}.advanced summary{cursor:pointer;color:var(--fc-primary);font-weight:800;font-size:.78rem}.raw-json{margin-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem}.apply-json{margin-top:8px}.apply-json svg{width:16px}.field-error{margin:7px 2px 0;color:var(--fc-danger);font-size:.76rem}@media(max-width:720px){.search-form{grid-template-columns:auto minmax(0,1fr)}.search-form .btn{grid-column:1/-1;width:100%}.map{height:330px}.vertex-count{width:100%;margin-left:0}.map-hint{max-width:calc(100% - 20px);bottom:30px}.mode-switch{width:100%}.mode-switch button{flex:1;justify-content:center}}@media(max-width:480px){.editor-toolbar>.map-action{flex:1;justify-content:center}.coordinate-summary{line-height:1.45}}
</style>
