<script setup lang="ts">
import type * as Leaflet from 'leaflet'
import type { GeoJsonObject, FeatureCollection } from 'geojson'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import { openSatelliteBasemap, navigationOverlay, type RasterBasemap } from '~/utils/mapBasemaps'
import { stationDisplayColor, stationRadiusPreview, weatherStationIconUrl } from '~/utils/stations'
import { parcelDisplayColor } from '~/utils/parcelColors'
import type { Geometry, MapStation, MapParcel } from '~/types/plots'
const props = withDefaults(defineProps<{
  modelValue?: unknown; stations?: MapStation[]; parcels?: MapParcel[]; selectedParcelId?: string
  stationValues?: Record<string,{value:number|null;unit:string;color:string}>
  selectionDisabled?: boolean; polygonColor?: string; showInfluence?: boolean
  basemap?: RasterBasemap; labelsBasemap?: RasterBasemap | null; scrollZoom?: boolean
  overlayUrl?: string | null; overlayOpacity?: number; readOnly?: boolean; pointMode?: boolean
  latitude?: number | string | null; longitude?: number | string | null; radius?: number | string | null
  initialStationView?: boolean; initialZoom?: number; parcelMode?: boolean; compactControls?: boolean; confirmClear?: boolean
  beforeClear?: () => Promise<boolean>; clearMessage?: string
}>(), { stations: () => [], parcels: () => [], showInfluence: true, basemap: () => openSatelliteBasemap,
  labelsBasemap: () => navigationOverlay, scrollZoom: true, overlayOpacity: .75, initialZoom: 6, radius: 750 })
