<script setup lang="ts">
import { CloudSun, Microscope } from 'lucide-vue-next'
import type { ForecastDisease } from '~/types/api'
defineProps<{ disease: ForecastDisease }>()
</script>
<template>
  <article class="card projection">
    <div class="head"><span><Microscope/></span><div><b>{{ disease.name }}</b><span class="badge" :class="disease.risk==='alto'?'badge-danger':disease.risk==='moderado'?'badge-warning':'badge-success'">{{ disease.risk }}</span></div></div>
    <p v-if="disease.reason || disease.reasons?.length">{{ disease.reason || disease.reasons?.[0] }}</p>
    <div class="dates"><CloudSun/> {{ disease.dates?.length ? disease.dates.map(d=>new Date(`${d}T12:00:00`).toLocaleDateString('es-PY',{day:'2-digit',month:'short'})).join(', ') : 'Sin fecha' }}</div>
    <small>Proyección meteorológica, no diagnóstico.</small>
  </article>
</template>
<style scoped>
.projection{padding:16px;box-shadow:none;border-top:4px solid var(--fc-info)}.head{display:flex;align-items:center;gap:10px}.head>span{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#eef6fa;color:var(--fc-primary)}.head svg{width:20px}.head b{margin-right:8px;color:var(--fc-primary)}p{font-size:.87rem;color:var(--fc-text-muted);line-height:1.45}.dates{display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:800;color:var(--fc-primary)}.dates svg{width:16px}small{display:block;margin-top:8px;color:var(--fc-text-muted)}
</style>
