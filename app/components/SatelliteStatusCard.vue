<script setup lang="ts">
import { BrainCircuit, Cloud, ExternalLink, Image, MapPinned, RefreshCw, Satellite, Sparkles } from 'lucide-vue-next'
import type { Recommendation, SatelliteObservation, SatelliteSignal, SatelliteStatus } from '~/types/api'

const props = withDefaults(defineProps<{
  data?: SatelliteObservation | null
  status?: SatelliteStatus | null
  recommendation?: Recommendation | null
  refreshing?: boolean
  agentLoading?: boolean
  error?: string
  agentError?: string
}>(), {
  data: null,
  status: null,
  recommendation: null,
  refreshing: false,
  agentLoading: false,
  error: '',
  agentError: '',
})
const emit = defineEmits<{ refresh: []; agentRefresh: [] }>()
const config = useRuntimeConfig()
const selectedStatistic = ref('ndvi')
const selectedLayer = ref('true_color')

const indexDefinitions: Record<string, { label: string; meaning: string }> = {
  ndvi: { label: 'NDVI', meaning: 'Vigor y cobertura vegetal' },
  ndmi: { label: 'NDMI', meaning: 'Humedad del dosel/superficie' },
  ndwi: { label: 'NDWI', meaning: 'Señal superficial de agua' },
  evi: { label: 'EVI', meaning: 'Vigor en coberturas densas' },
  savi: { label: 'SAVI', meaning: 'Vegetación corrigiendo influencia del suelo' },
  ndre: { label: 'NDRE', meaning: 'Clorofila y estrés en etapas avanzadas' },
  gndvi: { label: 'GNDVI', meaning: 'Actividad fotosintética sensible al verde' },
  nbr: { label: 'NBR', meaning: 'Cambios severos y alteración de cobertura' },
  msi: { label: 'MSI', meaning: 'Estrés hídrico relativo; mayor puede indicar sequedad' },
}

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
const visualLayers = computed(() => {
  const rows = [{ key: 'true_color', label: 'Color real', meaning: 'Sentinel-2 RGB', url: props.data?.image_available ? resolveImageUrl(props.data?.source_url) : null }]
  for (const [key, definition] of Object.entries(indexDefinitions)) {
    rows.push({ key, label: definition.label, meaning: definition.meaning, url: resolveImageUrl(props.data?.index_images?.[key]) })
  }
  return rows
})
const selectedVisualLayer = computed(() => visualLayers.value.find(item => item.key === selectedLayer.value) || visualLayers.value[0])
const imageUrl = computed(() => selectedVisualLayer.value?.url || null)
const captureLabel = computed(() => props.data?.captured_at ? new Date(props.data.captured_at).toLocaleString('es-PY') : 'No indicada')
const latestCatalogLabel = computed(() => props.data?.latest_catalog_scene_at ? new Date(props.data.latest_catalog_scene_at).toLocaleString('es-PY') : null)
const validCoverageLabel = computed(() => {
  const value = props.data?.quality?.valid_coverage_percentage
  return value == null ? '—' : `${Number(value).toFixed(1)}%`
})
const validPixelsLabel = computed(() => props.data?.quality?.valid_pixels ?? '—')
const dataAgeLabel = computed(() => props.data?.data_age_days == null ? '—' : `${Number(props.data.data_age_days).toFixed(1)} días`)
const sourceModeLabel = computed(() => {
  const mode = props.data?.data_source_mode
  if (mode === 'RECENT_VALID_FALLBACK') return 'Escena válida anterior'
  if (mode === 'LAST_VALID_CACHE') return 'Último NDVI válido guardado'
  return 'Escena válida más reciente'
})
const analysis = computed(() => props.data?.analysis || null)
const qualityClass = computed(() => analysis.value?.reliability === 'alta' ? 'badge-success' : analysis.value?.reliability === 'media' ? 'badge-warning' : 'badge-danger')
const markdown = computed(() => props.recommendation?.markdown || props.recommendation?.resumen || '')
const indices = computed<Record<string, number | null>>(() => ({
  ndvi: props.data?.ndvi ?? null,
  ndmi: props.data?.ndmi ?? null,
  ndwi: props.data?.ndwi ?? null,
  ...(props.data?.indices || {}),
}))
const indexRows = computed(() => Object.entries(indexDefinitions).map(([key, definition]) => ({
  key,
  ...definition,
  value: indices.value[key] ?? null,
})))
const availableStatistics = computed(() => Object.keys(props.data?.statistics || {}).filter(key => props.data?.statistics?.[key]))
const selectedStats = computed(() => props.data?.statistics?.[selectedStatistic.value] || null)
const sceneMetadataRows = computed(() => {
  const metadata = props.data?.scene_metadata || {}
  const definitions: Array<[string, string]> = [
    ['id', 'ID de escena'],
    ['collection', 'Colección'],
    ['platform', 'Plataforma'],
    ['constellation', 'Constelación'],
    ['instrument', 'Instrumento'],
    ['processing_level', 'Nivel de procesamiento'],
  ]
  return definitions
    .map(([key, label]) => ({ key, label, value: metadata[key] }))
    .filter(row => row.value !== null && row.value !== undefined && row.value !== '')
})

