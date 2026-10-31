<script setup lang="ts">
import type { Map as LeafletMap, TileLayer } from 'leaflet'
import type { RegionalAnalysis, RegionalSnapshot } from '~/types/regionalMap'
import { CloudSun, LogOut } from 'lucide-vue-next'

const props = defineProps<{ map: LeafletMap | null }>()
const emit = defineEmits<{ 'view-change': [state: {active: boolean; snapshot: RegionalSnapshot | null; variable: string}] }>()
const active = ref(false)
const api = usePublicParcelApi()
const busy = ref(false), error = ref(''), variable = ref('')
const snapshot = shallowRef<RegionalSnapshot | null>(null)
const variables = computed(() => (snapshot.value?.variables || []).filter(v => v.available_stations >= 3))
let layer: TileLayer | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let completedJob = '', pendingJob = '', generation = 0, layerGeneration = 0, disposed = false

function message(exception: unknown, fallback: string) {
  const detail = (exception as { data?: { detail?: unknown } })?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}
async function updateLayer() {
  const ticket = ++layerGeneration
  const expectedMap = props.map, expectedVariable = variable.value, expectedJob = completedJob
  layer?.remove(); layer = undefined
  if (!active.value || !expectedMap || !expectedVariable || !expectedJob || !variables.value.some(v => v.id === expectedVariable)) return
  const module = await import('leaflet'), L = module.default || module
  if (disposed || !active.value || ticket !== layerGeneration || props.map !== expectedMap || variable.value !== expectedVariable || completedJob !== expectedJob) return
  // Above the parcel image, below boundaries and editing controls. No map movement.
  const pane = expectedMap.getPane('stationClimatePane') || expectedMap.createPane('stationClimatePane')
  pane.style.zIndex = '360'; pane.style.pointerEvents = 'none'
  layer = L.tileLayer(api.apiUrl(`/public/map/analyses/${expectedJob}/tiles/${expectedVariable}/{z}/{x}/{y}.png?domain=regional&scale=relative&v=7`), {
    pane: 'stationClimatePane', opacity: .65, maxNativeZoom: 14, maxZoom: 21,
    attribution: 'Estimación FECOCLIMA · estaciones, últimas 72 h',
  }).on('tileerror', () => { if (!disposed && ticket === layerGeneration) error.value = 'No se pudo cargar toda la capa. Vuelva a consultar.' }).addTo(expectedMap)
}
async function poll(ticket: number) {
  try {
    const result = await api.request<RegionalAnalysis>(`/public/map/analyses/${pendingJob}`)
    if (disposed || ticket !== generation) return
    if (result.status === 'COMPLETED' && result.snapshot) {
      snapshot.value = result.snapshot; completedJob = result.job_id; busy.value = false
      const available = variables.value
      if (!available.some(v => v.id === variable.value)) variable.value = available[0]?.id || ''
      if (!available.length) error.value = 'Aún no hay variables con lecturas comparables de al menos tres estaciones.'
      active.value = available.length > 0
      try { localStorage.setItem('fecoclima-regional-map-job', completedJob) } catch { /* Optional map-page reuse. */ }
      await updateLayer()
      return
    }
    if (['FAILED', 'CANCELLED'].includes(result.status)) {
      busy.value = false; error.value = result.message || 'No se pudo completar la consulta. Intente de nuevo.'; return
    }
    timer = setTimeout(() => void poll(ticket), 2500)
  } catch (exception) {
    if (!disposed && ticket === generation) { busy.value = false; error.value = message(exception, 'No se pudo consultar las estaciones. Intente de nuevo.') }
  }
}
async function consult() {
  if (busy.value || !props.map) return
  const ticket = ++generation
  busy.value = true; error.value = ''
  if (timer) clearTimeout(timer)
  try {
    const result = await api.request<RegionalAnalysis>('/public/map/analyses', { method: 'POST' })
    if (disposed || ticket !== generation) return
    pendingJob = result.job_id
    await poll(ticket)
  } catch (exception) {
    if (!disposed && ticket === generation) { busy.value = false; error.value = message(exception, 'No se pudo iniciar la consulta. Intente de nuevo.') }
  }
}
function exit() {
  generation++; layerGeneration++; if (timer) clearTimeout(timer)
  active.value = false; busy.value = false; variable.value = ''; error.value = ''
  layer?.remove(); layer = undefined
}
const currentVariable = computed(() => variables.value.find(item => item.id === variable.value))
const scaleValue = (value: number) => value.toLocaleString('es-PY', {maximumFractionDigits: 2})
watch([active, snapshot, variable], () => emit('view-change', {active: active.value, snapshot: snapshot.value, variable: variable.value}))
watch([() => props.map, variable, active], () => { error.value = ''; void updateLayer() })
onBeforeUnmount(() => { disposed = true; generation++; layerGeneration++; if (timer) clearTimeout(timer); layer?.remove() })
</script>

