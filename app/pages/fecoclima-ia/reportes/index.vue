<script setup lang="ts">
import { FileDown, FilePlus2, RefreshCw } from 'lucide-vue-next'
import type { Crop, Station } from '~/types/api'

useSeoMeta({ title: 'Reportes' })
const { request } = useApi()
const stations = ref<Station[]>([])
const crops = ref<Crop[]>([])
const reports = ref<any[]>([])
const form = reactive({
  station_id: '',
  crop_code: 'SOJA',
  planting_date: new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10),
  date_from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
  date_to: new Date().toISOString().slice(0, 10)
})
const creating = ref(false)
const message = ref('')

async function load() {
  [stations.value, crops.value, reports.value] = await Promise.all([
    request('/public/stations'), request('/public/crops'), request('/reports/public', { query: { limit: 30 } })
  ])
  if (!form.station_id && stations.value[0]) form.station_id = stations.value[0].id
}
async function createReport() {
  creating.value = true
  message.value = ''
  try {
    const result: any = await request('/reports', { method: 'POST', body: form })
    message.value = `Reporte ${result.status}. Actualice la lista para consultar su avance.`
    await load()
  } finally { creating.value = false }
}
onMounted(load)
</script>
<template>
  <div class="page"><div class="container">
    <h1 class="page-title">Reportes agrometeorológicos</h1>
    <p class="page-subtitle">Seleccione estación, cultivo, fecha de siembra y periodo. No requiere crear ni mantener ciclos productivos.</p>
    <form class="card report-form" @submit.prevent="createReport">
      <div class="card-body form-grid">
        <label><span class="label">Estación</span><select v-model="form.station_id" class="select" required><option v-for="station in stations" :key="station.id" :value="station.id">{{ station.name }}</option></select></label>
        <label><span class="label">Cultivo</span><select v-model="form.crop_code" class="select" required><option v-for="crop in crops" :key="crop.id" :value="crop.code">{{ crop.name }}</option></select></label>
        <label><span class="label">Fecha de siembra</span><input v-model="form.planting_date" class="input" type="date" :max="form.date_to" required></label>
        <label><span class="label">Fecha desde</span><input v-model="form.date_from" class="input" type="date" required></label>
        <label><span class="label">Fecha hasta</span><input v-model="form.date_to" class="input" type="date" required></label>
      </div>
      <div class="report-actions"><button class="btn btn-primary" :disabled="creating"><FilePlus2/>{{ creating ? 'Creando trabajo…' : 'Generar reporte' }}</button></div>
    </form>
    <p v-if="message" class="notice">{{ message }}</p>
    <section class="history"><div class="row-between"><h2 class="section-title">Historial</h2><button class="btn btn-light" @click="load"><RefreshCw/>Actualizar</button></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Creado</th><th>Estación</th><th>Cultivo</th><th>Siembra</th><th>Periodo</th><th>Estado</th><th>Archivo</th></tr></thead><tbody><tr v-for="report in reports" :key="report.id"><td>{{ new Date(report.created_at).toLocaleString('es-PY') }}</td><td>{{ report.station_name }}</td><td>{{ report.crop_name }}</td><td>{{ report.planting_date || '—' }}</td><td>{{ report.date_from }} – {{ report.date_to }}</td><td><span class="badge" :class="report.status==='COMPLETED'?'badge-success':report.status==='FAILED'?'badge-danger':'badge-warning'">{{ report.status }}</span></td><td><NuxtLink v-if="report.status==='COMPLETED'" class="btn btn-light" :to="`/fecoclima-ia/reportes/${report.id}`"><FileDown/>Abrir</NuxtLink><span v-else>—</span></td></tr><tr v-if="!reports.length"><td colspan="7"><EmptyState title="Sin reportes"/></td></tr></tbody></table></div></div>
    </section>
  </div></div>
</template>
<style scoped>.report-form{margin-top:24px}.report-actions{padding:0 22px 22px;display:flex;justify-content:flex-end}.btn svg{width:18px}.history{margin-top:30px}</style>
