/** Distinguish usable historical imagery from a pending refresh. */
export function imageryStatus(status: string | undefined, hasData: boolean, loading: boolean, paused: boolean, error: string) {
  const processing = status === 'PROCESSING'
  const busy = !hasData && (loading || (processing && !paused && !error))
  return {
    busy,
    label: hasData ? 'Datos disponibles' : loading ? 'Consultando imágenes' : processing
      ? hasData ? 'Imagen anterior · actualización pendiente' : paused || error ? 'Consulta pendiente' : 'Procesando imágenes'
      : hasData ? 'Datos disponibles' : error ? 'No se pudo consultar' : 'Pendiente',
    message: processing && hasData
      ? 'La imagen y sus índices ya están disponibles. Se está comprobando si hay nuevas escenas.'
      : processing && (paused || error) ? 'Aún no se confirmó el resultado de la búsqueda. Pulse Actualizar imágenes para comprobar su estado.'
      : '',
  }
}
