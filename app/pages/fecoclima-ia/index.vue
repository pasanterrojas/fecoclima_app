<script setup lang="ts">
import { Clock3, RadioTower, Sparkles } from 'lucide-vue-next'
import type { Crop, DashboardResponse, Recommendation, Station } from '~/types/api'

useSeoMeta({ title: 'Clima y alertas' })
const { request } = useApi()
const selection = useSelectionStore()
const stations = ref<Station[]>([])
const crops = ref<Crop[]>([])
const dashboard = ref<DashboardResponse | null>(null)
const selectorsLoading = ref(true)
const analyzing = ref(false)
const agentLoading = ref(false)
const satelliteRefreshing = ref(false)
const satelliteAgentLoading = ref(false)
const error = ref('')
const agentError = ref('')
const satelliteError = ref('')
const satelliteAgentError = ref('')
const analysisDirty = ref(false)
const analyzedSignature = ref('')

const today = new Date().toISOString().slice(0, 10)
const selectionSignature = computed(() => [selection.stationId, selection.cropCode, selection.plantingDate, selection.period].join('|'))
const canAnalyze = computed(() => Boolean(selection.stationId && selection.cropCode && selection.plantingDate) && !analyzing.value)
const chartLabels = computed(() => dashboard.value?.series.map(item => new Date(String(item.sampled_at)).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) || [])
const temperatureData = computed(() => [
  { label: 'Temperatura °C', data: dashboard.value?.series.map(item => item.temperature_c as number | null) || [] },
  { label: 'Humedad %', data: dashboard.value?.series.map(item => item.humidity_pct as number | null) || [] }
])
const rainData = computed(() => [
  { label: 'Lluvia mm', data: dashboard.value?.series.map(item => item.rain_mm as number | null) || [] },
  { label: 'Humedad suelo %', data: dashboard.value?.series.map(item => item.soil_moisture_pct as number | null) || [] }
])
const connectionLabel = computed(() => {
  const value = dashboard.value?.connection_status
  return value === 'online'
    ? 'Datos recientes'
    : value === 'delayed'
      ? 'Datos con retraso'
      : value === 'offline'
        ? 'Sin lectura reciente'
        : 'Sin datos'
})
const sourceSyncMessage = computed(() => {
  const sync = dashboard.value?.source_sync
  if (!sync?.requested) return ''
  if (sync.status === 'COMPLETED') {
    if (sync.created || sync.updated) return `FECOCLIMA actualizado: ${sync.received} lecturas recibidas, ${sync.created} nuevas y ${sync.updated} actualizadas.`
    return 'FECOCLIMA respondió, pero no entregó lecturas más recientes para la ventana consultada.'
  }
  if (sync.status === 'CURRENT') return 'La sincronización reciente se reutilizó para evitar llamadas repetidas al proveedor.'
  if (sync.status === 'IN_PROGRESS') return 'Otra sincronización de FECOCLIMA ya está en ejecución. Se muestran los datos almacenados.'
  if (sync.status === 'MISCONFIGURED') return 'La estación no puede actualizarse porque falta el GUID externo o la credencial FECOCLIMA.'
  if (sync.status === 'FAILED') return 'FECOCLIMA no respondió correctamente. El análisis continúa con la última información guardada.'
  return ''
})

function alertBadgeClass(color?: string, level?: string): string {
  const configured = String(color || '').toLowerCase()
  if (['red', 'rojo'].includes(configured)) return 'badge-danger'
  if (['yellow', 'amarillo', 'orange', 'naranja'].includes(configured)) return 'badge-warning'
  if (['green', 'verde'].includes(configured)) return 'badge-success'
  if (['gray', 'grey', 'gris', 'blue', 'azul'].includes(configured)) return 'badge-info'
  if (level === 'GRAVE') return 'badge-danger'
  if (level === 'MODERADA') return 'badge-warning'
  if (level === 'NINGUNA') return 'badge-success'
  return 'badge-info'
}

