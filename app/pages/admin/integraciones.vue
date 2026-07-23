<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const fields = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'integration_type', label: 'Tipo', type: 'select', required: true, options: [
    { label: 'Estación meteorológica', value: 'WEATHER' },
    { label: 'Pronóstico', value: 'FORECAST' },
    { label: 'Satélite', value: 'SATELLITE' },
    { label: 'Inteligencia artificial', value: 'AI' },
    { label: 'Correo SMTP', value: 'SMTP' }
  ] },
  { key: 'provider', label: 'Proveedor', type: 'select', required: true, options: [
    { label: 'FECOCLIMA', value: 'FECOCLIMA' },
    { label: 'Open-Meteo', value: 'OPEN_METEO' },
    { label: 'Copernicus Data Space', value: 'COPERNICUS_DATA_SPACE' },
    { label: 'API compatible con OpenAI', value: 'OPENAI_COMPATIBLE' },
    { label: 'SMTP', value: 'SMTP' }
  ] },
  { key: 'base_url', label: 'URL base' },
  { key: 'timeout_seconds', label: 'Timeout (s)', type: 'number' },
  { key: 'retry_count', label: 'Reintentos', type: 'number' },
  { key: 'sync_frequency_minutes', label: 'Frecuencia (min)', type: 'number' },
  {
    key: 'non_sensitive_config',
    label: 'Parámetros JSON',
    type: 'textarea',
    json: true,
    placeholder: '{\n  "timezone": "America/Asuncion"\n}'
  },
  { key: 'secret_value', label: 'Actualizar credencial' },
  { key: 'active', label: 'Activa', type: 'checkbox' }
] as const
</script>

<template>
  <AdminCrudPage
    title="Integraciones"
    description="Registro administrativo de FECOCLIMA, pronóstico, satélite, IA y SMTP. Los secretos operativos continúan configurándose en el .env del backend."
    endpoint="/integrations"
    :fields="fields as any"
    :columns="[
      { key: 'name', label: 'Nombre' },
      { key: 'integration_type', label: 'Tipo' },
      { key: 'provider', label: 'Proveedor' },
      { key: 'active', label: 'Activa' },
      { key: 'last_run_at', label: 'Última ejecución' },
      { key: 'last_result', label: 'Resultado' }
    ]"
  />
</template>
