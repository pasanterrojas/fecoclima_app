<script setup lang="ts">
defineProps<{ title:string; description?:string }>()
</script>
<template><div class="admin-page-head"><div class="admin-page-heading"><span class="page-eyebrow">FECOCLIMA · ADMINISTRACIÓN</span><h1>{{ title }}</h1><p v-if="description">{{ description }}</p></div><div v-if="$slots.default" class="page-actions"><slot /></div></div></template>
<style scoped>
.admin-page-head{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:26px}.admin-page-heading{min-width:0}.page-eyebrow{display:block;margin-bottom:8px;color:#6385a0;font-size:.61rem;font-weight:800;letter-spacing:.13em}.admin-page-head h1{margin:0;color:#123e62;font-size:clamp(1.5rem,2.4vw,1.95rem);letter-spacing:-.04em;line-height:1.16;overflow-wrap:anywhere}.admin-page-head p{margin:9px 0 0;color:#627c90;max-width:720px;font-size:.87rem;line-height:1.6}.page-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}@media(max-width:700px){.admin-page-head{align-items:flex-start;flex-direction:column;gap:18px}.page-actions{width:100%}.page-actions:deep(.btn){flex:1}.page-eyebrow{font-size:.58rem}}
</style>
