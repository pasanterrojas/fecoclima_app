<script setup lang="ts">
import type { ArchivedParcel, HistoryPage } from '~/types/parcelHistory'
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const { request } = useApi()
const { dateTime } = useViewerTime()
const rows = ref<ArchivedParcel[]>([]), total = ref(0), offset = ref(0)
const search = ref(''), state = ref('all'), loading = ref(false), error = ref('')
const limit = 50
let generation = 0
async function load() {
  const ticket = ++generation
  loading.value = true; error.value = ''
  try {
    const page = await request<HistoryPage<ArchivedParcel>>('/admin/parcel-history', {
      query: { search: search.value, state: state.value, offset: offset.value, limit },
    })
    if (ticket === generation) { rows.value = page.items; total.value = page.total }
  } catch { if (ticket === generation) error.value = 'No se pudo cargar el histórico de parcelas.' }
  finally { if (ticket === generation) loading.value = false }
}
function filter() { offset.value = 0; void load() }
function move(amount: number) { offset.value += amount; void load() }
onMounted(load)
</script>
<template>
  <section>
    <NuxtLink to="/fecoclima-ia/admin/parcelas" class="back-link">← Volver a parcelas</NuxtLink>
    <AdminPageHeader title="Histórico de parcelas e imágenes" description="Registro de todas las parcelas y polígonos consultados. Conserva las escenas descargadas y los registros eliminados por el usuario." />
    <form class="history-filters" @submit.prevent="filter">
      <input v-model="search" class="input" placeholder="Parcela, productor o CI" aria-label="Buscar en el histórico" />
      <select v-model="state" class="select" aria-label="Estado de parcela" @change="filter"><option value="all">Todos los registros</option><option value="active">Parcelas activas</option><option value="deleted">Eliminadas</option><option value="preview">Polígonos explorados</option></select>
      <button class="btn btn-primary" type="submit">Buscar</button>
    </form>
    <ErrorState v-if="error" :message="error" /><LoadingState v-if="loading" />
    <div v-else class="card table-wrap">
      <table><thead><tr><th>Parcela / polígono</th><th>Productor</th><th>Estado</th><th>Registro</th><th>Escenas</th></tr></thead><tbody>
        <tr v-for="row in rows" :key="row.id">
          <td><NuxtLink class="record-link" :to="`/fecoclima-ia/admin/parcelas/historico/${row.id}`">{{ row.name }}</NuxtLink><small>{{ row.area_ha || 0 }} ha</small></td>
          <td>{{ row.producer_name || 'Sin productor' }}<small v-if="row.producer_document">CI {{ row.producer_document }}</small></td>
          <td>{{ row.deleted_at ? 'Eliminada' : !row.crop_id ? 'Polígono explorado' : row.active ? 'Activa' : 'Inactiva' }}<small v-if="row.deleted_at">{{ dateTime(row.deleted_at) }}</small></td>
          <td>{{ dateTime(row.created_at) }}</td><td>{{ row.scene_count }}</td>
        </tr>
        <tr v-if="!rows.length"><td colspan="5">No hay registros para estos filtros.</td></tr>
      </tbody></table>
    </div>
    <nav class="history-pages" aria-label="Páginas del histórico"><button class="btn btn-light" :disabled="loading || offset === 0" @click="move(-limit)">Anterior</button><span>{{ total ? offset + 1 : 0 }}–{{ Math.min(offset + rows.length, total) }} de {{ total }}</span><button class="btn btn-light" :disabled="loading || offset + limit >= total" @click="move(limit)">Siguiente</button></nav>
  </section>
</template>
<style scoped>
.history-filters,.history-pages{display:flex;gap:12px;align-items:center;margin:18px 0;flex-wrap:wrap}.history-filters input{flex:1;min-width:200px}.history-filters select{width:auto}td small{display:block;color:var(--fc-text-muted);margin-top:5px}
</style>