<template>
  <div class="station-climate-control">
    <button v-if="!active" type="button" class="map-tool-button consult-all-stations" :disabled="busy || !map" @click="consult"><CloudSun aria-hidden="true" /><span>{{ busy ? 'Consultando estaciones…' : 'Consultar todas las estaciones' }}</span></button>
    <label v-if="active && variables.length" class="station-climate-variable">Variable · últimas 72 horas
      <select v-model="variable" class="select" aria-label="Variable de todas las estaciones"><option v-for="item in variables" :key="item.id" :value="item.id">{{ item.label }} ({{ item.unit }})</option></select>
    </label>
    <div v-if="active && currentVariable" class="station-climate-scale" :aria-label="`Escala de ${currentVariable.label} en ${currentVariable.unit}`">
      <div class="station-climate-colorbar" :style="{background:`linear-gradient(to right,${currentVariable.palette.join(',')})`}" />
      <div class="station-climate-scale-values"><span v-for="ratio in [0,.5,1]" :key="ratio">{{scaleValue(currentVariable.minimum+(currentVariable.maximum-currentVariable.minimum)*ratio)}} {{currentVariable.unit}}</span></div>
    </div>
    <button v-if="active" type="button" class="map-tool-button consult-all-stations exit-station-view" @click="exit"><LogOut aria-hidden="true" /><span>Salir vista estaciones</span></button>
    <small v-if="busy" role="status">Consultando las últimas 72 horas…</small>
    <small v-if="error" role="status">{{ error }}</small>
  </div>
</template>

<style scoped>
.station-climate-control{display:grid;gap:8px;width:100%;min-width:0}.station-climate-control .consult-all-stations{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:10px;border:1px solid #bed6df;border-radius:10px;background:#f0f7fa;color:#215f7b;font-size:.75rem;font-weight:650;text-align:left;cursor:pointer}.consult-all-stations svg{width:17px;height:17px;flex-shrink:0}.consult-all-stations:disabled{opacity:.6;cursor:wait}.consult-all-stations:focus-visible,.station-climate-variable select:focus-visible{outline:3px solid #438db7;outline-offset:3px}.station-climate-variable{display:grid;gap:6px;color:#476778;font-size:.72rem}.station-climate-variable select{width:100%;min-width:0;min-height:40px;padding:8px;font-size:.75rem}.station-climate-control>small{line-height:1.5;color:#627b89;font-size:.7rem}@media(max-width:700px){.station-climate-variable select{font-size:16px;min-height:44px}}
</style>

<style scoped>.station-climate-scale{display:grid;gap:6px}.station-climate-colorbar{height:12px;border-radius:6px}.station-climate-scale-values{display:flex;justify-content:space-between;gap:6px;font-size:.65rem;color:#456778;font-variant-numeric:tabular-nums}.station-climate-scale-values span:nth-child(2){text-align:center}.station-climate-scale-values span:last-child{text-align:right}.station-climate-control .exit-station-view{margin-top:6px;background:#fff;border-color:#b5cbd8}</style>
