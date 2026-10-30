<script setup lang="ts">
const props = defineProps<{ status?: string | null; reason?: string | null; cached?: boolean }>()

const fallback = computed(() => props.status === 'fallback' || props.status === 'FALLBACK')
const message = computed(() => {
  if (props.reason === 'provider_auth') return 'La credencial de IA no está autorizada. Un administrador debe renovarla y probar la conexión.'
  if (props.reason === 'provider_quota') return 'La cuota del servicio de IA se agotó. Un administrador debe revisar el saldo.'
  if (props.reason === 'provider_limited') return 'El servicio de IA está limitando temporalmente las consultas.'
  if (props.reason === 'provider_model') return 'El modelo configurado para esta consulta no está disponible. Un administrador debe seleccionar y probar otro modelo.'
  if (props.reason === 'provider_output_limit') return 'La respuesta de IA alcanzó su límite antes de terminar. Un administrador debe revisar el límite de respuesta.'
  if (props.reason === 'agent_not_configured') return 'No hay un agente activo para este cultivo. Un administrador puede configurarlo.'
  if (props.reason === 'provider_not_configured') return 'El servicio de IA no tiene una credencial configurada.'
  return 'El servicio de IA no respondió en esta consulta.'
})
</script>

<template>
  <div v-if="status" class="ai-status" :class="fallback ? 'ai-status-fallback' : 'ai-status-live'" role="status">
    <strong>{{ fallback ? 'Respuesta de respaldo · sin IA' : cached ? 'Respuesta anterior del agente IA' : 'Respuesta generada por agente IA' }}</strong>
    <span v-if="fallback">{{ message }} Los datos meteorológicos y las alertas siguen disponibles; este texto no fue generado por IA.</span>
    <span v-else-if="cached">Se reutilizó una respuesta previa para los mismos datos.</span>
  </div>
</template>

<style scoped>
.ai-status{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin:10px 0;padding:10px 12px;border-radius:10px;font-size:.85rem;line-height:1.4}.ai-status strong{font-weight:800}.ai-status-fallback{background:#fff3db;color:#563b04;border:1px solid #e4bc61}.ai-status-live{background:#e5f5eb;color:#155b35;border:1px solid #a6d6b4}
</style>
