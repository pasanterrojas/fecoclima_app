<script setup lang="ts">
import type { AdminStation } from '~/utils/stations'
const props = defineProps<{ stations: AdminStation[] }>()
const mapStations = computed(() => props.stations.map(station => ({ ...station, influence_geojson: station.influence_area ?? station.influence_geojson ?? null })))
</script>
<template>
  <article class="card station-overview"><div class="card-body"><div class="row-between"><div><h2 class="section-title">Mapa de estaciones meteorológicas</h2><p>{{ stations.length }} estaciones registradas. Las áreas coloreadas representan su radio de influencia.</p></div><NuxtLink class="btn btn-light" to="/fecoclima-ia/admin/estaciones">Administrar estaciones</NuxtLink></div><ClientOnly><WorldParcelMap :model-value="null" :stations="mapStations" overview /></ClientOnly></div></article>
</template>
<style scoped>.station-overview{margin-top:22px}.station-overview p{color:var(--fc-text-muted)}.row-between{flex-wrap:wrap;gap:12px}</style>
