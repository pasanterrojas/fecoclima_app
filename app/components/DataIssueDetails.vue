<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, Wrench } from 'lucide-vue-next'
export interface DataIssue { code: string; variable?: string; message: string; action: string }
const props = defineProps<{ issues?: DataIssue[]; station?: string; samples?: number; expectedSamples?: number; technical?: boolean }>()
const list = computed(() => props.issues || [])
const missing = computed(() => list.value.length > 0)
</script>
<template>
  <div class="quality-explainer" :class="{ incomplete: missing }">
    <div class="quality-status"><AlertCircle v-if="missing" aria-hidden="true"/><CheckCircle2 v-else aria-hidden="true"/>
      <div><strong>{{ missing ? 'Por qué aparece información incompleta' : 'No hay incidencias detectadas en esta ventana' }}</strong><small v-if="station">{{ station }}</small></div>
    </div>
    <p v-if="missing" class="quality-intro">Una lectura disponible no significa que todos los sensores hayan enviado suficientes datos. No completamos mediciones con valores inventados.</p>
    <details v-if="missing" :open="technical ? true : undefined">
      <summary>Ver {{ list.length }} {{ list.length === 1 ? 'motivo y su solución' : 'motivos y sus soluciones' }}</summary>
      <ul><li v-for="(issue, index) in list" :key="`${issue.code}-${issue.variable || index}`"><span>{{ issue.message }}</span><small><Wrench aria-hidden="true"/> {{ issue.action }}</small></li></ul>
    </details>
    <p v-else class="quality-intro"><Info aria-hidden="true" /> Los indicadores se calculan según las reglas y mediciones configuradas.</p>
    <small v-if="technical && expectedSamples != null" class="quality-count">Muestras: {{ samples ?? 0 }} de {{ expectedSamples }} esperadas.</small>
  </div>
</template>
<style scoped>
.quality-explainer{width:100%;padding:14px 16px;border:1px solid #cde6d9;border-radius:15px;background:#f1faf6}.quality-explainer.incomplete{border-color:#eedcbb;background:#fffaf0}.quality-status{display:flex;align-items:center;gap:10px;color:#226549}.incomplete .quality-status{color:#906320}.quality-status svg{width:21px;height:21px;flex-shrink:0}.quality-status strong{display:block;font-size:.85rem}.quality-status small{display:block;margin-top:2px;font-size:.73rem}.quality-intro{margin:9px 0 0!important;color:#536b78;font-size:.81rem;line-height:1.5}.quality-intro svg{width:15px;height:15px;vertical-align:middle}.quality-explainer details{margin-top:10px;padding:0;border:0}.quality-explainer summary{cursor:pointer;font-size:.8rem;font-weight:750;color:var(--fc-primary)}.quality-explainer ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}.quality-explainer li{display:grid;gap:3px;padding:9px 10px;border:1px solid #ebdfcd;border-radius:10px;background:#fff;font-size:.79rem;line-height:1.55}.quality-explainer li small{display:flex;align-items:flex-start;gap:6px;color:#65737c}.quality-explainer li small svg{width:13px;height:13px;flex-shrink:0;margin-top:3px}.quality-count{display:block;margin-top:10px;color:#566b75}
</style>