const emit = defineEmits<{ 'update:modelValue': [geometry: Geometry | null]; 'update:latitude': [latitude: number]; 'update:longitude': [longitude: number]; 'select-parcel': [id: string]; 'basemap-error': []; 'map-ready': [map: Leaflet.Map]; 'select-station': [id: string] }>()
const root = ref<HTMLElement>(), element = ref<HTMLElement>(), ready = ref(false), drawing = ref(false), editing = ref(false), askClear = ref(false), error = ref('')
let L: typeof Leaflet, map: Leaflet.Map | undefined, base: Leaflet.TileLayer | undefined, labels: Leaflet.TileLayer | undefined
let zones: Leaflet.LayerGroup, markers: Leaflet.LayerGroup, parcels: Leaflet.LayerGroup, draft: Leaflet.FeatureGroup
let overlay: Leaflet.ImageOverlay | undefined, point: Leaflet.Marker | undefined, circle: Leaflet.Circle | undefined
let drawHandler: Leaflet.Draw.Polygon | undefined, editHandler: Leaflet.EditToolbar.Edit | undefined, resize: ResizeObserver | undefined
let lastGeometry = '', disposed = false, initialStationsFitted = false
function geometry(value: unknown): Geometry | null {
  if (!value || typeof value !== 'object') return null
  const row = value as {type?: string; geometry?: unknown; coordinates?: unknown}
  if (row.type === 'Feature') return geometry(row.geometry)
  return ['Polygon', 'MultiPolygon'].includes(row.type || '') && Array.isArray(row.coordinates) ? value as Geometry : null
}
function publish() {
  const features = (draft.toGeoJSON() as FeatureCollection).features.filter(f => ['Polygon','MultiPolygon'].includes(f.geometry.type))
  const polygons = features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [])
  const value = polygons.length === 1 ? {type:'Polygon',coordinates:polygons[0]} : polygons.length ? {type:'MultiPolygon',coordinates:polygons} : null
  const serialized = JSON.stringify(value)
  if (serialized === lastGeometry) return
  lastGeometry = serialized; emit('update:modelValue', value as Geometry | null)
}
function setDraft() {
  if (!map || JSON.stringify(geometry(props.modelValue)) === lastGeometry) return
  drawHandler?.disable(); editHandler?.disable(); drawing.value = editing.value = false
  draft.clearLayers()
  const value = geometry(props.modelValue)
  if (value) {
    const pieces = value.type === 'Polygon' ? [value.coordinates] : value.coordinates
    for (const coordinates of pieces) L.geoJSON({type:'Polygon',coordinates} as GeoJsonObject, {onEachFeature:(_feature,layer)=>{if(props.selectedParcelId)tagParcel(layer,props.selectedParcelId)},style:{color:props.polygonColor || '#eab308',weight:3,fillOpacity:.06}}).eachLayer(layer=>draft.addLayer(layer))
  }
  lastGeometry = JSON.stringify(value)
  updateOverlay()
}
function toggleDrawing() {
  if (!map || props.readOnly || props.pointMode) return
  if (drawing.value) { drawHandler?.disable(); drawing.value = false; return }
  editHandler?.disable(); editing.value = false
  drawHandler = new L.Draw.Polygon(map as Leaflet.DrawMap, {allowIntersection:false,showArea:false,metric:true,shapeOptions:{color:props.polygonColor || '#eab308',weight:3,fillOpacity:.08}})
  drawHandler.enable(); drawing.value = true
}
function toggleEditing() {
  if (!map || props.readOnly || !draft.getLayers().length) return
  if (editing.value) { editHandler?.save(); editHandler?.disable(); editing.value = false; publish(); return }
  drawHandler?.disable(); drawing.value = false
  editHandler = new L.EditToolbar.Edit(map as Leaflet.DrawMap, {featureGroup:draft}); editHandler.enable(); editing.value = true
}
function requestClear() {if(props.confirmClear){askClear.value=true;return}void clearPolygon()}
async function clearPolygon() {
  if (props.beforeClear && !await props.beforeClear()) return
  drawHandler?.disable(); editHandler?.disable(); drawing.value = editing.value = askClear.value = false
  draft.clearLayers(); publish(); updateOverlay()
}
function refreshStations() {
  if (!map) return
  zones.clearLayers(); markers.clearLayers()
  props.stations.forEach((station,index)=>{
    if(props.stationValues?.[station.id]?.value===null)return
    const color = props.stationValues?.[station.id]?.color || stationDisplayColor(station,index)
    const footprint = geometry(station.influence_geojson) || (station.latitude != null && station.longitude != null && station.influence_radius_m ? stationRadiusPreview(station.latitude,station.longitude,station.influence_radius_m) : null)
    if (footprint) L.geoJSON(footprint as GeoJsonObject,{interactive:false,style:{color,weight:2,fillOpacity:props.stationValues?0:.12,className:'station-influence'}}).addTo(zones)
    if (station.latitude == null || station.longitude == null) return
    let icon: Leaflet.Icon|Leaflet.DivIcon=L.icon({iconUrl:weatherStationIconUrl,iconSize:[36,42],iconAnchor:[18,40],className:'weather-station-marker'})
    const reading=props.stationValues?.[station.id]
    if(reading){const content=document.createElement('span');content.className='station-value';content.style.borderColor=reading.color;content.style.color='#153746';content.style.setProperty('--reading-color',reading.color);content.textContent=reading.value==null?'':`${reading.value.toLocaleString('es-PY',{maximumFractionDigits:2})} ${reading.unit}`;content.setAttribute('data-station-value',station.id);icon=L.divIcon({html:content,className:'station-reading-marker',iconSize:[88,36],iconAnchor:[44,18]})}
    const marker = L.marker([station.latitude,station.longitude],{icon,title:station.name})
    const label = document.createElement('span'); label.textContent = station.name;label.style.borderLeft=`3px solid ${color}`;label.style.paddingLeft='5px'
    marker.bindTooltip(label,{direction:'top'}).on('click',()=>emit('select-station',station.id)).addTo(markers)
  })
  if (props.showInfluence) zones.addTo(map)
  else zones.remove()
}
function tagParcel(layer: Leaflet.Layer,id: string) {
  layer.on('add',()=>{const element=(layer as Leaflet.Path).getElement?.();element?.setAttribute('data-parcel-id',id)})
}
function refreshParcels() {
  if (!map) return
  parcels.clearLayers()
  props.parcels.forEach((parcel,index)=>{
    if (parcel.id === props.selectedParcelId && geometry(props.modelValue)) return
    const value = geometry(parcel.geojson); if (!value) return
    const layer = L.geoJSON(value as GeoJsonObject,{onEachFeature:(_feature,layer)=>tagParcel(layer,parcel.id),style:{color:parcelDisplayColor(parcel,index),weight:parcel.id===props.selectedParcelId?4:2,fillOpacity:.08}})
    const text = document.createElement('span'); text.textContent = parcel.name; layer.bindTooltip(text)
    layer.on('click',event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);if(!props.selectionDisabled)emit('select-parcel',parcel.id)}).addTo(parcels)
  })
}
function setBase() {
  if (!map) return
  base?.remove(); labels?.remove()
  base = L.tileLayer(props.basemap.tiles,{maxZoom:21,maxNativeZoom:props.basemap.maxZoom,attribution:props.basemap.attribution}).addTo(map)
  base.on('tileerror',()=>emit('basemap-error'))
  if (props.labelsBasemap) labels = L.tileLayer(props.labelsBasemap.tiles,{maxZoom:21,maxNativeZoom:props.labelsBasemap.maxZoom,attribution:props.labelsBasemap.attribution,pane:'overlayPane',opacity:.9,className:'labels-tile'}).addTo(map)
}
function updateOverlay() {
  if (!map) return
  overlay?.remove(); overlay = undefined
  const value = geometry(props.modelValue)
  if (!props.overlayUrl || !value) return
  const bounds = L.geoJSON(value as GeoJsonObject).getBounds()
  if (bounds.isValid()) overlay = L.imageOverlay(props.overlayUrl,bounds,{opacity:props.overlayOpacity,pane:'satellitePane',interactive:false}).addTo(map)
}
function fitInitialStations() {
  if (!map || !props.initialStationView || initialStationsFitted) return
  const locations = props.stations.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    && Math.abs(s.latitude!) <= 90 && Math.abs(s.longitude!) <= 180)
  if (!locations.length) return
  const bounds = L.latLngBounds(locations.map(s => [s.latitude!, s.longitude!] as [number,number]))
  map.invalidateSize({pan:false})
  // Fit station locations, without distant parcels or influence polygons widening
  // the initial view. Leaflet chooses the closest zoom that fits every marker.
  map.fitBounds(bounds,{padding:[45,45],maxZoom:map.getMaxZoom(),animate:false})
  initialStationsFitted = true
}

