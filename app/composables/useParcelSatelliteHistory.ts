import type { ParcelAnalysis } from '~/types/plots'

type Scene = NonNullable<ParcelAnalysis['context']['satellite']>

/** Processed scenes and provider refreshes scoped to the active saved parcel. */
export function useParcelSatelliteHistory(plotId: Ref<string>) {
  const { request } = usePublicParcelApi()
  const history = ref<Scene[]>([])
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const message = ref('')
  const status = ref('')
  const pollingPaused = ref(false)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load(id: string, ticket: number) {
    const result = await request<{ items: Scene[] }>(`/parcels/${id}/satellite/history`)
    if (ticket === generation) history.value = result.items || []
  }

  async function poll(id: string, ticket: number, attempt = 0) {
    if (ticket !== generation) return
    try {
      const state = await request<{ status: string; message: string }>(`/parcels/${id}/satellite-status`)
      if (ticket !== generation) return
      message.value = state.message
      status.value = state.status
      await load(id, ticket)
      if (ticket !== generation) return
      error.value = ''
      if (['FAILED', 'UNAVAILABLE'].includes(state.status)) {
        error.value = state.message
        message.value = ''
      }
      if (state.status !== 'PROCESSING') { refreshing.value = false; return }
      refreshing.value = true
    } catch {
      if (ticket !== generation) return
      error.value = 'No se pudo consultar el estado satelital. Reintentando…'
    }
    if (attempt >= 120) {
      refreshing.value = false
      pollingPaused.value = true
      message.value = 'La búsqueda continúa. Consulte la imagen más reciente en unos minutos.'
      return
    }
    timer = setTimeout(() => { void poll(id, ticket, attempt + 1) }, 5000)
  }

  async function refresh() {
    const id = plotId.value
    if (!id || refreshing.value) return
    if (timer) clearTimeout(timer)
    const ticket = ++generation
    loading.value = false
    refreshing.value = true
    pollingPaused.value = false
    status.value = 'PROCESSING'
    error.value = ''
    message.value = 'Buscando las 3 imágenes más recientes en Copernicus…'
    try {
      await request(`/parcels/${id}/satellite/refresh`, { method: 'POST' })
      if (ticket === generation) await poll(id, ticket)
    } catch (exception: any) {
      if (ticket === generation) {
        error.value = typeof exception?.data?.detail === 'string' ? exception.data.detail
          : exception?.response?.status === 404 ? 'No se encontró la parcela o el servicio de imágenes. Recargue la página para volver a consultar.'
          : 'No se pudo buscar la imagen más reciente. Vuelva a intentar.'
        message.value = ''
        status.value = 'FAILED'
        refreshing.value = false
      }
    }
  }

  watch(plotId, async id => {
    const ticket = ++generation
    if (timer) clearTimeout(timer)
    history.value = []
    refreshing.value = false
    error.value = ''
    message.value = ''
    status.value = ''
    pollingPaused.value = false
    loading.value = !!id
    if (!id) return
    try { await poll(id, ticket) }
    catch { if (ticket === generation) error.value = 'No se pudo cargar el historial de imágenes.' }
    finally { if (ticket === generation) loading.value = false }
  }, { immediate: true })
  onBeforeUnmount(() => { generation++; if (timer) clearTimeout(timer) })
  return { history, loading, refreshing, error, message, status, pollingPaused, refresh }
}
