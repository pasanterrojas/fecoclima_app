<script setup lang="ts">
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  Droplets,
  History,
  Image,
  Layers3,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Satellite,
  ScanSearch,
  Sparkles,
  Sprout,
  Thermometer,
  TriangleAlert,
} from 'lucide-vue-next'
import type {
  Crop,
  SatelliteMapAgentResult,
  SatelliteMapContext,
  SatelliteMapScene,
  Station,
} from '~/types/api'

useSeoMeta({ title: 'Análisis satelital' })
const { request } = useApi()
const selection = useSelectionStore()
const config = useRuntimeConfig()

const stations = ref<Station[]>([])
const crops = ref<Crop[]>([])
const context = ref<SatelliteMapContext | null>(null)
const loading = ref(true)
const processing = ref(false)
const agentLoading = ref(false)
const error = ref('')
const processError = ref('')
const agentError = ref('')
const selectedScene = ref<SatelliteMapScene | null>(null)
const historyDays = ref(60)
const historyInitialized = ref(false)
const selectedIndex = ref('ndvi')
const selectedVisualLayer = ref('true_color')
const agentResult = ref<SatelliteMapAgentResult | null>(null)

const indexDefinitions: Record<string, { label: string; title: string; help: string }> = {
  ndvi: { label: 'NDVI', title: 'Vigor y cobertura', help: 'Actividad de la vegetación y cantidad de cobertura verde.' },
  ndmi: { label: 'NDMI', title: 'Humedad de la vegetación', help: 'Señal relativa de agua en la vegetación y el dosel.' },
  ndwi: { label: 'NDWI', title: 'Agua superficial', help: 'Ayuda a ubicar agua libre o sectores muy húmedos.' },
  evi: { label: 'EVI', title: 'Vigor en cobertura densa', help: 'Complementa NDVI cuando el cultivo tiene mucha biomasa.' },
  savi: { label: 'SAVI', title: 'Vegetación y suelo', help: 'Reduce la influencia del suelo visible.' },
  ndre: { label: 'NDRE', title: 'Clorofila', help: 'Útil para cambios de clorofila en etapas avanzadas.' },
  gndvi: { label: 'GNDVI', title: 'Actividad fotosintética', help: 'Sensibilidad a cambios en la banda verde.' },
  nbr: { label: 'NBR', title: 'Cambio fuerte de cobertura', help: 'Señala alteraciones importantes; no identifica la causa.' },
  msi: { label: 'MSI', title: 'Estrés hídrico relativo', help: 'Valores mayores pueden acompañar mayor sequedad.' },
}

const indexRows = computed(() => Object.entries(indexDefinitions).map(([key, definition]) => ({
  key,
  ...definition,
  value: context.value?.observation?.indices?.[key] ?? null,
  stats: context.value?.observation?.statistics?.[key] ?? null,
})))
const selectedStats = computed(() => context.value?.observation?.statistics?.[selectedIndex.value] || null)
const currentObservationId = computed(() => context.value?.observation?.id || null)
const currentSceneId = computed(() => context.value?.observation?.scene_id || null)
const activeSceneId = computed(() => selectedScene.value?.scene_id || currentSceneId.value)
const visualLayers = computed(() => {
  const observation = context.value?.observation
  const rows = [{
    key: 'true_color',
    label: 'Color real',
    title: 'Sentinel-2 RGB',
    url: observation?.image_available ? resolveImageUrl(observation.source_url || null) : null,
    value: null as number | null,
  }]
  for (const [key, definition] of Object.entries(indexDefinitions)) {
    rows.push({
      key,
      label: key.toUpperCase(),
      title: definition.title,
      url: resolveImageUrl(observation?.index_images?.[key] || null),
      value: observation?.indices?.[key] ?? null,
    })
  }
  return rows
})
const selectedVisual = computed(() => visualLayers.value.find(item => item.key === selectedVisualLayer.value) || visualLayers.value[0])
const currentImageUrl = computed(() => selectedVisual.value?.url || null)
const interpretationClass = computed(() => {
  const level = context.value?.interpretation.level
  return level === 'ATTENTION' ? 'attention' : level === 'LIMITED' || level === 'NO_DATA' ? 'limited' : 'watch'
})