function fitAllParcels() {
  if (!map) return
  const bounds = L.latLngBounds([])
  props.parcels.forEach(p=>{const value=geometry(p.geojson);if(value)bounds.extend(L.geoJSON(value as GeoJsonObject).getBounds())})
  if (draft.getLayers().length) bounds.extend(draft.getBounds())
  if (!bounds.isValid()) props.stations.forEach(s=>{const footprint=geometry(s.influence_geojson);if(footprint)bounds.extend(L.geoJSON(footprint as GeoJsonObject).getBounds());else if(s.latitude!=null&&s.longitude!=null)bounds.extend([s.latitude,s.longitude])})
  if (bounds.isValid()) map.fitBounds(bounds,{padding:[45,45],maxZoom:16})
}
function updatePoint() {
  if (!map || !props.pointMode) return
  if (props.latitude == null || props.longitude == null || props.latitude === '' || props.longitude === '' || !Number.isFinite(Number(props.latitude)) || !Number.isFinite(Number(props.longitude))) {point?.remove();circle?.remove();point=undefined;circle=undefined;return}
  const hadPoint = !!point
  const location: Leaflet.LatLngTuple = [Number(props.latitude),Number(props.longitude)]
  point?.remove(); circle?.remove()
  point = L.marker(location,{draggable:!props.readOnly,icon:L.icon({iconUrl:weatherStationIconUrl,iconSize:[36,42],iconAnchor:[18,40]})}).addTo(map)
  point.on('dragend',()=>{const at=point!.getLatLng();emit('update:latitude',at.lat);emit('update:longitude',at.lng)})
  circle = L.circle(location,{radius:Number(props.radius)||750,color:props.polygonColor||'#287da1',fillOpacity:.12}).addTo(map)
  if (ready.value && (!hadPoint || !map.getBounds().contains(location))) map.setView(location,Math.max(12,map.getZoom()))
}
async function useCurrentLocation() {
  if (!navigator.geolocation) { error.value='Este navegador no ofrece ubicación.';return }
  navigator.geolocation.getCurrentPosition(position=>{map?.setView([position.coords.latitude,position.coords.longitude],16)},()=>{error.value='No se pudo acceder a su ubicación. Puede navegar manualmente.'})
}
function resizeMap() { map?.invalidateSize({pan:false}) }
defineExpose({fitAllParcels,useCurrentLocation,resize:resizeMap})
onMounted(async()=>{
  const loaded = await import('leaflet'); L = loaded.default || loaded
  ;(window as unknown as {L:typeof Leaflet}).L=L
  await import('leaflet-draw')
  if (disposed || !element.value) return
  L.drawLocal.draw.handlers.polygon.tooltip = {start:'Marque la primera esquina.',cont:'Marque otra esquina.',end:'Toque el primer punto para cerrar.'}
  L.drawLocal.draw.handlers.simpleshape.tooltip.end = 'Suelte para terminar.'
  map = L.map(element.value,{center:[-25.3,-57.5],zoom:props.initialZoom,maxZoom:21,scrollWheelZoom:props.scrollZoom,preferCanvas:false,zoomControl:false})
  map.createPane('satellitePane').style.zIndex='350'
  zones=L.layerGroup(); markers=L.layerGroup().addTo(map);parcels=L.layerGroup().addTo(map);draft=L.featureGroup().addTo(map)
  setBase();setDraft();refreshStations();refreshParcels();updatePoint()
  map.on(L.Draw.Event.CREATED,(event:unknown)=>{draft.clearLayers();draft.addLayer((event as {layer:Leaflet.Layer}).layer);drawing.value=false;publish();updateOverlay()})
  map.on(L.Draw.Event.DRAWSTOP,()=>{drawing.value=false})
  map.on(L.Draw.Event.EDITED,()=>{publish();updateOverlay()})
  map.on(L.Draw.Event.EDITVERTEX,()=>{publish();updateOverlay()})
  map.on('click',event=>{if(props.pointMode&&!props.readOnly){emit('update:latitude',event.latlng.lat);emit('update:longitude',event.latlng.lng)}})
  L.control.zoom({position:'bottomright'}).addTo(map)
  L.control.scale({imperial:false}).addTo(map)
  resize=new ResizeObserver(resizeMap);resize.observe(element.value)
  if(props.pointMode&&point)map.setView(point.getLatLng(),props.initialZoom)
  else if(props.initialStationView)fitInitialStations()
  else fitAllParcels()
  ready.value=true;emit('map-ready',map)
})
watch(()=>props.modelValue,()=>{setDraft();refreshParcels()}, {deep:true})
watch(()=>[props.basemap,props.labelsBasemap],setBase,{deep:true})
watch(()=>[props.stations,props.stationValues],()=>{refreshStations();fitInitialStations()},{deep:true})
watch(()=>[props.parcels,props.selectedParcelId],refreshParcels,{deep:true})
watch(()=>props.showInfluence,()=>{if(!map)return;props.showInfluence?zones.addTo(map):zones.remove()})
watch(()=>props.overlayUrl,updateOverlay)
watch(()=>props.overlayOpacity,value=>overlay?.setOpacity(value))
watch(()=>props.readOnly,value=>{if(value){drawHandler?.disable();editHandler?.disable();drawing.value=false;editing.value=false}})
watch(()=>props.scrollZoom,value=>{if(!map)return;value?map.scrollWheelZoom.enable():map.scrollWheelZoom.disable()})
watch(()=>[props.latitude,props.longitude,props.radius],updatePoint)
watch(()=>props.polygonColor,()=>{draft?.setStyle({color:props.polygonColor||'#eab308'});circle?.setStyle({color:props.polygonColor||'#287da1'})})
onBeforeUnmount(()=>{disposed=true;resize?.disconnect();map?.remove();map=undefined})
</script>
<template>
  <div ref="root" class="leaflet-editor polygon-editor">
    <div v-if="!readOnly&&!pointMode" class="map-tools"><button type="button" class="btn btn-light" :disabled="!ready" @click="geometry(modelValue)?toggleEditing():toggleDrawing()">{{ drawing?'Cancelar dibujo':geometry(modelValue)?editing?'Terminar edición':'Editar vértices':'Dibujar parcela' }}</button><button v-if="geometry(modelValue)" class="btn btn-light map-tool-button clear" @click="requestClear">Borrar polígono</button></div>
    <div ref="element" class="map" :aria-label="pointMode?'Ubicación de la estación':'Mapa interactivo para delimitar la parcela'" />
    <p v-if="drawing" class="draw-hint" role="status">Marque las esquinas y toque el primer punto para cerrar la parcela.</p>
    <p v-if="error" role="status">{{ error }}</p>
    <ConfirmationModal :open="askClear" title="¿Borrar el polígono?" :message="clearMessage||'Se borrará el polígono y se limpiarán los widgets de esta consulta.'" @cancel="askClear=false" @confirm="clearPolygon"/>
  </div>
</template>
<style scoped>
.leaflet-editor{position:relative;min-width:0}.map{height:100%;min-height:410px;border-radius:12px;z-index:0}.map-tools{position:absolute;top:12px;left:12px;z-index:450;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100% - 24px)}.draw-hint{position:absolute;left:12px;bottom:30px;z-index:450;padding:8px;background:#ffffffe6;border-radius:8px;font-size:.8rem}.clear-confirmation{padding:15px;background:#fff4e1;border:1px solid #e2bf7b;border-radius:10px}.clear-confirmation button{margin-right:9px}:deep(.leaflet-control-attribution){font-size:9px}:deep(.leaflet-marker-icon){filter:drop-shadow(0 1px 2px #24374477)}@media(max-width:650px){.map{min-height:350px}}
</style>

<style scoped>:deep(.station-value){display:block;position:relative;padding:6px 8px;border:3px solid;border-radius:11px;background:#fffffff5;font-size:12px;font-weight:800;white-space:nowrap;text-align:center;box-shadow:0 2px 7px #102e3555}:deep(.station-value)::after{content:'';position:absolute;bottom:-8px;left:calc(50% - 5px);border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--reading-color,currentColor)}</style>


