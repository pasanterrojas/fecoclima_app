<script setup lang="ts">
import type { ParcelAnalysis } from '~/types/plots'
type Scene = NonNullable<ParcelAnalysis['context']['satellite']>
const props = defineProps<{scenes:Scene[];variant?:'modern';selectedSceneId?:string}>()
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
const points = computed(()=>ordered.value.map((scene,index)=>({id:scene.id,captured_at:scene.captured_at,value:values.value[index] ?? null})))
const change = computed(()=>{
  const valid=values.value.filter((value):value is number=>value!==null)
  return valid.length>1 ? valid[valid.length-1]! - valid[0]! : null
})
const formattedChange = computed(()=>change.value===null ? '' : `${change.value>0?'+':''}${change.value.toLocaleString('es-PY',{maximumFractionDigits:4})}`)
</script>
<template>
  <section v-if="scenes.length>1" class="spectral-history" :class="{'spectral-history--modern':variant==='modern'}" aria-label="Evolución de índices de la misma parcela">
    <div class="history-heading"><div><b>{{variant==='modern'?'Evolución de los indicadores':'Cómo ha cambiado su parcela'}}</b><p>{{variant==='modern'?'Compare las capturas del mismo polígono.':'Promedios calculados para el mismo polígono en cada fecha disponible.'}}</p></div><label>Indicador<select v-model="selected" class="select"><option v-for="name in indices" :key="name" :value="name">{{name.toUpperCase()}}</option></select></label></div>
    <div v-if="variant==='modern'" class="history-summary"><span><i aria-hidden="true" />{{scenes.length}} capturas disponibles</span><span v-if="change!==null" class="history-change"><b>{{formattedChange}}</b> entre la primera y la última</span></div>
    <div v-if="values.filter(value=>value!==null).length>1" class="history-chart"><ClientOnly><SpectralTrendChart v-if="variant==='modern'" :points="points" :indicator="selected" :selected-scene-id="selectedSceneId" /><WeatherLineChart v-else :labels="labels" :datasets="[{label:selected.toUpperCase(),data:values,borderColor:'#004481',unit:'Índice, sin unidad'}]" /></ClientOnly></div>
    <p v-else>Se necesitan dos fechas con valores válidos para mostrar la evolución de este indicador.</p>
    <details><summary>Ver fechas y valores</summary><table><thead><tr><th>Fecha</th><th>{{selected.toUpperCase()}}</th></tr></thead><tbody><tr v-for="(scene,index) in ordered" :key="scene.id"><td>{{labels[index]}}</td><td>{{values[index]?.toLocaleString('es-PY',{maximumFractionDigits:4}) ?? 'Sin dato'}}</td></tr></tbody></table></details>
  </section>
</template>
<style scoped>
.spectral-history{padding:16px;border:1px solid #d6e6ee;border-radius:14px;background:#f8fbfd;display:grid;gap:12px}.history-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}.history-heading b{color:var(--fc-primary)}.spectral-history p{margin:5px 0 0;font-size:.78rem;color:var(--fc-text-muted)}.history-heading label{display:grid;gap:5px;font-size:.75rem;min-width:130px}.history-chart{height:240px;min-width:0}.spectral-history summary{cursor:pointer;font-size:.78rem;color:var(--fc-primary)}.spectral-history table{width:100%;font-size:.78rem;text-align:left;border-collapse:collapse}.spectral-history td,.spectral-history th{padding:7px;border-bottom:1px solid #d6e6ee}
.spectral-history--modern{min-width:0;padding:22px;border-color:#dcebe7;border-radius:18px;background:linear-gradient(160deg,#fff 25%,#f3faf7);grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(240px,1fr) auto;gap:18px;box-shadow:0 5px 20px #124c4010}.spectral-history--modern .history-heading{align-items:start;flex-wrap:nowrap;gap:12px}.spectral-history--modern .history-heading b{color:#234b50;font-size:.94rem}.spectral-history--modern .history-heading p{line-height:1.5;max-width:260px}.spectral-history--modern .history-heading label{min-width:105px;color:#657f84;font-weight:600}.spectral-history--modern .history-heading select{min-height:38px;border-radius:10px;background:#f5faf8;border-color:#d6e7df;color:#196458;font-weight:800}.history-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:.72rem;color:#71898c}.history-summary>span:first-child{display:flex;align-items:center;gap:7px}.history-summary i{width:7px;height:7px;border-radius:50%;background:#12877d;box-shadow:0 0 0 4px #e3f3ed}.history-change{display:flex;align-items:center;gap:6px}.history-change b{padding:4px 7px;border-radius:6px;background:#e5f2ed;color:#24695c;font-size:.78rem;font-variant-numeric:tabular-nums}.spectral-history--modern .history-chart{height:auto;min-height:240px;position:relative}.spectral-history--modern details{padding-top:12px;border-top:1px solid #e2ece7}.spectral-history--modern summary{color:#617f7c;font-size:.73rem}@media(max-width:640px){.spectral-history--modern{padding:16px;gap:14px}.spectral-history--modern .history-heading{flex-wrap:wrap}.spectral-history--modern .history-chart{height:245px}.history-summary{align-items:start;flex-direction:column}}
</style>
