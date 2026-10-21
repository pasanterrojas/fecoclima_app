<script setup lang="ts">
import type { Parcel } from '~/types/plots'
import { stationError } from '~/utils/stations'
definePageMeta({ layout: 'admin', middleware: 'admin-auth', key: route => route.fullPath })
const route = useRoute(), { request } = useApi()
const parcel = ref<Parcel>()
const loading = ref(true), error = ref(''), notice = ref('')
const tab=ref('info')
onMounted(async () => {
  try { if (route.params.id !== 'nuevo') parcel.value = await request<Parcel>(`/plots/${route.params.id}`) }
  catch(exception) { error.value = stationError(exception) }
  finally { loading.value = false }
})
async function saved(record: Parcel) {
  parcel.value = record
  if (route.params.id === 'nuevo') await navigateTo(`/fecoclima-ia/admin/parcelas/${record.id}`)
  else notice.value = 'Parcela actualizada correctamente.'
}
</script>
<template>
  <section>
    <NuxtLink to="/fecoclima-ia/admin/parcelas" class="back-link">← Volver a parcelas</NuxtLink>
    <AdminPageHeader :title="parcel?.name || 'Nueva parcela'" :description="parcel ? `${parcel.producer_name || 'Productor'}${parcel.producer_document ? ` · CI ${parcel.producer_document}` : ''} · ${parcel.area_ha || 0} ha` : 'Identifique al productor y delimite su terreno.'" />
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p><ErrorState v-if="error" :message="error" /><LoadingState v-if="loading" />
    <template v-else-if="!error"><nav v-if="parcel" class="detail-tabs"><button :class="{active:tab==='info'}" @click="tab='info'">Información</button><button :class="{active:tab==='satellite'}" @click="tab='satellite'">Capas multiespectrales</button></nav><article class="card card-body"><ParcelForm v-if="tab==='info'" :key="parcel?.id || 'nuevo'" :parcel="parcel" admin @saved="saved" @cancel="navigateTo('/fecoclima-ia/admin/parcelas')" /><ParcelSatelliteViewer v-else-if="parcel" :plot-id="parcel.id" :geometry="parcel.geojson" /></article></template>
  </section>
</template>
