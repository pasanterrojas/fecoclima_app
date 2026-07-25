<script setup lang="ts">
import { Crosshair, Image, Layers3, Maximize2, ZoomIn, ZoomOut } from 'lucide-vue-next'

type Coordinate = [number, number]

const props = withDefaults(defineProps<{
  geometry?: Record<string, any> | null
  imageUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  defaultOpacity?: number
}>(), {
  geometry: null,
  imageUrl: null,
  latitude: null,
  longitude: null,
  defaultOpacity: 0.78,
})

const mapRef = ref<HTMLElement | null>(null)
const width = ref(900)
const height = ref(560)
const zoom = ref(14)
const center = ref<Coordinate>([-57.6359, -25.3007])
const opacity = ref(props.defaultOpacity)
const showImage = ref(true)
const isPanning = ref(false)
let resizeObserver: ResizeObserver | null = null
let pointerState: { id: number; x: number; y: number; worldX: number; worldY: number } | null = null

function geometryObject(): Record<string, any> | null {
  const value = props.geometry
  if (!value) return null
  return value.type === 'Feature' ? value.geometry : value
}

function ringsFromGeometry(): Coordinate[][] {
  const geometry = geometryObject()
  if (!geometry) return []
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]
  const rings: Coordinate[][] = []
  for (const polygon of polygons || []) {
    const ring = polygon?.[0]
    if (!Array.isArray(ring)) continue
    const points = ring
      .filter((item: any) => Array.isArray(item) && item.length >= 2)
      .map((item: any) => [Number(item[0]), Number(item[1])] as Coordinate)
      .filter((item: Coordinate) => Number.isFinite(item[0]) && Number.isFinite(item[1]))
    if (points.length >= 3) rings.push(points)
  }
  return rings
}

const rings = computed(ringsFromGeometry)
const allPoints = computed(() => rings.value.flat())

function clampLatitude(value: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, value))
}

function lonLatToWorld([longitude, latitude]: Coordinate, level = zoom.value) {
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
  return [longitude, clampLatitude(latitude)]
}

const centerWorld = computed(() => lonLatToWorld(center.value))
const topLeft = computed(() => ({ x: centerWorld.value.x - width.value / 2, y: centerWorld.value.y - height.value / 2 }))
const tiles = computed(() => {
  const startX = Math.floor(topLeft.value.x / 256)
  const startY = Math.floor(topLeft.value.y / 256)
  const endX = Math.floor((topLeft.value.x + width.value) / 256)
  const endY = Math.floor((topLeft.value.y + height.value) / 256)
  const count = 2 ** zoom.value
  const rows: Array<{ key: string; url: string; left: number; top: number }> = []
  for (let y = startY; y <= endY; y += 1) {
    if (y < 0 || y >= count) continue
    for (let x = startX; x <= endX; x += 1) {
      const wrappedX = ((x % count) + count) % count
      rows.push({
        key: `${zoom.value}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${zoom.value}/${wrappedX}/${y}.png`,
        left: x * 256 - topLeft.value.x,
        top: y * 256 - topLeft.value.y,
      })
    }
  }
  return rows
})

function screenPoint(point: Coordinate) {
  const world = lonLatToWorld(point)
  return { x: world.x - topLeft.value.x, y: world.y - topLeft.value.y }
}

const screenRings = computed(() => rings.value.map(ring => ring.map(screenPoint)))
const stationScreen = computed(() => {
  if (props.latitude == null || props.longitude == null) return null
  return screenPoint([Number(props.longitude), Number(props.latitude)])
})
const imageRect = computed(() => {
  if (!allPoints.value.length) return null
  const west = Math.min(...allPoints.value.map(item => item[0]))
  const east = Math.max(...allPoints.value.map(item => item[0]))
  const south = Math.min(...allPoints.value.map(item => item[1]))
  const north = Math.max(...allPoints.value.map(item => item[1]))
  const northWest = screenPoint([west, north])
  const southEast = screenPoint([east, south])
  return {
    left: northWest.x,
    top: northWest.y,
    width: Math.max(1, southEast.x - northWest.x),
    height: Math.max(1, southEast.y - northWest.y),
  }
})

