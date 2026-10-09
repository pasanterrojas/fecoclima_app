<script setup lang="ts">
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-vue-next'
import type { AlertSummary, AlertLevel } from '~/types/api'

const props = defineProps<{ alert: AlertSummary; period?: string; disabled?: boolean }>()
const meta: Record<AlertLevel, { label: string; className: string }> = {
  NINGUNA: { label: 'Sin alerta relevante', className: 'none' },
  MODERADA: { label: 'Alerta moderada', className: 'moderate' },
  GRAVE: { label: 'Alerta grave', className: 'severe' },
  DATOS_INSUFICIENTES: { label: 'Datos insuficientes', className: 'missing' }
}
const evaluationDateLabel = computed(() => {
  if (!props.alert.evaluation_date) return ''
  return new Date(`${props.alert.evaluation_date}T12:00:00`).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
  })
})
const colorClass = computed(() => {
  const configured = String(props.alert.maximum_level_color || props.alert.level_color || '').toLowerCase()
  if (['red', 'rojo'].includes(configured)) return 'severe'
  if (['yellow', 'amarillo', 'orange'].includes(configured)) return 'moderate'
  if (['gray', 'grey', 'gris', 'blue'].includes(configured)) return 'missing'
  if (['green', 'verde'].includes(configured)) return 'none'
  return meta[props.alert.maximum_level_72h]?.className || 'missing'
})
</script>

<template>
  <article class="alert-card card" :class="colorClass">
    <div class="card-body">
      <div class="row-between">
        <div>
          <div class="eyebrow">Mayor atención detectada en los últimos 3 días<span v-if="evaluationDateLabel"> · {{ evaluationDateLabel }}</span><InfoHint text="Este nivel corresponde a la fecha indicada. Puede ser distinto del nivel de hoy." /></div>
          <h3>{{ alert.maximum_level_label || meta[alert.maximum_level_72h].label }}</h3>
          <p>{{ alert.simple_explanation }}</p>
          <details v-if="alert.rule_version" class="rule-version"><summary>Cómo se calculó (i)</summary>Reglas del cultivo, versión {{ alert.rule_version }}</details>
        </div>
        <ShieldAlert class="hero-icon" />
      </div>
      <div class="alert-kpis">
        <div><b>{{ alert.conditions_met }}/{{ alert.conditions_total }}</b><span>señales encontradas <InfoHint text="Cantidad de condiciones observadas que coincidieron con el criterio del cultivo." /></span></div>
        <div><b>{{ alert.completion_percentage }}%</b><span>datos para evaluar <InfoHint text="Cuántas condiciones se pudieron comprobar con las lecturas disponibles." /></span></div>
        <div><b>{{ Math.round(alert.confidence * 100) }}%</b><span>fiabilidad del cálculo <InfoHint text="Indica qué tan completo es el cálculo. No es una certeza sobre la salud del cultivo." /></span></div>
      </div>
      <div class="conditions">
        <div v-for="condition in alert.conditions" :key="condition.key" class="condition" :title="condition.explanation">
          <CheckCircle2 v-if="condition.status === 'met'" class="ok" />
          <AlertTriangle v-else-if="condition.status === 'not_met'" class="no" />
          <HelpCircle v-else class="unknown" />
          <span>{{ condition.label }}</span>
        </div>
      </div>
      <WidgetExplanation :alert-id="alert.evaluation_id" :period="period || '72h'" widget="alert" :disabled="disabled" />
    </div>
  </article>
</template>

<style scoped>
.alert-card{overflow:hidden;border-left:8px solid var(--fc-success)}.alert-card.moderate{border-left-color:var(--fc-warning)}.alert-card.severe{border-left-color:var(--fc-danger)}.alert-card.missing{border-left-color:var(--fc-info)}.eyebrow{text-transform:uppercase;font-size:.75rem;letter-spacing:.08em;font-weight:800;color:var(--fc-text-muted)}h3{margin:6px 0;font-size:1.65rem;color:var(--fc-primary)}p{margin:0;color:var(--fc-text-muted);max-width:720px}.rule-version{display:block;margin-top:8px;color:var(--fc-secondary);font-weight:700}.hero-icon{width:48px;height:48px;color:var(--fc-primary)}.alert-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.alert-kpis>div{padding:13px;background:var(--fc-surface-muted);border-radius:10px}.alert-kpis b{display:block;font-size:1.25rem;color:var(--fc-primary)}.alert-kpis span{font-size:.78rem;color:var(--fc-text-muted)}.conditions{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.condition{display:flex;gap:8px;align-items:center;font-size:.88rem}.condition svg{width:18px}.ok{color:var(--fc-success)}.no{color:var(--fc-warning)}.unknown{color:var(--fc-info)}@media(max-width:620px){.conditions{grid-template-columns:1fr}.alert-kpis{grid-template-columns:1fr 1fr}.hero-icon{display:none}}
</style>
