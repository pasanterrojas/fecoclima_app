<script setup lang="ts">
import { stationError, stationRadiusPreview, type AdminStation } from '~/utils/stations'
import type { MapStation } from '~/types/plots'

const props = defineProps<{ station?: AdminStation }>()
const emit = defineEmits<{ saved: [station: AdminStation]; cancel: [] }>()
const { request } = useApi()
const form = reactive({
  external_guid: props.station?.external_guid || '',
  name: props.station?.name || '', code: props.station?.code || '',
  endpoint_url: (props.station?.endpoint_url || props.station?.effective_endpoint_url || '').replace('{guid}', props.station?.external_guid || '{guid}'),
  description: props.station?.description || '',
  latitude: props.station?.latitude ?? '' as number | '', longitude: props.station?.longitude ?? '' as number | '',
  altitude_m: props.station?.altitude_m ?? '' as number | '',
  country: props.station?.country || 'Paraguay', department: props.station?.department || '',
  district: props.station?.district || '', locality: props.station?.locality || '',
  influence_radius_m: props.station?.influence_radius_m || 5000, active: props.station?.active ?? true,
  map_color: String(props.station?.integration_config?.map_color || props.station?.map_color || '#277da1'),
  timezone: props.station?.timezone || 'America/Asuncion',
  expected_interval_minutes: props.station?.expected_interval_minutes ?? 10,
  soil_unit: String(props.station?.integration_config?.soil_moisture_unit || (props.station?.external_guid?.toUpperCase() === 'C2694D32-5A4B-48C0-A3B6-8345D9E4935B' ? 'cb' : '%')),
  leaf_mode: String(props.station?.leaf_sensor_config?.mode || (props.station?.external_guid?.toUpperCase() === 'C2694D32-5A4B-48C0-A3B6-8345D9E4935B' ? 'threshold' : 'unknown')),
  wet_threshold: Number(props.station?.leaf_sensor_config?.wet_threshold ?? 6),
})
const mapsLink = ref('')
const soilUnitEdited = ref(false)
watch(() => `${form.endpoint_url} ${form.external_guid}`, value => {
  if (!props.station && !soilUnitEdited.value) form.soil_unit = value.toUpperCase().includes('C2694D32-5A4B-48C0-A3B6-8345D9E4935B') ? 'cb' : '%'
})
const saving = ref(false), locating = ref(false), error = ref(''), locationNotice = ref('')
let locationRequest = 0
let coordinateTimer: ReturnType<typeof setTimeout> | undefined
const coordinatesValid = computed(() => typeof form.latitude === 'number' && Number.isFinite(form.latitude) && Math.abs(form.latitude) <= 90 && typeof form.longitude === 'number' && Number.isFinite(form.longitude) && Math.abs(form.longitude) <= 180)
const previewStations = computed<MapStation[]>(() => coordinatesValid.value ? [{
  id: 'preview', name: form.name || 'Nueva estación', latitude: Number(form.latitude), longitude: Number(form.longitude),
  influence_geojson: stationRadiusPreview(Number(form.latitude), Number(form.longitude), Number(form.influence_radius_m) || 5000), active: form.active,
  map_color: form.map_color,
}] : [])
const mapsUrl = computed(() => coordinatesValid.value ? `https://www.google.com/maps/search/?api=1&query=${form.latitude},${form.longitude}` : 'https://www.google.com/maps')

interface LocationResult { latitude: number; longitude: number; altitude_m: number | null; country: string | null; department: string | null; district: string | null; locality: string | null; warnings: string[]; sources: string[] }
async function locate(value: string) {
  const generation = ++locationRequest
  locating.value = true
  error.value = ''
  locationNotice.value = ''
  try {
    const result = await request<LocationResult>('/stations/location/resolve', { method: 'POST', body: { location: value } })
    if (generation !== locationRequest) return
    form.latitude = result.latitude
    form.longitude = result.longitude
    // Never carry an old address/elevation to a newly selected point.
    form.altitude_m = result.altitude_m ?? ''
    form.country = result.country || ''
    form.department = result.department || ''
    form.district = result.district || ''
    form.locality = result.locality || ''
    locationNotice.value = result.warnings.length ? result.warnings.join(' ') : 'Ubicación y altitud completadas. Revise los valores antes de guardar.'
  } catch (exception) {
    if (generation === locationRequest) error.value = stationError(exception)
  } finally {
    if (generation === locationRequest) locating.value = false
  }
}
function pointChanged(axis: 'latitude' | 'longitude', value: number) {
  locationRequest++
  locating.value = true
  form[axis] = value
  form.altitude_m = ''
  form.department = form.district = form.locality = ''
  if (coordinateTimer) clearTimeout(coordinateTimer)
  coordinateTimer = setTimeout(() => { if (coordinatesValid.value) void locate(`${form.latitude},${form.longitude}`) }, 500)
}
async function save() {
  if (!coordinatesValid.value) { error.value = 'Seleccione la ubicación de la estación.'; return }
  saving.value = true
  error.value = ''
  try {
    const { soil_unit, leaf_mode, wet_threshold, map_color, ...fields } = form
    const result = await request<AdminStation>(props.station ? `/stations/${props.station.id}` : '/stations', {
      method: props.station ? 'PUT' : 'POST',
      body: { ...fields,
        // Preserve existing metadata that isn't edited by this form.
        import_config: props.station?.import_config || {},
        available_variables: props.station?.available_variables || [],
        integration_config: { ...(props.station?.integration_config || {}), map_color, soil_moisture_unit: soil_unit,
          soil_tension_proxy_enabled: false, soil_tension_rule_validated: false },
        leaf_sensor_config: { ...(props.station?.leaf_sensor_config || {}), mode: leaf_mode, ...(leaf_mode === 'threshold' ? { wet_threshold: Number(wet_threshold) } : {}) }, external_guid: form.external_guid.trim() || null, code: form.code.trim() || null, description: form.description.trim() || null,
        altitude_m: form.altitude_m === '' ? null : form.altitude_m,
        source_type: 'FECOCLIMA_API', influence_geojson: null,
      },
    })
    emit('saved', result)
  } catch (exception) { error.value = stationError(exception) }
  finally { saving.value = false }
}
onBeforeUnmount(() => { locationRequest++; if (coordinateTimer) clearTimeout(coordinateTimer) })
</script>