function resolveImageUrl(source?: string | null): string | null {
  if (!source) return null
  if (/^https?:\/\//i.test(source)) return source
  try {
    const api = new URL(String(config.public.apiBase))
    return new URL(source, api.origin).toString()
  } catch {
    return source
  }
}

function chooseVisualLayer(key: string) {
  const layer = visualLayers.value.find(item => item.key === key)
  if (!layer?.url) return
  selectedVisualLayer.value = key
  if (key !== 'true_color') selectedIndex.value = key
}

function chooseIndexLayer(key: string) {
  selectedIndex.value = key
  chooseVisualLayer(key)
}

function formatDate(value?: string | null, withTime = false): string {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleString('es-PY', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatNumber(value: any, digits = 2): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '—'
}

function sceneStatus(scene: SatelliteMapScene): string {
  if (!scene.processed) return 'Disponible'
  if (scene.processing_status === 'PROCESSED') return 'Procesada'
  if (scene.processing_status === 'PARTIAL') return 'Parcial'
  return scene.processing_status || 'Guardada'
}

async function loadSelectors() {
  const [stationRows, cropRows] = await Promise.all([
    request<Station[]>('/public/stations'),
    request<Crop[]>('/public/crops'),
  ])
  stations.value = stationRows
  crops.value = cropRows
  if (!stationRows.some(item => item.id === selection.stationId)) selection.stationId = stationRows[0]?.id || ''
  if (!cropRows.some(item => item.code === selection.cropCode)) selection.cropCode = cropRows[0]?.code || ''
}

async function loadContext(observationId?: string | null) {
  if (!selection.stationId || !selection.cropCode) return
  loading.value = true
  error.value = ''
  processError.value = ''
  try {
    context.value = await request<SatelliteMapContext>('/public/satellite-map', {
      query: {
        station_id: selection.stationId,
        crop_code: selection.cropCode,
        observation_id: observationId || undefined,
        history_days: historyInitialized.value ? historyDays.value : undefined,
      },
    })
    if (!historyInitialized.value) {
      historyDays.value = context.value.runtime_config.history_days
      historyInitialized.value = true
    }
    const keys = Object.keys(context.value.observation?.statistics || {})
    if (keys.length && !keys.includes(selectedIndex.value)) selectedIndex.value = keys[0]
    const availableLayers = visualLayers.value.filter(item => item.url).map(item => item.key)
    if (!availableLayers.includes(selectedVisualLayer.value)) selectedVisualLayer.value = availableLayers[0] || 'true_color'
    selectedScene.value = context.value.catalog_scenes.find(item => item.scene_id === context.value?.observation?.scene_id) || null
    agentResult.value = null
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No fue posible cargar el análisis satelital.'
    context.value = null
  } finally {
    loading.value = false
  }
}

async function chooseScene(scene: SatelliteMapScene) {
  selectedScene.value = scene
  processError.value = ''
  agentResult.value = null
  if (scene.processed && scene.observation_id) await loadContext(scene.observation_id)
}

async function processScene(scene?: SatelliteMapScene | null) {
  const target = scene || selectedScene.value || context.value?.catalog_scenes[0]
  if (!target || !selection.stationId || !selection.cropCode) return
  processing.value = true
  processError.value = ''
  try {
    const result = await request<{ context: SatelliteMapContext }>('/public/satellite-map/process', {
      method: 'POST',
      body: {
        station_id: selection.stationId,
        crop_code: selection.cropCode,
        scene_id: target.scene_id,
        captured_date: target.captured_at.slice(0, 10),
        history_days: historyDays.value,
        force: true,
      },
    })
    context.value = result.context
    const availableLayers = visualLayers.value.filter(item => item.url).map(item => item.key)
    selectedVisualLayer.value = availableLayers.includes(selectedVisualLayer.value) ? selectedVisualLayer.value : (availableLayers[0] || 'true_color')
    selectedScene.value = context.value.catalog_scenes.find(item => item.scene_id === context.value?.observation?.scene_id) || null
    agentResult.value = null
  } catch (exception: any) {
    processError.value = exception?.data?.detail || exception?.message || 'No fue posible procesar la escena seleccionada.'
  } finally {
    processing.value = false
  }
}

async function refreshLatest() {
  if (!context.value?.catalog_scenes.length) {
    await loadContext()
    return
  }
  await processScene(context.value.catalog_scenes[0])
}

async function generateAgentExplanation() {
  if (!selection.stationId || !selection.cropCode || !currentObservationId.value) return
  agentLoading.value = true
  agentError.value = ''
  try {
    agentResult.value = await request<SatelliteMapAgentResult>('/public/satellite-map/agent', {
      method: 'POST',
      body: {
        station_id: selection.stationId,
        crop_code: selection.cropCode,
        observation_id: currentObservationId.value,
        force: true,
      },
    })
  } catch (exception: any) {
    agentError.value = exception?.data?.detail || exception?.message || 'No fue posible generar la explicación del agente.'
  } finally {
    agentLoading.value = false
  }
}

watch(() => [selection.stationId, selection.cropCode], () => {
  if (selection.stationId && selection.cropCode) void loadContext()
})
watch(historyDays, () => {
  if (historyInitialized.value && !loading.value && selection.stationId && selection.cropCode) void loadContext(currentObservationId.value)
})

onMounted(async () => {
  try {
    await loadSelectors()
    await loadContext()
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No fue posible iniciar el mapa satelital.'
    loading.value = false
  }
})
</script>

<template>
  <div class="page satellite-page">
    <div class="container">
      <header class="page-head">
        <div>
          <span class="eyebrow">Copernicus Data Space · Sentinel-2</span>
          <h1 class="page-title">Qué está pasando en la zona de influencia</h1>
          <p class="page-subtitle">Vea la imagen sobre el polígono de la estación, compare fechas y relacione los índices con el clima registrado.</p>
        </div>
        <button class="btn btn-primary" :disabled="processing || loading || !context?.catalog_scenes.length" @click="refreshLatest">
          <RefreshCw :class="{ spinning: processing }" />
          {{ processing ? 'Procesando…' : 'Actualizar escena reciente' }}
        </button>
      </header>

      <section class="control-card card">
        <div class="card-body controls">
          <GlobalStationSelector v-model="selection.stationId" :stations="stations" :loading="loading" />
          <GlobalCropSelector v-model="selection.cropCode" :crops="crops" :loading="loading" />
          <label>
            <span class="label">Historial visible</span>
            <select v-model.number="historyDays" class="select">
              <option :value="30">Últimos 30 días</option>
              <option :value="60">Últimos 60 días</option>
              <option :value="90">Últimos 90 días</option>
              <option :value="180">Últimos 180 días</option>
              <option :value="365">Último año</option>
            </select>
          </label>
          <div v-if="context" class="geometry-badge">
            <MapPinned />
            <div><b>{{ context.geometry_source === 'POLYGON' ? 'Polígono exacto' : 'Área aproximada' }}</b><span>{{ context.area_ha ? `${context.area_ha} ha aproximadas` : context.station.locality || context.station.name }}</span></div>
          </div>
        </div>
      </section>

      <ErrorState v-if="error" :message="error" @retry="loadContext()" />
      <LoadingState v-else-if="loading" />

      <template v-else-if="context">
        <p v-if="context.geometry_source !== 'POLYGON'" class="notice notice-warning geometry-warning">La estación está usando un área circular aproximada. Para que la imagen represente el terreno real, dibuje y guarde el polígono en <NuxtLink to="/admin/estaciones">Administración → Estaciones</NuxtLink>.</p>
        <section class="history-card card">
          <div class="card-body">
            <div class="section-head">
              <div><span class="eyebrow">Historial de escenas</span><h2>Seleccione un día para comparar</h2><p>Las fechas con “Procesada” ya tienen imagen e índices. Las demás se calculan al solicitarlas.</p></div>
              <span class="badge badge-info"><History /> {{ context.catalog_scenes.length }} escenas</span>
            </div>
            <p v-if="context.catalog_error" class="notice notice-warning">No fue posible consultar nuevas escenas en este momento. {{ context.catalog_error }}</p>
            <p v-else-if="context.catalog_warning" class="notice notice-info">{{ context.catalog_warning }}</p>
            <div v-if="context.catalog_scenes.length" class="scene-strip">
              <button
                v-for="scene in context.catalog_scenes"
                :key="scene.scene_id"
                type="button"
                class="scene-item"
                :class="{ active: activeSceneId === scene.scene_id, processed: scene.processed }"
                @click="chooseScene(scene)"
              >
                <span class="scene-date"><CalendarDays /> {{ formatDate(scene.captured_at) }}</span>
                <b>{{ sceneStatus(scene) }}</b>
                <small><Cloud /> {{ scene.cloud_percentage == null ? 'Nubosidad —' : `${formatNumber(scene.cloud_percentage, 0)}% nubes` }}</small>
                <small v-if="scene.processed"><Layers3 /> {{ scene.indices_available }} índices</small>
              </button>
            </div>
            <div v-else class="empty-scenes"><Satellite /><div><b>No se encontraron escenas en el periodo.</b><p>Aumente el historial o revise el máximo de nubosidad configurado en Administración → Integraciones.</p></div></div>
            <div v-if="selectedScene && !selectedScene.processed" class="process-scene">
              <div><b>Esta fecha todavía no fue procesada.</b><span>Copernicus calculará la imagen RGB y los nueve índices para todo el polígono.</span></div>
              <button class="btn btn-primary" :disabled="processing" @click="processScene(selectedScene)">
                <LoaderCircle v-if="processing" class="spinning" /><ScanSearch v-else />
                {{ processing ? 'Procesando escena…' : 'Procesar esta fecha' }}
              </button>
            </div>
            <p v-if="processError" class="notice notice-warning">{{ processError }}</p>
          </div>
        </section>

        <section class="map-card card">
          <div class="card-body">
            <div class="section-head map-heading">
              <div>
                <span class="eyebrow">{{ context.station.name }} · {{ context.crop.name }}</span>
                <h2>{{ context.observation ? `Escena del ${formatDate(context.observation.captured_at)}` : 'Zona configurada sin escena procesada' }}</h2>
                <p>La capa seleccionada corresponde a la misma escena y al mismo polígono. Puede mover, acercar y cambiar la transparencia.</p>
              </div>
              <div v-if="context.observation" class="scene-summary">
                <span><Cloud /> {{ context.observation.cloud_percentage == null ? 'Nubes —' : `${formatNumber(context.observation.cloud_percentage, 0)}% nubes` }}</span>
                <span><Image /> {{ context.observation.resolution_m || 10 }} m/píxel</span>
                <span class="badge" :class="context.observation.analysis?.reliability === 'alta' ? 'badge-success' : 'badge-warning'">{{ context.observation.analysis?.reliability || 'sin evaluar' }}</span>
              </div>
            </div>
            <div class="visual-layer-strip" role="list" aria-label="Capas satelitales disponibles">
              <button
                v-for="layer in visualLayers"
                :key="layer.key"
                type="button"
                :class="{ active: selectedVisualLayer === layer.key, unavailable: !layer.url }"
                :disabled="!layer.url"
                @click="chooseVisualLayer(layer.key)"
              >
                <span>{{ layer.label }}</span>
                <small>{{ layer.title }}<template v-if="layer.value != null"> · {{ formatNumber(layer.value, 3) }}</template></small>
              </button>
            </div>
            <div v-if="context.observation" class="layer-status">
              <Layers3 />
              <span>Mostrando <b>{{ selectedVisual?.label }}</b> de la escena {{ formatDate(context.observation.captured_at) }}. {{ context.observation.visual_layers_available || 0 }} de 9 mapas de índices disponibles.</span>
            </div>
            <SatelliteAnalysisMap
              :geometry="context.geometry"
              :image-url="currentImageUrl"
              :latitude="context.station.latitude"
              :longitude="context.station.longitude"
              :default-opacity="context.runtime_config.default_map_opacity"
            />
          </div>
        </section>

        <section class="interpretation-card card" :class="`is-${interpretationClass}`">
          <div class="card-body">
            <div class="interpretation-head">
              <div class="interpretation-icon"><TriangleAlert v-if="interpretationClass === 'attention'" /><CheckCircle2 v-else /></div>
              <div>
                <span class="eyebrow">Interpretación del polígono</span>
                <h2>{{ context.interpretation.headline }}</h2>
                <p>{{ context.interpretation.summary }}</p>
              </div>
              <button class="btn btn-light" :disabled="agentLoading || !context.observation" @click="generateAgentExplanation">
                <Sparkles :class="{ spinning: agentLoading }" />
                {{ agentLoading ? 'Interpretando…' : agentResult ? 'Actualizar criterio IA' : 'Explicar con IA' }}
              </button>
            </div>
            <div class="interpretation-grid">
              <div class="action-box"><h3>Qué hacer ahora</h3><ol><li v-for="item in context.interpretation.actions" :key="item">{{ item }}</li></ol></div>
              <div class="watch-box"><h3>Qué cambió o qué vigilar</h3><ul v-if="context.interpretation.what_to_watch.length"><li v-for="item in context.interpretation.what_to_watch" :key="item">{{ item }}</li></ul><p v-else>No existe todavía una escena anterior comparable.</p></div>
              <div class="weather-box"><h3>Clima de la estación ese día</h3><template v-if="context.weather_on_capture"><p><Thermometer /> Temperatura media: <b>{{ formatNumber(context.weather_on_capture.temperature_avg_c, 1) }} °C</b></p><p><Droplets /> Humedad: <b>{{ formatNumber(context.weather_on_capture.humidity_avg_pct, 0) }}%</b></p><p><Cloud /> Lluvia: <b>{{ formatNumber(context.weather_on_capture.rain_sum_mm, 1) }} mm</b></p></template><p v-else>No hay resumen meteorológico guardado para la fecha de la escena.</p></div>
            </div>
            <div v-if="agentResult" class="agent-result"><MarkdownContent :content="agentResult.markdown" /></div>
            <p v-if="agentError" class="notice notice-warning">{{ agentError }}</p>
            <p class="single-limit">{{ context.interpretation.limitations[0] }}</p>
          </div>
        </section>

        <section class="indices-card card">
          <div class="card-body">
            <div class="section-head"><div><span class="eyebrow">Toda la superficie del polígono</span><h2>Índices espectrales</h2><p>El promedio y las estadísticas se calculan con los píxeles válidos de la zona, no con un solo punto.</p></div><span class="badge badge-success"><Sprout /> {{ context.observation?.analysis?.indices_available || 0 }} de 9 disponibles</span></div>
            <div class="index-grid">
              <article
                v-for="index in indexRows"
                :key="index.key"
                :class="{ unavailable: index.value == null, active: selectedVisualLayer === index.key }"
                role="button"
                :aria-disabled="!context.observation?.index_images?.[index.key]"
                :tabindex="context.observation?.index_images?.[index.key] ? 0 : -1"
                @click="chooseIndexLayer(index.key)"
                @keydown.enter="chooseIndexLayer(index.key)"
              >
                <div><b>{{ index.label }}</b><span>{{ index.title }}</span></div>
                <strong>{{ index.value == null ? '—' : formatNumber(index.value, 3) }}</strong>
                <p>{{ index.help }}</p>
                <small class="map-availability">{{ context.observation?.index_images?.[index.key] ? 'Mapa disponible' : 'Mapa no procesado' }}</small>
              </article>
            </div>
            <div v-if="context.observation && Object.keys(context.observation.statistics || {}).length" class="statistics">
              <label><span class="label">Ver distribución de</span><select v-model="selectedIndex" class="select"><option v-for="row in indexRows" :key="row.key" :value="row.key" :disabled="!row.stats">{{ row.label }} · {{ row.title }}</option></select></label>
              <div v-if="selectedStats" class="stats-grid">
                <div><span>Mínimo</span><b>{{ formatNumber(selectedStats.min, 3) }}</b></div>
                <div><span>Promedio</span><b>{{ formatNumber(selectedStats.mean, 3) }}</b></div>
                <div><span>Máximo</span><b>{{ formatNumber(selectedStats.max, 3) }}</b></div>
                <div><span>Desviación</span><b>{{ formatNumber(selectedStats.stdev, 3) }}</b></div>
                <div><span>Píxeles válidos</span><b>{{ selectedStats.sample_count ?? '—' }}</b></div>
                <div><span>Sin dato</span><b>{{ selectedStats.no_data_count ?? '—' }}</b></div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.satellite-page{padding-bottom:45px}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.page-head .btn svg,.interpretation-head .btn svg,.process-scene .btn svg{width:18px}.control-card,.history-card,.map-card,.interpretation-card,.indices-card{margin-top:20px}.geometry-warning{margin-top:20px}.geometry-warning a{font-weight:800;color:inherit;text-decoration:underline}.controls{display:grid;grid-template-columns:1.1fr 1fr .8fr 1fr;gap:14px;align-items:end}.geometry-badge{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 11px;border-radius:10px;background:#edf7fb;color:var(--fc-primary)}.geometry-badge>svg{width:22px}.geometry-badge div{display:flex;flex-direction:column}.geometry-badge span{font-size:.76rem;color:var(--fc-text-muted)}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.section-head h2{margin:3px 0 5px;color:var(--fc-primary)}.section-head p{margin:0;color:var(--fc-text-muted)}.section-head .badge{display:inline-flex;align-items:center;gap:6px}.section-head .badge svg{width:16px}.scene-strip{display:flex;gap:10px;margin-top:17px;padding-bottom:5px;overflow-x:auto}.scene-item{flex:0 0 175px;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:12px;border:1px solid var(--fc-border);border-radius:12px;background:#fff;color:var(--fc-text);text-align:left}.scene-item:hover{border-color:#8cbad0}.scene-item.active{border-color:var(--fc-primary);box-shadow:0 0 0 2px rgba(0,113,172,.15)}.scene-item.processed{background:#f2faf5}.scene-item b{color:var(--fc-primary)}.scene-item small,.scene-date{display:flex;align-items:center;gap:5px}.scene-item svg{width:14px}.scene-date{font-size:.78rem;font-weight:800}.process-scene{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:15px;padding:14px;border-radius:12px;background:#fff7df;border:1px solid #f2d37b}.process-scene>div{display:flex;flex-direction:column;gap:3px}.process-scene span{color:var(--fc-text-muted)}.empty-scenes{display:flex;align-items:center;gap:12px;margin-top:17px;padding:18px;border:1px dashed var(--fc-border);border-radius:12px}.empty-scenes>svg{width:34px;color:var(--fc-primary)}.empty-scenes p{margin:4px 0 0;color:var(--fc-text-muted)}.map-heading{margin-bottom:13px}.visual-layer-strip{display:flex;gap:8px;margin:0 0 10px;padding-bottom:5px;overflow-x:auto}.visual-layer-strip button{flex:0 0 auto;min-width:128px;padding:9px 11px;border:1px solid var(--fc-border);border-radius:10px;background:#fff;text-align:left;color:var(--fc-text)}.visual-layer-strip button span,.visual-layer-strip button small{display:block}.visual-layer-strip button span{font-weight:900;color:var(--fc-primary)}.visual-layer-strip button small{margin-top:2px;color:var(--fc-text-muted);font-size:.7rem}.visual-layer-strip button.active{border-color:var(--fc-primary);box-shadow:0 0 0 2px rgba(0,113,172,.13);background:#edf8fd}.visual-layer-strip button.unavailable{opacity:.48}.layer-status{display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:9px 11px;border-radius:9px;background:var(--fc-surface-muted);color:var(--fc-text-muted);font-size:.8rem}.layer-status svg{width:17px;color:var(--fc-primary)}.scene-summary{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.scene-summary>span:not(.badge){display:inline-flex;align-items:center;gap:5px;color:var(--fc-text-muted);font-size:.8rem}.scene-summary svg{width:15px}.interpretation-card{border-left:5px solid #4d9b72}.interpretation-card.is-attention{border-left-color:#e5a323}.interpretation-card.is-limited{border-left-color:#8799a5}.interpretation-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:flex-start}.interpretation-icon{display:grid;place-items:center;width:45px;height:45px;border-radius:50%;background:#edf8f2;color:#357a56}.is-attention .interpretation-icon{background:#fff4d8;color:#a66b00}.is-limited .interpretation-icon{background:#eef1f3;color:#667680}.interpretation-icon svg{width:23px}.interpretation-head h2{margin:3px 0 6px;color:var(--fc-primary)}.interpretation-head p{margin:0;line-height:1.6}.interpretation-grid{display:grid;grid-template-columns:1.1fr 1fr .9fr;gap:12px;margin-top:17px}.interpretation-grid>div{padding:14px;border-radius:12px;background:var(--fc-surface-muted)}.interpretation-grid h3{margin:0 0 8px;color:var(--fc-primary);font-size:.95rem}.interpretation-grid ol,.interpretation-grid ul{margin:0;padding-left:20px}.interpretation-grid li{margin:6px 0;line-height:1.45}.weather-box p{display:flex;align-items:center;gap:7px;margin:7px 0}.weather-box svg{width:17px;color:var(--fc-primary)}.agent-result{margin-top:16px;padding:17px;border:1px solid #b8d9e8;border-radius:13px;background:#f6fbfd}.single-limit{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--fc-border);color:var(--fc-text-muted);font-size:.8rem}.index-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-top:17px}.index-grid article{padding:14px;border:1px solid var(--fc-border);border-radius:12px;background:#fff}.index-grid article.unavailable{opacity:.55;background:#f5f6f7}.index-grid article{cursor:pointer}.index-grid article.active{border-color:var(--fc-primary);box-shadow:0 0 0 2px rgba(0,113,172,.12)}.index-grid article>div{display:flex;flex-direction:column}.index-grid article>div b{color:var(--fc-primary)}.index-grid article>div span{font-size:.75rem;color:var(--fc-text-muted)}.index-grid strong{display:block;margin:10px 0 6px;font-size:1.5rem;color:#245f45}.index-grid p{margin:0;color:var(--fc-text-muted);font-size:.78rem;line-height:1.4}.map-availability{display:block;margin-top:9px;font-size:.7rem;font-weight:800;color:var(--fc-primary)}.statistics{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:end;margin-top:18px;padding-top:18px;border-top:1px solid var(--fc-border)}.stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.stats-grid>div{display:flex;flex-direction:column;padding:10px;border-radius:9px;background:var(--fc-surface-muted)}.stats-grid span{font-size:.7rem;color:var(--fc-text-muted)}.stats-grid b{color:var(--fc-primary)}.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1050px){.controls{grid-template-columns:1fr 1fr}.interpretation-grid{grid-template-columns:1fr 1fr}.weather-box{grid-column:1/-1}.index-grid{grid-template-columns:repeat(2,1fr)}.statistics{grid-template-columns:1fr}.stats-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.page-head,.section-head,.process-scene{flex-direction:column}.page-head .btn,.process-scene .btn{width:100%}.controls{grid-template-columns:1fr}.interpretation-head{grid-template-columns:auto 1fr}.interpretation-head .btn{grid-column:1/-1;width:100%}.interpretation-grid{grid-template-columns:1fr}.weather-box{grid-column:auto}.index-grid{grid-template-columns:1fr}.stats-grid{grid-template-columns:repeat(2,1fr)}}
</style>
