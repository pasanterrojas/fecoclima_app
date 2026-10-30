<script setup lang="ts">
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip, type ChartData, type ChartOptions } from 'chart.js'

ChartJS.register(LinearScale, LineElement, PointElement, Tooltip, Filler)
const props = defineProps<{
  points: { id: string; captured_at: string; value: number | null }[]
  indicator: string
  selectedSceneId?: string
}>()
const { dateOnly } = useViewerTime()
const valid = computed(() => props.points.filter((point): point is typeof point & { value: number } =>
  point.value !== null && Number.isFinite(point.value) && Number.isFinite(Date.parse(point.captured_at))))
const number = (value: number) => value.toLocaleString('es-PY', { maximumFractionDigits: 4 })
const date = (value: number) => dateOnly(new Date(value).toISOString())
const data = computed<ChartData<'line', { x: number; y: number }[]>>(() => ({
  datasets: [{
    label: props.indicator.toUpperCase(),
    data: valid.value.map(point => ({ x: Date.parse(point.captured_at), y: point.value })),
    borderColor: '#12877d', borderWidth: 3, fill: 'origin', clip: false,
    // Straight segments preserve the measured values between these few captures.
    tension: 0,
    pointRadius: valid.value.map(point => point.id === props.selectedSceneId ? 6 : 4),
    pointHoverRadius: 8, pointHitRadius: 22,
    pointBackgroundColor: valid.value.map(point => point.id === props.selectedSceneId ? '#12877d' : '#fff'),
    pointBorderColor: '#12877d', pointBorderWidth: 2,
    backgroundColor: ({ chart }) => {
      const area = chart.chartArea
      if (!area) return 'rgba(18,135,125,.08)'
      const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
      gradient.addColorStop(0, 'rgba(18,135,125,.24)')
      gradient.addColorStop(1, 'rgba(18,135,125,.015)')
      return gradient
    },
  }],
}))
const options = computed<ChartOptions<'line'>>(() => ({
  responsive: true, maintainAspectRatio: false,
  animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 },
  layout: { padding: { top: 14, right: 18, left: 3, bottom: 2 } },
  interaction: { mode: 'nearest', intersect: false, axis: 'x' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#123c43', titleColor: '#fff', bodyColor: '#d8f4ef',
      padding: 12, cornerRadius: 12, displayColors: false,
      callbacks: {
        title: items => {
          const captured = items[0]?.parsed.x
          return typeof captured === 'number' ? date(captured) : ''
        },
        label: item => `${props.indicator.toUpperCase()}  ${item.parsed.y === null ? 'Sin dato' : number(item.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      type: 'linear', offset: false,
      min: valid.value[0] ? Date.parse(valid.value[0].captured_at) : undefined,
      max: valid.value.at(-1) ? Date.parse(valid.value.at(-1)!.captured_at) : undefined,
      afterBuildTicks: scale => { scale.ticks = valid.value.map(point => ({ value: Date.parse(point.captured_at) })) },
      border: { display: false }, grid: { display: false },
      ticks: { color: '#6b8790', font: { size: 11 }, padding: 12, maxRotation: 0, autoSkip: true,
        callback: value => date(Number(value)) },
    },
    y: {
      beginAtZero: false, grace: '18%', border: { display: false },
      grid: { color: 'rgba(113,145,150,.12)', drawTicks: false },
      ticks: { color: '#789099', maxTicksLimit: 5, padding: 10, font: { size: 11 }, callback: value => number(Number(value)) },
    },
  },
}))
</script>
<template>
  <div class="trend-canvas"><Line :data="data" :options="options" role="img" :aria-label="`Evolución de ${indicator.toUpperCase()} en ${valid.length} fechas de captura. Consulte las fechas y valores debajo del gráfico.`" /></div>
</template>
<style scoped>
.trend-canvas{position:absolute;inset:0;min-width:0;min-height:0}.trend-canvas :deep(canvas){display:block;max-width:100%}
</style>