<template>
  <form class="station-form card" @submit.prevent="save">
    <div class="card-body">
      <div class="row-between"><h2 class="section-title">{{ station ? 'Editar estación' : 'Nueva estación meteorológica' }}</h2><button type="button" class="btn btn-light" @click="emit('cancel')">Cerrar</button></div>
      <div class="form-grid">
        <label><span class="label">Nombre *</span><input v-model.trim="form.name" class="input" required minlength="2" maxlength="180" placeholder="Ej. Raúl Peña" /></label>

        <label class="full"><span class="label">URL de API *</span><input v-model.trim="form.endpoint_url" class="input" type="url" required placeholder="https://fecoclima.fecoprod.com.py/clima/api/estacion/lectura-guid-por-periodo/GUID/2026/1/6" /><small>Pegue la URL de esta estación con su GUID real. El año y los meses se ajustan automáticamente en cada consulta.</small></label>
        <details class="full"><summary>Código e identificador externo</summary><p class="form-help">La URL completa permite obtener el GUID automáticamente. Complete estos campos solo si necesita un identificador específico.</p>        <label><span class="label">Código (opcional)</span><input v-model.trim="form.code" class="input" maxlength="80" placeholder="Se genera al guardar si lo deja vacío" /><small>Use su código existente o deje que el sistema asigne uno.</small></label>        <label class="full"><span class="label">GUID de la estación (si la URL no lo incluye)</span><input v-model.trim="form.external_guid" class="input" placeholder="Identificador proporcionado por FECOPROD" /><small>Se extrae automáticamente de una URL completa. Si pega solo la URL base, debe ingresar el GUID real; el código interno no lo reemplaza.</small></label></details>
        <label class="full"><span class="label">Descripción</span><textarea v-model="form.description" class="textarea" rows="3" /></label>
      </div>
      <section class="station-location">
        <div class="row-between"><h3>Ubicación de la estación</h3><a :href="mapsUrl" target="_blank" rel="noopener" class="btn btn-light">Abrir Google Maps ↗</a></div>
        <p>Ubique el punto en Maps y pegue su enlace. También puede hacer clic directamente en el mapa inferior.</p>
        <div class="location-import"><input v-model.trim="mapsLink" class="input" aria-label="URL de Google Maps o coordenadas" placeholder="URL de Google Maps o latitud, longitud" /><button type="button" class="btn btn-primary" :disabled="!mapsLink || locating" @click="locate(mapsLink)">{{ locating ? 'Consultando…' : 'Obtener ubicación' }}</button></div>
        <ClientOnly><StationPolygonEditor point-mode :model-value="null" :latitude="form.latitude" :longitude="form.longitude" :stations="previewStations" :initial-zoom="6" @update:latitude="pointChanged('latitude', $event)" @update:longitude="pointChanged('longitude', $event)" /></ClientOnly>
        <p v-if="locating" role="status">Completando dirección y altitud…</p>
        <p v-if="locationNotice" class="notice notice-warning" role="status">{{ locationNotice }}</p>
        <div class="form-grid location-fields">
          <label><span class="label">Latitud *</span><input v-model.number="form.latitude" class="input" type="number" step="any" min="-90" max="90" required @change="coordinatesValid && locate(`${form.latitude},${form.longitude}`)" /></label>
          <label><span class="label">Longitud *</span><input v-model.number="form.longitude" class="input" type="number" step="any" min="-180" max="180" required @change="coordinatesValid && locate(`${form.latitude},${form.longitude}`)" /></label>
          <label><span class="label">Altitud del terreno (m)</span><input v-model.number="form.altitude_m" class="input" type="number" step="any" /><small>Estimada; puede corregirla con la altitud medida de la estación.</small></label>
          <label><span class="label">Departamento</span><input v-model.trim="form.department" class="input" maxlength="120" /></label>
          <label><span class="label">Distrito</span><input v-model.trim="form.district" class="input" maxlength="120" /></label>
          <label><span class="label">Localidad</span><input v-model.trim="form.locality" class="input" maxlength="120" /></label>
        </div>
        <small>Dirección: © OpenStreetMap / Nominatim · Altitud estimada: Open-Meteo / Copernicus DEM GLO-90. Los campos son editables si la cartografía no es precisa.</small>
      </section>
      <div class="form-grid">
        <label><span class="label">Radio de influencia (metros) *</span><input v-model.number="form.influence_radius_m" type="range" min="10" :max="Math.max(20000,form.influence_radius_m)" step="10" aria-label="Ajustar radio de influencia" /><input v-model.number="form.influence_radius_m" class="input" type="number" min="10" max="100000" step="1" required /><small>Vista previa circular alrededor del punto. Valor inicial: 5.000 metros.</small></label>
        <label><span class="label">Color del área de influencia</span><input v-model="form.map_color" class="input station-color" type="color" aria-label="Color del área de influencia" /><small>{{ form.map_color }} · Se aplica al área y a la etiqueta en los mapas públicos y del CMS.</small></label>
        <label><span class="label">Estado</span><select v-model="form.active" class="select"><option :value="true">Activa</option><option :value="false">Desactivada</option></select></label>
      </div>
      <section class="station-sensors">
        <h3>Configuración de lecturas y sensores <InfoHint text="Estos parámetros afectan directamente las alertas por datos incompletos. Configure lo que realmente entrega el equipo, sin convertir centibares a porcentaje." /></h3>
        <div class="form-grid">
          <label><span class="label">Cada cuántos minutos transmite la estación</span><input v-model.number="form.expected_interval_minutes" type="number" min="1" max="1440" step="1" class="input" required /><small>Indique el intervalo real de la API. El sistema lo utiliza para calcular cuántas muestras debería recibir.</small></label>
          <label><span class="label">Unidad del sensor de suelo</span><select v-model="form.soil_unit" class="select" @change="soilUnitEdited = true"><option value="%">Porcentaje de humedad (%)</option><option value="cb">Tensión del suelo (cb)</option></select><small>No son equivalentes. En Cultivos → Reglas elija “Tensión del agua en el suelo (cb)” y un umbral validado para el suelo, sensor y cultivo.</small></label>
          <label><span class="label">Interpretación del sensor de mojado foliar</span><select v-model="form.leaf_mode" class="select"><option value="unknown">No configurado / no disponible</option><option value="threshold">Escala con umbral de mojado</option><option value="binary_wet">Sensor binario (mojado/seco)</option><option value="hours">Reporta horas mojadas</option></select><small>Seleccione la semántica real del sensor; un valor 0 puede significar seco, no ausente.</small></label>
          <label v-if="form.leaf_mode === 'threshold'"><span class="label">Umbral a partir del cual se considera mojado</span><input v-model.number="form.wet_threshold" type="number" min="0" max="1000" step="any" class="input" required /><small>Solo use un umbral documentado para esta estación (p. ej., 6 cuando corresponda).</small></label>
          <label class="full"><span class="label">Zona horaria de las lecturas</span><input v-model.trim="form.timezone" class="input" maxlength="80" required placeholder="America/Asuncion" /><small>Debe corresponder a la estación. Afecta las fechas de mediciones que no incluyen zona horaria.</small></label>
        </div>
      </section>
      <p v-if="station?.influence_geojson" class="notice notice-warning">Al guardar se utilizará este radio circular como área de influencia, reemplazando el polígono personalizado anterior.</p>
      <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
      <div class="form-actions"><button type="button" class="btn btn-light" @click="emit('cancel')">Cancelar</button><button class="btn btn-primary" :disabled="saving || locating">{{ saving ? 'Guardando…' : 'Guardar estación' }}</button></div>
    </div>
  </form>
</template>

<style scoped>
.station-form{margin-bottom:22px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}.form-grid label{min-width:0}.full{grid-column:1/-1}.form-grid small,.station-location>small{display:block;margin-top:6px;color:var(--fc-text-muted);font-size:.78rem;line-height:1.4}.station-location{margin:24px 0;padding:18px;border:1px solid var(--fc-border);border-radius:12px}.station-location h3{margin:0;color:var(--fc-primary)}.station-location>p{color:var(--fc-text-muted)}.location-import{display:flex;gap:10px;margin:14px 0}.location-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.station-active{display:flex;align-items:center;gap:10px}.form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}@media(max-width:750px){.form-grid,.location-fields{grid-template-columns:1fr}.location-import{flex-direction:column}.station-location{padding:12px}.station-form .row-between{flex-wrap:wrap;gap:10px}}
</style>

<style scoped>.station-sensors{margin:24px 0;padding:16px;border:1px solid var(--fc-border);border-radius:14px;background:var(--fc-surface-muted)}.station-sensors h3{display:flex;align-items:center;gap:6px;color:var(--fc-primary);margin:0 0 12px}.station-sensors .form-grid{margin-top:10px}</style>
