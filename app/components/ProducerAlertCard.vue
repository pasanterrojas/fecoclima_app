<script setup lang="ts">
import { ShieldCheck, ShieldAlert } from 'lucide-vue-next'
import type { AlertSummary } from '~/types/api'

const props = defineProps<{ alert: AlertSummary; period: string; disabled?: boolean }>()
const level = computed(() => props.alert.maximum_level_72h)
const headline = computed(() => ({
  GRAVE: 'Conviene revisar el cultivo pronto',
  MODERADA: 'Hay señales que vale la pena vigilar',
  NINGUNA: 'No vemos señales de alerta en las lecturas',
  DATOS_INSUFICIENTES: 'Necesitamos más lecturas para orientarle',
})[level.value] || 'Revise el estado de su cultivo')
const date = computed(() => props.alert.evaluation_date
  ? new Date(`${props.alert.evaluation_date}T12:00:00`).toLocaleDateString('es-PY', { dateStyle: 'medium' })
  : null)
</script>

<template>
  <section class="card producer-alert" :class="`level-${level.toLowerCase()}`">
    <div class="card-body">
      <div class="alert-heading"><ShieldCheck v-if="level === 'NINGUNA'" aria-hidden="true" /><ShieldAlert v-else aria-hidden="true" /><div><span>Estado del cultivo según el tiempo</span><h2>{{ headline }}</h2></div></div>
      <p>{{ date ? `Estas señales corresponden al ${date}; corresponden al periodo analizado, no necesariamente a hoy.` : 'El resultado depende de las lecturas disponibles.' }}</p>
      <p class="practical">{{ level === 'DATOS_INSUFICIENTES' ? 'Puede revisar el cultivo en campo y consultar de nuevo cuando la estación envíe más datos.' : 'Observe sus plantas en el campo: las lecturas ayudan a orientar la revisión, pero no reemplazan lo que usted ve.' }}</p>
      <WidgetExplanation :alert-id="alert.evaluation_id" :period="period" widget="alert" :disabled="disabled" />
    </div>
  </section>
</template>

<style scoped>
.producer-alert{border-left:6px solid var(--fc-info)}.level-grave{border-left-color:var(--fc-danger)}.level-moderada{border-left-color:var(--fc-warning)}.level-ninguna{border-left-color:var(--fc-success)}.alert-heading{display:flex;gap:13px;align-items:center}.alert-heading>svg{width:36px;height:36px;flex:0 0 auto;color:var(--fc-primary)}.alert-heading span{color:var(--fc-text-muted);font-size:.85rem}.alert-heading h2{margin:3px 0;color:var(--fc-primary);font-size:1.28rem}p{margin:12px 0 0;line-height:1.5}.practical{color:var(--fc-text-muted)}.producer-alert :deep(.widget-explanation){margin-top:12px}
</style>
