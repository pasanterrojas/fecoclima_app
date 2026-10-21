<script setup lang="ts">
const props = defineProps<{ detailId?: string }>()
const tab = ref('info')
const knowledgeRef = ref<{uploadPending:(crop:{id:string})=>Promise<void>}>()
const { request } = useApi()
async function afterSave(crop:Record<string,any>) {
  const persisted = await request<Record<string, any>>(`/crops/${crop.id}`)
  const requestedMonths = [...(crop.planting_months || [])].map(Number).sort((a,b)=>a-b)
  const storedMonths = [...(persisted.planting_months || [])].map(Number).sort((a,b)=>a-b)
  if (persisted.active !== crop.active || JSON.stringify(storedMonths) !== JSON.stringify(requestedMonths)) {
    throw new Error('El servidor no conservó la disponibilidad o los meses de siembra. Revise la migración 0009 y la versión activa de la API.')
  }
  await knowledgeRef.value?.uploadPending({id:crop.id})
}
const fields = [
  {key:'name',label:'¿Cómo se llama el cultivo?',required:true,placeholder:'Ej. Trigo',section:'1. Identifique el cultivo'},
  {key:'code',label:'Código del cultivo',required:true,hint:'Un nombre corto sin espacios. Ejemplos: TRIGO o SOJA.',section:'1. Identifique el cultivo'},
  {key:'description',label:'Características y especificaciones',type:'textarea',placeholder:'Describa las variedades, la zona o los aspectos que deban conocer sus agentes.',section:'1. Identifique el cultivo'},
  {key:'planting_months',label:'Meses de siembra',type:'checkbox-group',defaultValue:[],options:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((label,index)=>({label,value:index+1})),hint:'Seleccione todos los meses de la ventana de siembra. Este calendario orienta; no cambia la fecha real de cada parcela.',section:'2. Disponibilidad y calendario'},
  {key:'active',label:'¿Está disponible para los productores?',type:'boolean-select',defaultValue:true,section:'2. Disponibilidad y calendario'},
]
</script>
<template>
  <section>
    <nav v-if="detailId && detailId !== 'nuevo'" class="detail-tabs" aria-label="Información del cultivo"><button type="button" :class="{active:tab === 'info'}" :aria-pressed="tab === 'info'" @click="tab = 'info'">Información y documentos</button><button type="button" :class="{active:tab === 'fenologia'}" :aria-pressed="tab === 'fenologia'" @click="tab = 'fenologia'">Calendario fenológico</button><button type="button" :class="{active:tab === 'reglas'}" :aria-pressed="tab === 'reglas'" @click="tab = 'reglas'">Reglas y alertas</button></nav>
    <AdminCrudPage v-show="tab === 'info'" title="Cultivos" description="Administre cultivos, documentos técnicos y reglas." endpoint="/crops" base-path="/fecoclima-ia/admin/cultivos" :detail-id="props.detailId" create-label="Agregar cultivo" :fields="fields as any" :after-save="afterSave" :columns="[{key:'name',label:'Cultivo'},{key:'code',label:'Código'},{key:'rules_status',label:'Reglas'},{key:'active',label:'Estado'}]">
      <template #drawer-extra><CropKnowledgeDocuments ref="knowledgeRef" :crop-id="props.detailId && props.detailId !== 'nuevo' ? props.detailId : undefined" /></template>
    </AdminCrudPage>
    <section v-if="tab === 'fenologia' && detailId && detailId !== 'nuevo'"><NuxtLink to="/fecoclima-ia/admin/cultivos" class="back-link">← Volver a cultivos</NuxtLink><CropPhenologyEditor :crop-id="detailId" /></section>
    <section v-if="tab === 'reglas' && detailId && detailId !== 'nuevo'"><NuxtLink to="/fecoclima-ia/admin/cultivos" class="back-link">← Volver a cultivos</NuxtLink><CropRulesEditor :crop-id="detailId" /></section>
  </section>
</template>
