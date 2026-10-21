<script setup lang="ts">
import { stationError, type AdminStation } from '~/utils/stations'
definePageMeta({ layout: 'admin', middleware: 'admin-auth', key: route => route.fullPath })
const route = useRoute()
const { request } = useApi()
const station = ref<AdminStation>()
const loading = ref(true), error = ref(''), notice = ref('')
const tab = ref('info')
async function load() {
  loading.value = true
  try { if (route.params.id !== 'nuevo') station.value = await request<AdminStation>(`/stations/${route.params.id}`) }
  catch (exception) { error.value = stationError(exception) }
  finally { loading.value = false }
}
async function saved(record: AdminStation) {
  station.value = record
  notice.value = 'Estación guardada correctamente.'
  if (route.params.id === 'nuevo') await navigateTo(`/fecoclima-ia/admin/estaciones/${record.id}`)
}
async function sync() {
  try { await request(`/stations/${station.value?.id}/sync`,{method:'POST'});notice.value = 'Actualización de lecturas enviada a la cola.' } catch(exception) {error.value=stationError(exception)}
}
onMounted(load)
</script>
<template>
  <section :key="String(route.params.id)">
    <NuxtLink to="/fecoclima-ia/admin/estaciones" class="back-link">← Volver a estaciones</NuxtLink>
    <AdminPageHeader :title="station?.name || 'Nueva estación'" description="Datos de la estación y área que representa." />
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p><p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <LoadingState v-if="loading" />
    <template v-else-if="!error || station">
      <nav v-if="station" class="detail-tabs" aria-label="Estación"><button :class="{active:tab === 'info'}" @click="tab='info'">Información y ubicación</button><button :class="{active:tab === 'datos'}" @click="tab='datos'">Lecturas y sincronización</button></nav>
      <StationForm v-if="tab === 'info'" :key="station?.id || 'nuevo'" :station="station" @saved="saved" @cancel="navigateTo('/fecoclima-ia/admin/estaciones')" />
      <div v-else class="card card-body"><h2 class="section-title">Actualizar datos meteorológicos</h2><p class="form-help">Solicite nuevas lecturas de esta estación o revise las importaciones y sus registros.</p><div class="row"><button class="btn btn-primary" @click="sync">Sincronizar lecturas</button><NuxtLink class="btn btn-light" :to="`/fecoclima-ia/admin/importaciones?station=${station?.id}`">Ver datos y registros</NuxtLink></div></div>
    </template>
  </section>
</template>