function fitGeometry() {
  const points = allPoints.value
  if (!points.length) {
    if (props.latitude != null && props.longitude != null) center.value = [Number(props.longitude), Number(props.latitude)]
    return
  }
  for (let candidate = 19; candidate >= 3; candidate -= 1) {
    const world = points.map(item => lonLatToWorld(item, candidate))
    const minX = Math.min(...world.map(item => item.x))
    const maxX = Math.max(...world.map(item => item.x))
    const minY = Math.min(...world.map(item => item.y))
    const maxY = Math.max(...world.map(item => item.y))
    if (maxX - minX <= Math.max(100, width.value - 130) && maxY - minY <= Math.max(100, height.value - 130)) {
      zoom.value = candidate
      center.value = worldToLonLat((minX + maxX) / 2, (minY + maxY) / 2, candidate)
      return
    }
  }
}

function centerStation() {
  if (props.latitude == null || props.longitude == null) return
  center.value = [Number(props.longitude), Number(props.latitude)]
  zoom.value = Math.max(zoom.value, 15)
}

function changeZoom(delta: number) {
  zoom.value = Math.max(3, Math.min(19, zoom.value + delta))
}

function onPointerDown(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button, input, a')) return
  pointerState = { id: event.pointerId, x: event.clientX, y: event.clientY, worldX: centerWorld.value.x, worldY: centerWorld.value.y }
  isPanning.value = true
  mapRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!pointerState || pointerState.id !== event.pointerId) return
  center.value = worldToLonLat(pointerState.worldX - (event.clientX - pointerState.x), pointerState.worldY - (event.clientY - pointerState.y))
}

function onPointerUp(event: PointerEvent) {
  if (!pointerState || pointerState.id !== event.pointerId) return
  pointerState = null
  isPanning.value = false
  try { mapRef.value?.releasePointerCapture(event.pointerId) } catch { /* no-op */ }
}

watch(() => props.geometry, () => nextTick(fitGeometry), { deep: true, immediate: true })
watch(() => props.defaultOpacity, value => { opacity.value = value })

