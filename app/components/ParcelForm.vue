<script setup lang="ts">
import { parcelDisplayColor } from '~/utils/parcelColors'
import type { Parcel, ParcelDraft, MapStation } from '~/types/plots'
const props = defineProps<{ parcel?: Parcel; admin?: boolean; stations?: MapStation[]; initialColor?: string; deferCreation?: boolean }>()
const emit = defineEmits<{ saved: [parcel: Parcel]; prepared: [draft: ParcelDraft]; cancel: [] }>()
const privateApi = useApi()
const publicApi = usePublicParcelApi()
const request = <T,>(...args: Parameters<typeof privateApi.request<T>>) => (props.admin ? privateApi : publicApi).request<T>(...args)
const formId = useId()
const localStations = ref<MapStation[]>([])
const mapStations = computed(()=>props.stations || localStations.value)
const crops = ref<{ id: string; code: string; name: string }[]>([])
const form = reactive({
  name: props.parcel?.name || '',
  map_color: parcelDisplayColor(props.parcel || {map_color:props.initialColor}),
  active: props.parcel?.active ?? true,
  producer_name: props.parcel?.producer_name || '',
  producer_document: props.parcel?.producer_document || '',
  crop_id: props.parcel?.crop_id || '',
  planting_date: props.parcel?.planting_date || '',
  geojson: props.parcel?.geojson ? { ...props.parcel.geojson } : null,
  latitude: props.parcel?.latitude ?? null,
  longitude: props.parcel?.longitude ?? null
})
const saving = ref(false)
const error = ref('')
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' })
onMounted(async () => {
  const [cropResult,stationResult]=await Promise.allSettled([
    request<typeof crops.value>('/public/crops'),
    props.stations ? Promise.resolve(props.stations) : request<MapStation[]>('/public/stations'),
  ])
  if(cropResult.status==='fulfilled')crops.value=cropResult.value
  else error.value='No se pudieron cargar los cultivos.'
  if(stationResult.status==='fulfilled')localStations.value=stationResult.value
})

async function save() {
  if (!form.geojson) {
    error.value = 'Dibuje los límites de la parcela.'
    return
  }
  if (props.deferCreation && !props.parcel && !props.admin) {
    emit('prepared', { ...form, geojson: form.geojson })
    return
  }
  saving.value = true
  error.value = ''
  try {
    const base = props.admin ? '/plots' : '/parcels'
    const row = await request<Parcel>(props.parcel ? `${base}/${props.parcel.id}` : base, {
      method: props.parcel ? 'PUT' : 'POST',
      body: { ...form }
    })
    emit('saved', row)
  } catch (e: unknown) {
    const detail = (e as { data?: { detail?: unknown } }).data?.detail
    error.value = typeof detail === 'string' ? detail : 'Revise los datos de la parcela e intente nuevamente.'
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <section class="parcel-form">
    <h2>{{ parcel ? 'Configurar parcela' : 'Nueva parcela' }}</h2>
    <form :id="formId" @submit.prevent="save"><div class="form-fields">
      <label
        ><span class="label">Nombre de la parcela</span
        ><input v-model="form.name" class="input" required minlength="2" maxlength="180"
      /></label>
      <label
        ><span class="label">Nombre del productor</span
        ><input v-model.trim="form.producer_name" class="input" maxlength="180" required
      /></label>
      <label><span class="label">Cédula de identidad (CI)</span><input v-model.trim="form.producer_document" class="input" required minlength="4" maxlength="30" /></label>
      <label
        ><span class="label">Cultivo</span
        ><select v-model="form.crop_id" class="select" required>
          <option value="">Seleccione</option>
          <option v-for="crop in crops" :key="crop.id" :value="crop.id">{{ crop.name }}</option>
        </select></label
      >
      <label
        ><span class="label">Fecha de siembra</span
        ><input v-model="form.planting_date" class="input" type="date" required :max="today"
      /></label>
      <label><span class="label">Estado</span><select v-model="form.active" class="select"><option :value="true">Activa</option><option :value="false">Desactivada</option></select></label>
      <label class="parcel-color-field"><span class="label">Color de la parcela</span><span class="color-choice"><input v-model="form.map_color" type="color" aria-label="Color de la parcela" /><small>Así verá sus límites en el mapa.</small></span></label>
    </div></form>
    <p>
      Marque los límites de su parcela. {{ deferCreation && !parcel ? 'Se guardará al pulsar Analizar y completar widgets en la vista principal.' : 'La superficie y las estaciones que la cubren se calculan al guardar.' }}
    </p>
    <ClientOnly><WorldParcelMap v-model="form.geojson" :stations="mapStations" :parcel-color="form.map_color" /></ClientOnly>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <div class="actions">
      <button type="button" class="btn btn-light" :disabled="saving" @click="emit('cancel')">Cancelar</button
      ><button type="submit" :form="formId" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Guardando…' : deferCreation && !parcel ? 'Usar este polígono' : 'Guardar parcela' }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.color-choice{display:flex;align-items:center;gap:12px;min-height:44px}.color-choice input{width:50px;height:38px;padding:3px;border:1px solid var(--fc-border);border-radius:9px;background:#fff;cursor:pointer}.color-choice small{color:var(--fc-text-muted)}.parcel-form :deep(.world-map-shell:not(:fullscreen)){height:min(55vh,560px);min-height:410px}

.parcel-form {
  display: grid;
  gap: 18px;
}
.form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.form-error {
  color: var(--fc-danger);
}
p {
  line-height: 1.5;
  color: var(--fc-text-muted);
}
@media (max-width: 600px) {
  .form-fields {
    grid-template-columns: 1fr;
  }
}
</style>
