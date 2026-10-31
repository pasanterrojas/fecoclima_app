<script setup lang="ts">
import { stationError, type AdminStation } from '~/utils/stations'
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const auth = useAuthStore()
const { request } = useApi()
const rows = ref<AdminStation[]>([]), editing = ref<AdminStation>(), deleting = ref<AdminStation>()
const formOpen = ref(false), loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), search = ref('')
const filtered = computed(() => rows.value.filter(row => [row.name, row.code, row.department, row.district, row.locality].join(' ').toLowerCase().includes(search.value.toLowerCase())))
async function load() {
  loading.value = true
  try { rows.value = (await request<{ items: AdminStation[] }>('/stations', { query: { limit: 250 } })).items }
  catch (exception) { error.value = stationError(exception) }
  finally { loading.value = false }
}
function open(station?: AdminStation) { void navigateTo(`/fecoclima-ia/admin/estaciones/${station?.id || 'nuevo'}`) }
async function saved() { formOpen.value = false; notice.value = 'Estación guardada. Su ubicación está disponible en el mapa del dashboard.'; await load() }
async function toggle(station: AdminStation) {
  busy.value = true; error.value = ''
  try { await request(`/stations/${station.id}`, { method: 'PUT', body: { name: station.name, active: !station.active } }); await load() }
  catch (exception) { error.value = stationError(exception) }
  finally { busy.value = false }
}
async function remove() {
  if (!deleting.value) return
  busy.value = true
  try { await request(`/stations/${deleting.value.id}`, { method: 'DELETE' }); deleting.value = undefined; await load() }
  catch (exception) { error.value = stationError(exception) }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section>
    <AdminPageHeader title="Estaciones meteorológicas" description="Registre la API, ubicación y radio de influencia de cada estación." />
    <div class="row-between"><input v-model="search" class="input station-search" aria-label="Buscar estaciones" placeholder="Buscar estación o localidad" /><button class="btn btn-primary" @click="open()">Nueva estación</button></div>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice notice-success">{{ notice }} <NuxtLink to="/fecoclima-ia/admin">Ver dashboard</NuxtLink></p>
    <StationForm v-if="formOpen" :key="editing?.id || 'new'" :station="editing" @saved="saved" @cancel="formOpen = false" />
    <article class="card station-list"><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Ubicación</th><th>Radio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      <tr v-for="station in filtered" :key="station.id"><td><NuxtLink class="record-link" :to="`/fecoclima-ia/admin/estaciones/${station.id}`">{{ station.name }}</NuxtLink><small class="muted">{{ station.external_guid || 'Sin GUID' }}</small></td><td>{{ [station.department, station.district, station.locality].filter(Boolean).join(' · ') || 'Sin dirección' }}<small>{{ station.latitude }}, {{ station.longitude }}</small></td><td>{{ station.influence_radius_m }} m</td><td>{{ station.active ? 'Activa' : 'Desactivada' }}</td><td><div class="station-actions"><button class="btn btn-light" @click="open(station)">Ver / editar</button><button class="btn btn-light" :disabled="busy" @click="toggle(station)">{{ station.active ? 'Desactivar' : 'Activar' }}</button><button v-if="auth.user?.role === 'superadmin'" class="btn btn-danger" :disabled="busy" @click="deleting = station">Eliminar</button></div></td></tr>
      <tr v-if="!filtered.length"><td colspan="5">{{ loading ? 'Consultando estaciones…' : 'No hay estaciones para mostrar.' }}</td></tr>
    </tbody></table></div></article>
    <ConfirmationModal :open="!!deleting" title="Eliminar estación" :message="`¿Desea eliminar ${deleting?.name || 'esta estación'}?`" @cancel="deleting = undefined" @confirm="remove" />
  </section>
</template>
<style scoped>
.station-search{max-width:380px}.station-list{margin-top:22px}small{display:block;color:var(--fc-text-muted);margin-top:5px}.station-actions{display:flex;gap:8px;flex-wrap:wrap}.station-form{margin-top:20px}.notice{margin-top:16px}@media(max-width:650px){.row-between{flex-wrap:wrap;gap:12px}}
</style>
