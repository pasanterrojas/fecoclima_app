<script setup lang="ts">
import type { Parcel } from '~/types/plots'
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const { request } = useApi()
const parcels = ref<Parcel[]>([])
const editing = ref<Parcel | undefined>()
const formOpen = ref(false)
const error = ref('')
const deleting = ref<Parcel>()
const search = ref('')
const filtered = computed(() => parcels.value.filter(parcel => [parcel.name, parcel.producer_name, parcel.producer_document].join(' ').toLowerCase().includes(search.value.toLowerCase())))
async function remove() {
  if (!deleting.value) return
  try { await request(`/plots/${deleting.value.id}`, { method: 'DELETE' }); deleting.value = undefined; await load() } catch { error.value = 'No se pudo eliminar la parcela.' }
}
function openForm(parcel?: Parcel) { void navigateTo(`/fecoclima-ia/admin/parcelas/${parcel?.id || 'nuevo'}`) }

async function load() {
  try {
    parcels.value = (await request<{ items: Parcel[] }>('/plots', { query: { limit: 250 } })).items.filter((row) => !!row.crop_id)
  } catch {
    error.value = 'No se pudieron cargar las parcelas.'
  }
}
async function saved() {
  formOpen.value = false
  editing.value = undefined
  await load()
}
onMounted(load)
</script>
<template>
  <div>
    <AdminPageHeader
      title="Parcelas"
      description="Delimite cada parcela, asigne su cultivo y fecha de siembra. La superficie y las estaciones influyentes se resuelven automáticamente."
    />
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button
        class="btn btn-primary"
        @click="openForm()"
      >
        Nueva parcela</button
      ><NuxtLink to="/fecoclima-ia" class="btn btn-light">Abrir vista Productor / Técnico</NuxtLink>
    </div>
    <ParcelForm
      v-if="formOpen"
      :key="editing?.id || 'new'"
      :parcel="editing"
      admin
      @saved="saved"
      @cancel="formOpen = false"
    />
    <div v-else class="card table-wrap">
      <input v-model="search" class="input" placeholder="Buscar parcela, productor o CI" aria-label="Buscar parcelas" />
      <table><thead><tr><th>Parcela</th><th>Productor · CI</th><th>Superficie</th><th>Siembra</th><th>Acciones</th></tr></thead><tbody>
        <tr v-for="parcel in filtered" :key="parcel.id"><td><NuxtLink class="record-link" :to="`/fecoclima-ia/admin/parcelas/${parcel.id}`">{{ parcel.name }}</NuxtLink></td><td>{{ parcel.producer_name || 'Sin productor' }}<span v-if="parcel.producer_document"> · CI {{ parcel.producer_document }}</span></td><td>{{ parcel.area_ha }} ha</td><td>{{ parcel.planting_date || 'Pendiente' }}</td><td><div class="actions"><button class="btn btn-light" @click="openForm(parcel)">Ver / editar</button><a class="btn btn-light" :href="`https://www.google.com/maps/search/?api=1&query=${parcel.latitude},${parcel.longitude}`" target="_blank" rel="noopener">Ubicar en Maps</a><button class="btn btn-danger" @click="deleting = parcel">Eliminar</button></div></td></tr>
        <tr v-if="!filtered.length"><td colspan="5">No hay parcelas para mostrar.</td></tr>
      </tbody></table>
    </div>
    <ConfirmationModal :open="!!deleting" title="Eliminar parcela" :message="`¿Eliminar ${deleting?.name || 'esta parcela'}?`" @confirm="remove" @cancel="deleting = undefined" />
  </div>
</template>
<style scoped>
.actions {
  display: flex;
  gap: 12px;
  margin: 20px 0;
  flex-wrap: wrap;
}
.parcel-list {
  display: grid;
  gap: 12px;
}
.parcel-list article {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: white;
  border: 1px solid var(--fc-border);
  border-radius: 12px;
}
.parcel-list p {
  font-size: 0.85rem;
  margin-top: 6px;
  color: var(--fc-text-muted);
}
</style>
