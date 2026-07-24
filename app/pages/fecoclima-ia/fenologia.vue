<script setup lang="ts">
import { RotateCcw, Search, Sprout } from 'lucide-vue-next'
import type { Crop, Recommendation, Station } from '~/types/api'

useSeoMeta({ title: 'Fenología' })
const { request } = useApi()
const stations = ref<Station[]>([])
const crops = ref<Crop[]>([])
const form = reactive({ station_id: '', crop_code: 'SOJA', cycle_type: 'normal', planting_date: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10) })
const result = ref<any>(null)
const loading = ref(false)
const error = ref('')
const agentError = ref('')
const today = new Date().toISOString().slice(0, 10)

onMounted(async () => {
  [stations.value, crops.value] = await Promise.all([request('/public/stations'), request('/public/crops')])
  if (stations.value[0]) form.station_id = stations.value[0].id
  if (!crops.value.some(item => item.code === form.crop_code) && crops.value[0]) form.crop_code = crops.value[0].code
})

async function calculate(force = false) {
  loading.value = true; error.value = ''; agentError.value = ''
  try {
    result.value = await request('/public/agent/phenology', {
      method: 'POST',
      body: { ...form, force }
    })
  } catch (e: any) {
    error.value = e?.data?.detail || e?.message || 'No se pudo calcular la fenología.'
  } finally { loading.value = false }
}
function reset() {
  form.station_id = stations.value[0]?.id || ''
  form.crop_code = crops.value[0]?.code || 'SOJA'
  form.cycle_type = 'normal'
  form.planting_date = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  result.value = null
}
const stage = computed(() => result.value?.phenology)
const environment = computed(() => result.value?.environment_since_planting?.overall || {})
const cropName = computed(() => crops.value.find(item => item.code === form.crop_code)?.name || form.crop_code)
</script>

<template>
  <div class="page phenology-page"><div class="container">
    <div class="phenology-title"><Sprout/><h1 class="page-title">Fenología y ambiente acumulado</h1><p class="page-subtitle">La etapa estimada y un criterio breve sobre lo ocurrido desde la siembra.</p></div>
    <form class="phenology-form card" @submit.prevent="calculate(false)"><div class="card-body form-grid">
      <label><span class="label">Estación</span><select v-model="form.station_id" class="select" required><option value="">Seleccione</option><option v-for="s in stations" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
      <label><span class="label">Cultivo</span><select v-model="form.crop_code" class="select"><option v-for="c in crops" :key="c.id" :value="c.code">{{ c.name }}</option></select></label>
      <label><span class="label">Tipo de ciclo</span><select v-model="form.cycle_type" class="select"><option value="corto">Corto</option><option value="normal">Normal</option><option value="largo">Largo</option></select></label>
      <label><span class="label">Fecha de siembra</span><input v-model="form.planting_date" class="input" type="date" :max="today" required></label>
    </div><div class="actions"><button type="submit" class="btn btn-secondary" :disabled="loading"><Search/>{{ loading ? 'Sincronizando y analizando…' : 'Analizar desde la siembra' }}</button><button type="button" class="btn btn-primary" @click="reset"><RotateCcw/>Limpiar</button></div></form>
    <ErrorState v-if="error" :message="error" @retry="calculate(false)" />
    <LoadingState v-else-if="loading && !result" />

    <template v-if="result && stage">
      <section class="result card"><div class="card-body">
        <div class="row-between"><div><span class="badge badge-info">Día {{ stage.days_after_planting }}</span><h2>{{ stage.stage_name }}</h2><p>{{ stage.description }}</p></div><div class="stage-code">{{ stage.stage_code }}</div></div>
        <hr class="divider"><h3>Calendario estimado</h3><div class="timeline"><div v-for="item in stage.timeline" :key="item.code" class="timeline-item" :class="{ active: item.code === stage.stage_code }"><b>{{ item.code }}</b><span>{{ item.name }}</span><small>{{ item.estimated_start_date }} – {{ item.estimated_end_date }}</small></div></div>
      </div></section>

      <section class="environment card"><div class="card-body"><h2>Resumen ambiental desde la siembra</h2><div class="environment-grid">
        <div><span>Temperatura media</span><b>{{ environment.temperature_c?.mean ?? '—' }} °C</b></div>
        <div><span>Humedad media</span><b>{{ environment.humidity_pct?.mean ?? '—' }} %</b></div>
        <div><span>Lluvia acumulada</span><b>{{ environment.rain_total_mm ?? '—' }} mm</b></div>
        <div><span>Días con lluvia</span><b>{{ environment.rainy_days ?? '—' }}</b></div>
        <div><span>Mojado foliar acumulado</span><b>{{ environment.leaf_wetness_total_hours ?? '—' }} h</b></div>
        <div><span>Completitud media</span><b>{{ environment.completeness_pct?.mean ?? '—' }} %</b></div>
      </div></div></section>

      <section class="agent-section"><AgentInsightCard :crop-name="cropName" :recommendation="result.recommendation as Recommendation" :loading="loading" :error="agentError" @refresh="calculate(true)" /></section>
      <p class="notice notice-warning small">La etapa es una estimación temporal. El criterio IA usa los datos ambientales disponibles desde la siembra, pero debe contrastarse con observación de campo.</p>
    </template>
  </div></div>
</template>

<style scoped>.phenology-page{background:linear-gradient(#fff 0,#eef7fc 45%,var(--fc-bg) 100%)}.phenology-title{text-align:center;margin-bottom:18px}.phenology-title>svg{width:52px;height:52px;color:var(--fc-primary)}.phenology-form,.result,.environment,.agent-section,.small{max-width:1100px;margin-left:auto;margin-right:auto}.actions{display:flex;justify-content:center;gap:8px;padding:0 22px 22px}.actions svg{width:18px}.result{margin-top:25px}.result h2,.environment h2{margin:10px 0 5px;color:var(--fc-primary)}.result p{color:var(--fc-text-muted)}.stage-code{width:90px;height:90px;display:grid;place-items:center;border-radius:50%;background:var(--fc-primary);color:#fff;font-size:1.7rem;font-weight:900}.timeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:15px 0 4px}.timeline-item{padding:13px;border:1px solid var(--fc-border);border-radius:10px;background:var(--fc-surface-muted)}.timeline-item.active{color:#fff;background:var(--fc-primary);border-color:var(--fc-primary)}.timeline-item b,.timeline-item span,.timeline-item small{display:block}.timeline-item span{margin:4px 0;font-size:.84rem}.timeline-item small{opacity:.75}.environment{margin-top:18px}.environment-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.environment-grid>div{padding:14px;border-radius:11px;background:var(--fc-surface-muted)}.environment-grid span,.environment-grid b{display:block}.environment-grid span{color:var(--fc-text-muted);font-size:.78rem}.environment-grid b{margin-top:4px;color:var(--fc-primary)}.agent-section{margin-top:18px}.small{margin-top:16px}@media(max-width:700px){.actions{flex-direction:column}.actions .btn{width:100%}.environment-grid{grid-template-columns:1fr 1fr}.stage-code{width:70px;height:70px}}@media(max-width:480px){.environment-grid{grid-template-columns:1fr}}
</style>