watch(availableStatistics, keys => {
  if (keys.length && !keys.includes(selectedStatistic.value)) selectedStatistic.value = keys[0]
}, { immediate: true })
watch(visualLayers, rows => {
  const available = rows.filter(item => item.url).map(item => item.key)
  if (!available.includes(selectedLayer.value)) selectedLayer.value = available[0] || 'true_color'
}, { immediate: true })

function selectLayer(key: string) {
  const layer = visualLayers.value.find(item => item.key === key)
  if (!layer?.url) return
  selectedLayer.value = key
  if (key !== 'true_color') selectedStatistic.value = key
}

function indexLabel(value?: number | null): string {
  return value == null ? '—' : Number(value).toFixed(3)
}
function statisticLabel(value?: number | null): string {
  return value == null ? '—' : Number(value).toFixed(4)
}
function signalClass(signal: SatelliteSignal): string {
  return signal.level === 'positive' ? 'signal-positive' : signal.level === 'attention' ? 'signal-attention' : 'signal-info'
}
function metadataValue(value: any): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}
</script>

<template>
  <article class="card satellite-card">
    <div class="card-body">
      <header class="sat-head">
        <div class="row title-row">
          <span class="sat-icon"><Satellite /></span>
          <div>
            <span class="eyebrow">Copernicus Data Space · Sentinel-2 L2A</span>
            <h3>Imagen reciente, índices espectrales y criterio IA</h3>
            <p>La escena del polígono se cruza con la estación, fenología, reglas y documentos del cultivo.</p>
          </div>
        </div>
        <div class="sat-actions">
          <button class="btn btn-light" :disabled="refreshing || !status?.configured" @click="emit('refresh')">
            <RefreshCw :class="{ spinning: refreshing }" />
            {{ refreshing ? 'Consultando escena…' : 'Actualizar escena' }}
          </button>
          <button class="btn btn-light" :disabled="agentLoading || !data" @click="emit('agentRefresh')">
            <Sparkles :class="{ spinning: agentLoading }" />
            {{ agentLoading ? 'Interpretando…' : 'Reinterpretar con IA' }}
          </button>
        </div>
      </header>

      <p v-if="error" class="notice notice-warning">{{ error }}</p>
      <p v-if="data?.data_warning" class="notice notice-warning freshness-notice">{{ data.data_warning }}</p>

      <template v-if="data">
        <div class="sat-layout">
          <div class="image-panel">
            <div class="layer-selector" role="list" aria-label="Capas Sentinel-2">
              <button v-for="layer in visualLayers" :key="layer.key" type="button" :disabled="!layer.url" :class="{ active: selectedLayer === layer.key }" @click="selectLayer(layer.key)">
                <b>{{ layer.label }}</b><span>{{ layer.meaning }}</span>
              </button>
            </div>
            <div class="selected-layer-label"><Image /><span>Mostrando <b>{{ selectedVisualLayer?.label }}</b> · misma escena, fecha y polígono</span></div>
            <img v-if="imageUrl" class="satellite-image" :src="imageUrl" :alt="`Capa ${selectedVisualLayer?.label || 'Sentinel-2'} de la geozona seleccionada`">
            <div v-else class="image-empty">
              <Image />
              <b>La capa seleccionada todavía no está procesada</b>
              <span>Actualice la escena para generar color real y los nueve mapas espectrales desde la misma adquisición.</span>
            </div>
            <div class="image-meta">
              <span><MapPinned /> {{ data.plot_name || 'Geozona' }}</span>
              <span><Cloud /> {{ data.cloud_percentage == null ? 'Nubosidad no indicada' : `${data.cloud_percentage}% de nubosidad` }}</span>
              <span><Satellite /> {{ captureLabel }}</span>
            </div>
          </div>

          <div class="evidence-panel">
            <div class="quality-row">
              <div>
                <span>Confiabilidad de la evidencia</span>
                <b>{{ analysis?.quality_score ?? '—' }}/100</b>
              </div>
              <span class="badge" :class="qualityClass">{{ analysis?.reliability || 'sin evaluar' }}</span>
            </div>

            <p v-if="analysis?.summary" class="summary">{{ analysis.summary }}</p>

            <div class="index-grid">
              <button v-for="index in indexRows" :key="index.key" type="button" :disabled="!data.index_images?.[index.key]" :class="{ unavailable: index.value == null, active: selectedLayer === index.key }" @click="selectLayer(index.key)">
                <span>{{ index.label }} · {{ index.meaning }}</span>
                <b>{{ indexLabel(index.value) }}</b>
                <small>{{ data.index_images?.[index.key] ? 'Ver mapa' : 'Sin mapa' }}</small>
              </button>
              <div><span>Resolución espacial</span><b>{{ data.resolution_m ? `${data.resolution_m} m` : '—' }}</b></div>
            </div>

            <dl class="details">
              <div><dt>Producto mostrado</dt><dd>{{ sourceModeLabel }}</dd></div>
              <div><dt>Fecha NDVI válido</dt><dd>{{ captureLabel }}</dd></div>
              <div v-if="latestCatalogLabel && latestCatalogLabel !== captureLabel"><dt>Última adquisición</dt><dd>{{ latestCatalogLabel }}</dd></div>
              <div><dt>Cobertura válida</dt><dd>{{ validCoverageLabel }}</dd></div>
              <div><dt>Píxeles válidos</dt><dd>{{ validPixelsLabel }}</dd></div>
              <div><dt>Antigüedad</dt><dd>{{ dataAgeLabel }}<template v-if="data.data_is_stale"> · desactualizado</template></dd></div>
              <div><dt>Geometría</dt><dd>{{ analysis?.geometry_label || data.geometry_mode || 'No indicada' }}</dd></div>
              <div><dt>Área</dt><dd>{{ data.plot_area_ha == null ? 'No registrada' : `${data.plot_area_ha} ha` }}</dd></div>
              <div><dt>Procesamiento</dt><dd>{{ data.processing_status || 'No indicado' }}</dd></div>
              <div><dt>Mapas de índices</dt><dd>{{ data.visual_layers_available || 0 }} de 9</dd></div>
              <div><dt>Escena</dt><dd>{{ data.scene_id || 'No indicada' }}</dd></div>
            </dl>
          </div>
        </div>

        <section v-if="availableStatistics.length" class="statistics-section">
          <div class="section-heading"><BrainCircuit /><div><h4>Estadísticas del polígono</h4><p>No se muestra solo un píxel: se resumen todos los píxeles válidos del área configurada.</p></div></div>
          <div class="statistics-toolbar"><label><span class="label">Índice</span><select v-model="selectedStatistic" class="select"><option v-for="key in availableStatistics" :key="key" :value="key">{{ indexDefinitions[key]?.label || key.toUpperCase() }}</option></select></label></div>
          <div v-if="selectedStats" class="stats-grid">
            <div><span>Mínimo</span><b>{{ statisticLabel(selectedStats.min) }}</b></div>
            <div><span>Promedio</span><b>{{ statisticLabel(selectedStats.mean) }}</b></div>
            <div><span>Máximo</span><b>{{ statisticLabel(selectedStats.max) }}</b></div>
            <div><span>Desviación</span><b>{{ statisticLabel(selectedStats.stdev) }}</b></div>
            <div><span>Píxeles válidos</span><b>{{ selectedStats.valid_pixel_count ?? selectedStats.sample_count ?? '—' }}</b></div>
            <div><span>Cobertura válida</span><b>{{ selectedStats.valid_coverage_percentage == null ? '—' : `${Number(selectedStats.valid_coverage_percentage).toFixed(1)}%` }}</b></div>
            <div><span>Sin dato</span><b>{{ selectedStats.no_data_count ?? '—' }}</b></div>
          </div>
          <div v-if="selectedStats?.percentiles" class="percentiles"><span v-for="(value, key) in selectedStats.percentiles" :key="key"><b>P{{ key }}</b> {{ statisticLabel(value) }}</span></div>
        </section>

        <section v-if="sceneMetadataRows.length" class="scene-section">
          <h4>Metadatos de la escena válida mostrada</h4>
          <dl><div v-for="row in sceneMetadataRows" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ metadataValue(row.value) }}</dd></div></dl>
        </section>

        <section v-if="analysis?.signals?.length" class="signal-section">
          <div class="section-heading"><BrainCircuit /><div><h4>Señales calculadas</h4><p>Estas señales no modifican por sí solas la alerta determinística.</p></div></div>
          <div class="signal-grid">
            <article v-for="signal in analysis.signals" :key="signal.code" class="signal" :class="signalClass(signal)">
              <div><b>{{ signal.label }}</b><strong v-if="signal.value != null">{{ Number(signal.value).toFixed(3) }}</strong></div>
              <p>{{ signal.message }}</p>
            </article>
          </div>
        </section>

        <section class="agent-interpretation">
          <div class="section-heading"><Sparkles /><div><h4>Interpretación cruzada del agente</h4><p>Relaciona Sentinel-2 con lluvia, temperatura, humedad, suelo, etapa fenológica, riesgo de enfermedades y riego.</p></div></div>
          <p v-if="agentError" class="notice notice-warning">{{ agentError }}</p>
          <LoadingState v-if="agentLoading" />
          <MarkdownContent v-else-if="markdown" :content="markdown" />
          <EmptyState v-else title="Criterio satelital pendiente" message="La evidencia está disponible; pulse “Reinterpretar con IA” para generar la explicación cruzada." />
        </section>

        <section v-if="analysis?.evidence_for_agent?.length" class="agent-evidence">
          <h4>Evidencia entregada al agente</h4>
          <ul><li v-for="item in analysis.evidence_for_agent" :key="item">{{ item }}</li></ul>
        </section>

        <section v-if="analysis?.limitations?.length" class="limitations">
          <h4>Limitaciones obligatorias</h4>
          <ul><li v-for="item in analysis.limitations" :key="item">{{ item }}</li></ul>
        </section>

        <p v-if="data.processing_status === 'CATALOG_ONLY'" class="notice notice-warning small">El catálogo encontró la escena, pero todavía no calculó imagen ni índices. Abra Integraciones, edite Sentinel-2, configure OAuth y ejecute la prueba.</p>
        <p v-if="data.processing_error" class="notice notice-warning small">Procesamiento satelital: {{ data.processing_error }}</p>
        <a v-if="selectedLayer === 'true_color' && imageUrl && /^https?:\/\//i.test(data.source_url || '')" :href="imageUrl" target="_blank" rel="noopener" class="source-link"><ExternalLink /> Abrir fuente de imagen</a>
      </template>

      <div v-else class="empty-evidence">
        <Satellite />
        <div>
          <b>No existe evidencia Copernicus para esta zona</b>
          <p>{{ status?.error || (status?.configured ? 'Pulse “Actualizar escena” para buscar la imagen Sentinel-2 más reciente.' : 'Configure en la estación un polígono de influencia o coordenadas con radio.') }}</p>
        </div>
      </div>

      <p class="method-note">Sentinel-2 aporta evidencia espacial gratuita del terreno. Las conclusiones de riego o enfermedad deben contrastarse con sensores, reglas y observación de campo.</p>
    </div>
  </article>
