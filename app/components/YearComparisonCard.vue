<script setup lang="ts">
import { CalendarRange, TrendingDown, TrendingUp } from 'lucide-vue-next'
import type { YearComparison } from '~/types/api'

const props = withDefaults(defineProps<{
  data?: YearComparison | null
}>(), {
  data: null,
})

const metrics = [
  { key: 'temperature_c', label: 'Temperatura', unit: '°C', statistic: 'mean', delta: 'temperature_mean_c' },
  { key: 'humidity_pct', label: 'Humedad relativa', unit: '%', statistic: 'mean', delta: 'humidity_mean_pct' },
  { key: 'rain_mm', label: 'Lluvia acumulada', unit: 'mm', statistic: 'sum', delta: 'rain_sum_mm' },
  { key: 'soil_moisture_pct', label: 'Humedad de suelo', unit: '%', statistic: 'mean', delta: 'soil_moisture_mean_pct' },
  { key: 'evapotranspiration_mm', label: 'Evapotranspiración', unit: 'mm', statistic: 'sum', delta: 'evapotranspiration_sum_mm' },
] as const

const selectedKey = ref<(typeof metrics)[number]['key']>('temperature_c')
const selectedMetric = computed(() => metrics.find(metric => metric.key === selectedKey.value) || metrics[0])

function labels(period: 'current' | 'previous_year'): string[] {
  return (props.data?.[period].series || []).map(item => new Date(String(item.sampled_at)).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }))
}

function values(period: 'current' | 'previous_year'): Array<number | null> {
  return (props.data?.[period].series || []).map(item => {
    const value = item[selectedMetric.value.key]
    return value == null ? null : Number(value)
  })
}

const currentLabels = computed(() => labels('current'))
const previousLabels = computed(() => labels('previous_year'))
const currentDatasets = computed(() => [{ label: `${selectedMetric.value.label} · periodo actual`, data: values('current') }])
const previousDatasets = computed(() => [{ label: `${selectedMetric.value.label} · año anterior`, data: values('previous_year') }])
const currentSummaryValue = computed(() => props.data?.current.summary?.[selectedMetric.value.key]?.[selectedMetric.value.statistic] ?? null)
const previousSummaryValue = computed(() => props.data?.previous_year.summary?.[selectedMetric.value.key]?.[selectedMetric.value.statistic] ?? null)
const deltaValue = computed(() => props.data?.deltas?.[selectedMetric.value.delta] ?? null)
const comparable = computed(() => props.data?.comparability?.status === 'comparable')

function formatValue(value: number | null | undefined, signed = false): string {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const numeric = Number(value)
  const prefix = signed && numeric > 0 ? '+' : ''
  return `${prefix}${numeric.toLocaleString('es-PY', { maximumFractionDigits: 2 })} ${selectedMetric.value.unit}`
}

