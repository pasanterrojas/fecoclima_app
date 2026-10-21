<script setup lang="ts">
import type { ParcelAnalysis } from '~/types/plots'
type Scene = NonNullable<ParcelAnalysis['context']['satellite']>
const props = defineProps<{scenes:Scene[]}>()
const selected = ref('ndvi')
const {dateOnly}=useViewerTime()
const ordered = computed(()=>[...props.scenes].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)))
const indices = computed(()=>[...new Set(ordered.value.flatMap(scene=>Object.keys(scene.indices || {})))])
watch(indices, values=>{if(!values.includes(selected.value))selected.value=values[0] || 'ndvi'})
const values = computed(()=>ordered.value.map(scene=>{
  const value=scene.indices?.[selected.value]
  return typeof value==='number' && Number.isFinite(value) ? value : null
}))
const labels = computed(()=>ordered.value.map(scene=>dateOnly(scene.captured_at)))
</script>
<template>
  <section v-if="scenes.length>1" class="spectral-history" aria-label="Evolución de índices de la misma parcela">
    <div class="history-heading"><div><b>Cómo ha cambiado su parcela</b><p>Promedios calculados para el mismo polígono en cada fecha disponible.</p></div><label>Indicador<select v-model="selected" class="select"><option v-for="name in indices" :key="name" :value="name">{{name.toUpperCase()}}</option></select></label></div>
    <div v-if="values.filter(value=>value!==null).length>1" class="history-chart"><ClientOnly><WeatherLineChart :labels="labels" :datasets="[{label:selected.toUpperCase(),data:values,borderColor:'#004481',unit:'Índice, sin unidad'}]" /></ClientOnly></div>
    <p v-else>Se necesitan dos fechas con valores válidos para mostrar la evolución de este indicador.</p>
    <details><summary>Ver fechas y valores</summary><table><thead><tr><th>Fecha</th><th>{{selected.toUpperCase()}}</th></tr></thead><tbody><tr v-for="(scene,index) in ordered" :key="scene.id"><td>{{labels[index]}}</td><td>{{values[index]?.toLocaleString('es-PY',{maximumFractionDigits:4}) ?? 'Sin dato'}}</td></tr></tbody></table></details>
  </section>
</template>
<style scoped>
.spectral-history{padding:16px;border:1px solid #d6e6ee;border-radius:14px;background:#f8fbfd;display:grid;gap:12px}.history-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}.history-heading b{color:var(--fc-primary)}.spectral-history p{margin:5px 0 0;font-size:.78rem;color:var(--fc-text-muted)}.history-heading label{display:grid;gap:5px;font-size:.75rem;min-width:130px}.history-chart{height:240px;min-width:0}.spectral-history summary{cursor:pointer;font-size:.78rem;color:var(--fc-primary)}.spectral-history table{width:100%;font-size:.78rem;text-align:left;border-collapse:collapse}.spectral-history td,.spectral-history th{padding:7px;border-bottom:1px solid #d6e6ee}
</style>
