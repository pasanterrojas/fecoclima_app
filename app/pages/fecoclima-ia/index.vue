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
// Vista simple (productor) o técnica: el mismo análisis con
// lenguaje llano o con el detalle completo de cada widget.
const simpleView = ref(true)

const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const selectionSignature = computed(() => [selection.stationId, selection.cropCode, selection.plantingDate, selection.period].join('|'))
const validPlantingDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(selection.plantingDate) && selection.plantingDate <= today)
const canAnalyze = computed(() => Boolean(selection.stationId && selection.cropCode && validPlantingDate.value) && !analyzing.value)
const chartLabels = computed(() => dashboard.value?.series.map(item => new Date(String(item.sampled_at)).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) || [])
const temperatureData = computed(() => [
  {
    label: 'Temperatura °C',
    unit: '°C',
    data: dashboard.value?.series.map(
      item => item.temperature_c as number | null
    ) || [],
    borderColor: '#E67E22', // Naranja
    backgroundColor: 'rgba(230, 126, 34, 0.12)'
  },
  {
    label: 'Humedad %',
    axis: 'right' as const,
    unit: '%',
    data: dashboard.value?.series.map(
      item => item.humidity_pct as number | null
    ) || [],
    borderColor: '#26834A', // Verde
    backgroundColor: 'rgba(38, 131, 74, 0.12)'
  }
])
const soilMoistureUnit = computed(() => dashboard.value?.metrics.find(item => item.key === 'soil_moisture')?.unit || '')
const rainData = computed(() => [
  { label: 'Lluvia mm', unit: 'mm', data: dashboard.value?.series.map(item => item.rain_mm as number | null) || [] },
  { label: `Humedad del suelo ${soilMoistureUnit.value}`.trim(), unit: soilMoistureUnit.value, axis: 'right' as const, data: dashboard.value?.series.map(item => item.soil_moisture_pct as number | null) || [] }
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
  const provider = sync.provider || 'La fuente de datos'
  if (!sync.supported) return 'Esta estación utiliza datos cargados por su equipo. No necesita conexión a FECOCLIMA; consulte la fecha de la última lectura.'
  if (sync.status === 'COMPLETED') {
    if (sync.received || sync.created || sync.updated) {
      const syncDates = sync.sync_from && sync.sync_to
        ? ` entre ${formatShortDate(sync.sync_from)} y ${formatShortDate(sync.sync_to)}`
        : ''
      const analysisCount = Number(sync.analysis_readings || 0)
      const analysisWindow = sync.analysis_from && sync.analysis_to
        ? ` entre ${formatShortDateTime(sync.analysis_from)} y ${formatShortDateTime(sync.analysis_to)}`
        : ' dentro de su ventana horaria exacta'
      const analysisDetail = sync.analysis_period
        ? ` El análisis de ${periodLabel(sync.analysis_period)} usó ${analysisCount} lecturas${analysisWindow}.`
        : ''
      return `${provider} entregó ${sync.received} lecturas únicas${syncDates}`
    }
    return `${provider} respondió, pero no entregó lecturas más recientes para la ventana consultada.`
  }
  if (sync.status === 'CURRENT') {
    const analysisWindow = sync.analysis_from && sync.analysis_to
      ? ` entre ${formatShortDateTime(sync.analysis_from)} y ${formatShortDateTime(sync.analysis_to)}`
      : ' dentro de su ventana horaria exacta'
    const analysisDetail = sync.analysis_period
      ? ` El análisis de ${periodLabel(sync.analysis_period)} usó ${Number(sync.analysis_readings || 0)} lecturas${analysisWindow}.`
      : ''
    return `La sincronización reciente se reutilizó para evitar llamadas repetidas al proveedor.${analysisDetail}`
  }
  if (sync.status === 'IN_PROGRESS') return 'La estación se está actualizando. Por ahora mostramos las lecturas guardadas.'
  if (sync.status === 'MISCONFIGURED') return 'La estación no puede actualizarse porque falta el GUID externo o la credencial FECOCLIMA.'
  if (sync.status === 'FAILED') return `${provider} no respondió. Puede seguir consultando las últimas lecturas guardadas.`
  return ''
})

