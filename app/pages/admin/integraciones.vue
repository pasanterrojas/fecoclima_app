<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const stations = ref<any[]>([])
const selectedStationId = ref('')

async function loadStations() {
  try {
    const result: any = await request('/stations', { query: { limit: 250 } })
    stations.value = (result.items || []).filter((item: any) => item.active !== false)
    if (!selectedStationId.value && stations.value.length) {
      selectedStationId.value = stations.value.find((item: any) => item.code === 'RAUL-PENA')?.id || stations.value[0].id
    }
  } catch {
    stations.value = []
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
    placeholder: '{\n  "client_id": "su-client-id",\n  "token_url": "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",\n  "stac_search_url": "https://stac.dataspace.copernicus.eu/v1/search",\n  "process_url": "https://sh.dataspace.copernicus.eu/process/v1",\n  "statistics_url": "https://sh.dataspace.copernicus.eu/statistics/v1",\n  "collection": "sentinel-2-l2a",\n  "analysis_max_age_days": 20,\n  "analysis_max_reliable_cloud_percentage": 30,\n  "ndvi_low_threshold": 0.25,\n  "ndvi_active_threshold": 0.55,\n  "ndmi_dry_threshold": 0.0,\n  "ndmi_moist_threshold": 0.2,\n  "ndwi_water_threshold": 0.1,\n  "ndvi_decline_delta": -0.08,\n  "ndmi_decline_delta": -0.05\n}',
    hint: 'Copernicus usa client_id aquí y client_secret en el campo cifrado siguiente. El backend permite sobrescribir token, STAC, Process y Statistics sin cambiar código.'
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
    <div class="station-test-card">
      <label>
        <span class="label">Estación utilizada en la prueba</span>
        <select v-model="selectedStationId" class="select">
          <option value="">Selección automática</option>
          <option v-for="station in stations" :key="station.id" :value="station.id">
            {{ station.name }}
          </option>
        </select>
        <small>Sentinel-2 y Open-Meteo probarán exactamente la estación seleccionada. Así el resultado no se mezcla con parcelas o estaciones heredadas.</small>
      </label>
    </div>
    <div class="notice integration-guide">
      <b>¿Qué significa FAILED en Sentinel-2?</b>
      <span>Es el resultado de la última prueba manual o ejecución registrada. La columna “Detalle” muestra ahora la fase exacta que falló: catálogo STAC, OAuth, generación RGB o estadísticas espectrales.</span>
    </div>
    <AdminCrudPage
      title="Integraciones"
      description="Configure y pruebe FECOCLIMA, Open-Meteo, Copernicus, IA y correo. Las credenciales de Copernicus pueden administrarse cifradas desde este panel o mantenerse en el .env como respaldo."
      endpoint="/integrations"
      :fields="fields as any"
      :allow-test="true"
      :test-query="() => selectedStationId ? { station_id: selectedStationId } : {}"
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

<style scoped>.station-test-card{margin-bottom:14px;padding:14px;border:1px solid var(--fc-border);border-radius:12px;background:var(--fc-surface-muted)}.station-test-card label{display:flex;flex-direction:column;gap:6px;max-width:520px}.station-test-card small{color:var(--fc-text-muted)}.integration-guide{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}</style>
