<script setup lang="ts">
import { BarChart3, Bot, RefreshCw, Sparkles } from 'lucide-vue-next'
import type { AlertCondition, Recommendation } from '~/types/api'

const props = defineProps<{
  cropName: string
  recommendation?: Recommendation | null
  conditions?: AlertCondition[]
  period?: string
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ refresh: [] }>()
const showCharts = ref(false)

function legacyMarkdown(item: Recommendation): string {
  const actions = (item.acciones_recomendadas || []).slice(0, 3).map(value => `- ${value}`).join('\n')
  const diseases = (item.enfermedades || []).slice(0, 3).map(d => `- **${d.nombre}**: ${d.justificacion}`).join('\n')
  const watch = (item.variables_a_vigilar || []).slice(0, 3).map(value => `- ${value}`).join('\n')
  return `## 🌾 Lo importante hoy\n\n${item.resumen || 'Revise el lote y confirme el estado del cultivo.'}\n\n### Qué hacer hoy\n${actions || '- Recorra el lote y registre lo observado.'}\n\n### Qué vigilar\n${diseases || watch || '- Cambios en hojas, humedad y sectores con menor ventilación.'}`
}


const markdown = computed(() => {
  const item = props.recommendation
  if (!item) return ''
  if (typeof item.markdown === 'string' && item.markdown.trim()) return item.markdown.trim()
  return legacyMarkdown(item)
})
</script>

<template>
  <article class="agent-card card">
    <div class="agent-glow" />
    <div class="card-body agent-body">
      <header class="agent-head">
        <div class="agent-avatar"><Bot /></div>
        <div><div class="eyebrow"><Sparkles /> Criterio del agente</div><h2>Recomendación para productores</h2></div>
        <div class="agent-actions">
          <label v-if="conditions?.length" class="chart-toggle"><input v-model="showCharts" type="checkbox"><BarChart3 /> Ver en gráfico</label>
          <button class="btn btn-light" :disabled="loading" @click="emit('refresh')"><RefreshCw /> Actualizar recomendación</button>
        </div>
      </header>
      <div v-if="loading" class="agent-loading"><span class="ai-orb"/><div><b>Preparando una recomendación clara…</b><p>Estamos priorizando lo que necesita atención y las acciones de campo.</p></div></div>
      <div v-else-if="error" class="notice notice-warning"><b>No fue posible actualizar la recomendación.</b><span>{{ error }}</span></div>
      <template v-else-if="recommendation">
        <AgentRecommendationCharts v-if="showCharts && conditions?.length" :conditions="conditions" :period="period || '72h'" />
        <MarkdownContent :content="markdown" />
      </template>
      <div v-else class="notice"><b>Recomendación pendiente.</b><span>Pulse “Analizar con IA” para obtener las acciones prioritarias.</span></div>
      <footer v-if="recommendation" class="agent-meta"><span>{{ recommendation._cached ? 'Recomendación reutilizada sin cambios en los datos' : 'Recomendación actualizada ahora' }}</span><span v-if="recommendation?._agent_name">{{ recommendation._agent_name }}</span></footer>
    </div>
  </article>
</template>

<style scoped>
.agent-card{position:relative;overflow:hidden;border:1px solid rgba(59,141,194,.28);box-shadow:0 18px 48px rgba(0,68,129,.15)}.agent-glow{position:absolute;width:420px;height:420px;right:-180px;top:-240px;background:radial-gradient(circle,rgba(59,141,194,.28),transparent 68%);pointer-events:none}.agent-body{position:relative;padding:28px}.agent-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:18px;margin-bottom:22px}.agent-avatar{display:grid;place-items:center;width:58px;height:58px;color:#fff;background:linear-gradient(135deg,var(--fc-primary),#55a9d7);border-radius:18px;box-shadow:0 10px 24px rgba(0,68,129,.22)}.agent-avatar svg{width:31px;height:31px}.eyebrow{display:flex;align-items:center;gap:6px;color:var(--fc-secondary);font-size:.77rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.eyebrow svg{width:15px}.agent-head h2{margin:5px 0;color:var(--fc-primary);font-size:1.5rem}.agent-head p{margin:0;color:var(--fc-text-muted)}.agent-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}.agent-head .btn svg,.chart-toggle svg{width:17px}.chart-toggle{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:8px 11px;border:1px solid var(--fc-border);border-radius:9px;background:#fff;color:var(--fc-primary);font-size:.8rem;font-weight:800;cursor:pointer}.chart-toggle input{accent-color:var(--fc-primary)}.agent-loading{display:flex;align-items:center;gap:16px;padding:20px;background:linear-gradient(135deg,#eef8fd,#fff);border-radius:14px}.agent-loading p{margin:4px 0 0;color:var(--fc-text-muted)}.ai-orb{width:32px;height:32px;border-radius:50%;background:conic-gradient(var(--fc-secondary),transparent,var(--fc-primary));animation:spin 1s linear infinite}.agent-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:18px;padding-top:14px;border-top:1px solid var(--fc-border);color:var(--fc-text-muted);font-size:.8rem}.safety-note{margin:16px 0 0;padding:12px 14px;background:#fff8e3;border-radius:10px;color:#6d520e;font-size:.84rem}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:900px){.agent-head{grid-template-columns:auto 1fr}.agent-actions{grid-column:1/-1;justify-content:stretch}.agent-actions>*{flex:1;justify-content:center}}@media(max-width:520px){.agent-body{padding:20px}.agent-avatar{width:48px;height:48px;border-radius:14px}.agent-actions{flex-direction:column}.agent-actions>*{width:100%}}
</style>