</template>

<style scoped>
.satellite-card{overflow:hidden}.sat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.title-row{align-items:flex-start}.sat-icon{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:14px;background:#e7f3fa;color:var(--fc-primary)}.sat-icon svg{width:26px}.eyebrow{display:block;margin-bottom:3px;color:var(--fc-secondary);font-size:.74rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h3,h4,p{margin:0}h3,h4{color:var(--fc-primary)}.title-row p,.section-heading p{margin-top:5px;color:var(--fc-text-muted);font-size:.88rem}.sat-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.sat-actions svg{width:16px}.freshness-notice{margin-top:14px}.sat-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:18px;margin-top:18px}.image-panel,.evidence-panel{min-width:0}.layer-selector{display:flex;gap:7px;margin-bottom:9px;padding-bottom:4px;overflow-x:auto}.layer-selector button{flex:0 0 116px;padding:8px 9px;border:1px solid var(--fc-border);border-radius:9px;background:#fff;text-align:left;color:var(--fc-text)}.layer-selector button b,.layer-selector button span{display:block}.layer-selector button b{color:var(--fc-primary)}.layer-selector button span{margin-top:2px;color:var(--fc-text-muted);font-size:.65rem;line-height:1.25}.layer-selector button.active{border-color:var(--fc-primary);background:#edf8fd;box-shadow:0 0 0 2px rgba(0,113,172,.12)}.layer-selector button:disabled{opacity:.42}.selected-layer-label{display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:8px 10px;border-radius:8px;background:var(--fc-surface-muted);color:var(--fc-text-muted);font-size:.76rem}.selected-layer-label svg{width:16px;color:var(--fc-primary)}.satellite-image,.image-empty{width:100%;height:390px;border:1px solid var(--fc-border);border-radius:14px}.satellite-image{display:block;object-fit:cover}.image-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;background:var(--fc-surface-muted);color:var(--fc-text-muted)}.image-empty svg{width:44px;height:44px;color:var(--fc-primary)}.image-empty b{color:var(--fc-primary)}.image-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:9px;color:var(--fc-text-muted);font-size:.78rem}.image-meta span{display:inline-flex;align-items:center;gap:5px}.image-meta svg{width:14px}.evidence-panel{padding:17px;border:1px solid var(--fc-border);border-radius:14px;background:linear-gradient(180deg,#fff,var(--fc-surface-muted))}.quality-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.quality-row>div span{display:block;color:var(--fc-text-muted);font-size:.76rem}.quality-row>div b{display:block;margin-top:2px;color:var(--fc-primary);font-size:1.45rem}.summary{margin:13px 0;padding:10px 12px;border-radius:9px;background:#e9f3f9;color:var(--fc-primary);font-weight:800}.index-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.index-grid>button,.index-grid>div{padding:10px;border:1px solid var(--fc-border);border-radius:9px;background:#fff;text-align:left;color:inherit}.index-grid>button{cursor:pointer}.index-grid>button:disabled{cursor:not-allowed}.index-grid>button.active{border-color:var(--fc-primary);box-shadow:0 0 0 2px rgba(0,113,172,.12)}.index-grid>button.unavailable{opacity:.58}.index-grid span{display:block;color:var(--fc-text-muted);font-size:.68rem;line-height:1.35}.index-grid b{display:block;margin-top:4px;color:var(--fc-primary);font-size:1rem}.index-grid small{display:block;margin-top:4px;color:var(--fc-secondary);font-size:.66rem;font-weight:800}.details{margin:14px 0 0}.details>div{display:grid;grid-template-columns:105px 1fr;gap:10px;padding:7px 0;border-bottom:1px dashed var(--fc-border);font-size:.8rem}.details dt{color:var(--fc-text-muted)}.details dd{margin:0;font-weight:700;overflow-wrap:anywhere}.statistics-section,.scene-section,.signal-section,.agent-interpretation,.agent-evidence,.limitations{margin-top:18px}.statistics-section,.scene-section{padding:15px;border:1px solid var(--fc-border);border-radius:12px}.section-heading{display:flex;align-items:flex-start;gap:9px}.section-heading>svg{flex:0 0 23px;color:var(--fc-primary)}.statistics-toolbar{max-width:260px;margin-top:12px}.stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}.stats-grid>div{padding:10px;border-radius:9px;background:var(--fc-surface-muted)}.stats-grid span{display:block;color:var(--fc-text-muted);font-size:.69rem}.stats-grid b{display:block;margin-top:3px;color:var(--fc-primary)}.percentiles{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.percentiles span{padding:6px 8px;border-radius:7px;background:#edf7fb;font-size:.75rem}.scene-section dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 0}.scene-section dl>div{padding:9px;border-radius:8px;background:var(--fc-surface-muted)}.scene-section dt{color:var(--fc-text-muted);font-size:.7rem}.scene-section dd{margin:3px 0 0;font-weight:700;font-size:.8rem;overflow-wrap:anywhere}.signal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px}.signal{padding:13px;border-left:4px solid;border-radius:10px;background:var(--fc-surface-muted)}.signal>div{display:flex;justify-content:space-between;gap:10px}.signal strong{white-space:nowrap}.signal p{margin-top:6px;color:var(--fc-text-muted);font-size:.81rem;line-height:1.45}.signal-positive{border-color:var(--fc-success)}.signal-info{border-color:var(--fc-secondary)}.signal-attention{border-color:var(--fc-warning)}.agent-interpretation{padding:17px;border-radius:13px;background:linear-gradient(135deg,#edf7fb,#fff)}.agent-interpretation .section-heading{margin-bottom:12px}.agent-evidence,.limitations{padding:14px 16px;border-radius:12px}.agent-evidence{background:#edf7fb}.limitations{background:#fff8e8}.agent-evidence ul,.limitations ul{margin:8px 0 0;padding-left:18px}.agent-evidence li,.limitations li{margin:4px 0;font-size:.84rem}.empty-evidence{display:flex;align-items:center;gap:13px;margin-top:18px;padding:22px;border:1px dashed var(--fc-border);border-radius:13px;background:var(--fc-surface-muted)}.empty-evidence>svg{width:38px;color:var(--fc-primary)}.empty-evidence b{color:var(--fc-primary)}.empty-evidence p{margin-top:4px;color:var(--fc-text-muted)}.source-link{display:inline-flex;align-items:center;gap:6px;margin-top:12px;color:var(--fc-primary);font-weight:800;font-size:.84rem}.source-link svg{width:16px}.method-note{margin-top:16px;color:var(--fc-text-muted);font-size:.78rem}.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1100px){.stats-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.sat-head{flex-direction:column}.sat-actions{justify-content:flex-start}.sat-layout{grid-template-columns:1fr}.satellite-image,.image-empty{height:320px}.scene-section dl{grid-template-columns:1fr 1fr}}@media(max-width:560px){.index-grid,.stats-grid,.scene-section dl{grid-template-columns:1fr}.details>div{grid-template-columns:1fr;gap:2px}.satellite-image,.image-empty{height:250px}.sat-actions{width:100%}.sat-actions .btn{width:100%}}
</style>
