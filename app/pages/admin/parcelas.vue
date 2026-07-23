<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const stations = ref<Record<string, any>[]>([])
const crops = ref<Record<string, any>[]>([])

const fields = computed(() => [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'producer_name', label: 'Productor u organización' },
  { key: 'crop_id', label: 'Cultivo', type: 'select', required: true, options: crops.value.map(item => ({ label: item.name, value: item.id })) },
  { key: 'station_id', label: 'Estación asociada', type: 'select', required: true, options: stations.value.map(item => ({ label: item.name, value: item.id })) },
  { key: 'area_ha', label: 'Superficie (ha)', type: 'number' },
  { key: 'latitude', label: 'Latitud', type: 'number' },
  { key: 'longitude', label: 'Longitud', type: 'number' },
  {
    key: 'geojson',
    label: 'Polígono GeoJSON',
    type: 'textarea',
    json: true,
    placeholder: '{\n  "type": "Polygon",\n  "coordinates": [[[...]]]\n}'
  },
  { key: 'active', label: 'Activa', type: 'checkbox' }
])

onMounted(async () => {
  const [stationData, cropData] = await Promise.all([
    request<any>('/stations', { query: { limit: 250 } }),
    request<any>('/crops', { query: { limit: 250 } })
  ])
  stations.value = stationData.items || []
  crops.value = cropData.items || []
})
</script>

<template>
  <AdminCrudPage
    title="Parcelas"
    description="La parcela debe corresponder al cultivo y estación del ciclo. El polígono GeoJSON será la unidad espacial para futuras observaciones Sentinel-2."
    endpoint="/plots"
    :fields="fields as any"
    :columns="[
      { key: 'name', label: 'Nombre' },
      { key: 'producer_name', label: 'Productor' },
      { key: 'area_ha', label: 'Área ha' },
      { key: 'station_name', label: 'Estación' },
      { key: 'crop_name', label: 'Cultivo' },
      { key: 'active', label: 'Activa' }
    ]"
  />
</template>
