<script setup lang="ts">
import type { Interpretation } from '~/types/plots'
const props = defineProps<{ result?: Interpretation }>()
const reasons: Record<string,string> = {agent_not_configured:'No hay un agente activo publicado para este tipo y cultivo. Revise Agentes IA.',provider_not_configured:'Faltan las credenciales del proveedor del agente.',provider_auth:'El proveedor rechazó la credencial de IA. Revise su configuración.',provider_quota:'El proveedor de IA no tiene cuota disponible.',provider_limited:'El proveedor limitó temporalmente las consultas.',provider_timeout:'El proveedor no respondió a tiempo.',provider_output_limit:'El modelo agotó el límite de tokens sin entregar texto. Aumente el límite técnico del agente en el CMS.',provider_empty_response:'El proveedor devolvió una respuesta vacía.',provider_model:'El modelo del agente no está disponible en el proveedor.',provider_request:'El proveedor rechazó la configuración de la solicitud. Pruebe el modelo desde el CMS.',provider_unavailable:'El proveedor está temporalmente fuera de servicio.'}
const summary = computed(() => props.result?.markdown || '')
const sourceText = computed(() => (props.result?.sources || []).map(source => `${source.document}${source.page_or_section ? ` · ${source.page_or_section}` : ''}`).join('; '))
const technicalHint = computed(() => props.result?.status === 'fallback' ? reasons[props.result.fallback_reason || ''] || 'No se pudo consultar el modelo de IA.' : '')
const incomplete = computed(() => props.result?.text_complete === false || Boolean(props.result?.max_characters && /(?:…|\.{3})$/.test(summary.value.trim())))
const recoveryAction = computed(() => props.result?.purpose === 'WEATHER_ANALYSIS' || props.result?.purpose === 'FORECAST_ANALYSIS'
  ? 'Pulse «Interpretar pronóstico» para generar una versión completa.'
  : 'Vuelva a generar esta interpretación para obtener una versión completa.')
</script>
<template>
  <div v-if="result" class="parcel-interpretation">
    <small class="status">{{
      result.status === 'completed' ? 'Interpretación de IA' : result.status === 'disabled' ? 'Interpretación desactivada' : 'Resumen basado en datos · IA no disponible'
    }}</small>
    <MarkdownContent :content="summary" />
    <p v-if="incomplete" class="incomplete-text" role="status">Esta explicación guardada quedó incompleta. {{ recoveryAction }}</p>
    <small v-if="technicalHint" class="ai-limitation">{{ technicalHint }}</small>
    <div v-if="sourceText" class="sources-hint"><span>Documentos consultados</span><InfoHint :text="sourceText" /></div>
  </div>
</template>
<style scoped>
.parcel-interpretation {
  width: 100%;
  display: grid;
  gap: 8px;
}
.ai-limitation { display: block; font-size: .74rem; line-height: 1.5; }
.incomplete-text { padding: 10px 12px; border-radius: 9px; background: #fff3db; color: #684c14; font-size: .82rem; line-height: 1.5; }
.sources-hint { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.status {
  font-weight: 700;
  color: var(--fc-text-muted);
  font-size: 0.74rem;
}
.parcel-interpretation > small {
  font-size: 0.74rem;
  color: var(--fc-text-muted);
}
</style>

<style scoped>.widget-summary{margin:0;line-height:1.65;overflow-wrap:anywhere}.parcel-interpretation details{font-size:.78rem;color:var(--fc-text-muted)}.parcel-interpretation details small{display:block;margin-top:6px}</style>
