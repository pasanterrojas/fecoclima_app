<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { AlertCondition } from '~/types/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const props = defineProps<{
  conditions: AlertCondition[]
  period: string
}>()

const mode = ref<'comparison' | 'status'>('comparison')
const periodLabel = computed(() => ({
  '24h': '24 horas',
  '72h': '72 horas',
  '7d': '7 días',
  '30d': '30 días',
} as Record<string, string>)[props.period] || props.period)

function numericObserved(item: AlertCondition): number | null {
  const raw = item.period_value ?? item.value
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const chartable = computed(() => props.conditions.filter((item) => {
  const value = numericObserved(item)
  const hasCriterion = item.operator === 'between'
    ? item.threshold_min != null && item.threshold_max != null
    : item.threshold_value != null
  return value !== null && hasCriterion
}))

function observedValue(item: AlertCondition): number {
  return numericObserved(item) ?? 0
}

function observedLabel(item: AlertCondition): string {
  return item.period_aggregation === 'sum'
    ? `Acumulado · ${periodLabel.value}`
    : `Promedio · ${periodLabel.value}`
}

function criterionBars(item: AlertCondition): Array<{ label: string; value: number; color: string }> {
  if (item.operator === 'between') {
    return [
      { label: 'Ideal mínimo', value: Number(item.threshold_min), color: '#8ccf48' },
      { label: observedLabel(item), value: observedValue(item), color: '#5b9bd5' },
      { label: 'Ideal máximo', value: Number(item.threshold_max), color: '#8ccf48' },
    ]
  }
  const label = ['gt', 'gte'].includes(String(item.operator))
    ? 'Ideal mínimo'
    : ['lt', 'lte'].includes(String(item.operator))
      ? 'Ideal máximo'
      : 'Valor ideal'
  return [
    { label, value: Number(item.threshold_value), color: '#8ccf48' },
    { label: observedLabel(item), value: observedValue(item), color: '#5b9bd5' },
  ]
}

function chartData(item: AlertCondition) {
  const bars = criterionBars(item)
  return {
    labels: bars.map(bar => bar.label),
    datasets: [{
      data: bars.map(bar => bar.value),
      backgroundColor: bars.map(bar => bar.color),
      borderRadius: 3,
      maxBarThickness: 44,
    }],
  }
}

function chartOptions(item: AlertCondition): any {
  const values = criterionBars(item).map(bar => bar.value)
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(...values)
  const padding = Math.max(1, Math.abs(maximum - minimum) * 0.16)
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${Number(context.raw).toLocaleString('es-PY', { maximumFractionDigits: 2 })} ${item.unit || ''}`.trim(),
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, minRotation: 0 } },
      y: {
        min: minimum < 0 ? minimum - padding : 0,
        suggestedMax: maximum + padding,
        grid: { color: 'rgba(90, 118, 136, .16)' },
        ticks: { font: { size: 10 } },
      },
    },
  }
}

function meetsCriterion(item: AlertCondition): boolean | null {
  const value = observedValue(item)
  if (!Number.isFinite(value)) return null
  if (item.operator === 'between') return value >= Number(item.threshold_min) && value <= Number(item.threshold_max)
  if (item.operator === 'gt') return value > Number(item.threshold_value)
  if (item.operator === 'gte') return value >= Number(item.threshold_value)
  if (item.operator === 'lt') return value < Number(item.threshold_value)
  if (item.operator === 'lte') return value <= Number(item.threshold_value)
  if (item.operator === 'eq') return value === Number(item.threshold_value)
  return null
}

function criterionText(item: AlertCondition): string {
  const unit = item.unit ? ` ${item.unit}` : ''
  if (item.operator === 'between') return `${item.threshold_min} a ${item.threshold_max}${unit}`
  const symbol = ({ gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' } as Record<string, string>)[String(item.operator)] || ''
  return `${symbol} ${item.threshold_value}${unit}`.trim()
}
</script>

<template>
  <section v-if="chartable.length" class="agent-visuals" aria-label="Comparación gráfica de condiciones">
    <header>
      <div>
        <b>Lectura rápida de las condiciones</b>
        <span>Valor del periodo frente al criterio publicado del cultivo.</span>
      </div>
      <label>
        <span>Vista</span>
        <select v-model="mode" class="select">
          <option value="comparison">Barras comparativas</option>
          <option value="status">Semáforo resumido</option>
        </select>
      </label>
    </header>

    <div v-if="mode === 'comparison'" class="visual-grid">
      <article v-for="item in chartable" :key="item.key" class="mini-chart">
        <h3>{{ item.label }}</h3>
        <div class="chart-canvas"><Bar :data="chartData(item)" :options="chartOptions(item)" /></div>
        <p><b>{{ observedValue(item).toLocaleString('es-PY', { maximumFractionDigits: 2 }) }} {{ item.unit }}</b> · {{ observedLabel(item) }}</p>
      </article>
    </div>

    <div v-else class="status-grid">
      <article v-for="item in chartable" :key="item.key" :class="meetsCriterion(item) ? 'met' : 'not-met'">
        <span class="status-dot" />
        <div><b>{{ item.label }}</b><small>Criterio: {{ criterionText(item) }}</small></div>
        <strong>{{ observedValue(item).toLocaleString('es-PY', { maximumFractionDigits: 2 }) }} {{ item.unit }}</strong>
      </article>
    </div>

    <p class="visual-note">Estos gráficos representan datos y umbrales, no una interpretación visual inventada por el agente. El texto completo se conserva debajo.</p>
  </section>
</template>

<style scoped>
.agent-visuals{margin:0 0 22px;padding:18px;border:1px solid #c4dce8;border-radius:14px;background:#f8fcfe}.agent-visuals>header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:15px}.agent-visuals>header>div{display:flex;flex-direction:column;gap:3px}.agent-visuals>header b{color:var(--fc-primary)}.agent-visuals>header span,.visual-note{color:var(--fc-text-muted);font-size:.78rem}.agent-visuals>header label{display:flex;align-items:center;gap:8px}.agent-visuals>header .select{min-width:210px}.visual-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid #9aabb4;border-left:1px solid #9aabb4}.mini-chart{min-width:0;padding:13px;background:#fff;border-right:1px solid #9aabb4;border-bottom:1px solid #9aabb4}.mini-chart h3{min-height:38px;margin:0;text-align:center;color:#5b6670;font-size:.9rem}.chart-canvas{height:185px}.mini-chart p{margin:7px 0 0;text-align:center;color:var(--fc-text-muted);font-size:.74rem}.mini-chart p b{color:var(--fc-primary)}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.status-grid article{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;border:1px solid var(--fc-border);border-radius:11px;background:#fff}.status-grid article.met{border-left:5px solid var(--fc-success)}.status-grid article.not-met{border-left:5px solid var(--fc-warning)}.status-dot{width:10px;height:10px;border-radius:50%;background:var(--fc-warning)}.met .status-dot{background:var(--fc-success)}.status-grid article div{display:flex;flex-direction:column}.status-grid small{margin-top:2px;color:var(--fc-text-muted)}.status-grid strong{color:var(--fc-primary);white-space:nowrap}.visual-note{margin:12px 0 0}@media(max-width:980px){.visual-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.agent-visuals>header{align-items:stretch;flex-direction:column}.agent-visuals>header label{align-items:stretch;flex-direction:column}.agent-visuals>header .select{width:100%;min-width:0}.visual-grid,.status-grid{grid-template-columns:1fr}.status-grid article{grid-template-columns:auto minmax(0,1fr)}.status-grid strong{grid-column:2}}
</style>