async function loadSelectors() {
  selectorsLoading.value = true
  try {
    const [stationRows, cropRows] = await Promise.all([
      request<Station[]>('/public/stations'),
      request<Crop[]>('/public/crops')
    ])
    stations.value = stationRows
    crops.value = cropRows
    if (!selection.stationId && stationRows[0]) selection.stationId = stationRows[0].id
    if (!cropRows.some(item => item.code === selection.cropCode) && cropRows[0]) selection.cropCode = cropRows[0].code
  } finally {
    selectorsLoading.value = false
  }
}

async function generateAgentCriterion(force = false) {
  const alertId = dashboard.value?.alert.evaluation_id
  if (!alertId || !dashboard.value) return
  agentLoading.value = true
  agentError.value = ''
  try {
    const result = await request<Recommendation>('/public/agent/analyze', {
      method: 'POST',
      body: { alert_id: alertId, period: selection.period, force }
    })
    dashboard.value.recommendation = result
  } catch (exception: any) {
    agentError.value = exception?.data?.detail || exception?.message || 'No se pudo ejecutar el agente del cultivo.'
  } finally {
    agentLoading.value = false
  }
}

async function generateSatelliteCriterion(force = false) {
  const alertId = dashboard.value?.alert.evaluation_id
  if (!alertId || !dashboard.value) return
  satelliteAgentLoading.value = true
  satelliteAgentError.value = ''
  try {
    const result = await request<Recommendation>('/public/agent/satellite', {
      method: 'POST',
      body: { alert_id: alertId, period: selection.period, force }
    })
    dashboard.value.satellite_recommendation = result
  } catch (exception: any) {
    satelliteAgentError.value = exception?.data?.detail || exception?.message || 'No se pudo ejecutar el agente satelital.'
  } finally {
    satelliteAgentLoading.value = false
  }
}

async function analyze() {
  if (!canAnalyze.value) return
  analyzing.value = true
  error.value = ''
  agentError.value = ''
  satelliteAgentError.value = ''
  satelliteError.value = ''
  try {
    const result = await request<DashboardResponse>('/public/dashboard', {
      query: {
        station_id: selection.stationId,
        crop_code: selection.cropCode,
        planting_date: selection.plantingDate,
        period: selection.period,
        refresh_source: true
      }
    })
    dashboard.value = result
    analyzedSignature.value = selectionSignature.value
    analysisDirty.value = false
    void generateAgentCriterion(false)
    void generateSatelliteCriterion(false)
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No se pudo completar el análisis.'
  } finally {
    analyzing.value = false
  }
}

async function refreshSatellite() {
  if (!dashboard.value || analysisDirty.value || satelliteRefreshing.value) return
  satelliteRefreshing.value = true
  satelliteError.value = ''
  try {
    const result = await request<{
      satellite: DashboardResponse['satellite']
      satellite_status: DashboardResponse['satellite_status']
    }>('/public/satellite/refresh', {
      method: 'POST',
      body: {
        station_id: dashboard.value.station.id,
        crop_code: dashboard.value.crop.code,
        force: false
      }
    })
    dashboard.value.satellite = result.satellite
    dashboard.value.satellite_status = result.satellite_status
    // The criterion cache includes the satellite context. Force a new
    // explanation so the agent immediately uses the refreshed geozone.
    await Promise.all([
      generateAgentCriterion(true),
      generateSatelliteCriterion(true)
    ])
  } catch (exception: any) {
    satelliteError.value = exception?.data?.detail || exception?.message || 'No se pudo actualizar Copernicus.'
  } finally {
    satelliteRefreshing.value = false
  }
}

watch(selectionSignature, signature => {
  if (dashboard.value && signature !== analyzedSignature.value) analysisDirty.value = true
})

onMounted(async () => {
  try {
    await loadSelectors()
  } catch (exception: any) {
    error.value = exception?.data?.detail || 'No se pudo conectar con el API.'
  }
})
</script>

