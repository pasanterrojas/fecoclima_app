<script setup lang="ts">
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CloudRain, Compass, Droplets, Gauge, Leaf, MapPin, Radio, Sun, Thermometer, Waves, Wind } from 'lucide-vue-next'
import type { Influence, ParcelAnalysis } from '~/types/plots'

type Observation = ParcelAnalysis['context']['raw_readings'][number]
const props = defineProps<{observation:Observation;influence?:Influence;stale?:boolean;technical?:boolean}>()
const track=ref<HTMLElement>()
const {dateTime:date,zoneLabel}=useViewerTime()
const metrics=computed(()=>[
 {key:'temperature_c',label:'Temperatura',unit:'°C',icon:Thermometer,color:'coral'},
 {key:'humidity_pct',label:'Humedad del aire',unit:'%',icon:Droplets,color:'blue'},
 {key:'rain_mm',label:'Lluvia',unit:'mm',icon:CloudRain,color:'blue'},
 {key:'soil_moisture_pct',label:props.observation.sensor_units?.soil_moisture_pct==='cb'?'Tensión del suelo':'Humedad del suelo',unit:props.observation.sensor_units?.soil_moisture_pct || '%',icon:Waves,color:'mint'},
 {key:'soil_temperature_c',label:'Temperatura del suelo',unit:'°C',icon:Thermometer,color:'earth'},
 {key:'wind_speed_ms',label:'Velocidad del viento',unit:'m/s',icon:Wind,color:'teal'},
 {key:'wind_gust_ms',label:'Ráfaga de viento',unit:'m/s',icon:Wind,color:'teal'},
 {key:'wind_direction_deg',label:'Dirección del viento',unit:'°',icon:Compass,color:'teal'},
 {key:'feels_like_c',label:'Sensación térmica',unit:'°C',icon:Thermometer,color:'coral'},
 {key:'heat_index_c',label:'Índice de calor',unit:'°C',icon:Sun,color:'amber'},
 {key:'dew_point_c',label:'Punto de rocío',unit:'°C',icon:Droplets,color:'blue'},
 {key:'pressure_hpa',label:'Presión atmosférica',unit:'hPa',icon:Gauge,color:'violet'},
 {key:'solar_wm2',label:'Radiación solar',unit:'W/m²',icon:Sun,color:'amber'},
 {key:'uv_index',label:'Índice UV',unit:'',icon:Sun,color:'amber'},
 {key:'evapotranspiration_mm',label:'Evapotranspiración',unit:'mm',icon:Leaf,color:'mint'},
 {key:'total_rain_mm',label:'Lluvia acumulada',unit:'mm',icon:CloudRain,color:'blue'},
 {key:'min_temperature_c',label:'Temperatura mínima',unit:'°C',icon:ArrowDown,color:'blue',at:'min_temperature_at'},
 {key:'max_temperature_c',label:'Temperatura máxima',unit:'°C',icon:ArrowUp,color:'coral',at:'max_temperature_at'},
 {key:'leaf_sensor_value',label:'Sensor de hoja',unit:props.observation.sensor_units?.leaf_sensor_value || 'señal',icon:Leaf,color:'mint'},
])
// Show only fields the provider actually reports. Optional sensors are not 'missing' alerts.
const reportedMetrics = computed(() => metrics.value.filter(metric => props.observation.reading?.[metric.key] !== null && props.observation.reading?.[metric.key] !== undefined && props.observation.reading?.[metric.key] !== '' && Number.isFinite(Number(props.observation.reading?.[metric.key]))))
function number(value:unknown):string{
 if(value===null || value===undefined || value==='')return 'Sin dato'
 const parsed=Number(value)
 return Number.isFinite(parsed) ? parsed.toLocaleString('es-PY',{maximumFractionDigits:3}) : 'Sin dato'
}
function scroll(direction:number){track.value?.scrollBy({left:direction*track.value.clientWidth*0.8,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
</script>
<template>
 <article class="station-readings" :data-station-id="observation.station_id">
  <header class="station-heading"><div class="station-identity"><span class="station-mark"><Radio aria-hidden="true" /></span><div><h3>{{ observation.name }}</h3><p>{{ date(observation.reading?.sampled_at) }} <span>· Última lectura disponible</span></p><small class="reading-timezone">{{ zoneLabel }}</small></div></div><div class="station-chips"><span v-if="influence?.distance_m != null"><MapPin aria-hidden="true" />{{ influence.distance_m < 1000 ? `${number(influence.distance_m)} m` : `${number(influence.distance_m / 1000)} km` }} de referencia</span><span v-if="influence?.coverage_pct != null">{{ number(influence.coverage_pct) }}% de cobertura</span><span v-if="stale" class="stale">Lectura atrasada</span></div></header>
  <template v-if="observation.reading">

   <div class="readings-navigation"><div><button type="button" :aria-label="`Ver valores anteriores de ${observation.name}`" @click="scroll(-1)"><ChevronLeft aria-hidden="true" /></button><button type="button" :aria-label="`Ver más valores de ${observation.name}`" @click="scroll(1)"><ChevronRight aria-hidden="true" /></button></div></div>
   <div ref="track" class="readings-track" tabindex="0" role="region" :aria-label="`Valores de la última lectura de ${observation.name}`">
    <div v-for="metric in reportedMetrics" :key="metric.key" class="reading-tile" :class="metric.color" :data-reading="metric.key">
     <span class="metric-icon"><component :is="metric.icon" aria-hidden="true" /></span><span class="metric-label">{{ metric.label }}</span><strong :class="{unavailable:observation.reading[metric.key]==null}">{{ number(observation.reading[metric.key]) }}<small v-if="observation.reading[metric.key]!=null">{{ metric.unit }}</small></strong><small v-if="metric.at && observation.reading[metric.at]" class="metric-date">{{ date(observation.reading[metric.at]) }}</small>
    </div>
   </div>
   <p v-if="!reportedMetrics.length" class="reading-missing">La última lectura no contiene valores meteorológicos válidos. Consulte la sincronización de esta estación.</p>
  </template>
  <p v-else class="reading-missing">Esta estación todavía no tiene una lectura disponible para el análisis.</p>
 </article>
</template>
<style scoped>
.reading-timezone{display:block;margin-top:4px;font-size:.7rem;color:var(--fc-text-muted)}
.station-readings{width:100%;min-width:0;padding:18px 18px 12px;border:1px solid #e0eaf2;border-radius:17px;background:#fff;box-shadow:0 3px 16px #16496a09}
.station-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.station-identity{display:flex;align-items:center;gap:11px;min-width:0}.station-mark{display:grid;place-items:center;width:43px;height:43px;flex:0 0 43px;border-radius:14px;color:var(--fc-primary);background:#e7f2fb}.station-mark svg{width:20px}.station-identity h3{margin:0;color:var(--fc-text);font-size:.99rem;letter-spacing:-.01em}.station-identity p{margin:4px 0 0;color:var(--fc-text-muted);font-size:.74rem}.station-chips{display:flex;gap:6px;flex-wrap:wrap}.station-chips>span{display:flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:#edf5fb;color:#235d83;font-size:.71rem;font-weight:650}.station-chips svg{width:13px;height:13px}.station-chips .stale{background:#fff1dc;color:#925d0b}
.readings-navigation{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin:17px 0 11px;color:#647b8c;font-size:.77rem}.readings-navigation>div{display:flex;gap:6px}.readings-navigation button{display:grid;place-items:center;width:33px;height:33px;border:1px solid #cee0ed;border-radius:10px;background:#fff;color:var(--fc-primary);cursor:pointer}.readings-navigation button:hover{background:#e9f4fb}.readings-navigation svg{width:16px;height:16px}
.readings-track{display:flex;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding:2px 1px 12px;scrollbar-width:thin;scrollbar-color:#b8d6e9 transparent}.reading-tile{--tile-color:#2475ac;--tile-bg:#e9f4fc;display:flex;flex:0 0 169px;min-height:157px;flex-direction:column;align-items:flex-start;padding:16px;border:1px solid #e2edf5;border-radius:15px;background:linear-gradient(160deg,var(--tile-bg),#fff 85%);scroll-snap-align:start}.metric-icon{display:grid;place-items:center;width:34px;height:34px;margin-bottom:16px;border-radius:11px;background:#ffffffc9;color:var(--tile-color)}.metric-icon svg{width:18px;height:18px}.metric-label{color:#597487;font-size:.73rem;font-weight:650;line-height:1.4;min-height:20px}.reading-tile strong{display:flex;align-items:baseline;gap:5px;margin-top:6px;color:var(--fc-primary-strong);font-size:1.56rem;font-weight:800;letter-spacing:-.035em;line-height:1.15}.reading-tile strong small{color:#6e8495;font-size:.73rem;letter-spacing:0;font-weight:600}.reading-tile strong.unavailable{font-size:1rem;letter-spacing:0;color:#8094a1;font-weight:600}.metric-date{font-size:.63rem;color:#627d90;margin-top:7px}
.mint{--tile-color:#26834a;--tile-bg:#eff9f3}.blue{--tile-color:#277eae;--tile-bg:#edf6fc}.teal{--tile-color:#2b819c;--tile-bg:#eff8fa}.amber{--tile-color:#ac831f;--tile-bg:#fffaed}.violet{--tile-color:#7865a6;--tile-bg:#f5f2fc}.earth{--tile-color:#91754b;--tile-bg:#f8f4ed}.coral{--tile-color:#bf6f46;--tile-bg:#fff5ed}
.reading-missing{padding:13px;margin-top:12px;border-radius:12px;background:#fff7e7;color:#836122;font-size:.85rem}.readings-track:focus-visible{outline:2px solid var(--fc-secondary);outline-offset:3px}
@media(max-width:600px){.station-readings{padding:13px}.station-identity p span{display:block}.station-chips{padding:0}.reading-tile{flex-basis:145px;padding:13px;min-height:149px}.reading-raw dl{grid-template-columns:1fr}.reading-raw dd{margin-bottom:6px}}
</style>
