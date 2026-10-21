<script setup lang="ts">
import { Activity, Coins, RefreshCw, Workflow } from 'lucide-vue-next'

interface AgentRunActivity {
  id: string
  created_at: string
  status: string
  model: string | null
  provider: string | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number | null
  duration_ms: number | null
}
interface AgentActivity {
  runs: AgentRunActivity[]
  summary: {
    runs: number
    input_tokens: number
    output_tokens: number
    total_tokens: number
    usage_reported_runs?: number
    cost_usd: number | null
    cost_status: 'known' | 'not_configured'
  }
}

const props = defineProps<{ agentId: string }>()
const { request } = useApi()
const activity = ref<AgentActivity>()
const loading = ref(false)
const error = ref('')
const number = (value: number | null | undefined) => new Intl.NumberFormat('es-PY').format(value || 0)
const cost = (value: number | null | undefined) => value === null || value === undefined ? 'No disponible' : new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value)
const date = (value: string) => new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
const statusLabel = (status: string) => ({ COMPLETED: 'Completado', SUCCESS: 'Completado', FAILED: 'Con error', RUNNING: 'En curso', PENDING: 'En cola' } as Record<string, string>)[status] || status

async function load() {
  loading.value = true
  error.value = ''
  try { activity.value = await request<AgentActivity>(`/agents/${props.agentId}/activity`) }
  catch { error.value = 'No se pudo consultar la actividad de este agente. Puede volver a intentarlo.' }
  finally { loading.value = false }
}
watch(() => props.agentId, load, { immediate: true })
</script>

<template>
  <section class="card agent-activity" :aria-busy="loading">
    <div class="card-body">
      <div class="activity-header"><div><span class="activity-eyebrow">SEGUIMIENTO DEL AGENTE</span><h2><Activity />Actividad y consumo</h2><p>Últimas 100 ejecuciones. El resumen corresponde únicamente a este historial.</p></div><button type="button" class="btn btn-light" :disabled="loading" @click="load"><RefreshCw />Actualizar</button></div>
      <p v-if="error" class="notice notice-warning" role="alert">{{ error }}</p>
      <LoadingState v-if="loading && !activity" />
      <template v-if="activity">
        <div class="activity-metrics">
          <article><span class="metric-icon"><Workflow /></span><div><span>Últimas ejecuciones</span><strong>{{ number(activity.summary.runs) }}</strong><small>Hasta 100 registros de este agente</small></div></article>
          <article><span class="metric-icon"><Activity /></span><div><span>Tokens registrados</span><strong>{{ activity.summary.usage_reported_runs === 0 && activity.summary.runs > 0 ? 'No reportados' : number(activity.summary.total_tokens) }}</strong><small>{{ number(activity.summary.input_tokens) }} de entrada · {{ number(activity.summary.output_tokens) }} de salida</small><small v-if="activity.summary.usage_reported_runs !== undefined && activity.summary.usage_reported_runs < activity.summary.runs">Uso informado en {{ activity.summary.usage_reported_runs }} de {{ activity.summary.runs }} ejecuciones.</small></div></article>
          <article><span class="metric-icon"><Coins /></span><div><span>Costo registrado</span><strong :class="{ 'cost-unknown': activity.summary.cost_usd === null }">{{ cost(activity.summary.cost_usd) }}</strong><small>{{ activity.summary.cost_usd === null ? 'Costo no disponible; requiere una tarifa configurada.' : 'Importe informado por el sistema en USD.' }}</small></div></article>
        </div>
        <details v-if="activity.runs.length" class="activity-history"><summary>Ver historial de ejecuciones <span>{{ activity.runs.length }}</span></summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Proveedor y modelo</th><th>Tokens</th><th>Costo USD</th></tr></thead><tbody><tr v-for="run in activity.runs" :key="run.id"><td>{{ date(run.created_at) }}<small v-if="run.duration_ms !== null">{{ number(run.duration_ms) }} ms</small></td><td><span class="badge" :class="run.status === 'FAILED' ? 'badge-danger' : ['COMPLETED','SUCCESS'].includes(run.status) ? 'badge-success' : 'badge-info'">{{ statusLabel(run.status) }}</span></td><td>{{ run.model || 'Sin modelo registrado' }}<small>{{ run.provider || 'Proveedor no registrado' }}</small></td><td>{{ number(run.total_tokens) }}<small>{{ number(run.input_tokens) }} entrada · {{ number(run.output_tokens) }} salida</small></td><td>{{ cost(run.cost_usd) }}</td></tr></tbody></table></div></details>
        <p v-else class="activity-empty">Todavía no hay ejecuciones registradas. Aparecerán cuando este agente participe en una consulta.</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.agent-activity{margin-top:24px}.activity-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.activity-eyebrow{display:block;color:#7798af;font-size:.59rem;font-weight:800;letter-spacing:.12em;margin-bottom:7px}.activity-header h2{display:flex;align-items:center;gap:8px;margin:0;color:#275c81;font-size:1.08rem}.activity-header h2 svg{width:20px;height:20px}.activity-header p{margin:7px 0 0;color:#7590a5;font-size:.79rem}.activity-header .btn svg{width:16px;height:16px}.activity-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.activity-metrics article{display:flex;gap:12px;align-items:flex-start;padding:18px;border:1px solid #e0ebf3;border-radius:15px;background:#f7fbfe}.metric-icon{display:grid;place-items:center;width:35px;height:35px;flex:0 0 35px;background:#e4f0fa;color:#357dad;border-radius:11px}.metric-icon svg{width:18px;height:18px}.activity-metrics article>div{min-width:0}.activity-metrics article>div>span{font-size:.7rem;color:#7390a5}.activity-metrics strong{display:block;margin:7px 0;color:#195780;font-size:1.55rem;letter-spacing:-.04em}.activity-metrics .cost-unknown{font-size:1.05rem;letter-spacing:-.02em;margin:12px 0}.activity-metrics small{display:block;color:#7b96aa;font-size:.67rem;line-height:1.6}.activity-history{margin-top:22px}.activity-history summary{display:flex;align-items:center;gap:9px;padding:10px 0;color:#3e6e8f;font-size:.8rem;font-weight:750;cursor:pointer}.activity-history summary:before{content:'▸';font-size:.8rem}.activity-history[open] summary:before{content:'▾'}.activity-history summary>span{padding:3px 7px;border-radius:7px;background:#e8f2f9;color:#6b91ac;font-size:.64rem}.activity-history .table-wrap{margin-top:10px}.activity-history td small{display:block;color:#7894a9;font-size:.68rem;margin-top:4px}.activity-empty{margin:20px 0 0;padding:15px 18px;border-radius:12px;background:#f5f9fc;color:#7691a6;font-size:.79rem;line-height:1.7}@media(max-width:1000px){.activity-metrics{grid-template-columns:1fr}.activity-metrics strong{font-size:1.4rem}.activity-metrics article{align-items:center}}@media(max-width:600px){.activity-header{align-items:flex-start;flex-direction:column}.activity-header .btn{width:100%}}
</style>
