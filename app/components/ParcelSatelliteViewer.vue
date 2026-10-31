<script setup lang="ts">
import type { Geometry, MapStation, ParcelAnalysis } from '~/types/plots'
import { recentImageryScenes } from '~/utils/imageryHistory'
type Satellite = ParcelAnalysis['context']['satellite']
const props = defineProps<{plotId:string;geometry:Geometry;initialSatellite?:Satellite;stations?:MapStation[];publicAccess?:boolean;selectedImageryId?:string;selectionDisabled?:boolean}>()
const emit = defineEmits<{'select-imagery':[id:string]}>()
const privateApi=useApi(),publicApi=usePublicParcelApi()
const request=<T,>(...args:Parameters<typeof privateApi.request<T>>)=>(props.publicAccess?publicApi:privateApi).request<T>(...args)
const apiUrl=(path:string)=>(props.publicAccess?publicApi:privateApi).apiUrl(path)
const satellite=ref<Satellite>(props.initialSatellite || null)
const mapImagery=computed(()=>satellite.value ? {...satellite.value,index_images:{...satellite.value.index_images,...(satellite.value.image_available && satellite.value.source_url ? {rgb:satellite.value.source_url}: {})}} : null)
const error=ref(''),notice=ref(''),busy=ref(false)
const history=ref<NonNullable<Satellite>[]>([]),selectedId=ref(props.selectedImageryId ?? props.initialSatellite?.id ?? ''),compareId=ref(''),compare=ref(false),compareLayer=ref('ndvi')
function chooseImagery(id:string){selectedId.value=id;emit('select-imagery',id)}
watch(()=>props.selectedImageryId,id=>{if(id!==undefined)selectedId.value=id})
const comparison=computed(()=>history.value.find(scene=>scene.id===compareId.value))
const comparisonLayers=computed(()=>Object.keys(satellite.value?.index_images || {}).filter(layer=>satellite.value?.index_images?.[layer] && comparison.value?.index_images?.[layer] && (satellite.value?.index_visual_versions?.[layer] || 'legacy-continuous') === (comparison.value?.index_visual_versions?.[layer] || 'legacy-continuous')))
const {dateOnly:date}=useViewerTime()
async function loadHistory(){
  try {
    const result=await request<{items:NonNullable<Satellite>[]}>(`/parcels/${props.plotId}/satellite/history`)
    history.value=recentImageryScenes(result.items || [])
    if(!history.value.some(scene=>scene.id===selectedId.value))selectedId.value=''
    satellite.value=history.value.find(scene=>scene.id===selectedId.value) || history.value[0] || props.initialSatellite || null
    if(!history.value.some(scene=>scene.id===compareId.value && scene.id!==satellite.value?.id))compareId.value=history.value.find(scene=>scene.id!==satellite.value?.id)?.id || ''
  } catch { notice.value='No se pudo consultar el historial. Se conserva la imagen disponible.' }
}
watch(selectedId,id=>{const scene=id ? history.value.find(item=>item.id===id) : history.value[0] || props.initialSatellite;if(scene)satellite.value=scene})
watch(satellite,scene=>{if(compareId.value===scene?.id)compareId.value=history.value.find(item=>item.id!==scene?.id)?.id || ''})
watch(comparisonLayers,layers=>{if(!layers.includes(compareLayer.value))compareLayer.value=layers[0] || ''})
async function load(){
 await loadHistory()
}
async function refresh(){
 busy.value=true;error.value=''
 try{await request(`/parcels/${props.plotId}/refresh`,{method:'POST'});notice.value='Actualización solicitada. Las imágenes se procesan en segundo plano; pulse Consultar capas para revisar el resultado.'}
 catch{error.value='No se pudo solicitar la actualización.'}finally{busy.value=false}
}
watch(()=>props.initialSatellite,value=>{selectedId.value=props.selectedImageryId ?? value?.id ?? '';satellite.value=value || null})
onMounted(()=>{void loadHistory()})
</script>
<template>
 <div class="parcel-satellite-viewer">
  <div v-if="history.length>1" class="scene-toolbar"><button type="button" class="btn btn-light" :aria-pressed="compare" @click="compare=!compare">{{compare?'Cerrar comparación':'Comparar fechas'}}</button></div>
  <section v-if="compare && satellite" class="scene-comparison"><label><span class="label">Comparar con</span><select v-model="compareId" class="select"><option v-for="scene in history.filter(scene=>scene.id!==satellite?.id)" :key="scene.id" :value="scene.id">{{date(scene.captured_at)}}</option></select></label><label v-if="comparisonLayers.length"><span class="label">Misma capa en ambas imágenes</span><select v-model="compareLayer" class="select"><option v-for="layer in comparisonLayers" :key="layer" :value="layer">{{layer.toUpperCase()}}</option></select></label><div v-if="comparison && comparisonLayers.length" class="comparison-images"><figure v-for="scene in [comparison,satellite]" :key="scene.id"><img :src="apiUrl(scene.index_images![compareLayer]!)" :alt="`${compareLayer.toUpperCase()} del ${date(scene.captured_at)}`" loading="lazy"><figcaption>{{date(scene.captured_at)}} · {{compareLayer.toUpperCase()}}</figcaption></figure></div><p v-else>Para comparar, ambas fechas deben tener la misma capa y escala de colores. Actualice las fuentes de las escenas con escala anterior.</p><SpectralLegend v-if="satellite.index_legends?.[compareLayer] && comparisonLayers.length" :legend="satellite.index_legends[compareLayer]!" :index-name="compareLayer" :technical="!publicAccess" /><p>Compare el mismo indicador y confirme los cambios en campo. La imagen seleccionada y sus indicadores se usarán en el próximo análisis IA; pulse Analizar para actualizar las recomendaciones.</p></section>
  <SpectralHistory :scenes="history" />
  <ClientOnly><WorldParcelMap :technical="!publicAccess" :model-value="geometry" :stations="stations || []" :imagery="mapImagery" :imagery-scenes="history" :selected-imagery-id="selectedId" :selection-disabled="selectionDisabled" @select-imagery="chooseImagery" read-only /></ClientOnly>
  <p v-if="satellite">Escena mostrada: {{ date(satellite.captured_at) }}. El mapa de fondo y las capas Copernicus son imágenes distintas.</p>
  <p v-else>No hay una imagen procesada para este polígono. Solicite actualizar las fuentes y consulte nuevamente.</p>
  <p v-if="satellite?.data_warning" class="notice notice-warning">{{ satellite.data_warning }}</p>
  <div v-if="satellite" class="index-values"><span v-for="(value,key) in satellite.indices || {ndvi:satellite.ndvi,ndmi:satellite.ndmi,ndwi:satellite.ndwi}" :key="key"><b>{{ String(key).toUpperCase() }}</b> {{ value ?? 'Sin dato' }}</span></div>
  <p class="form-help">NDVI: vigor · NDRE: clorofila · NDMI: humedad de la vegetación. Active una capa en el mapa para explorar diferencias dentro de la parcela.</p>
  <template v-if="initialSatellite === undefined"><div class="row"><button type="button" class="btn btn-light" :disabled="busy" @click="load">Consultar capas</button><button type="button" class="btn btn-primary" :disabled="busy" @click="refresh">Actualizar fuentes</button></div><p v-if="notice" role="status">{{ notice }}</p></template>
  <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
 </div>
</template>
<style scoped>.scene-toolbar{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.scene-toolbar label{min-width:200px;flex:1}.scene-comparison{display:grid;gap:12px;padding:15px;border:1px solid var(--fc-border);border-radius:15px;background:#f4f9fc}.comparison-images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.comparison-images figure{margin:0;min-width:0}.comparison-images img{width:100%;height:auto;max-height:290px;object-fit:contain;background:#edf3f6;border-radius:12px}.comparison-images figcaption{font-size:.8rem;text-align:center;margin-top:5px}
.parcel-satellite-viewer{display:grid;gap:14px;width:100%}.parcel-satellite-viewer p{margin:0;font-size:.85rem;color:var(--fc-text-muted)}.index-values{display:flex;flex-wrap:wrap;gap:10px}.index-values span{padding:9px 13px;background:#eef6f8;border-radius:9px;font-size:.85rem}.row{flex-wrap:wrap}</style>
