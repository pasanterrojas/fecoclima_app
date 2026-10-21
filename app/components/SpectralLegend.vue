<script setup lang="ts">
import type { SpectralLegend, SpectralVisualization } from '~/types/plots'
import { spectralDescriptions } from '~/utils/spectralDescriptions'
const props = defineProps<{legend:SpectralLegend; indexName:string; grid?:SpectralVisualization['visual_grid']}>()
const explanation = computed(() => spectralDescriptions[props.indexName.toLowerCase()] || 'Compare los colores para encontrar diferencias entre sectores de su parcela y revisarlas en campo.')
</script>
<template>
  <section class="spectral-legend" :aria-label="`Escala de ${indexName.toUpperCase()}`">
    <div class="legend-heading"><b>{{indexName.toUpperCase()}} · Escala fija</b><span>Cinco categorías · misma escala entre fechas</span></div>
    <ol><li v-for="item in legend.classes" :key="item.label"><i :style="{backgroundColor:item.color}" /><span>{{item.label}}</span></li></ol>
    <p v-if="legend.formula">{{legend.formula}} <a v-if="legend.formula_source" :href="legend.formula_source" target="_blank" rel="noopener noreferrer">Referencia</a></p>
    <p class="index-explanation">{{ explanation }}</p>
    <small v-if="grid">Salida remuestreada ≈ {{grid.output_resolution_m}} m · bandas nativas de {{grid.native_resolution_m.join('–')}} m. El remuestreo no agrega detalle al sensor.</small>
  </section>
</template>
<style scoped>
.spectral-legend{display:grid;gap:10px;min-width:0;padding:14px 15px;border-top:1px solid #d8e6ee;background:#f5fafc;border-radius:0 0 14px 14px;color:var(--fc-text)}.legend-heading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:5px;font-size:.78rem}.legend-heading span{color:var(--fc-text-muted);font-size:.72rem}.spectral-legend ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.spectral-legend li{display:grid;gap:5px;text-align:center;font-size:.74rem}.spectral-legend i{height:12px;border-radius:4px;border:1px solid #15334a15}.spectral-legend p,.spectral-legend small{margin:0;font-size:.73rem;color:var(--fc-text-muted)}@media(max-width:480px){.spectral-legend li{font-size:.65rem}.spectral-legend{padding:12px 10px}}
</style>
