<script setup lang="ts">
import { CloudDownload, FileSpreadsheet, PlugZap, Upload } from 'lucide-vue-next'
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Datos y sincronización' })
const { request } = useApi()
const stations = ref<any[]>([])
const stationId = ref('')
const dateFrom = ref(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
const dateTo = ref(new Date().toISOString().slice(0, 10))
const file = ref<File | null>(null)
const preview = ref<any>(null)
const mappingText = ref('{}')
const busy = ref(false)
const message = ref('')
const error = ref('')

onMounted(async () => {
  const response: any = await request('/stations', { query: { limit: 250 } })
  stations.value = response.items || []
  stationId.value = stations.value[0]?.id || ''
})
function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] || null
  preview.value = null
}
async function testConnection() {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const result: any = await request(`/stations/${stationId.value}/test-connection`, { method: 'POST' })
    message.value = `Conexión correcta. La API devolvió ${result.records_received} registros para el mes actual.`
  } catch (e: any) { error.value = e?.data?.detail || 'No se pudo probar la conexión' } finally { busy.value = false }
}
async function sync() {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const result: any = await request(`/stations/${stationId.value}/sync`, { method: 'POST', query: { date_from: dateFrom.value, date_to: dateTo.value } })
    message.value = `Sincronización en cola. Trabajo: ${result.job_id}`
  } catch (e: any) { error.value = e?.data?.detail || 'No se pudo iniciar la sincronización' } finally { busy.value = false }
}
async function previewFile() {
  if (!file.value) return
  error.value = ''; message.value = ''; busy.value = true
  try {
    const data = new FormData(); data.append('file', file.value)
    preview.value = await request('/imports/preview', { method: 'POST', body: data })
    mappingText.value = JSON.stringify(preview.value.suggested_mapping || {}, null, 2)
  } catch (e: any) { error.value = e?.data?.detail || 'No se pudo leer el archivo' } finally { busy.value = false }
}
async function importFile() {
  if (!file.value || !stationId.value) return
  error.value = ''; message.value = ''; busy.value = true
  try {
    JSON.parse(mappingText.value)
    const data = new FormData(); data.append('station_id', stationId.value); data.append('mapping', mappingText.value); data.append('file', file.value)
    const result: any = await request('/imports/weather', { method: 'POST', body: data })
    message.value = `Importación finalizada: ${result.created} nuevos, ${result.updated} actualizados y ${result.failed} filas con error.`
  } catch (e: any) { error.value = e?.data?.detail || e?.message || 'No se pudo importar' } finally { busy.value = false }
}
</script>
<template><section><AdminPageHeader title="Datos y sincronización" description="Pruebe la API FECOCLIMA, sincronice por rango o importe archivos Excel/CSV con vista previa."/><ErrorState v-if="error" :message="error"/><p v-if="message" class="notice">{{message}}</p><div class="grid grid-2"><article class="card"><div class="card-body"><h2 class="section-title"><CloudDownload/> API FECOCLIMA</h2><label><span class="label">Estación</span><select v-model="stationId" class="select"><option v-for="s in stations" :key="s.id" :value="s.id">{{s.name}} · {{s.source_type}}</option></select></label><div class="form-grid compact"><label><span class="label">Desde</span><input v-model="dateFrom" type="date" class="input"></label><label><span class="label">Hasta</span><input v-model="dateTo" type="date" class="input"></label></div><div class="actions"><button class="btn btn-light" :disabled="busy||!stationId" @click="testConnection"><PlugZap/>Probar conexión</button><button class="btn btn-primary" :disabled="busy||!stationId" @click="sync"><CloudDownload/>Sincronizar</button></div><p class="notice notice-warning small">La llave <code>clima-key</code> se lee exclusivamente desde el entorno del backend. Los rangos se separan por año y en bloques máximos de seis meses.</p></div></article><article class="card"><div class="card-body"><h2 class="section-title"><FileSpreadsheet/> Importación Excel/CSV</h2><label><span class="label">Archivo</span><input class="input" type="file" accept=".xlsx,.xls,.csv" @change="selectFile"></label><div class="actions"><button class="btn btn-light" :disabled="busy||!file" @click="previewFile"><Upload/>Vista previa</button></div><template v-if="preview"><p><b>{{preview.total_rows}}</b> filas detectadas.</p><label><span class="label">Mapeo JSON</span><textarea v-model="mappingText" class="textarea" rows="9"/></label><div class="table-wrap preview"><table><thead><tr><th v-for="c in preview.columns" :key="c">{{c}}</th></tr></thead><tbody><tr v-for="(row,i) in preview.rows.slice(0,5)" :key="i"><td v-for="c in preview.columns" :key="c">{{row[c]}}</td></tr></tbody></table></div><div class="actions"><button class="btn btn-primary" :disabled="busy" @click="importFile"><Upload/>Confirmar importación</button></div></template></div></article></div></section></template>
<style scoped>.section-title{display:flex;align-items:center;gap:9px}.section-title svg,.btn svg{width:19px}.compact{margin-top:15px}.actions{display:flex;gap:9px;justify-content:flex-end;margin-top:17px}.preview{max-height:260px;margin-top:15px}@media(max-width:650px){.actions{align-items:stretch;flex-direction:column}.actions .btn{width:100%}}</style>
