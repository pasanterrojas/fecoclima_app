<script setup lang="ts">
const props = defineProps<{ detailId?: string }>()
const { request } = useApi()
const crudRef = ref<{load:()=>Promise<void>}>()
const crops = ref<Record<string,any>[]>([])
const modelOptions = ref<Array<{id:string;label:string}>>([])
const libraryDocuments = ref<Array<{id:string;title:string;crop_id?:string;index_status:string}>>([])
const modelWarning = ref(''), notice = ref('')
const purposes = [
  { label: 'Orquestador de parcela', value: 'ORCHESTRATOR' },
  { label: 'RAG agronómico por cultivo', value: 'RAG_CROP' },
  { label: 'Informes PDF', value: 'PDF_REPORT' },
  { label: 'Datos meteorológicos', value: 'WEATHER_ANALYSIS' },
  { label: 'Alertas', value: 'ALERT_ANALYSIS' },
  { label: 'Enfermedades posibles', value: 'DISEASE_ANALYSIS' },
  { label: 'Pronóstico a tres días', value: 'FORECAST_ANALYSIS' },
  { label: 'Chat contextual', value: 'CROP_CHAT' },
  { label: 'Análisis de Copernicus y geozona', value: 'SATELLITE_ANALYSIS' },
  { label: 'Análisis ambiental desde la siembra', value: 'PHENOLOGY_ANALYSIS' },
  { label: 'Boletín automático de 72 horas', value: 'DAILY_DIGEST' }
]

