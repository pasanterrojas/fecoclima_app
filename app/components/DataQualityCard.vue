<script setup lang="ts">
import { DatabaseZap, Info } from 'lucide-vue-next'

defineProps<{
  alertId?: string | null
  period?: string
  disabled?: boolean
  quality: {
    completion_percentage: number
    record_completeness_percentage?: number
    variable_completeness_percentage?: number
    missing_variables: string[]
    outliers: number
    notes?: string[]
  }
}>()
</script>

<template>
  <article class="card">
    <div class="card-body">
      <div class="row"><DatabaseZap/><h3>¿Hay suficientes datos?</h3><InfoHint text="Esto mide la disponibilidad de lecturas, no la salud del cultivo." /></div>
      <div class="quality-block">
        <div class="quality-head"><span>Lecturas recibidas <InfoHint text="Se comparan con la frecuencia esperada para esta estación." /></span><b>{{ quality.record_completeness_percentage ?? quality.completion_percentage }}%</b></div>
        <div class="bar"><span :style="{width:`${quality.record_completeness_percentage ?? quality.completion_percentage}%`}"/></div>
      </div>
      <div class="quality-block">
        <div class="quality-head"><span>Datos que se pudieron analizar <InfoHint text="No todas las condiciones pueden evaluarse si faltan sensores o lecturas." /></span><b>{{ quality.variable_completeness_percentage ?? 0 }}%</b></div>
        <div class="bar variables"><span :style="{width:`${quality.variable_completeness_percentage ?? 0}%`} "/></div>
      </div>
      <p v-if="quality.missing_variables.length" class="notice notice-warning small"><b>Faltan estas mediciones:</b> {{ quality.missing_variables.join(', ') }}.</p>
      <p v-else class="notice small">Hay lecturas para las condiciones necesarias.</p>
      <details><summary>Más detalles (i)</summary><p class="muted small">Lecturas fuera del rango esperado: {{ quality.outliers }}</p></details>
      <details v-if="quality.notes?.length" class="details"><summary><Info/> Cómo se interpreta</summary><ul><li v-for="note in quality.notes" :key="note">{{ note }}</li></ul></details>
      <WidgetExplanation :alert-id="alertId" :period="period || '72h'" widget="quality" :disabled="disabled" />
    </div>
  </article>
</template>

<style scoped>
h3{margin:0;color:var(--fc-primary)}.quality-block{margin:17px 0}.quality-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--fc-primary)}.bar{height:10px;background:#e4edf3;border-radius:999px;overflow:hidden;margin:7px 0}.bar span{display:block;height:100%;background:var(--fc-secondary);border-radius:inherit}.bar.variables span{background:var(--fc-success)}small{color:var(--fc-text-muted)}p{margin:9px 0}.details{margin-top:13px}.details summary{display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--fc-primary);font-weight:800}.details summary svg{width:16px}.details ul{padding-left:20px}.details li{margin:7px 0;color:var(--fc-text-muted);font-size:.82rem}
</style>
