<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const stations = ref<Record<string, any>[]>([])
const selectedStationId = ref('')
const stationsLoading = ref(true)
const stationsError = ref('')
const refreshingScene = ref(false)
const sceneMessage = ref('')
const sceneDetails = ref<Record<string, any> | null>(null)

const selectedStation = computed(() => stations.value.find(item => item.id === selectedStationId.value) || null)
const selectedGeometry = computed(() => {
  const station = selectedStation.value
  if (!station) return { ready: false, source: 'NONE', label: 'Seleccione una estación', detail: 'La prueba satelital debe ejecutarse sobre una estación concreta.' }
  const raw = station.influence_geojson
  const geometry = raw?.type === 'Feature' ? raw.geometry : raw
  if (geometry && ['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    return { ready: true, source: 'POLYGON', label: 'Polígono configurado', detail: 'Copernicus usará exactamente la zona dibujada en la estación.' }
  }
  if (station.latitude !== null && station.latitude !== undefined && station.longitude !== null && station.longitude !== undefined) {
    return { ready: true, source: 'POINT_RADIUS', label: 'Coordenadas + radio', detail: `Se usará un área aproximada de ${station.influence_radius_m || 750} m alrededor de la estación.` }
  }
  return { ready: false, source: 'NONE', label: 'Geozona incompleta', detail: 'Vaya a Estaciones y dibuje un polígono o registre latitud y longitud.' }
})

async function loadStations() {
  stationsLoading.value = true
  stationsError.value = ''
  try {
    const data: any = await request('/stations', { query: { limit: 250 } })
    stations.value = (data.items || []).filter((item: any) => item.active !== false)
    if (!stations.value.some(item => item.id === selectedStationId.value)) {
      selectedStationId.value = stations.value[0]?.id || ''
    }
  } catch (error: any) {
    stationsError.value = error?.data?.detail || error?.message || 'No fue posible cargar las estaciones.'
  } finally {
    stationsLoading.value = false
  }
}

async function refreshSatelliteScene() {
  if (!selectedStationId.value || !selectedGeometry.value.ready) return
  refreshingScene.value = true
  sceneMessage.value = ''
  sceneDetails.value = null
  try {
    const result: any = await request(`/satellite/stations/${selectedStationId.value}/sync`, {
      method: 'POST',
      query: { force: true }
    })
    sceneDetails.value = result
    sceneMessage.value = result.status === 'PROCESSED'
      ? 'La escena y los índices fueron procesados y guardados.'
      : `La actualización terminó con estado ${result.status || 'desconocido'}. Revise el detalle.`
  } catch (error: any) {
    sceneMessage.value = error?.data?.detail || error?.message || 'No fue posible procesar la escena satelital.'
    sceneDetails.value = error?.data || null
  } finally {
    refreshingScene.value = false
  }
}

onMounted(loadStations)

const fields = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'integration_type', label: 'Tipo', type: 'select', required: true, options: [
    { label: 'Estación meteorológica', value: 'WEATHER' },
    { label: 'Pronóstico', value: 'FORECAST' },
    { label: 'Satélite', value: 'SATELLITE' },
    { label: 'Inteligencia artificial', value: 'AI' },
    { label: 'Correo SMTP', value: 'SMTP' },
    { label: 'Avisos a productores', value: 'NOTIFICATION' }
  ] },
  { key: 'provider', label: 'Proveedor', type: 'select', required: true, options: [
    { label: 'FECOCLIMA', value: 'FECOCLIMA' },
    { label: 'Open-Meteo', value: 'OPEN_METEO' },
    { label: 'Copernicus Data Space', value: 'COPERNICUS_DATA_SPACE' },
    { label: 'API compatible con OpenAI', value: 'OPENAI_COMPATIBLE' },
    { label: 'SMTP', value: 'SMTP' },
    { label: 'Correo + Telegram', value: 'EMAIL_TELEGRAM_DIGEST' }
  ] },
  { key: 'base_url', label: 'URL base', hint: 'Para Copernicus puede dejarla vacía y usar las URLs específicas del JSON.' },
  { key: 'timeout_seconds', label: 'Timeout (s)', type: 'number', numericMode: 'integer', step: 1, min: 1, max: 600, hint: 'Número entero entre 1 y 600 segundos.' },
  { key: 'retry_count', label: 'Reintentos', type: 'number', numericMode: 'integer', step: 1, min: 0, max: 10, hint: 'Número entero entre 0 y 10.' },
  { key: 'sync_frequency_minutes', label: 'Frecuencia (min)', type: 'number', numericMode: 'integer', step: 1, min: 1, hint: 'Déjelo vacío si no debe ejecutarse automáticamente.' },
  {
    key: 'non_sensitive_config',
    label: 'Parámetros JSON',
    type: 'textarea',
    json: true,
    placeholder: '{\n  "client_id": "su-client-id",\n  "token_url": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",\n  "stac_search_url": "https://stac.dataspace.copernicus.eu/v1/search",\n  "process_url": "https://sh.dataspace.copernicus.eu/process/v1",\n  "statistics_url": "https://sh.dataspace.copernicus.eu/statistics/v1",\n  "collection": "sentinel-2-l2a"\n}',
    hint: 'Copernicus usa client_id aquí y client_secret en el campo cifrado siguiente.'
  },
  {
    key: 'secret_value',
    label: 'Client secret / credencial cifrada',
    type: 'password',
    hint: 'En Copernicus ingrese el client_secret. Al editar, déjelo vacío para conservar el secreto existente.'
  },
  { key: 'active', label: 'Activa', type: 'checkbox' }
] as const
</script>