function periodLabel(period?: string | null): string {
  return ({ '24h': '24 horas', '72h': '72 horas', '7d': '7 días', '30d': '30 días' } as Record<string, string>)[String(period || '')] || String(period || '')
}

function formatShortDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
}

function formatShortDateTime(value: string): string {
  return new Date(value).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

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
    if (!stationRows.some(item => item.id === selection.stationId)) selection.stationId = stationRows[0]?.id || ''
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
    if (dashboard.value?.alert.evaluation_id === alertId && !analysisDirty.value) dashboard.value.recommendation = result
  } catch (exception: any) {
    agentError.value = exception?.data?.detail || exception?.message || 'No se pudo ejecutar el agente del cultivo.'
  } finally {
    agentLoading.value = false
  }
}

async function generateSatelliteCriterion(force = false) {
  const alertId = dashboard.value?.alert.evaluation_id
  if (!alertId || !dashboard.value?.satellite) return
  satelliteAgentLoading.value = true
  satelliteAgentError.value = ''
  try {
    const result = await request<Recommendation>('/public/agent/satellite', {
      method: 'POST',
      body: { alert_id: alertId, period: selection.period, force }
    })
    if (dashboard.value?.alert.evaluation_id === alertId && !analysisDirty.value) dashboard.value.satellite_recommendation = result
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
  // Al volver al tablero, pedir la fecha de esta consulta en vez de reutilizar
  // un valor que Pinia pueda haber conservado (por ejemplo, con HMR).
  selection.plantingDate = ''
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
          <h1 class="page-title">Conozca cómo está su cultivo</h1>
          <p class="page-subtitle">Elija su estación y cultivo, indique cuándo sembró y descubra qué conviene revisar en su parcela. Los datos siguen disponibles aunque la IA no responda.</p>
        </div>
        <div class="view-toggle" role="group" aria-label="Modo de vista">
          <button type="button" :aria-pressed="simpleView" :class="{ active: simpleView }" @click="simpleView = true">Vista simple</button>
          <button type="button" :aria-pressed="!simpleView" :class="{ active: !simpleView }" @click="simpleView = false">Vista técnica</button>
        </div>
      </header>

      <section class="selector-panel card">
        <div class="card-body selector-grid">
          <GlobalStationSelector v-model="selection.stationId" :stations="stations" :loading="selectorsLoading" />
          <GlobalCropSelector v-model="selection.cropCode" :crops="crops" />
          <label><span class="label">¿Cuándo sembró?</span><input v-model="selection.plantingDate" class="input" type="date" autocomplete="off" :max="today" required aria-describedby="planting-help"><small id="planting-help">Así podremos estimar la etapa de su cultivo.</small></label>
          <label><span class="label">Días que quiere consultar</span><InfoHint text="Elija cuántos días de lecturas desea revisar. Esto no cambia su fecha de siembra." /><select v-model="selection.period" class="select"><option value="24h">24 horas</option><option value="72h">72 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select></label>
          <button class="analyze-btn" :disabled="!canAnalyze" @click="analyze"><Sparkles /><span>{{ analyzing ? 'Preparando su análisis…' : 'Ver cómo está mi cultivo' }}</span><small>Le mostramos las lecturas y alertas; la IA intenta aportar consejos adicionales.</small></button>
        </div>
      </section>

      <div v-if="analysisDirty" class="notice notice-warning stale-notice"><b>Cambió su consulta.</b><span>Lo que ve abajo corresponde a los datos anteriores. Pulse “Ver cómo está mi cultivo” para actualizar.</span></div>
      <ErrorState v-if="error" :message="error" @retry="analyze" />
      <LoadingState v-else-if="analyzing && !dashboard" />

      <template v-if="dashboard">
        <section class="station-bar">
          <div><RadioTower /><div><b>{{ dashboard.station.name }}</b><span>{{ [dashboard.station.locality, dashboard.station.department].filter(Boolean).join(', ') || 'Ubicación no registrada' }}</span></div></div>
          <div class="station-status"><span class="badge" :class="dashboard.connection_status === 'online' ? 'badge-success' : dashboard.connection_status === 'delayed' ? 'badge-warning' : 'badge-danger'">{{ connectionLabel }}</span><span><Clock3 /> {{ dashboard.latest_reading_at ? new Date(dashboard.latest_reading_at).toLocaleString('es-PY') : 'Sin lectura' }}</span></div>
        </section>

        <div v-if="sourceSyncMessage" class="notice source-sync" :class="dashboard.source_sync?.status === 'FAILED' || dashboard.source_sync?.status === 'MISCONFIGURED' ? 'notice-warning' : ''">
          <b>Datos de la estación:</b>
          <span>{{ sourceSyncMessage }}</span>
          <details v-if="dashboard.source_sync?.error"><summary>Detalle técnico (i)</summary><small>{{ dashboard.source_sync.error }}</small></details>
        </div>

        <section v-if="simpleView" class="section-block"><ProducerWeatherCard :dashboard="dashboard" :period="selection.period" :disabled="analysisDirty" /></section>
        <section v-else class="grid metrics-grid"><WeatherMetricCard v-for="metric in dashboard.metrics" :key="metric.key" :metric="metric" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /></section>
        <section v-if="simpleView" class="grid grid-2 major-grid"><ProducerAlertCard :alert="dashboard.alert" :period="selection.period" :disabled="analysisDirty" /><PhenologyStatusCard :data="dashboard.phenology" :crop-name="dashboard.crop.name" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /></section>
        <section v-else class="grid grid-3 major-grid"><AlertStatusCard :alert="dashboard.alert" :period="selection.period" :disabled="analysisDirty" /><PhenologyStatusCard :data="dashboard.phenology" :crop-name="dashboard.crop.name" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /><DataQualityCard :quality="dashboard.data_quality" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /></section>

        <section class="section-block">
          <AgentInsightCard :crop-name="dashboard.crop.name" :recommendation="dashboard.recommendation" :conditions="dashboard.alert.conditions" :period="selection.period" :loading="agentLoading" :error="agentError" @refresh="generateAgentCriterion(true)" />
        </section>

        <section class="section-block">
          <h2 class="section-title">Qué enfermedades conviene vigilar <InfoHint text="Son condiciones que pueden favorecer enfermedades, no un diagnóstico. Confirme siempre en el cultivo." /></h2>
          <div v-if="dashboard.alert.diseases.length" class="grid grid-3"><DiseaseRiskCard v-for="disease in dashboard.alert.diseases" :key="disease.name" :disease="disease" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /></div>
          <div v-else class="card"><EmptyState title="Sin coincidencias publicadas" message="No se detectaron reglas de enfermedad publicadas para la etapa y los datos observados disponibles." /></div>
        </section>

        <section class="grid grid-2 section-block">
          <ChartContainer title="Temperatura y humedad" subtitle="Cómo han cambiado las lecturas de la estación"><WeatherLineChart :labels="chartLabels" :datasets="temperatureData" /><WidgetExplanation :alert-id="dashboard.alert.evaluation_id" :period="selection.period" widget="chart" item-key="weather" :disabled="analysisDirty" /></ChartContainer>
          <ChartContainer title="Lluvia y suelo" subtitle="Las líneas muestran las lecturas disponibles de la estación"><WeatherLineChart :labels="chartLabels" :datasets="rainData" /><WidgetExplanation :alert-id="dashboard.alert.evaluation_id" :period="selection.period" widget="chart" item-key="rain_soil" :disabled="analysisDirty" /></ChartContainer>
        </section>

        <section class="section-block">
          <YearComparisonCard :data="dashboard.year_comparison" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" />
        </section>

        <section id="pronostico" class="section-block">
          <h2 class="section-title">Qué tiempo se espera <InfoHint text="Este pronóstico es una estimación para la ubicación de su estación; no es una medición." /></h2>
          <div v-if="dashboard.forecast.length" class="forecast-grid">
            <article v-for="day in dashboard.forecast" :key="String(day.date)" class="card forecast"><b>{{ new Date(String(day.date) + 'T12:00:00').toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short' }) }}</b><span>{{ day.temperature_max_c ?? '—' }}° / {{ day.temperature_min_c ?? '—' }}°</span><small>Lluvia esperada: {{ day.precipitation_mm ?? '—' }} mm · probabilidad: {{ day.precipitation_probability_pct ?? '—' }}%</small><details><summary>Más datos (i)</summary><small>Humedad del aire: {{ day.humidity_pct ?? '—' }}% · Temperatura del suelo: {{ day.soil_temperature_avg_c ?? '—' }}°C</small><small>Humedad estimada del suelo: {{ day.estimated_soil_moisture_pct ?? '—' }}% · Tiempo estimado de hojas mojadas: {{ day.leaf_wetness_hours ?? '—' }} h</small></details><WidgetExplanation :alert-id="dashboard.alert.evaluation_id" :period="selection.period" widget="forecast" :item-key="String(day.date)" :disabled="analysisDirty" /></article>
          </div>
          <div v-else class="card"><EmptyState title="Pronóstico no disponible" :message="dashboard.forecast_status?.error || (dashboard.forecast_status?.configured ? 'Open-Meteo no devolvió datos para la ubicación.' : 'La estación necesita latitud y longitud para consultar Open-Meteo.')" /></div>
          
        </section>

        <section class="section-block">
          <h2 class="section-title">Qué conviene vigilar en los próximos días <InfoHint text="Es una posibilidad calculada con el pronóstico, no una alerta confirmada por la estación." /></h2>
         
           <div v-if="dashboard.forecast_risk?.days?.length" class="card forecast-risk-table"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Etapa estimada</th><th>Señales favorables <InfoHint text="Cuántas condiciones del cultivo podrían coincidir ese día." /></th><th>Datos disponibles <InfoHint text="Porcentaje de condiciones que se pudieron evaluar con el pronóstico." /></th><th>Atención sugerida</th><th>Ayuda</th></tr></thead><tbody><tr v-for="day in dashboard.forecast_risk.days" :key="day.date"><td>{{ new Date(`${day.date}T12:00:00`).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short' }) }}</td><td>{{ day.stage_name || 'Sin calendario' }}</td><td>{{ day.conditions_met }} de {{ day.conditions_total }}</td><td>{{ day.coverage_pct }}%</td><td><span class="badge" :class="alertBadgeClass(day.potential_color, day.potential_level)">{{ day.potential_label || day.potential_level }}</span></td><td><WidgetExplanation :alert-id="dashboard.alert.evaluation_id" :period="selection.period" widget="forecast_risk" :item-key="day.date" :disabled="analysisDirty" /></td></tr></tbody></table></div></div>
          <div v-else class="card"><EmptyState title="Sin pronóstico evaluable" :message="dashboard.forecast_risk?.methodology || 'No hay pronóstico o reglas publicadas para este cultivo.'" /></div>
        </section>

        <section class="section-block">
          <h2 class="section-title">Enfermedades que podrían verse favorecidas <InfoHint text="El pronóstico señala condiciones, no confirma que el cultivo esté enfermo." /></h2>
          <div v-if="dashboard.forecast_risk?.diseases?.length" class="grid grid-3"><ForecastDiseaseCard v-for="disease in dashboard.forecast_risk.diseases" :key="disease.name" :disease="disease" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" /></div>
          <div v-else class="card"><EmptyState title="Sin coincidencias completas" :message="dashboard.forecast_risk?.methodology || 'No hay reglas completamente evaluables con las variables del pronóstico.'" /></div>
          <div v-if="dashboard.forecast_risk?.unresolved_diseases?.length" class="notice forecast-limitations"><b>Reglas no proyectadas por falta de variables:</b><span v-for="item in dashboard.forecast_risk.unresolved_diseases" :key="item.name">{{ item.name }} ({{ item.missing_variables.join(', ') }})</span></div>
        </section>

        <section v-if="simpleView" class="section-block"><ProducerSatelliteCard :data="dashboard.satellite" :status="dashboard.satellite_status" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" :refreshing="satelliteRefreshing" :error="satelliteError" @refresh="refreshSatellite" /></section>
        <section v-else class="section-block"><SatelliteStatusCard :data="dashboard.satellite" :status="dashboard.satellite_status" :recommendation="dashboard.satellite_recommendation" :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :disabled="analysisDirty" :refreshing="satelliteRefreshing" :agent-loading="satelliteAgentLoading" :error="satelliteError" :agent-error="satelliteAgentError" @refresh="refreshSatellite" @agent-refresh="generateSatelliteCriterion(true)" /></section>
        <section class="section-block"><CropAgentChat :alert-id="dashboard.alert.evaluation_id" :period="selection.period" :crop-name="dashboard.crop.name" :disabled="analysisDirty" /></section>
      </template>

      <div v-else-if="!selectorsLoading && !analyzing" class="card start-card"><EmptyState title="Empecemos por su parcela" message="Elija una estación y cultivo, indique cuándo sembró y pulse “Ver cómo está mi cultivo”." /></div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.view-toggle{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--fc-border);border-radius:12px;background:var(--fc-surface-muted);flex:0 0 auto}.view-toggle button{border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-size:.85rem;color:var(--fc-text-muted);background:transparent;cursor:pointer}.view-toggle button.active{color:#fff;background:var(--fc-primary)}.selector-panel{margin-bottom:20px}.selector-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;align-items:end}.analyze-btn{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:center;text-align:left;padding:15px 18px;border:0;border-radius:14px;color:#fff;background:linear-gradient(110deg,var(--fc-primary),var(--fc-secondary));box-shadow:0 12px 28px rgba(0,68,129,.22);font-weight:900}.analyze-btn svg{grid-row:1/3;width:28px;height:28px}.analyze-btn span{font-size:1.05rem}.analyze-btn small{font-weight:500;opacity:.82}.analyze-btn:disabled{opacity:.55;cursor:not-allowed}.stale-notice{display:flex;gap:8px;margin-bottom:18px}.station-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px;padding:14px 18px;color:#fff;background:var(--fc-primary);border-radius:var(--fc-radius)}.station-bar>div{display:flex;align-items:center;gap:11px}.station-bar svg{width:25px}.station-bar b,.station-bar span{display:block}.station-bar span{font-size:.82rem;color:#d7edf9}.station-status span{display:inline-flex;align-items:center;gap:6px}.station-status .badge{color:inherit}.station-status svg{width:16px}.source-sync{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:18px}.source-sync small{width:100%;color:var(--fc-text-muted);overflow-wrap:anywhere}.major-grid,.section-block{margin-top:22px}.major-grid{align-items:stretch}.forecast-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:13px}.forecast{padding:16px;box-shadow:none;display:flex;flex-direction:column;gap:6px}.forecast b{color:var(--fc-primary);text-transform:capitalize}.forecast-note{color:var(--fc-text-muted);font-size:.82rem;margin:12px 2px 0}.forecast span{font-size:1.15rem;font-weight:900}.forecast small,.section-help{color:var(--fc-text-muted)}.forecast-risk-table{box-shadow:none}.forecast-limitations{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px 14px}.forecast-limitations b{width:100%}.forecast-limitations span{font-size:.84rem}.engine-note{margin-top:22px;text-align:center;color:var(--fc-text-muted);font-size:.82rem}.start-card{margin-top:20px;padding:30px}@media(max-width:1180px){.major-grid{grid-template-columns:1fr 1fr}.major-grid>*:first-child{grid-column:1/-1}}@media(max-width:1050px){.selector-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dashboard-head,.station-bar{align-items:flex-start;flex-direction:column}.selector-grid,.major-grid{grid-template-columns:1fr}.major-grid>*:first-child{grid-column:auto}.station-status{align-items:flex-start!important;flex-direction:column}}
</style>