onMounted(() => {
  if (!mapRef.value) return
  const update = () => {
    width.value = mapRef.value?.clientWidth || 900
    height.value = mapRef.value?.clientHeight || 560
  }
  update()
  resizeObserver = new ResizeObserver(() => { update(); fitGeometry() })
  resizeObserver.observe(mapRef.value)
  fitGeometry()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="sat-map-wrap">
    <div class="map-toolbar">
      <label class="opacity-control">
        <Layers3 />
        <span>Transparencia</span>
        <input v-model.number="opacity" type="range" min="0.15" max="1" step="0.05">
      </label>
      <button type="button" class="map-tool" :class="{ active: showImage }" :disabled="!imageUrl" @click="showImage = !showImage">
        <Image /> {{ showImage ? 'Ocultar imagen' : 'Mostrar imagen' }}
      </button>
      <button type="button" class="map-tool" @click="fitGeometry"><Maximize2 /> Ver polígono</button>
    </div>
    <div
      ref="mapRef"
      class="sat-map"
      :class="{ panning: isPanning }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="changeZoom($event.deltaY < 0 ? 1 : -1)"
    >
      <img v-for="tile in tiles" :key="tile.key" class="tile" :src="tile.url" alt="" draggable="false" :style="{ left: `${tile.left}px`, top: `${tile.top}px` }">
      <img
        v-if="imageUrl && showImage && imageRect"
        class="sat-overlay"
        :src="imageUrl"
        alt="Imagen Sentinel-2 georreferenciada sobre la zona de influencia"
        draggable="false"
        :style="{
          left: `${imageRect.left}px`,
          top: `${imageRect.top}px`,
          width: `${imageRect.width}px`,
          height: `${imageRect.height}px`,
          opacity,
        }"
      >
      <svg class="geometry-overlay" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" aria-hidden="true">
        <polygon
          v-for="(ring, index) in screenRings"
          :key="index"
          :points="ring.map(point => `${point.x},${point.y}`).join(' ')"
          class="polygon"
        />
        <template v-if="stationScreen">
          <circle :cx="stationScreen.x" :cy="stationScreen.y" r="10" class="station-halo" />
          <circle :cx="stationScreen.x" :cy="stationScreen.y" r="4" class="station-dot" />
        </template>
      </svg>
      <div class="zoom-controls">
        <button type="button" title="Acercar" @click.stop="changeZoom(1)"><ZoomIn /></button>
        <button type="button" title="Alejar" @click.stop="changeZoom(-1)"><ZoomOut /></button>
        <button type="button" title="Centrar estación" @click.stop="centerStation"><Crosshair /></button>
        <button type="button" title="Ver todo el polígono" @click.stop="fitGeometry"><Maximize2 /></button>
      </div>
      <div v-if="!imageUrl" class="image-message"><Image /><span>Seleccione y procese una escena para colocarla sobre el polígono.</span></div>
      <a class="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" @pointerdown.stop>© OpenStreetMap</a>
    </div>
  </div>
</template>

<style scoped>
.sat-map-wrap{display:flex;flex-direction:column;gap:9px}.map-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.opacity-control,.map-tool{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:8px 11px;border:1px solid var(--fc-border);border-radius:9px;background:#fff;color:var(--fc-primary);font-weight:800;font-size:.78rem}.opacity-control svg,.map-tool svg{width:16px}.opacity-control input{width:120px}.map-tool.active{background:#e9f5fa}.map-tool:disabled{opacity:.45}.sat-map{position:relative;height:560px;overflow:hidden;border:1px solid var(--fc-border);border-radius:16px;background:#dce8d7;cursor:grab;isolation:isolate;touch-action:none;user-select:none}.sat-map.panning{cursor:grabbing}.tile{position:absolute;z-index:0;width:256px;height:256px;max-width:none;pointer-events:none}.sat-overlay{position:absolute;z-index:1;object-fit:fill;pointer-events:none;mix-blend-mode:normal}.geometry-overlay{position:absolute;inset:0;z-index:2;width:100%;height:100%;pointer-events:none}.polygon{fill:rgba(0,113,172,.08);stroke:#0071ac;stroke-width:4;vector-effect:non-scaling-stroke}.station-halo{fill:rgba(255,255,255,.45);stroke:#fff;stroke-width:3;vector-effect:non-scaling-stroke}.station-dot{fill:#004b73}.zoom-controls{position:absolute;z-index:4;top:12px;right:12px;display:grid;border-radius:9px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.2)}.zoom-controls button{display:grid;place-items:center;width:38px;height:38px;border:0;border-bottom:1px solid var(--fc-border);background:#fff;color:var(--fc-primary)}.zoom-controls button:last-child{border-bottom:0}.zoom-controls svg{width:18px}.image-message{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:9px;max-width:360px;padding:12px 14px;border-radius:11px;background:rgba(255,255,255,.92);color:var(--fc-primary);font-weight:800;font-size:.82rem;box-shadow:0 8px 24px rgba(0,0,0,.16);pointer-events:none}.image-message svg{width:22px;flex:0 0 22px}.osm-credit{position:absolute;z-index:4;right:5px;bottom:4px;padding:2px 4px;background:rgba(255,255,255,.82);color:#31556d;font-size:.62rem}@media(max-width:760px){.sat-map{height:430px}.opacity-control{width:100%;justify-content:space-between}.opacity-control input{flex:1}.map-tool{flex:1;justify-content:center}}@media(max-width:480px){.sat-map{height:360px}.map-toolbar{align-items:stretch;flex-direction:column}.map-tool{width:100%}}
</style>
