<script setup lang="ts">
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'vue-chartjs'
import type { Interpretation, StageWaterTotal, WaterBalance } from '~/types/plots'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)
const props = defineProps<{ balance: WaterBalance; cropCode?: string; stageCode?: string | null; criterion?: Interpretation; technical?: boolean; timeline?: { code: string; name: string; estimated_end_date: string }[] }>()
const stationId = ref('')
const station = computed(() => props.balance.stations.find(s => s.station_id === stationId.value) || props.balance.stations[0])
const code = computed(() => props.stageCode || props.balance.current_stage_code || station.value?.days.at(-1)?.stage_code || '')
const soy = computed(() => (props.cropCode || props.balance.crop_code) === 'SOJA')
const format = (value: number | null | undefined, suffix = '') => value == null ? 'Sin registro comparable' : `${value.toLocaleString('es-PY', { maximumFractionDigits: 1 })}${suffix}`
// Older snapshots keep their original evidence. Group their saved days without filling gaps.
const totals = computed<StageWaterTotal[]>(() => {
  if (station.value?.stage_totals) return station.value.stage_totals
  const groups = new Map<string, WaterBalance['stations'][number]['days']>()
  for (const day of station.value?.days || []) {
    if (!day.stage_code) continue
    groups.set(day.stage_code, [...(groups.get(day.stage_code) || []), day])
  }
  return [...groups].map(([stage, days]) => {
    const closed = days.filter(d => d.closed_day !== false)
    const paired = closed.filter(d => d.rain_minus_requirement_mm != null && d.required_mm != null && d.rain_mm != null)
    const rain = paired.length ? paired.reduce((sum, d) => sum + d.rain_mm!, 0) : null
    const required = paired.length ? paired.reduce((sum, d) => sum + d.required_mm!, 0) : null
    return { stage_code: stage, stage_name: stage, closed_days: closed.length, compared_days: paired.length,
      required_elapsed_mm: closed.length && closed.every(d => d.required_mm != null) ? closed.reduce((sum, d) => sum + d.required_mm!, 0) : null,
      required_compared_mm: required, rain_compared_mm: rain, rain_complete_mm: paired.length === closed.length ? rain : null,
      gap_compared_mm: rain == null || required == null ? null : rain - required,
      reference_pct: stage === code.value ? props.balance.susceptibility.reference_pct : null }
  })
})
const current = computed(() => totals.value.find(s => s.stage_code === code.value))
const visibleStages = computed(() => totals.value.filter(s => s.stage_code !== 'SIEMBRA'))
const label = (stage: string) => stage.replace(/-/g, ' a ')
const endDate = (stage: string) => { const value = props.timeline?.find(s => s.code === stage)?.estimated_end_date; return value ? value.split('-').reverse().join('/') : '' }
const planned = (stage: StageWaterTotal) => stage.required_stage_mm ?? stage.required_elapsed_mm
const future = (stage: StageWaterTotal) => stage.closed_days === 0 && stage.stage_code !== code.value
const gap = computed(() => current.value?.gap_compared_mm ?? null)
function stageIllustration(stageCode: string) {
  if (!soy.value) return null
  const stages: Record<string, { image: number; box: string; label: string }> = {
    V1: { image: 6, box: '215 320 220 300', label: 'Primeras hojas · V1' },
    'V2-V4': { image: 6, box: '840 315 260 305', label: 'Desarrollo vegetativo · V3 como referencia' },
    'V5-V8': { image: 7, box: '855 300 290 320', label: 'Desarrollo vegetativo · V6 como referencia' },
    V9: { image: 7, box: '855 300 290 320', label: 'Referencia de desarrollo vegetativo · V6' },
    R1: { image: 8, box: '270 295 275 325', label: 'Inicio de floración · R1' },
    R3: { image: 8, box: '770 295 250 325', label: 'Formación de vainas · R3' },
    R5: { image: 10, box: '515 295 270 325', label: 'Llenado de granos · R5' },
    R7: { image: 11, box: '580 295 285 330', label: 'Inicio de maduración · R7' },
    R8: { image: 11, box: '850 295 245 330', label: 'Maduración plena · R8' },
  }
  return stages[stageCode] || null
}
const chart = computed(() => ({
  labels: visibleStages.value.map(s => label(s.stage_code)),
  datasets: [
    { label: 'Lluvia requerida', data: visibleStages.value.map(planned), borderColor: '#ff3024', backgroundColor: 'rgba(255, 48, 36, .19)', fill: 'origin', spanGaps: false, pointRadius: 3, pointBackgroundColor: '#ff3024', pointBorderColor: '#fff', borderWidth: 2, cubicInterpolationMode: 'monotone' as const, tension: .35 },
    { label: 'Lluvia acontecida', data: visibleStages.value.map(s => future(s) ? null : s.rain_compared_mm), borderColor: '#008d22', backgroundColor: 'rgba(0, 141, 34, .19)', fill: 'origin', spanGaps: false, pointRadius: 3, pointBackgroundColor: '#008d22', pointBorderColor: '#fff', borderWidth: 2, cubicInterpolationMode: 'monotone' as const, tension: .35 },
  ],
}))
const options = { responsive: true, maintainAspectRatio: false, animation: false as const, interaction: { mode: 'index' as const, intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: 'mm de lluvia' } }, x: { title: { display: true, text: 'Estados fenológicos' } } }, plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { afterBody: (items: { dataIndex: number }[]) => { const stage = visibleStages.value[items[0]?.dataIndex ?? -1]; return stage ? `${stage.compared_days} de ${stage.closed_days} días completos con lluvia comparable` : '' } } } } }
</script>

