<script setup lang="ts">
import { Satellite } from 'lucide-vue-next'
import type { SatelliteObservation } from '~/types/api'
defineProps<{ data?: SatelliteObservation | null }>()
</script>

<template>
  <article class="card">
    <div class="card-body">
      <div class="row"><Satellite /><h3>Información satelital</h3></div>
      <template v-if="data">
        <img v-if="data.source_url && /\.(png|jpe?g|webp)(\?|$)/i.test(data.source_url)" class="satellite-image" :src="data.source_url" alt="Observación satelital de la parcela">
        <p><b>Última captura:</b> {{ data.captured_at || 'No indicada' }}</p>
        <p><b>NDVI:</b> {{ data.ndvi ?? 'No disponible' }}</p>
        <p><b>NDMI:</b> {{ data.ndmi ?? 'No disponible' }}</p>
        <p><b>Nubosidad:</b> {{ data.cloud_percentage ?? 'No disponible' }}%</p>
      </template>
      <div v-else class="notice">
        No existe una observación satelital procesada para el ciclo seleccionado. Debe haber un ciclo vinculado a una parcela y un proceso backend que consulte y guarde Sentinel-2.
      </div>
      <p class="muted small">La imagen satelital describe el estado observado de la cobertura; no es una predicción meteorológica.</p>
    </div>
  </article>
</template>

<style scoped>
h3{margin:0;color:var(--fc-primary)}p{margin:10px 0}.satellite-image{width:100%;max-height:280px;object-fit:cover;border-radius:10px;margin:14px 0;border:1px solid var(--fc-border)}
</style>