const agentTypes: Record<string,string> = { ORCHESTRATOR: 'Orquestador', RAG_CROP: 'Agro', PDF_REPORT: 'Académico', WEATHER_ANALYSIS: 'Datos', ALERT_ANALYSIS: 'Agro', DISEASE_ANALYSIS: 'Agro', FORECAST_ANALYSIS: 'Datos', CROP_CHAT: 'Chat', SATELLITE_ANALYSIS: 'GIS', PHENOLOGY_ANALYSIS: 'Agro', DAILY_DIGEST: 'Notificador' }
const fields = computed(() => [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'code', label: 'Código interno', required: true, hint: 'Identificador corto de este agente.' },
  {
    key: 'crop_id',
    label: 'Cultivo',
    type: 'select',
    options: [
      { label: 'General (orquestador, PDF o boletín)', value: '' },
      ...crops.value.map(crop => ({ label: crop.name, value: crop.id }))
    ],
    hint: 'Los agentes agro y notificadores requieren cultivo. Datos, académico, GIS, orquestador y chat pueden ser generales.'
  },
  { key: 'purpose', label: 'Tipo de agente y especialidad', type: 'select', required: true, defaultValue: 'RAG_CROP', options: purposes.filter(p=>['RAG_CROP','WEATHER_ANALYSIS','SATELLITE_ANALYSIS','ORCHESTRATOR','CROP_CHAT','DAILY_DIGEST','PDF_REPORT'].includes(p.value)).map(p => ({...p, label: `${agentTypes[p.value]} · ${p.label}`})) },
  { key: 'description', label: 'Descripción', type: 'textarea' },
  {
    key: 'system_prompt',
    label: 'Conocimiento y criterio del agente',
    type: 'textarea',
    hint: 'Defina el criterio del agente. Hereda los documentos del cultivo y recibe los cálculos ya procesados en Python.'
  },
  {
    key: 'response_detail_level',
    label: 'Nivel de detalle para el productor',
    type: 'select',
    required: true,
    defaultValue: 'BRIEF',
    options: [
      { label: 'Breve y accionable', value: 'BRIEF' },
      { label: 'Equilibrado', value: 'BALANCED' },
      { label: 'Detallado', value: 'DETAILED' }
    ]
  },
  {
    key: 'response_tone',
    label: 'Forma de hablar',
    type: 'select',
    required: true,
    defaultValue: 'DIRECT_FRIENDLY',
    options: [
      { label: 'Directo y cercano', value: 'DIRECT_FRIENDLY' },
      { label: 'Técnico sencillo', value: 'SIMPLE_TECHNICAL' },
      { label: 'Institucional', value: 'INSTITUTIONAL' }
    ]
  },
  { key: 'response_max_words', label: 'Máximo de palabras del informe', type: 'number', numericMode: 'integer', min: 100, max: 1200, defaultValue: 260, hint: 'Este ajuste controla la longitud solicitada al agente; el resumen de la parcela y el chat ahora permiten explicaciones más amplias.' },
  { key: 'response_max_sections', label: 'Máximo de secciones', type: 'number', numericMode: 'integer', min: 2, max: 8, defaultValue: 4 },
  { key: 'response_include_observed', label: 'Hablar de datos observados', type: 'checkbox', defaultValue: true },
  { key: 'response_include_forecast', label: 'Hablar del pronóstico', type: 'checkbox', defaultValue: true },
  { key: 'response_include_satellite', label: 'Hablar de imagen e índices satelitales', type: 'checkbox', defaultValue: true },
  { key: 'response_include_year_comparison', label: 'Incluir comparación con el año anterior', type: 'checkbox', defaultValue: true },
  { key: 'response_include_sources', label: 'Mostrar fuentes documentales al productor', type: 'checkbox', defaultValue: false },
  { key: 'response_show_technical_values', label: 'Mostrar cifras técnicas', type: 'checkbox', defaultValue: false, hint: 'Desactivado: el agente traduce las cifras a condiciones prácticas y conserva solo las decisivas.' },
  { key: 'response_show_system_details', label: 'Mostrar detalles internos del cálculo', type: 'checkbox', defaultValue: false, hint: 'Manténgalo desactivado para ocultar confianza, condiciones X de Y, motor, modelo y otros términos internos.' },
  { key: 'response_use_emojis', label: 'Usar emojis moderados', type: 'checkbox', defaultValue: true },
  {
    key: 'response_custom_instructions',
    label: 'Estructura y contenido del widget',
    type: 'textarea',
    placeholder: 'Ejemplo: incluya una sección titulada “Recomendación general” y allí explique el dato decisivo para el productor.',
    hint: 'Estas instrucciones tienen prioridad para los títulos, el orden de secciones y el enfoque visible. No pueden cambiar el nivel determinístico ni inventar datos.'
  },
  { key: 'provider', label: 'Proveedor de este agente', type: 'select', defaultValue: 'OPENAI', required: true, options: [{ label: 'OpenAI API', value: 'OPENAI' }, { label: 'Edge · Gemma / API compatible', value: 'EDGE' }] },
  { key: 'model', label: 'Modelo', type: 'select', options: modelOptions.value.map(model => ({value:model.id,label:model.label || model.id})), required: true, hint: 'Seleccione uno de los modelos disponibles en sus proveedores configurados.' },
  { key: 'allowed_widgets', label: 'Widgets permitidos al orquestador', type: 'checkbox-group', defaultValue: ['raw_data','alerts','phenology','diagnosis','satellite','diseases','forecast','chat'], options: [{value:'raw_data',label:'Datos crudos'},{value:'alerts',label:'Alertas'},{value:'phenology',label:'Fenología'},{value:'diagnosis',label:'Diagnóstico'},{value:'satellite',label:'Satélite'},{value:'diseases',label:'Enfermedades posibles'},{value:'forecast',label:'Pronóstico'},{value:'chat',label:'Chat'}], hint: 'Define qué tipos de widgets puede alimentar la síntesis del orquestador.' },
  { key: 'html_template', label: 'Plantilla HTML para informes PDF', type: 'textarea', hint: 'Jinja: {{ context.plot.name }}, {{ context.phenology.stage_name }}, {{ narrative }}. Puede usar CSS, tablas y bucles. Sin cálculos, archivos ni recursos remotos.' },
  { key: 'temperature', label: 'Temperatura', type: 'number', numericMode: 'decimal', step: 0.1, min: 0, max: 2, defaultValue: 0.2, placeholder: '0.2' },
  { key: 'max_tokens', label: 'Límite técnico de tokens', type: 'number', numericMode: 'integer', step: 1, min: 100, max: 20000, defaultValue: 1500, hint: 'Presupuesto del modelo. Para la interpretación de parcelas se recomiendan al menos 800 a 1500 tokens.' },
  { key: 'active', label: 'Activo', type: 'checkbox' }
].map(field => ({ ...field, ...(field.type === 'checkbox' ? {type:'boolean-select'} : {}), section: ['name','code','crop_id','purpose'].includes(field.key) ? '1. Identidad y especialidad' : ['provider','model','active'].includes(field.key) ? '2. Conexión y disponibilidad' : field.key === 'system_prompt' ? '3. Criterio del agente' : undefined, advanced: !['name','code','crop_id','purpose','provider','model','system_prompt','active'].includes(field.key), ...(['html_template','response_max_words','response_max_sections'].includes(field.key) ? {showWhen:{key:'purpose',values:['PDF_REPORT']}} : {}), ...(field.key === 'allowed_widgets' ? {showWhen:{key:'purpose',values:['ORCHESTRATOR']}} : {}) })).sort((a,b) => {
  const order = ['name','code','purpose','crop_id','provider','model','active','system_prompt']
  return (order.includes(a.key) ? order.indexOf(a.key) : 100) - (order.includes(b.key) ? order.indexOf(b.key) : 100)
}))


