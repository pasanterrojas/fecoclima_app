<script setup lang="ts">
import { CalendarDays, Sprout } from 'lucide-vue-next'
import type { PhenologyStageStatus } from '~/types/api'
defineProps<{ data: PhenologyStageStatus; cropName?: string }>()
</script>
<template>
  <article class="card phenology-card">
    <div class="card-body">
      <div class="row-between">
        <div>
          <span class="eyebrow">Edad fenológica estimada</span>
          <h3>{{ data.stage_name || 'Configuración pendiente' }}</h3>
          <p>{{ data.description || data.message || 'Este cultivo todavía no tiene un calendario fenológico configurado.' }}</p>
        </div>
        <div class="stage"><Sprout/><b>{{ data.stage_code || '—' }}</b></div>
      </div>
      <div class="facts">
        <span><CalendarDays/> Día {{ Math.max(0, data.days_after_planting || 0) }} desde siembra</span>
        <span v-if="cropName">{{ cropName }}</span>
      </div>
      <div class="progress"><span :style="{ width: `${Math.min(100, Math.max(0, data.stage_progress_pct || 0))}%` }"/></div>
      <small>Estimación por fecha de siembra y calendario configurado para el cultivo; no sustituye una observación de campo.</small>
    </div>
  </article>
</template>
<style scoped>
.phenology-card{border-left:8px solid var(--fc-primary)}.eyebrow{text-transform:uppercase;font-size:.75rem;letter-spacing:.08em;font-weight:800;color:var(--fc-text-muted)}h3{margin:6px 0;color:var(--fc-primary);font-size:1.5rem}p{margin:0;color:var(--fc-text-muted);line-height:1.55}.stage{min-width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:var(--fc-primary);color:#fff}.stage svg{width:22px}.stage b{font-size:1rem}.facts{display:flex;justify-content:space-between;gap:12px;margin:18px 0 10px;color:var(--fc-primary);font-weight:800}.facts span{display:flex;align-items:center;gap:7px}.facts svg{width:17px}.progress{height:9px;background:var(--fc-surface-muted);border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;background:var(--fc-secondary);border-radius:inherit}small{display:block;margin-top:10px;color:var(--fc-text-muted)}
</style>
