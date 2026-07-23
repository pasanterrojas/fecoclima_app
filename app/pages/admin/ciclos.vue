<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const stations = ref<Record<string, any>[]>([])
const crops = ref<Record<string, any>[]>([])
const plots = ref<Record<string, any>[]>([])

const fields = computed(() => [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'plot_id', label: 'Parcela', type: 'select', options: plots.value.map(item => ({ label: `${item.name}${item.station_name ? ` · ${item.station_name}` : ''}`, value: item.id })) },
  { key: 'station_id', label: 'Estación', type: 'select', required: true, options: stations.value.map(item => ({ label: item.name, value: item.id })) },
  { key: 'crop_id', label: 'Cultivo', type: 'select', required: true, options: crops.value.map(item => ({ label: item.name, value: item.id })) },
  { key: 'planting_date', label: 'Fecha de siembra', type: 'date', required: true },
  { key: 'sowing_type', label: 'Tipo de siembra' },
  { key: 'cycle_type', label: 'Tipo de ciclo', type: 'select', options: [{ label: 'Normal', value: 'normal' }] },
  { key: 'variety', label: 'Variedad' },
  { key: 'estimated_harvest_date', label: 'Cosecha estimada', type: 'date' },
  { key: 'current_stage', label: 'Etapa actual' },
  { key: 'stage_method', label: 'Método de determinación', type: 'select', options: [
    { label: 'Calculada', value: 'CALCULATED' },
    { label: 'Manual', value: 'MANUAL' },
    { label: 'Importada', value: 'IMPORTED' }
  ] },
  { key: 'status', label: 'Estado', type: 'select', options: [
    { label: 'Planificado', value: 'PLANNED' },
    { label: 'Activo', value: 'ACTIVE' },
    { label: 'Finalizado', value: 'FINISHED' }
  ] },
  { key: 'observations', label: 'Observaciones', type: 'textarea' }
])

onMounted(async () => {
  const [stationData, cropData, plotData] = await Promise.all([
    request<any>('/stations', { query: { limit: 250 } }),
    request<any>('/crops', { query: { limit: 250 } }),
    request<any>('/plots', { query: { limit: 250 } })
  ])
  stations.value = stationData.items || []
  crops.value = cropData.items || []
  plots.value = plotData.items || []
})
</script>

<template>
  <AdminCrudPage
    title="Ciclos productivos"
    description="Cree un ciclo ACTIVO para la misma estación y cultivo que se seleccionarán en el portal público. Para satélite, vincule también una parcela."
    endpoint="/crop-cycles"
    :fields="fields as any"
    :columns="[
      { key: 'name', label: 'Nombre' },
      { key: 'crop_name', label: 'Cultivo' },
      { key: 'station_name', label: 'Estación' },
      { key: 'plot_name', label: 'Parcela' },
      { key: 'planting_date', label: 'Siembra' },
      { key: 'current_stage', label: 'Etapa' },
      { key: 'status', label: 'Estado' }
    ]"
  />
</template>
