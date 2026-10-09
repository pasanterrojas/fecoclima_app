<script setup lang="ts">
import { CloudSun } from 'lucide-vue-next'
import type { DashboardResponse, MetricValue } from '~/types/api'

const props = defineProps<{ dashboard: DashboardResponse; period: string; disabled?: boolean }>()
const names: Record<string, string> = {
  temperature: 'Temperatura', humidity: 'Humedad del aire', rain: 'Lluvia reciente',
  wind: 'Viento', soil_moisture: 'Humedad del suelo',
}
const readings = computed(() => props.dashboard.metrics.filter(metric => {
  if (!(metric.key in names)) return false
  if (metric.key === 'soil_moisture' && metric.unit !== '%') return false
  return metric.value !== null
}))
function value(metric: MetricValue) {
  const number = Number(metric.value)
  return Number.isFinite(number) ? number.toLocaleString('es-PY', { maximumFractionDigits: 1 }) : String(metric.value)
}
const time = computed(() => props.dashboard.latest_reading_at
  ? new Date(props.dashboard.latest_reading_at).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })
  : '')
</script>

<template>
  <section class="card producer-weather">
    <div class="card-body">
      <header class="weather-heading"><CloudSun aria-hidden="true" /><div><h2>Así estuvo el tiempo en {{ dashboard.station.name }}</h2><p v-if="time">Última lectura: {{ time }}</p></div></header>
      <p v-if="dashboard.connection_status !== 'online'" class="notice notice-warning">{{ dashboard.latest_reading_at ? 'La estación no ha enviado lecturas recientes. Revise la fecha antes de tomar una decisión.' : 'Esta estación todavía no tiene lecturas disponibles.' }}</p>
      <div v-if="readings.length" class="reading-grid">
        <div v-for="metric in readings" :key="metric.key" class="reading">
          <span>{{ names[metric.key] || metric.label }}</span>
          <div class="reading-value"><strong>{{ value(metric) }} <small>{{ metric.unit }}</small></strong><WidgetExplanation :alert-id="dashboard.alert.evaluation_id" :period="period" widget="metric" :item-key="metric.key" :disabled="disabled" /></div>
        </div>
      </div>
      <p v-else class="empty">Cuando haya una lectura, la encontrará aquí.</p>
    </div>
  </section>
</template>

<style scoped>
.weather-heading{display:flex;gap:12px;align-items:center;margin-bottom:18px}.weather-heading>svg{width:36px;height:36px;color:var(--fc-primary);flex:0 0 auto}h2{margin:0;color:var(--fc-primary);font-size:1.3rem;line-height:1.3}.weather-heading p{margin:4px 0 0;color:var(--fc-text-muted)}.producer-weather .notice{margin-bottom:16px}.reading-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,205px),1fr));gap:12px}.reading{display:flex;flex-direction:column;gap:6px;padding:15px;border:1px solid var(--fc-border);border-radius:14px;background:var(--fc-surface-muted)}.reading>span{color:var(--fc-text-muted)}.reading-value{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--fc-primary)}.reading-value strong{font-size:1.4rem;white-space:nowrap}.reading-value small{font-size:.8rem}.empty{margin:0;color:var(--fc-text-muted)}@media(max-width:620px){.reading-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.reading{padding:12px}.reading-value strong{font-size:1.2rem}}@media(max-width:360px){.reading-grid{grid-template-columns:1fr}}
</style>
