<script setup lang="ts">
import type { ArchivedParcel, ArchivedScene, HistoryPage } from '~/types/parcelHistory'
definePageMeta({ layout: 'admin', middleware: 'admin-auth', key: route => route.fullPath })
const route = useRoute(), { request, apiUrl } = useApi()
const { dateTime } = useViewerTime()
const parcel = ref<ArchivedParcel>(), scenes = ref<ArchivedScene[]>([]), selectedId = ref('')
const total = ref(0), loading = ref(true), moreLoading = ref(false), error = ref('')
const root = `/admin/parcel-history/${route.params.id}`
const scene = computed(() => scenes.value.find(item => item.id === selectedId.value) || scenes.value[0])
const geometry = computed(() => scene.value?.processing_geometry || parcel.value?.geojson || null)
const imagery = computed(() => scene.value ? { ...scene.value, index_images: {
  ...scene.value.index_images, ...(scene.value.image_available && scene.value.source_url ? { rgb: scene.value.source_url } : {}),
} } : null)
function download(url: string) { return apiUrl(`${url}${url.includes('?') ? '&' : '?'}download=true`) }
async function loadMore() {
  moreLoading.value = true; error.value = ''
  try {
    const page = await request<HistoryPage<ArchivedScene>>(`${root}/images`, { query: { offset: scenes.value.length, limit: 50 } })
    scenes.value = [...scenes.value, ...page.items]; total.value = page.total
  } catch { error.value = 'No se pudieron cargar las imágenes del histórico.' }
  finally { moreLoading.value = false }
}
onMounted(async () => {
  try { parcel.value = await request<ArchivedParcel>(root); await loadMore() }
  catch { error.value = 'No se pudo consultar la parcela del histórico.' }
  finally { loading.value = false }
})
</script>
<template>
  <section>
    <NuxtLink to="/fecoclima-ia/admin/parcelas/historico" class="back-link">← Volver al histórico</NuxtLink>
    <AdminPageHeader :title="parcel?.name || 'Histórico de parcela'" description="Todas las escenas conservadas de esta parcela, incluidas las de polígonos anteriores y las utilizadas en análisis." />
    <LoadingState v-if="loading" /><ErrorState v-if="error" :message="error" />
    <template v-if="parcel && !loading">
      <article class="card card-body history-summary"><p><b>{{ parcel.deleted_at ? 'Eliminada por el usuario' : parcel.crop_id ? 'Parcela guardada' : 'Polígono explorado' }}</b><span v-if="parcel.deleted_at"> · {{ dateTime(parcel.deleted_at) }}</span></p><p>{{ parcel.producer_name || 'Sin productor' }}<span v-if="parcel.producer_document"> · CI {{ parcel.producer_document }}</span> · {{ parcel.area_ha || 0 }} ha</p><p>Registrada: {{ dateTime(parcel.created_at) }} · {{ total }} escenas conservadas</p></article>
      <article class="card card-body history-images">
        <label v-if="scenes.length"><span class="label">Escena del histórico completo</span><select v-model="selectedId" class="select"><option value="">Más reciente · {{ dateTime(scenes[0]!.captured_at) }}</option><option v-for="item in scenes.slice(1)" :key="item.id" :value="item.id">{{ dateTime(item.captured_at) }} · {{ item.used_in_analyses.length ? 'Usada en análisis' : 'Descargada / procesada' }}</option></select></label>
        <p v-if="scene">{{ scene.used_in_analyses.length ? `Usada en ${scene.used_in_analyses.length} análisis guardados.` : 'Sin referencias en análisis guardados.' }} <span v-if="scene.processing_status">Estado: {{ scene.processing_status }}.</span></p>
        <ClientOnly><WorldParcelMap v-if="geometry" :key="JSON.stringify(geometry)" :model-value="geometry" :stations="[]" :imagery="imagery" read-only /></ClientOnly>
        <p v-if="!scenes.length">Todavía no hay escenas guardadas para este polígono.</p>
        <template v-if="scene">
          <p>Captura: {{ dateTime(scene.captured_at) }}. El mapa muestra el polígono utilizado para esta escena.</p>
          <p v-if="scene.data_warning" class="notice notice-warning">{{ scene.data_warning }}</p>
          <div class="history-values"><span v-for="(value, name) in scene.indices || {}" :key="name"><b>{{ String(name).toUpperCase() }}</b> {{ value ?? 'Sin dato' }}</span></div>
          <div class="history-downloads"><a v-if="scene.image_available && scene.source_url" class="btn btn-light" :href="download(scene.source_url)">Descargar imagen RGB</a><template v-for="(url, name) in scene.index_images || {}" :key="name"><a v-if="url" class="btn btn-light" :href="download(url)">Descargar {{ String(name).toUpperCase() }}</a></template></div>
          <details v-if="scene.used_in_analyses.length"><summary>Análisis que utilizaron esta imagen</summary><ul><li v-for="id in scene.used_in_analyses" :key="id">{{ id }}</li></ul></details>
        </template>
        <button v-if="scenes.length < total" class="btn btn-light" :disabled="moreLoading" @click="loadMore">{{ moreLoading ? 'Cargando…' : `Cargar más escenas (${scenes.length} de ${total})` }}</button>
      </article>
    </template>
  </section>
</template>
<style scoped>
.history-summary{margin-bottom:16px}.history-images{display:grid;gap:16px}.history-images p,.history-summary p{margin:0;line-height:1.5}.history-values,.history-downloads{display:flex;gap:10px;flex-wrap:wrap}.history-values span{padding:8px 12px;background:#eef6f8;border-radius:9px;font-size:.85rem}.history-images li{overflow-wrap:anywhere}
</style>
