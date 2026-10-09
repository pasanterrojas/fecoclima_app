<script setup lang="ts">
import { RefreshCw, Satellite } from 'lucide-vue-next'
import type { SatelliteObservation, SatelliteStatus } from '~/types/api'

const props = defineProps<{
  data?: SatelliteObservation | null
  status?: SatelliteStatus | null
  alertId?: string | null
  period: string
  disabled?: boolean
  refreshing?: boolean
  error?: string
}>()
const emit = defineEmits<{ refresh: [] }>()
const { apiUrl } = useApi()
const captured = computed(() => props.data?.captured_at
  ? new Date(props.data.captured_at).toLocaleDateString('es-PY', { dateStyle: 'medium' })
  : null)
const catalogueDate = computed(() => props.data?.latest_catalog_scene_at
  ? new Date(props.data.latest_catalog_scene_at).toLocaleDateString('es-PY', { dateStyle: 'medium' })
  : null)
const recent = computed(() => {
  if (!props.data?.captured_at || !props.data.image_available || props.data.processing_status !== 'PROCESSED') return false
  const age = (Date.now() - new Date(props.data.captured_at).getTime()) / 86_400_000
  return Number.isFinite(age) && age >= 0 && age <= 14 && !props.data.data_is_stale
})
const imageUrl = computed(() => recent.value && props.data?.source_url ? apiUrl(props.data.source_url) : '')
</script>

<template>
  <section class="card producer-satellite">
    <div class="card-body">
      <header class="sat-heading"><Satellite aria-hidden="true" /><div><h2>Imagen satelital de la zona</h2><p>Una mirada desde arriba para acompañar la revisión del campo.</p></div></header>
      <template v-if="imageUrl">
        <img class="recent-image" :src="imageUrl" :alt="`Imagen satelital de la zona tomada el ${captured}`" loading="lazy">
        <p class="capture-date">Imagen del {{ captured }} · Esta imagen muestra el área de la estación, no cada planta de su parcela.</p>
        <WidgetExplanation :alert-id="alertId" :period="period" widget="satellite" :disabled="disabled" />
      </template>
      <div v-else class="sat-placeholder">
        <p><b>Por ahora no tenemos una imagen reciente y procesada de esta zona.</b></p>
        <p v-if="captured">La última imagen utilizable es del {{ captured }}. Preferimos no mostrarla como si fuera actual.</p>
        <p v-if="catalogueDate && catalogueDate !== captured">Se encontró una imagen más nueva del {{ catalogueDate }}, pero aún no reúne las condiciones para analizarla.</p>
        <p v-if="!status?.configured">Se necesita configurar la ubicación de la estación para buscar imágenes.</p>
      </div>
      <p v-if="error" class="notice notice-warning" role="alert">No pudimos actualizar la imagen por ahora. Intente más tarde.</p>
      <button type="button" class="btn btn-light refresh-button" :disabled="disabled || refreshing || !status?.configured" @click="emit('refresh')"><RefreshCw aria-hidden="true" /> {{ refreshing ? 'Buscando imagen…' : 'Buscar imagen más reciente' }}</button>
    </div>
  </section>
</template>

<style scoped>
.sat-heading{display:flex;align-items:center;gap:12px;margin-bottom:16px}.sat-heading>svg{width:34px;height:34px;color:var(--fc-primary);flex:0 0 auto}h2{margin:0;font-size:1.3rem;color:var(--fc-primary)}.sat-heading p,.capture-date,.sat-placeholder p{margin:4px 0;color:var(--fc-text-muted);line-height:1.5}.recent-image{display:block;width:100%;max-height:430px;object-fit:contain;border-radius:12px;background:#eef5f8}.capture-date{margin:10px 0}.sat-placeholder{padding:24px;border:1px dashed var(--fc-border);border-radius:12px;background:var(--fc-surface-muted)}.sat-placeholder p+ p{margin-top:9px}.refresh-button{margin-top:15px}.refresh-button svg{width:18px;height:18px}@media(max-width:620px){.sat-placeholder{padding:17px}.refresh-button{width:100%}}
</style>