<template>
  <section class="water-balance" aria-label="Requerimiento de agua y lluvia registrada">
    <label v-if="balance.stations.length > 1" class="station-select"><span class="label">Estación</span><select v-model="stationId" class="select"><option value="">{{ balance.stations[0]?.name }}</option><option v-for="row in balance.stations.slice(1)" :key="row.station_id" :value="row.station_id">{{ row.name }}</option></select></label>
    <h3>Gráfico de lluvias</h3>
    <div class="rain-scroll" tabindex="0" aria-label="Gráfico y etapas del cultivo; deslice para ver el ciclo">
      <div class="rain-cycle" :style="{ minWidth: `${Math.max(620, visibleStages.length * 140)}px` }">
        <div class="water-chart"><Line :data="chart" :options="options" aria-label="Área roja: lluvia requerida por etapa. Área verde: lluvia acontecida hasta el análisis." /></div>
        <div class="stage-cards" :style="{ gridTemplateColumns: `repeat(${Math.max(1, visibleStages.length)}, minmax(0, 1fr))` }">
          <article v-for="stage in visibleStages" :key="stage.stage_code" class="stage-card" :class="{ current: stage.stage_code === code, future: future(stage) }" :aria-current="stage.stage_code === code ? 'step' : undefined">
            <h4>{{ label(stage.stage_code) }}<small v-if="stage.stage_code === code">Etapa actual</small></h4>
            <div class="stage-illustration">
              <svg v-if="stageIllustration(stage.stage_code)" :viewBox="stageIllustration(stage.stage_code)!.box" role="img" :aria-label="stageIllustration(stage.stage_code)!.label"><image :href="`/references/soy-phenology/stage-reference-${stageIllustration(stage.stage_code)!.image}.png`" width="1366" height="768" /></svg>
              <span v-else class="stage-placeholder">{{ label(stage.stage_code) }}</span>
            </div>
            <p v-if="endDate(stage.stage_code)">Hasta el <b>{{ endDate(stage.stage_code) }}</b></p>
            <p class="required"><b>{{ planned(stage) == null ? 'Sin referencia' : format(planned(stage), ' mm') }}</b> de lluvia requerida</p>
            <p class="recorded"><b>{{ future(stage) ? 'Aún no transcurrida' : stage.rain_compared_mm == null ? 'Sin registro comparable' : format(stage.rain_compared_mm, ' mm') }}</b><span v-if="!future(stage)"> de lluvia acontecida</span></p>
            <small v-if="!future(stage)">{{ stage.compared_days }} de {{ stage.closed_days }} días completos registrados</small>
            <p v-if="stage.reference_pct != null" class="stress-reference" :class="{ high: stage.reference_pct === 40 }"><b>{{ stage.reference_pct }}%</b> de reducción potencial bajo estrés*</p>
          </article>
        </div>
      </div>
    </div>
    <p v-if="visibleStages.some(stage=>stage.reference_pct!=null)" class="stress-note">* Referencia de reducción potencial bajo estrés; no es daño observado ni pérdida medida en esta parcela.</p>
    <div class="agronomic-criterion"><ParcelInterpretation v-if="criterion" :result="criterion" :technical="technical" hide-completed-label /><p v-else>{{ gap != null && gap < 0 ? 'En los días comparables de la etapa actual, la lluvia quedó por debajo del requerimiento. Revise la humedad en raíces y el riego aplicado.' : gap != null ? 'La lluvia cubre la referencia de los días comparables de la etapa actual. Confirme en campo que el agua esté disponible para las raíces.' : 'La curva roja muestra el agua requerida a lo largo del ciclo. La verde se completa con los registros disponibles de la estación; aún falta lluvia comparable en la etapa actual.' }}</p></div>

  </section>
