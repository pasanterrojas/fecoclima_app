<script setup lang="ts">
import type { ParcelForecast } from '~/types/plots'
const props=defineProps<{forecast:ParcelForecast;technical?:boolean}>()
const labels:Record<string,string>={temperature_avg_c:'Temperatura media',temperature_min_c:'Temperatura mínima',temperature_max_c:'Temperatura máxima',humidity_pct:'Humedad del aire',precipitation_mm:'Lluvia',wind_speed_ms:'Viento medio',evapotranspiration_mm:'Agua que perdería el suelo y el cultivo',soil_temperature_avg_c:'Temperatura del suelo',soil_moisture_pct:'Humedad del suelo estimada',soil_tension_cb:'Dificultad de las raíces para tomar agua',leaf_wetness_hours:'Tiempo con hojas mojadas estimado'}
const keys=computed(()=>Object.keys(labels).filter(key=>props.forecast.days.some(d=>d.variables?.[key])))
const active=ref('precipitation_mm')
watch(keys,list=>{if(!list.includes(active.value))active.value=list[0]||''},{immediate:true})
const format=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('es-PY',{maximumFractionDigits:1})
const date=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString('es-PY',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})
const trend=computed(()=>{
 const days=props.forecast.days, first=days[0]?.variables?.[active.value]?.value,last=days.at(-1)?.variables?.[active.value]?.value
 if(first==null||last==null)return 'Sin comparación para los tres días'
 const delta=last-first, tolerance=active.value==='humidity_pct'?3:.5
 return Math.abs(delta)<tolerance?'Se mantendría parecido':delta>0?'Iría en aumento':'Iría disminuyendo'
})
const points=computed(()=>{
 const values=props.forecast.days.map(d=>d.variables?.[active.value]?.value)
 const valid=values.filter((v):v is number=>v!=null)
 if(!valid.length)return ''
 const lo=Math.min(...valid),span=Math.max(1,Math.max(...valid)-lo)
 return values.map((v,i)=>v==null?null:`${30+i*120},${65-(v-lo)/span*45}`).filter(Boolean).join(' ')
})
</script>
<template>
 <div v-if="forecast.days.some(d=>Object.keys(d.variables||{}).length)||forecast.days.some(d=>d.precipitation_mm!=null)" class="prediction">
  <p class="forecast-origin">{{forecast.stations?.length?'Previsión para las estaciones de su parcela':'Previsión para su parcela'}} · estimada, puede cambiar.</p>
  <div class="prediction-days">
   <article v-for="day in forecast.days" :key="day.date">
    <h3>{{date(day.date)}}</h3><strong>{{format(day.temperature_min_c)}} a {{format(day.temperature_max_c)}} °C</strong>
    <p class="rain">{{format(day.variables?.precipitation_mm?.value??day.precipitation_mm)}} <small>mm de lluvia</small></p>
    <dl><template v-for="key in ['humidity_pct','wind_speed_ms']" :key="key"><template v-if="day.variables?.[key]"><dt>{{labels[key]}}</dt><dd>{{format(day.variables[key].value)}} {{day.variables[key].unit}}</dd></template></template></dl>
   </article>
  </div>
  <div v-if="keys.length" class="prediction-trend"><label>Cómo cambiaría<select v-model="active" class="select"><option v-for="key in keys" :key="key" :value="key">{{labels[key]}}</option></select></label><b>{{trend}}</b>
   <svg viewBox="0 0 300 85" role="img" :aria-label="`${labels[active]}: ${trend}`"><path d="M30 70H270" stroke="#d7e5e9"/><polyline :points="points" fill="none" stroke="#137e92" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
   <div class="trend-values"><span v-for="day in forecast.days" :key="day.date">{{format(day.variables?.[active]?.value)}} {{day.variables?.[active]?.unit}}<small>{{date(day.date)}}</small></span></div>
  </div>
  <details v-if="technical"><summary>Fuentes y cálculo de la previsión</summary><p>Open-Meteo en la ubicación de cada estación y tendencia de sus días completos. Se combinan con un peso prudente del historial; aún requiere validación con los valores observados. En suelo y hojas se conserva la referencia del modelo cuando los sensores no miden lo mismo.</p><article v-for="station in forecast.stations" :key="station.station_id"><b>{{station.name}}</b> · {{station.history_days}} días de historial · {{station.model_available?'Open-Meteo disponible':'Solo tendencia disponible'}}<pre>{{JSON.stringify(station.days,null,2)}}</pre></article></details>
 </div><p v-else>La previsión no está disponible todavía. Vuelva a analizar más tarde.</p>
</template>
<style scoped>
.prediction{display:grid;gap:16px}.forecast-origin{color:var(--fc-muted,#64748b);font-size:.85rem}.prediction-days{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.prediction-days article{padding:18px;border:1px solid #d8e7eb;border-radius:16px;background:linear-gradient(145deg,#f3fafb,#fff)}h3{font-size:.9rem;margin:0 0 12px;text-transform:capitalize}.rain{font-size:1.5rem;color:#087c99;font-weight:700;margin:14px 0}.rain small{font-size:.8rem;font-weight:400}dl{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:.8rem}dt{color:#526777}dd{margin:0;font-weight:600}.prediction-trend{border:1px solid #d8e7eb;border-radius:14px;padding:16px;max-width:600px}.prediction-trend label{display:grid;gap:8px}.prediction-trend b{display:block;margin-top:14px;font-size:.9rem}.prediction-trend svg{display:block;width:100%;height:100px}.trend-values{display:flex;justify-content:space-between;text-align:center;font-size:.85rem}.trend-values small{display:block;color:#64748b;font-size:.75rem;margin-top:5px}pre{max-height:260px;overflow:auto;white-space:pre-wrap;font-size:.75rem}@media(max-width:600px){.prediction-days{gap:6px}.prediction-days article{padding:10px}.prediction-days strong{font-size:.85rem}dl{grid-template-columns:1fr;gap:3px}.rain{font-size:1.15rem}.rain small{display:block}}
</style>
