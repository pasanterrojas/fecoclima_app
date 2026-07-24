<script setup lang="ts">
import { BrainCircuit, RefreshCw, Satellite } from 'lucide-vue-next'
import type { Recommendation } from '~/types/api'
defineProps<{ recommendation?: Recommendation | null; loading?: boolean; error?: string }>()
const emit = defineEmits<{ refresh: [] }>()
</script>
<template>
  <article class="card satellite-agent">
    <div class="card-body">
      <header class="head"><div class="icon"><Satellite /></div><div><span>Agente especializado</span><h3>{{ recommendation?._agent_name || 'Criterio IA de Copernicus' }}</h3><p>Interpreta la imagen y los índices de la geozona; los contrasta con clima, fenología y pronóstico.</p></div><button class="btn btn-light" :disabled="loading" @click="emit('refresh')"><RefreshCw /> Analizar geozona</button></header>
      <div v-if="loading" class="loading"><BrainCircuit /><span>Analizando imagen, NDVI, NDMI, NDWI, tendencias y calidad de escena…</span></div>
      <div v-else-if="error" class="notice notice-warning">{{ error }}</div>
      <MarkdownContent v-else-if="recommendation?.markdown" :content="recommendation.markdown" />
      <div v-else class="notice">Actualice Copernicus o ejecute “Analizar con IA” para obtener el criterio del agente satelital.</div>
      <footer v-if="recommendation" class="meta"><span>{{ recommendation.has_satellite_image ? 'La imagen procesada fue enviada al modelo visual.' : 'Análisis basado en índices y metadatos disponibles.' }}</span><span v-if="recommendation._model">{{ recommendation._model }}</span></footer>
    </div>
  </article>
</template>
<style scoped>.satellite-agent{border:1px solid #b6d9eb;background:linear-gradient(145deg,#fff,#f1f9fd)}.head{display:grid;grid-template-columns:auto 1fr auto;gap:15px;align-items:start}.icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#dff2fb;color:var(--fc-primary)}.icon svg{width:26px}.head span{color:var(--fc-secondary);font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.head h3{margin:3px 0;color:var(--fc-primary)}.head p{margin:0;color:var(--fc-text-muted)}.head button svg{width:17px}.loading{display:flex;gap:10px;align-items:center;margin-top:18px;padding:16px;border-radius:12px;background:#eaf6fc;color:var(--fc-primary);font-weight:700}.loading svg{width:25px}.meta{display:flex;justify-content:space-between;gap:12px;margin-top:15px;padding-top:12px;border-top:1px solid var(--fc-border);color:var(--fc-text-muted);font-size:.78rem}@media(max-width:760px){.head{grid-template-columns:auto 1fr}.head button{grid-column:1/-1;width:100%}.meta{flex-direction:column}}
</style>
