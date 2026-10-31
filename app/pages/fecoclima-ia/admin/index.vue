<script setup lang="ts">
import type { AdminStation } from '~/utils/stations'
import { AlertTriangle, Bot, CloudSun, Database, MapPinned, Sprout } from 'lucide-vue-next'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Administración' })
const { request } = useApi()
const stations = ref<AdminStation[]>([])
const stats = ref<Record<string, number>>({})
const jobs = ref<Array<{ id: string; job_type: string; status: string; created_at: string }>>([])
const aiRuns = ref<{ completed_24h: number; fallback_24h: number; items: Array<{ created_at: string; status: string; reason?: string; widget?: string; model?: string }> }>({ completed_24h: 0, fallback_24h: 0, items: [] })
const error = ref('')

async function load() {
  try {
    const [summary, recentJobs, runs, stationList] = await Promise.allSettled([
      request<typeof stats.value>('/admin/summary'),
      request<typeof jobs.value>('/admin/jobs', { query: { limit: 10 } }),
      request<typeof aiRuns.value>('/admin/ai-runs'),
      request<{ items: AdminStation[] }>('/stations', { query: { limit: 250 } }).then(result => result.items)
    ])
    if (summary.status === 'fulfilled') stats.value = summary.value
    if (recentJobs.status === 'fulfilled') jobs.value = recentJobs.value
    if (runs.status === 'fulfilled') aiRuns.value = runs.value
    if (stationList.status === 'fulfilled') stations.value = stationList.value
    error.value = [summary, recentJobs, runs, stationList].some(result => result.status === 'rejected') ? 'Algunos datos del panel no se pudieron actualizar. Intente de nuevo.' : ''
  } catch {
    error.value = 'No pudimos actualizar el estado del panel. Intente de nuevo.'
  }
}
onMounted(load)

const cards = computed(() => [
  { label: 'Estaciones activas', value: stats.value.stations_active || 0, icon: CloudSun },
  { label: 'Parcelas registradas', value: stats.value.plots_total || 0, icon: MapPinned },
  { label: 'Lecturas', value: stats.value.readings_total || 0, icon: Database },
  { label: 'Alertas 72 h', value: stats.value.alerts_72h || 0, icon: AlertTriangle },
  { label: 'Agentes activos', value: stats.value.agents_active || 0, icon: Bot },
  { label: 'Cultivos activos', value: stats.value.crops_active || 0, icon: Sprout }
])

function aiReason(reason?: string) {
  return ({
    provider_auth: 'Credencial IA no autorizada (HTTP 401): renueve la clave y pruebe la conexión.',
    provider_quota: 'Cuota de IA agotada.',
    provider_limited: 'El proveedor limita temporalmente las consultas.',
    provider_not_configured: 'No hay credencial IA configurada.',
    agent_not_configured: 'No hay un agente activo para el cultivo.'
  } as Record<string, string>)[reason || ''] || 'El proveedor IA no respondió.'
}
</script>

<template>
  <section>
    <AdminPageHeader title="Dashboard" description="Estaciones, cultivos e inteligencia agronómica en un solo lugar." />
    <p v-if="error" class="notice notice-warning">{{ error }} <button class="btn btn-light" @click="load">Reintentar</button></p>
    <div class="grid grid-3">
      <article v-for="card in cards" :key="card.label" class="card stat">
        <component :is="card.icon" /><div><b>{{ card.value }}</b><span>{{ card.label }}</span></div>
      </article>
    </div>
    <StationOverviewMap :stations="stations" />
    <article class="card ai-overview">
      <div class="card-body">
        <div class="row-between"><h2 class="section-title">¿Está respondiendo la IA?</h2><button class="btn btn-light" @click="load">Actualizar estado</button></div>
        <p>Últimas 24 horas: <b>{{ aiRuns.completed_24h }}</b> respuestas del agente y <b>{{ aiRuns.fallback_24h }}</b> respuestas de respaldo sin IA.</p>
        <div v-if="aiRuns.fallback_24h" class="notice notice-warning">Si aparece “Credencial IA no autorizada”, actualice <code>AI_API_KEY</code> en el entorno del backend, reinicie el API y pruebe el modelo en Administración → Agentes IA. No pegue la clave aquí.</div>
        <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Origen</th><th>Resultado</th></tr></thead>
          <tbody>
            <tr v-for="(run, index) in aiRuns.items" :key="`${run.created_at}-${index}`">
              <td>{{ new Date(run.created_at).toLocaleString('es-PY') }}</td>
              <td>{{ run.widget ? `Widget: ${run.widget}` : 'Análisis / conversación' }}</td>
              <td><span class="badge" :class="run.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'">{{ run.status === 'COMPLETED' ? 'Agente IA' : run.status === 'FALLBACK' ? 'Respaldo sin IA' : 'En curso' }}</span><small v-if="run.status === 'FALLBACK'">{{ aiReason(run.reason) }}</small></td>
            </tr>
            <tr v-if="!aiRuns.items.length"><td colspan="3">Todavía no se ha consultado al agente.</td></tr>
          </tbody>
        </table></div>
      </div>
    </article>
    <div class="grid grid-2 admin-sections">
      <article class="card"><div class="card-body"><h2 class="section-title">Trabajos recientes</h2><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Estado</th><th>Creado</th></tr></thead><tbody><tr v-for="job in jobs" :key="job.id"><td>{{ job.job_type }}</td><td><span class="badge" :class="job.status === 'COMPLETED' ? 'badge-success' : job.status === 'FAILED' ? 'badge-danger' : 'badge-warning'">{{ job.status }}</span></td><td>{{ new Date(job.created_at).toLocaleString('es-PY') }}</td></tr><tr v-if="!jobs.length"><td colspan="3">Sin trabajos recientes.</td></tr></tbody></table></div></div></article>
      <article class="card"><div class="card-body"><h2 class="section-title">Puesta en marcha</h2><ol><li>Registre cada estación en Estaciones, con sus coordenadas, zona horaria y fuente de datos.</li><li>Pegue el GUID de cada estación para completar la URL de API prellenada; también puede editarla o pegar una URL completa.</li><li>Pruebe la conexión y sincronice cada estación por separado.</li><li>Revise los datos faltantes, las reglas y los agentes de cada cultivo.</li><li>La fecha de siembra se solicita al productor al momento de consultar.</li></ol><div class="notice notice-warning">Las mediciones que faltan se indican como datos no disponibles. Si la IA falla, la respuesta se identifica como respaldo.</div></div></article>
    </div>
  </section>
</template>

<style scoped>
.stat{display:flex;align-items:center;gap:15px;padding:20px}.stat>svg{width:38px;height:38px;padding:8px;color:#fff;background:var(--fc-primary);border-radius:12px}.stat b,.stat span{display:block}.stat b{font-size:1.7rem;color:var(--fc-primary)}.stat span{color:var(--fc-text-muted);font-size:.85rem}.ai-overview,.admin-sections{margin-top:22px}.ai-overview p{margin:12px 0}.ai-overview td small{display:block;margin-top:5px}.ai-overview .notice{margin-bottom:12px}li{margin-bottom:10px}
</style>