function onEditing(row:Record<string,any>) {
  if (row.model && !modelOptions.value.some(model=>model.id===row.model)) modelOptions.value.push({id:row.model,label:row.model})
}
async function afterAgentSave(row:Record<string,any>) {
  if(row.crop_id) {
    await request(`/knowledge/crops/${row.crop_id}/sync`,{method:'POST'})
    notice.value='Agente guardado y sincronizado con los documentos del cultivo.'
  }
}
onMounted(async()=>{
 const results = await Promise.allSettled([
  request<{items:Record<string,any>[]}>('/crops',{query:{limit:250}}),
  request<{items:Array<{id:string;label:string}>}>('/agents/model-options'),
  request<{items:Array<{id:string;label:string}>}>('/agents/model-options',{query:{provider:'EDGE'}}),
  request<{items:typeof libraryDocuments.value}>('/knowledge/documents',{query:{limit:250}}),
 ])
 if(results[0].status==='fulfilled')crops.value=results[0].value.items
 for(const result of [results[1],results[2]])if(result.status==='fulfilled')for(const item of result.value.items || [])if(!modelOptions.value.some(model=>model.id===item.id))modelOptions.value.push(item)
 if(!modelOptions.value.length)modelWarning.value='No hay modelos disponibles. Revise la conexión de IA en Integraciones.'
 if(results[3].status==='fulfilled')libraryDocuments.value=results[3].value.items
})
</script>
<template>
 <section>
  <p v-if="modelWarning" class="notice notice-warning">{{ modelWarning }}</p><p v-if="notice" class="notice notice-success">{{ notice }}</p>
  <AdminCrudPage ref="crudRef" :detail-id="props.detailId" base-path="/fecoclima-ia/admin/agentes" title="Agentes" description="Un experto agro por cultivo y especialistas por área temática. Configure respuestas claras para productor y técnico." endpoint="/agents" create-label="Agregar agente" :fields="fields as any" :after-save="afterAgentSave" :allow-test="true" :filters="[{key:'category',label:'Tipo de agente',options:[{value:'AGRO',label:'Agro'},{value:'DATOS',label:'Datos'},{value:'GIS',label:'GIS'},{value:'ORQUESTADOR',label:'Orquestador'},{value:'CHAT',label:'Chat'},{value:'NOTIFICADOR',label:'Notificador'},{value:'ACADEMICO',label:'Académico'}]},{key:'crop_scope',label:'Cultivo',options:[{value:'GENERAL',label:'General'},...crops.map(crop=>({value:crop.id,label:crop.name}))]}]" :columns="[{key:'name',label:'Nombre'},{key:'crop_name',label:'Cultivo'},{key:'category_label',label:'Tipo'},{key:'documents_count',label:'Documentos'},{key:'model',label:'Modelo'},{key:'active',label:'Estado'}]" @editing="onEditing">
   <template #drawer-extra="{form}">
    <section><h2 class="section-title">Base de conocimiento heredada</h2><p class="form-help">{{ form.crop_id ? 'Los documentos pertenecen al cultivo y se sincronizan al guardar este agente.' : 'Este especialista compartido consulta los documentos del cultivo de cada parcela analizada.' }}</p>
     <template v-if="form.crop_id"><NuxtLink class="btn btn-light" :to="`/fecoclima-ia/admin/cultivos/${form.crop_id}`">Administrar documentos del cultivo</NuxtLink><ul><li v-for="document in libraryDocuments.filter(item=>item.crop_id===form.crop_id)" :key="document.id">{{ document.title }} · {{ document.index_status === 'INDEXED' ? 'Disponible' : 'En preparación' }}</li></ul><p v-if="!libraryDocuments.some(item=>item.crop_id===form.crop_id)" class="form-help">Este cultivo todavía no tiene documentos. Puede agregarlos en su ficha.</p></template>
    </section>
   </template>
  </AdminCrudPage>
  <AgentActivityPanel v-if="props.detailId && props.detailId !== 'nuevo'" :agent-id="props.detailId" />
 </section>
</template>
