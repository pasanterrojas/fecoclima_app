<script setup lang="ts">
import { Line } from 'vue-chartjs'
import { CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps<{
  labels: string[]
  datasets: Array<{ label: string; data: Array<number | null>; borderColor?: string; backgroundColor?: string; axis?: 'left' | 'right'; unit?: string }>
}>()

const palette = ref<string[]>([])
const chartFill = ref('')

onMounted(() => {
  const styles = getComputedStyle(document.documentElement)
  palette.value = ['--fc-primary', '--fc-secondary', '--fc-warning', '--fc-success']
    .map(variable => styles.getPropertyValue(variable).trim())
  chartFill.value = styles.getPropertyValue('--fc-chart-fill').trim()
})

const data = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((dataset, index) => ({
    ...dataset,
    borderColor: dataset.borderColor || palette.value[index % Math.max(palette.value.length, 1)] || 'currentColor',
    backgroundColor: dataset.backgroundColor || chartFill.value || 'transparent',
    yAxisID: dataset.axis === 'right' ? 'yRight' : 'y',
    tension: 0.28,
    pointRadius: 1.5,
    spanGaps: false,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { position: 'bottom' as const } },
  scales: {
    x: { ticks: { maxTicksLimit: 8 } },
    y: { beginAtZero: false, title: { display: Boolean(props.datasets.find(item => item.axis !== 'right')?.unit), text: props.datasets.find(item => item.axis !== 'right')?.unit || '' } },
    ...(props.datasets.some(item => item.axis === 'right') ? { yRight: { position: 'right' as const, beginAtZero: false, grid: { drawOnChartArea: false }, title: { display: true, text: props.datasets.find(item => item.axis === 'right')?.unit || '' } } } : {})
  },
}))
</script>

<template>
  <Line :data="data" :options="options" />
</template>
