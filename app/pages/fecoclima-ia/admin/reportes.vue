<script setup lang="ts">
import { stationError } from '~/utils/stations'
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
interface Consultation { analysis_id: string; name: string; producer_name: string | null; reference_at: string; crop_name: string; stage_name: string; window_hours: number; water_available: boolean; report: { id: string; status: string; error?: string; file_available: boolean } | null }
const { request, apiUrl } = useApi()
const { dateTime } = useViewerTime()
const rows = ref<Consultation[]>([]), search = ref(''), error = ref(''), busy = ref(''), loading = ref(false)
const total = ref(0), offset = ref(0), limit = 30
const sources = ref<{ document: string; sha256: string; sections: number }[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
async function load() {
  if (timer) clearTimeout(timer)
  loading.value = true
  try {
    const result = await request<{ items: Consultation[]; total: number }>('/admin/consultation-reports', { query: { search: search.value, limit, offset: offset.value } })
    if (disposed) return
    rows.value = result.items; total.value = result.total
    if (rows.value.some(row => ['PENDING', 'RUNNING'].includes(row.report?.status || ''))) timer = setTimeout(load, 4000)
  } catch (exception) { if (!disposed) error.value = stationError(exception) }
  finally { if (!disposed) loading.value = false }
}
async function generate(row: Consultation) {
  busy.value = row.analysis_id; error.value = ''
  try { await request(`/admin/consultation-reports/${row.analysis_id}`, { method: 'POST' }); await load() }
  catch (exception) { error.value = stationError(exception) }
  finally { busy.value = '' }
}
async function move(delta: number) { offset.value = Math.max(0, offset.value + delta); await load() }
onMounted(async () => { await load(); try { sources.value = (await request<{ items: typeof sources.value }>('/admin/consultation-reports/sources')).items } catch { /* Reports remain usable if the source registry is temporarily unavailable. */ } })
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer) })
</script>
<template>
  <section>
    <AdminPageHeader title="Reportes de consulta técnica" description="Genere el modelo del cliente con la evidencia de un análisis guardado: estación, alertas, fenología, agua, imágenes y conversación de esa consulta." />
    <form class="report-search" @submit.prevent="offset = 0; error = ''; load()"><input v-model.trim="search" class="input" aria-label="Buscar parcela o productor" placeholder="Parcela o productor"><button class="btn btn-light" :disabled="loading">Buscar</button></form>
    <p class="notice">El informe conserva la fecha, el período y las reglas del análisis elegido. Para incorporar nuevas fuentes y el balance hídrico a una captura anterior, vuelva a analizar la parcela.</p>
    <ErrorState v-if="error" :message="error" />
    <article class="card table-wrap"><table><thead><tr><th>Parcela / productor</th><th>Consulta</th><th>Estado fenológico estimado</th><th>Informe</th></tr></thead><tbody>
      <tr v-for="row in rows" :key="row.analysis_id"><td><b>{{ row.name }}</b><small>{{ row.producer_name || 'Sin productor identificado' }} · {{ row.crop_name }}</small></td><td>{{ dateTime(row.reference_at) }}<small>Período analizado: {{ row.window_hours }} horas</small></td><td>{{ row.stage_name || 'No determinado' }}<small>{{ row.water_available ? 'Incluye módulo de agua' : 'Captura anterior al módulo de agua' }}</small></td><td><div class="report-actions"><a v-if="row.report?.file_available" class="btn btn-primary" :href="apiUrl(`/admin/consultation-reports/files/${row.report.id}`)" target="_blank" rel="noopener">Descargar PDF</a><button class="btn btn-light" :disabled="!!busy || ['PENDING', 'RUNNING'].includes(row.report?.status || '')" @click="generate(row)">{{ ['PENDING', 'RUNNING'].includes(row.report?.status || '') ? 'Preparando informe…' : row.report?.file_available ? 'Generar de nuevo' : 'Generar informe' }}</button></div><small v-if="row.report?.status === 'FAILED'" role="alert">{{ row.report.error || 'No se pudo generar; vuelva a intentar.' }}</small></td></tr>
      <tr v-if="!rows.length"><td colspan="4">{{ loading ? 'Consultando análisis…' : 'No hay análisis guardados para generar un informe.' }}</td></tr>
    </tbody></table></article>
    <nav class="report-pages" aria-label="Páginas de consultas"><button class="btn btn-light" :disabled="loading || offset === 0" @click="move(-limit)">Anterior</button><span>{{ total ? offset + 1 : 0 }}–{{ Math.min(offset + rows.length, total) }} de {{ total }}</span><button class="btn btn-light" :disabled="loading || offset + limit >= total" @click="move(limit)">Siguiente</button></nav>
    <details v-if="sources.length" class="card card-body"><summary>Fuentes de trabajo revisadas</summary><p v-for="source in sources" :key="source.sha256"><b>{{ source.document }}</b><small>{{ source.sections }} secciones · SHA-256 {{ source.sha256 }}</small></p></details>
  </section>
</template>
<style scoped>
.report-search,.report-pages,.report-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0}.report-search input{max-width:460px}.report-actions{margin:0}td small,details small{display:block;color:var(--fc-text-muted);margin-top:6px;overflow-wrap:anywhere}td{vertical-align:top}.notice{line-height:1.6}
</style>
