<script setup lang="ts">
const props = defineProps<{ detailId?: string }>()
const fields: never[]=[]
</script>
<template><AdminCrudPage :detail-id="props.detailId" base-path="/fecoclima-ia/admin/auditoria" title="Auditoría" description="Inicios de sesión, cambios administrativos, sincronizaciones y errores." endpoint="/audit" :fields="fields" :columns="[{key:'created_at',label:'Fecha'},{key:'actor_email',label:'Responsable'},{key:'action',label:'Acción'},{key:'entity_type',label:'Entidad'},{key:'entity_id',label:'ID'},{key:'ip_address',label:'IP'}]">
  <template #record-detail="{record}"><details><summary>Ver cambios registrados</summary><pre>{{ JSON.stringify({antes:record.before_data,despues:record.after_data,detalle:record.extra_data},null,2) }}</pre></details></template>
</AdminCrudPage></template>
<style scoped>pre{max-height:440px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7fb;padding:18px;border-radius:10px;font-size:.8rem}summary{cursor:pointer;color:var(--fc-primary);font-weight:700}</style>