</template>
<style scoped>
.water-balance{display:grid;gap:16px;min-width:0;margin-top:18px;padding:18px;border:1px solid #d8e5eb;border-radius:15px;background:linear-gradient(#fafdff,#e1eef5)}.water-balance h3{margin:0;text-align:center;font-size:1.2rem;font-weight:500}.rain-scroll{overflow-x:auto;max-width:100%;border-radius:10px}.rain-scroll:focus-visible{outline:2px solid #287db3}.water-chart{height:340px;position:relative;padding:0 10px}.stage-cards{display:grid;margin:22px 12px 0 50px}.stage-card{padding:10px;border-right:1px solid #cfdee6;font-size:.75rem;min-width:0}.stage-card:last-child{border:0}.stage-card.current{background:#ffffffb3;box-shadow:inset 0 3px #247f9b;border-radius:7px}.stage-card h4{text-align:center;min-height:38px;margin:0 0 9px;font-size:.85rem}.stage-card h4 small{display:block;color:#247b95;font-size:.67rem;margin-top:4px}.stage-illustration{height:135px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}.stage-illustration svg{height:135px;max-width:100%;border:4px solid #fff;border-radius:5px}.stage-placeholder{color:#8da8af;font-size:1.4rem}.stage-card p{line-height:1.55;margin:8px 0}.stage-card>small{display:block;color:#5e7481;font-size:.66rem}.stage-card .required b{color:#cf382c}.stage-card .recorded b{color:#14813a}.stage-card.future .recorded b{color:#708594}.stress-reference b{color:#a27817}.stress-reference.high b{color:#c53c30}.water-period,.water-balance>small{font-size:.75rem;line-height:1.6;color:#587080;margin:0}.agronomic-criterion{padding:13px 16px;background:#ffffffb0;border-left:3px solid #408c70;border-radius:0 9px 9px 0}.agronomic-criterion h4{margin:0 0 9px;color:var(--fc-primary);font-size:.88rem}.agronomic-criterion p{font-size:.85rem;line-height:1.6;margin:0}.water-balance details{font-size:.78rem;line-height:1.6}.water-balance summary{cursor:pointer;font-weight:600}.station-select{max-width:350px}@media(max-width:650px){.water-balance{padding:12px}.water-chart{height:280px}.stage-card{padding:8px}}
</style>
