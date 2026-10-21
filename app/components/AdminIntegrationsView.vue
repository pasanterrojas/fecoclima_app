<script setup lang="ts">
const props = defineProps<{ detailId?: string }>()
const { request } = useApi()
const stations = ref<any[]>([])
const selectedStationId = ref('')

async function loadStations() {
  try {
    const result: any = await request('/stations', { query: { limit: 250 } })
    stations.value = (result.items || []).filter((item: any) => item.active !== false)
    if (!stations.value.some((item: any) => item.id === selectedStationId.value)) selectedStationId.value = stations.value[0]?.id || ''
  } catch {
    stations.value = []
  }
}

onMounted(loadStations)

const fields = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'provider', label: 'Servicio', type: 'select', required: true, defaultValue: 'COPERNICUS_DATA_SPACE', options: [
    { label: 'FECOCLIMA', value: 'FECOCLIMA' },
    { label: 'Open-Meteo', value: 'OPEN_METEO' },
    { label: 'Copernicus Data Space', value: 'COPERNICUS_DATA_SPACE' },
    { label: 'API compatible con OpenAI', value: 'OPENAI_COMPATIBLE' },
    { label: 'SMTP', value: 'SMTP' },
    { label: 'Correo + Telegram', value: 'EMAIL_TELEGRAM_DIGEST' }
  ] },
  { key: 'client_id', label: 'Client ID de Copernicus', configKey: 'client_id', showWhen: {key:'provider',values:['COPERNICUS_DATA_SPACE']}, required: true, hint:'Identificador de su aplicación en Copernicus Data Space.' },
  { key:'refresh_hours',label:'Buscar nuevas imágenes cada',type:'select',configKey:'refresh_hours',defaultValue:'24',showWhen:{key:'provider',values:['COPERNICUS_DATA_SPACE']},options:[{value:'6',label:'6 horas'},{value:'12',label:'12 horas'},{value:'24',label:'24 horas'},{value:'48',label:'48 horas'}]},
  { key: 'base_url', label: 'URL base', hint: 'Para Copernicus puede dejarla vacía y usar las URLs específicas del JSON.' },
  { key: 'timeout_seconds', label: 'Timeout (s)', type: 'number', numericMode: 'integer', step: 1, min: 1, max: 600, defaultValue: 30, hint: 'Número entero entre 1 y 600 segundos.' },
  { key: 'retry_count', label: 'Reintentos', type: 'number', numericMode: 'integer', step: 1, min: 0, max: 10, defaultValue: 3, hint: 'Número entero entre 0 y 10.' },
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
].map(field => ({...field, ...(field.type === 'checkbox' ? {type:'boolean-select'} : {}), advanced: ['base_url','timeout_seconds','retry_count','non_sensitive_config','sync_frequency_minutes'].includes(field.key)}))
const serviceTypes: Record<string,string> = {FECOCLIMA:'WEATHER',OPEN_METEO:'FORECAST',COPERNICUS_DATA_SPACE:'SATELLITE',OPENAI_COMPATIBLE:'AI',SMTP:'SMTP',EMAIL_TELEGRAM_DIGEST:'NOTIFICATION'}
function preparePayload(payload: Record<string,any>) { return {...payload,integration_type:serviceTypes[payload.provider]} }
</script>

<template>
  <section>
    <div v-if="props.detailId && props.detailId !== 'nuevo'" class="station-test-card">
      <label>
        <span class="label">Estación utilizada en la prueba</span>
        <select v-model="selectedStationId" class="select">
          <option value="">Seleccione una estación</option>
          <option v-for="station in stations" :key="station.id" :value="station.id">
            {{ station.name }}
          </option>
        </select>
        <small>Sentinel-2 y Open-Meteo probarán exactamente la estación seleccionada. Así el resultado no se mezcla con parcelas o estaciones heredadas.</small>
      </label>
    </div>
    <details v-if="props.detailId" class="notice integration-guide"><summary>Cómo interpretar las pruebas</summary>
      <b>¿Qué significa FAILED en Sentinel-2?</b>
      <span>Es el resultado de la última prueba manual o ejecución registrada. La columna “Detalle” muestra ahora la fase exacta que falló: catálogo STAC, OAuth, generación RGB o estadísticas espectrales.</span>
    </details>
    <AdminCrudPage :detail-id="props.detailId" base-path="/fecoclima-ia/admin/integraciones"
      title="Integraciones"
      description="Conecte estaciones, pronósticos, imágenes satelitales, IA y canales de comunicación."
      endpoint="/integrations"
      create-label="Agregar integración"
      :prepare-payload="preparePayload"
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