<template>
  <section>
    <div class="card station-test-card">
      <div class="card-body">
        <div class="station-test-head">
          <div>
            <h2>Prueba satelital por estación</h2>
            <p>Seleccione la estación que desea validar. La prueba leerá directamente el polígono guardado en <b>Admin → Estaciones</b>; no utilizará parcelas antiguas como fuente de la geometría.</p>
          </div>
          <div class="station-actions">
            <button class="btn btn-light" type="button" :disabled="stationsLoading" @click="loadStations">Actualizar estaciones</button>
            <button class="btn btn-primary" type="button" :disabled="refreshingScene || !selectedGeometry.ready" @click="refreshSatelliteScene">
              {{ refreshingScene ? 'Procesando…' : 'Procesar imagen e índices' }}
            </button>
          </div>
        </div>
        <div v-if="stationsError" class="notice test-danger">{{ stationsError }}</div>
        <div class="station-test-grid">
          <label>
            <span class="label">Estación para la prueba</span>
            <select v-model="selectedStationId" class="select" :disabled="stationsLoading">
              <option value="">Seleccione una estación</option>
              <option v-for="station in stations" :key="station.id" :value="station.id">
                {{ station.name }} · {{ station.code }}
              </option>
            </select>
          </label>
          <div class="geometry-state" :class="selectedGeometry.ready ? 'is-ready' : 'is-error'">
            <b>{{ selectedGeometry.label }}</b>
            <span>{{ selectedGeometry.detail }}</span>
            <small v-if="selectedStation">Latitud {{ selectedStation.latitude ?? '—' }} · Longitud {{ selectedStation.longitude ?? '—' }}</small>
          </div>
        </div>
        <p class="station-test-help">Después de cambiar un polígono, la integración quedará como <b>RETEST_REQUIRED</b>. Pulse el matraz de Sentinel-2 para validar credenciales y fases. Luego use <b>Procesar imagen e índices</b> para guardar la escena que alimenta el widget público.</p>
        <div v-if="sceneMessage" class="notice scene-result">
          <b>{{ sceneMessage }}</b>
          <pre v-if="sceneDetails" class="scene-json">{{ JSON.stringify(sceneDetails, null, 2) }}</pre>
        </div>
      </div>
    </div>

    <AdminCrudPage
      title="Integraciones"
      description="Configure y pruebe FECOCLIMA, Open-Meteo, Copernicus, IA y correo. La prueba de Sentinel-2 se ejecuta para la estación seleccionada arriba."
      endpoint="/integrations"
      :fields="fields as any"
      :allow-test="true"
      :test-query="selectedStationId ? { station_id: selectedStationId } : {}"
      :columns="[
        { key: 'name', label: 'Nombre' },
        { key: 'integration_type', label: 'Tipo' },
        { key: 'provider', label: 'Proveedor' },
        { key: 'active', label: 'Activa' },
        { key: 'last_run_at', label: 'Última ejecución' },
        { key: 'last_result', label: 'Resultado' },
        { key: 'last_detail', label: 'Detalle de la última prueba' }
      ]"
    />
  </section>
</template>

<style scoped>
.station-test-card{margin-bottom:18px}.station-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.station-test-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.station-test-head h2{margin:0 0 6px}.station-test-head p{margin:0;color:var(--fc-text-muted);max-width:850px}.station-test-grid{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;margin-top:18px;align-items:end}.geometry-state{display:flex;flex-direction:column;gap:4px;padding:13px 15px;border:1px solid;border-radius:10px}.geometry-state.is-ready{background:#edf9f2;border-color:#9fd5b7}.geometry-state.is-error{background:#fff0f0;border-color:#efb0b0}.geometry-state span,.geometry-state small{color:var(--fc-text-muted)}.station-test-help{margin:14px 0 0;color:var(--fc-text-muted)}.scene-result{margin-top:14px}.scene-result b{display:block}.scene-json{max-height:300px;overflow:auto;margin:10px 0 0;padding:10px;border-radius:8px;background:rgba(255,255,255,.72);white-space:pre-wrap;font-size:.76rem;line-height:1.45}.test-danger{background:#fff0f0;border-color:#efb0b0;margin-top:12px}@media(max-width:760px){.station-test-head{flex-direction:column}.station-test-grid{grid-template-columns:1fr}}
</style>
