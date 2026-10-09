<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const fields = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'code', label: 'Código interno', required: true },
  { key: 'external_guid', label: 'GUID externo (solo API FECOCLIMA)', hint: 'Cada estación FECOCLIMA necesita su propio GUID. La credencial del proveedor se guarda únicamente en el backend.' },
  { key: 'description', label: 'Descripción', type: 'textarea' },
  { key: 'country', label: 'País' },
  { key: 'department', label: 'Departamento' },
  { key: 'district', label: 'Distrito' },
  { key: 'locality', label: 'Localidad' },
  {
    key: 'latitude',
    label: 'Latitud',
    type: 'number',
    numericMode: 'decimal',
    step: 0.000001,
    min: -90,
    max: 90,
    placeholder: '-26.158510',
    hint: 'Admite punto o coma decimal. Rango válido: -90 a 90.'
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
    hint: 'Admite punto o coma decimal. Rango válido: -180 a 180.'
  },
  {
    key: 'influence_radius_m',
    label: 'Radio de respaldo para Copernicus (m)',
    type: 'number',
    numericMode: 'integer',
    step: 10,
    min: 10,
    max: 100000,
    placeholder: '750',
    hint: 'Se usa únicamente cuando no se dibuja un polígono. El polígono tiene prioridad.'
  },
  {
    key: 'influence_geojson',
    label: 'Polígono de influencia de la estación',
    type: 'geojson-map',
    hint: 'Dibuje el área agrícola representada por la estación. Esta geometría se envía a Copernicus para Sentinel-2.'
  },
  {
    key: 'altitude_m',
    label: 'Altitud (m)',
    type: 'number',
    numericMode: 'decimal',
    step: 0.1,
    placeholder: '364.5',
    hint: 'Puede registrar metros con decimales.'
  },
  { key: 'timezone', label: 'Zona horaria', placeholder: 'America/Asuncion', hint: 'Use el identificador de zona horaria de la estación. Por ejemplo: America/Asuncion.' },
  {
    key: 'source_type',
    label: 'Tipo de fuente',
    type: 'select',
    options: [
      { label: 'API FECOCLIMA', value: 'FECOCLIMA_API' },
      { label: 'Excel', value: 'EXCEL' },
      { label: 'CSV', value: 'CSV' },
      { label: 'Manual', value: 'MANUAL' }
    ]
  },
  {
    key: 'expected_interval_minutes',
    label: 'Frecuencia esperada (min)',
    type: 'number',
    numericMode: 'integer',
    step: 1,
    min: 1,
    max: 1440,
    hint: 'Número entero entre 1 y 1440 minutos.'
  },
  { key: 'integration_config', label: 'Configuración de sensores (JSON)', type: 'textarea', json: true, placeholder: '{"soil_moisture_unit":"%"}', hint: 'Opcional. Indique las unidades propias de esta estación; por ejemplo {"soil_moisture_unit":"%"} o "cbar". No incluya contraseñas.' },
  { key: 'leaf_sensor_config', label: 'Sensor de hoja (JSON)', type: 'textarea', json: true, placeholder: '{}', hint: 'Opcional: configure aquí la interpretación del sensor de hoja para esta estación.' },
  { key: 'available_variables', label: 'Sensores disponibles (lista JSON)', type: 'textarea', json: true, placeholder: '["temp", "humid", "rain"]', hint: 'Opcional: registre únicamente los sensores reales de esta estación; use [] si aún no los conoce.' },
  { key: 'active', label: 'Activa', type: 'checkbox' }
] as const
</script>

<template>
  <AdminCrudPage
    title="Estaciones"
    description="Agregue cada estación con su ubicación, zona horaria y fuente. Para FECOCLIMA, registre un GUID distinto por estación. El polígono propio se usa para Copernicus; Excel/CSV se importan por estación desde Datos y sincronización."
    endpoint="/stations"
    :fields="fields as any"
    :columns="[
      { key: 'name', label: 'Nombre' },
      { key: 'code', label: 'Código' },
      { key: 'source_type', label: 'Fuente' },
      { key: 'locality', label: 'Localidad' },
      { key: 'last_synced_at', label: 'Última sincronización' },
      { key: 'active', label: 'Activa' }
    ]"
    create-label="Nueva estación"
  />
</template>
