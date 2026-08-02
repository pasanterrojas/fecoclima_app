<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const stations = ref<Record<string, any>[]>([])

const fields = computed(() => [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'producer_name', label: 'Productor u organización' },
  {
    key: 'station_id',
    label: 'Estación asociada',
    type: 'select',
    required: true,
    options: stations.value.map(item => ({ label: item.name, value: item.id }))
  },
  {
    key: 'area_ha',
    label: 'Superficie (ha)',
    type: 'number',
    numericMode: 'decimal',
    step: 0.001,
    min: 0,
    placeholder: '12.750',
    hint: 'Admite punto o coma decimal; se conservan hasta tres decimales en hectáreas.'
  },
  {
    key: 'latitude',
    label: 'Latitud',
    type: 'number',
    numericMode: 'decimal',
    step: 0.000001,
    min: -90,
    max: 90,
    placeholder: '-26.158510',
    hint: 'Admite punto o coma decimal. Se usa cuando no existe un polígono.'
  },
  {
    key: 'longitude',
    label: 'Longitud',
    type: 'number',
    numericMode: 'decimal',
    step: 0.000001,
    min: -180,
    max: 180,
    placeholder: '-55.272180',
    hint: 'Admite punto o coma decimal. En Paraguay normalmente es negativa.'
  },
  {
    key: 'influence_radius_m',
    label: 'Radio de influencia (m)',
    type: 'number',
    numericMode: 'integer',
    step: 1,
    min: 10,
    max: 100000,
    placeholder: '750',
    hint: 'Se utiliza solamente si no se registra un polígono GeoJSON.'
  },
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
  const stationData = await request<any>('/stations', { query: { limit: 250 } })
  stations.value = stationData.items || []
})
</script>

<template>
  <AdminCrudPage
    title="Parcelas"
    description="La parcela se configura una sola vez como referencia geográfica de una estación. Los campos decimales admiten punto o coma. El polígono GeoJSON permite asociar observaciones Sentinel-2."
    endpoint="/plots"
    :fields="fields as any"
    :columns="[
      { key: 'name', label: 'Nombre' },
      { key: 'producer_name', label: 'Productor' },
      { key: 'area_ha', label: 'Área ha' },
      { key: 'station_name', label: 'Estación' },
      { key: 'active', label: 'Activa' }
    ]"
  />
</template>