function periodLabel(period: 'current' | 'previous_year'): string {
  const row = props.data?.[period]
  if (!row) return 'Sin periodo'
  const from = new Date(row.from).toLocaleString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const to = new Date(row.to).toLocaleString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${from} → ${to}`
}
</script>

<template>
  <article class="card comparison-card">
    <div class="card-body">
      <header class="comparison-head">
        <div class="heading">
          <span class="icon"><CalendarRange /></span>
          <div>
            <span class="eyebrow">Comportamiento histórico equivalente</span>
            <h3>Periodo actual vs. el mismo periodo del año anterior</h3>
            <p>La comparación se ancla a la última lectura disponible de la estación, incluso cuando el proveedor está retrasado.</p>
          </div>
        </div>
        <div class="head-actions">
          <label><span class="label">Variable</span><select v-model="selectedKey" class="select"><option v-for="metric in metrics" :key="metric.key" :value="metric.key">{{ metric.label }}</option></select></label>
        </div>
      </header>

      <template v-if="data">
        <div class="comparison-status">
          <span class="badge" :class="comparable ? 'badge-success' : 'badge-warning'">{{ comparable ? 'Periodos comparables' : 'Cobertura insuficiente' }}</span>
          <span>Actual: {{ data.current.coverage_pct }}% de cobertura</span>
          <span>Año anterior: {{ data.previous_year.coverage_pct }}% de cobertura</span>
        </div>

        <div class="summary-grid">
          <div><span>Actual · {{ selectedMetric.statistic === 'sum' ? 'acumulado' : 'promedio' }}</span><b>{{ formatValue(currentSummaryValue) }}</b></div>
          <div><span>Año anterior · {{ selectedMetric.statistic === 'sum' ? 'acumulado' : 'promedio' }}</span><b>{{ formatValue(previousSummaryValue) }}</b></div>
          <div class="delta" :class="deltaValue != null && deltaValue < 0 ? 'negative' : 'positive'">
            <span>Diferencia</span>
            <b><TrendingDown v-if="deltaValue != null && deltaValue < 0" /><TrendingUp v-else />{{ formatValue(deltaValue, true) }}</b>
          </div>
        </div>

        <div class="chart-grid">
          <section class="comparison-chart">
            <div><h4>Periodo actual</h4><small>{{ periodLabel('current') }}</small></div>
            <div v-if="currentLabels.length" class="chart"><WeatherLineChart :labels="currentLabels" :datasets="currentDatasets" /></div>
            <EmptyState v-else title="Sin serie actual" message="No hay suficientes lecturas para graficar este periodo." />
          </section>
          <section class="comparison-chart">
            <div><h4>Mismo periodo del año anterior</h4><small>{{ periodLabel('previous_year') }}</small></div>
            <div v-if="previousLabels.length" class="chart"><WeatherLineChart :labels="previousLabels" :datasets="previousDatasets" /></div>
            <EmptyState v-else title="Sin serie histórica" message="No hay suficientes lecturas guardadas para el periodo equivalente." />
          </section>
        </div>

        <div v-if="data.comparability.notes?.length" class="notice comparison-notes"><b>Condiciones de lectura:</b><span v-for="note in data.comparability.notes" :key="note">{{ note }}</span></div>
      </template>

      <EmptyState v-else title="Comparación no disponible" message="Ejecute el análisis para consultar el periodo actual y su equivalente del año anterior." />
    </div>
  </article>
</template>

<style scoped>
.comparison-card{overflow:hidden}.comparison-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.heading{display:flex;align-items:flex-start;gap:12px}.icon{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:14px;background:#e7f3fa;color:var(--fc-primary)}.icon svg{width:25px}.eyebrow{display:block;margin-bottom:3px;color:var(--fc-secondary);font-size:.74rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h3,h4,p{margin:0}h3,h4{color:var(--fc-primary)}.heading p{margin-top:5px;color:var(--fc-text-muted);font-size:.85rem}.head-actions{display:flex;align-items:flex-end;min-width:260px}.head-actions label{width:100%}.comparison-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:18px;color:var(--fc-text-muted);font-size:.8rem}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.summary-grid>div{padding:13px;border:1px solid var(--fc-border);border-radius:11px;background:var(--fc-surface-muted)}.summary-grid span{display:block;color:var(--fc-text-muted);font-size:.73rem}.summary-grid b{display:flex;align-items:center;gap:6px;margin-top:5px;color:var(--fc-primary);font-size:1.15rem}.summary-grid svg{width:18px}.summary-grid .negative b{color:var(--fc-danger)}.summary-grid .positive b{color:var(--fc-success)}.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:15px}.comparison-chart{min-width:0;padding:15px;border:1px solid var(--fc-border);border-radius:13px;background:#fff}.comparison-chart small{display:block;margin-top:4px;color:var(--fc-text-muted);font-size:.74rem}.chart{height:300px;margin-top:10px}.comparison-notes{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:14px}.comparison-notes b{width:100%}.comparison-notes span{font-size:.8rem}@media(max-width:950px){.comparison-head{flex-direction:column}.head-actions{width:100%;min-width:0}.chart-grid{grid-template-columns:1fr}}@media(max-width:620px){.summary-grid{grid-template-columns:1fr}.head-actions{align-items:stretch;flex-direction:column}.heading{flex-direction:column}.chart{height:260px}}
</style>
