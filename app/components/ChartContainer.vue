<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; loading?: boolean }>()
</script>

<template>
  <article class="card chart-card">
    <div class="card-body">
      <div class="row-between chart-head"><div><h3>{{ title }}</h3><p v-if="subtitle">{{ subtitle }}</p></div><slot name="actions" /></div>
      <div v-if="loading" class="skeleton chart-plot" />
      <div v-else class="chart-plot"><slot /></div>
      <slot name="below" />
    </div>
  </article>
</template>

<style scoped>
.chart-head{margin-bottom:15px}h3{margin:0;color:var(--fc-primary)}p{margin:4px 0 0;color:var(--fc-text-muted);font-size:.85rem}.chart-plot{position:relative;width:100%;height:300px;max-height:300px;overflow:hidden}.chart-plot :deep(canvas){display:block;max-width:100%;max-height:100%}@media(max-width:620px){.chart-plot{height:240px;max-height:240px}}
</style>