<template>
  <div class="page">
    <div class="container">
      <header class="dashboard-head">
        <div>
          <h1 class="page-title">Clima, fenología y criterio IA por cultivo</h1>
          <p class="page-subtitle">Configure la consulta y ejecute el análisis cuando lo necesite. Nada se recalcula automáticamente al cambiar un selector.</p>
        </div>
      </header>

      <section class="selector-panel card">
        <div class="card-body selector-grid">
          <GlobalStationSelector v-model="selection.stationId" :stations="stations" :loading="selectorsLoading" />
          <GlobalCropSelector v-model="selection.cropCode" :crops="crops" />
          <label><span class="label">Fecha de siembra</span><input v-model="selection.plantingDate" class="input" type="date" :max="today" required></label>
          <label><span class="label">Periodo de gráficos</span><select v-model="selection.period" class="select"><option value="24h">24 horas</option><option value="72h">72 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select></label>
          <button class="analyze-btn" :disabled="!canAnalyze" @click="analyze"><Sparkles /><span>{{ analyzing ? 'Procesando datos y reglas…' : 'Analizar con IA' }}</span><small>Clima · reglas · fenología · pronóstico · satélite</small></button>
        </div>
      </section>

      <div v-if="analysisDirty" class="notice notice-warning stale-notice"><b>Los filtros cambiaron.</b><span>El tablero visible corresponde a la consulta anterior. Pulse “Analizar con IA” para actualizarlo.</span></div>
      <ErrorState v-if="error" :message="error" @retry="analyze" />
      <LoadingState v-else-if="analyzing && !dashboard" />

      <template v-if="dashboard">
        <section class="station-bar">
          <div><RadioTower /><div><b>{{ dashboard.station.name }}</b><span>{{ [dashboard.station.locality, dashboard.station.department].filter(Boolean).join(', ') || 'Ubicación no registrada' }}</span></div></div>
          <div class="station-status"><span class="badge" :class="dashboard.connection_status === 'online' ? 'badge-success' : dashboard.connection_status === 'delayed' ? 'badge-warning' : 'badge-danger'">{{ connectionLabel }}</span><span><Clock3 /> {{ dashboard.latest_reading_at ? new Date(dashboard.latest_reading_at).toLocaleString('es-PY') : 'Sin lectura' }}</span></div>
        </section>

        <div v-if="sourceSyncMessage" class="notice source-sync" :class="dashboard.source_sync?.status === 'FAILED' || dashboard.source_sync?.status === 'MISCONFIGURED' ? 'notice-warning' : ''">
          <b>Fuente meteorológica:</b>
          <span>{{ sourceSyncMessage }}</span>
          <small v-if="dashboard.source_sync?.error">{{ dashboard.source_sync.error }}</small>
        </div>

        <section class="grid metrics-grid"><WeatherMetricCard v-for="metric in dashboard.metrics" :key="metric.key" :metric="metric" /></section>
        <section class="grid grid-3 major-grid"><AlertStatusCard :alert="dashboard.alert" /><PhenologyStatusCard :data="dashboard.phenology" :crop-name="dashboard.crop.name" /><DataQualityCard :quality="dashboard.data_quality" /></section>

        <section class="section-block">
          <AgentInsightCard :crop-name="dashboard.crop.name" :recommendation="dashboard.recommendation" :loading="agentLoading" :error="agentError" @refresh="generateAgentCriterion(true)" />
        </section>

        <section class="section-block">
          <h2 class="section-title">Enfermedades favorecidas por datos observados</h2>
          <div v-if="dashboard.alert.diseases.length" class="grid grid-3"><DiseaseRiskCard v-for="disease in dashboard.alert.diseases" :key="disease.name" :disease="disease" /></div>
          <div v-else class="card"><EmptyState title="Sin coincidencias publicadas" message="No se detectaron reglas de enfermedad publicadas para la etapa y los datos observados disponibles." /></div>
        </section>

        <section class="grid grid-2 section-block">
          <ChartContainer title="Temperatura y humedad" subtitle="Serie observada en la estación"><WeatherLineChart :labels="chartLabels" :datasets="temperatureData" /></ChartContainer>
          <ChartContainer title="Lluvia y suelo" subtitle="Los vacíos se conservan sin inventar valores"><WeatherLineChart :labels="chartLabels" :datasets="rainData" /></ChartContainer>
        </section>

        <section class="section-block">
          <YearComparisonCard :data="dashboard.year_comparison" />
        </section>

        <section id="pronostico" class="section-block">
          <h2 class="section-title">Pronóstico meteorológico</h2>
          <div v-if="dashboard.forecast.length" class="forecast-grid">
            <article v-for="day in dashboard.forecast" :key="String(day.date)" class="card forecast"><b>{{ new Date(String(day.date) + 'T12:00:00').toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short' }) }}</b><span>{{ day.temperature_max_c ?? '—' }}° / {{ day.temperature_min_c ?? '—' }}°</span><small>Lluvia {{ day.precipitation_mm ?? 0 }} mm · {{ day.precipitation_probability_pct ?? 0 }}%</small><small>HR {{ day.humidity_pct ?? '—' }}% · Suelo {{ day.soil_temperature_avg_c ?? '—' }}°C</small><small>Humedad suelo {{ day.estimated_soil_moisture_pct ?? '—' }}% · Mojado estimado {{ day.leaf_wetness_hours ?? '—' }} h</small></article>
          </div>
          <div v-else class="card"><EmptyState title="Pronóstico no disponible" :message="dashboard.forecast_status?.error || (dashboard.forecast_status?.configured ? 'Open-Meteo no devolvió datos para la ubicación.' : 'La estación necesita latitud y longitud para consultar Open-Meteo.')" /></div>
          <p v-if="dashboard.forecast.length" class="forecast-note">El suelo proviene del modelo meteorológico. El mojado foliar futuro es una aproximación; no reemplaza el sensor de hoja.</p>
        </section>

        <section class="section-block">
          <h2 class="section-title">Riesgo potencial según el pronóstico</h2>
          <p class="section-help">La clasificación usa los mismos niveles configurados en la versión publicada de /admin/reglas. Es una proyección, no una alerta observada.</p>
          <div v-if="dashboard.forecast_risk?.days?.length" class="card forecast-risk-table"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Etapa estimada</th><th>Condiciones favorables</th><th>Cobertura</th><th>Nivel potencial</th></tr></thead><tbody><tr v-for="day in dashboard.forecast_risk.days" :key="day.date"><td>{{ new Date(`${day.date}T12:00:00`).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short' }) }}</td><td>{{ day.stage_code || '—' }} · {{ day.stage_name || 'Sin calendario' }}</td><td>{{ day.conditions_met }} de {{ day.conditions_total }}</td><td>{{ day.coverage_pct }}%</td><td><span class="badge" :class="alertBadgeClass(day.potential_color, day.potential_level)">{{ day.potential_label || day.potential_level }}</span></td></tr></tbody></table></div></div>
          <div v-else class="card"><EmptyState title="Sin pronóstico evaluable" :message="dashboard.forecast_risk?.methodology || 'No hay pronóstico o reglas publicadas para este cultivo.'" /></div>
        </section>

        <section class="section-block">
          <h2 class="section-title">Enfermedades con condiciones pronosticadas completas</h2>
          <p class="section-help">Cada enfermedad se valida con sus parámetros publicados en /admin/reglas. No constituye diagnóstico.</p>
          <div v-if="dashboard.forecast_risk?.diseases?.length" class="grid grid-3"><ForecastDiseaseCard v-for="disease in dashboard.forecast_risk.diseases" :key="disease.name" :disease="disease" /></div>
          <div v-else class="card"><EmptyState title="Sin coincidencias completas" :message="dashboard.forecast_risk?.methodology || 'No hay reglas completamente evaluables con las variables del pronóstico.'" /></div>
          <div v-if="dashboard.forecast_risk?.unresolved_diseases?.length" class="notice forecast-limitations"><b>Reglas no proyectadas por falta de variables:</b><span v-for="item in dashboard.forecast_risk.unresolved_diseases" :key="item.name">{{ item.name }} ({{ item.missing_variables.join(', ') }})</span></div>
        </section>

        <section class="section-block"><SatelliteStatusCard :data="dashboard.satellite" :status="dashboard.satellite_status" :recommendation="dashboard.satellite_recommendation" :refreshing="satelliteRefreshing" :agent-loading="satelliteAgentLoading" :error="satelliteError" :agent-error="satelliteAgentError" @refresh="refreshSatellite" @agent-refresh="generateSatelliteCriterion(true)" /></section>
        <section class="section-block"><CropAgentChat :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :crop-name="dashboard.crop.name" :disabled="analysisDirty" /></section>
        <p class="engine-note">Pandas y NumPy procesan datos; las reglas publicadas deciden el color; el agente interpreta, conversa y analiza imágenes solo cuando usted lo solicita.</p>
      </template>

      <div v-else-if="!selectorsLoading && !analyzing" class="card start-card"><EmptyState title="Configure la consulta" message="Seleccione estación, cultivo, fecha de siembra y periodo; después pulse “Analizar con IA”." /></div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.selector-panel{margin-bottom:20px}.selector-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;align-items:end}.analyze-btn{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:center;text-align:left;padding:15px 18px;border:0;border-radius:14px;color:#fff;background:linear-gradient(110deg,var(--fc-primary),var(--fc-secondary));box-shadow:0 12px 28px rgba(0,68,129,.22);font-weight:900}.analyze-btn svg{grid-row:1/3;width:28px;height:28px}.analyze-btn span{font-size:1.05rem}.analyze-btn small{font-weight:500;opacity:.82}.analyze-btn:disabled{opacity:.55;cursor:not-allowed}.stale-notice{display:flex;gap:8px;margin-bottom:18px}.station-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px;padding:14px 18px;color:#fff;background:var(--fc-primary);border-radius:var(--fc-radius)}.station-bar>div{display:flex;align-items:center;gap:11px}.station-bar svg{width:25px}.station-bar b,.station-bar span{display:block}.station-bar span{font-size:.82rem;color:#d7edf9}.station-status span{display:inline-flex;align-items:center;gap:6px}.station-status .badge{color:inherit}.station-status svg{width:16px}.source-sync{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:18px}.source-sync small{width:100%;color:var(--fc-text-muted);overflow-wrap:anywhere}.major-grid,.section-block{margin-top:22px}.major-grid{align-items:stretch}.forecast-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:13px}.forecast{padding:16px;box-shadow:none;display:flex;flex-direction:column;gap:6px}.forecast b{color:var(--fc-primary);text-transform:capitalize}.forecast-note{color:var(--fc-text-muted);font-size:.82rem;margin:12px 2px 0}.forecast span{font-size:1.15rem;font-weight:900}.forecast small,.section-help{color:var(--fc-text-muted)}.forecast-risk-table{box-shadow:none}.forecast-limitations{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px 14px}.forecast-limitations b{width:100%}.forecast-limitations span{font-size:.84rem}.engine-note{margin-top:22px;text-align:center;color:var(--fc-text-muted);font-size:.82rem}.start-card{margin-top:20px;padding:30px}@media(max-width:1180px){.major-grid{grid-template-columns:1fr 1fr}.major-grid>*:first-child{grid-column:1/-1}}@media(max-width:1050px){.selector-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dashboard-head,.station-bar{align-items:flex-start;flex-direction:column}.selector-grid,.major-grid{grid-template-columns:1fr}.major-grid>*:first-child{grid-column:auto}.station-status{align-items:flex-start!important;flex-direction:column}}
</style>
