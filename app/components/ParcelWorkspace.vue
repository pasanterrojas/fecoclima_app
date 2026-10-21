<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  CircleHelp,
  MapPinned,
  Pencil,
  Trash2,
  Satellite,
  Plus,
  RefreshCw,
  Send,
  Sprout,
  Upload, Mic, Square, Paperclip, Image as ImageIcon, Share2, X, MessageCircle, Download
} from 'lucide-vue-next'
import { readParcelCache, writeParcelCache, type ParcelBrowserCache } from '~/utils/parcelBrowserCache'
import { widgetSummary } from '~/utils/widgetText'
import { prepareChatImages } from '~/utils/chatImages'
import { imageryStatus } from '~/utils/imageryStatus'
import { parcelDisplayColor, parcelColors } from '~/utils/parcelColors'
import { parcelSessionId, syncSessionParcels } from '~/utils/parcelSession'
import type { ChatMessage, Interpretation, Parcel, ParcelDraft, ParcelAnalysis } from '~/types/plots'
import type { Geometry, MapStation } from '~/types/plots'

const { request, apiUrl, ready: prepareBrowser } = usePublicParcelApi()
const { dateTime:dateLabel, zoneLabel:viewerZoneLabel } = useViewerTime()
const selection = useSelectionStore()
const parcels = ref<Parcel[]>([])
const analysis = ref<ParcelAnalysis | null>(null)
const loading = ref(true)
const busy = ref('')
const error = ref('')
const notice = ref('')
const technical = ref(false)
const hours = ref('72')
const formOpen = ref(false)
const editing = ref<Parcel | undefined>()
const selected = computed(() => parcels.value.find((row) => row.id === selection.plotId))
const context = computed(() => analysis.value?.context)
const analysisHours = computed(() => context.value?.selected_window_hours ?? (context.value?.windows['72'] ? 72 : Number(Object.keys(context.value?.windows || {})[0] || hours.value)))
const window = computed(() => context.value?.windows[String(analysisHours.value)])
const messages = ref<ChatMessage[]>([])
const question = ref('')
const files = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const attachmentInput = ref<HTMLInputElement | null>(null)
const chatScroll = ref<HTMLElement | null>(null)
const attachments = ref<File[]>([])
const recording = ref(false)
const audioError = ref('')
let recorder: MediaRecorder | null = null
let microphone: MediaStream | null = null
const canSendChat = computed(() => Boolean(question.value.trim() || files.value.length || attachments.value.length))
const chatVisibleResults = (key: string) => {
  const result = analysis.value?.agent_results?.[key]
  return result && Number((result as Interpretation & {window_hours?:number}).window_hours) === analysisHours.value
    && (result as Interpretation & {view_mode?:string}).view_mode === (technical.value ? 'technical' : 'producer') ? result : undefined
}
function scrollToLatest() {
  if (import.meta.client) nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}
watch(messages, scrollToLatest, { deep: true })
function addChatFiles(event: Event, type: 'images' | 'attachments') {
  const input = event.target as HTMLInputElement
  const added = Array.from(input.files || [])
  const target = type === 'images' ? files : attachments
  target.value = [...target.value, ...added].slice(0, 4)
  input.value = ''
}
function removeChatFile(type: 'images' | 'attachments', index: number) {
  const target = type === 'images' ? files : attachments
  target.value = target.value.filter((_, i) => i !== index)
}
function onChatKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    if (!busy.value && canSendChat.value) void sendChat()
  }
}
async function startVoice() {
  audioError.value = ''
  if (!import.meta.client || !navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    audioError.value = 'Este navegador no admite grabación. Puede adjuntar un audio desde su dispositivo.'
    return
  }
  try {
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true })
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(candidate => MediaRecorder.isTypeSupported(candidate))
    recorder = new MediaRecorder(microphone, type ? { mimeType: type } : undefined)
    const parts: BlobPart[] = []
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data) }
    recorder.onstop = () => {
      const mime = recorder?.mimeType.split(';')[0] || 'audio/webm'
      if (parts.length) {
        const ext = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm'
        attachments.value = [...attachments.value.filter(file => !file.type.startsWith('audio/')),
          new File(parts, `nota-de-voz-${Date.now()}.${ext}`, { type: mime })].slice(0, 4)
      }
      microphone?.getTracks().forEach(track => track.stop())
      microphone = null
      recorder = null
      recording.value = false
    }
    recorder.start()
    recording.value = true
  } catch {
    audioError.value = 'No se pudo acceder al micrófono. Verifique los permisos o adjunte un audio.'
    microphone?.getTracks().forEach(track => track.stop())
    microphone = null
  }
}
function stopVoice() { if (recorder?.state === 'recording') recorder.stop() }
async function shareChat() {
  if (!import.meta.client) return
  const text = messages.value.slice(-12).map(item => `${item.role === 'user' ? 'Usted' : 'FECOCLIMA IA'}: ${item.content}`).join('\n\n')
  if (!text) return
  if (navigator.share) {
    try { await navigator.share({ title: 'Mi conversación FECOCLIMA IA', text }); return } catch { /* Puede cancelar */ }
  }
  try { await navigator.clipboard.writeText(text); notice.value = 'Conversación copiada para compartir.' }
  catch { audioError.value = 'No se pudo compartir desde este navegador.' }
}
const mapStations = ref<MapStation[]>([])
const cropOptions = ref<{ id: string; code: string; name: string }[]>([])
const mapGeometry = ref<Geometry | null>(null)
const previewEnabled = computed(() => {
  const parcel = selected.value
  // Do not create anonymous previews/jobs for an already-owned, unchanged parcel.
  return !parcel || JSON.stringify(parcel.geojson) !== JSON.stringify(mapGeometry.value)
})
const imageryPreview = useParcelImagery(mapGeometry, previewEnabled)
const mapImagery = computed(() => {
  const previewScene = imageryPreview.scene.value
  const snapshot = context.value
  // Preview media links are revoked when the crop-less polygon is promoted to a parcel.
  // Prefer the newly private/authenticated URLs in the active analysis.
  if (snapshot?.satellite && JSON.stringify(snapshot.plot.geojson) === JSON.stringify(mapGeometry.value)) {
    return { ...snapshot.satellite, index_images: {
      ...snapshot.satellite.index_images,
      ...(snapshot.satellite.image_available && snapshot.satellite.source_url ? { rgb: snapshot.satellite.source_url } : {}),
    } }
  }
  if (previewScene && previewEnabled.value) return { ...previewScene, index_images: {
    ...previewScene.index_images,
    ...(previewScene.image_available && previewScene.source_url ? { rgb: previewScene.source_url } : {}),
  } }
  return null
})
type SpectralScene = NonNullable<ParcelAnalysis['context']['satellite']>
const spectralLabels: Record<string, string> = {
  ndvi: 'Vegetación', ndmi: 'Humedad de la vegetación', ndwi: 'Agua superficial', ndre: 'Clorofila',
  evi: 'Actividad vegetal', savi: 'Vegetación y suelo', gndvi: 'Verdor', nbr: 'Cambios en cobertura', msi: 'Estrés hídrico', recl: 'Clorofila de borde rojo',
}
const satelliteProgress = ref('')
const satelliteAutomaticUpdate = ref(false)
let satelliteTimer: ReturnType<typeof setTimeout> | undefined
let satellitePollGeneration = 0
let satelliteUpdating = false
const spectralScene = computed(() => mapImagery.value)
const spectralValues = computed(() => {
  const item = spectralScene.value
  if (!item) return []
  return Object.entries({ ...(item.indices || {}), ndvi: item.ndvi ?? item.indices?.ndvi, ndmi: item.ndmi ?? item.indices?.ndmi, ndwi: item.ndwi ?? item.indices?.ndwi })
    .filter(([key, value]) => key in spectralLabels && typeof value === 'number' && Number.isFinite(value))
    .map(([key, value]) => ({ key, title: spectralLabels[key]!, value: Number(value), label: key.toUpperCase() }))
})
function formatSpectral(value: number) { return value.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) }
function stopSatelliteTracking() {
  satellitePollGeneration++
  if (satelliteTimer) clearTimeout(satelliteTimer)
  satelliteTimer = undefined
}
async function followSatellite(plotId: string, analysisId: string, generationId: number, attempt = 0) {
  if (generationId !== satellitePollGeneration || analysis.value?.id !== analysisId || selection.plotId !== plotId) return
  if (attempt >= 72) {
    satelliteProgress.value = 'Copernicus continúa procesando. Puede actualizar la consulta más adelante.'
    return
  }
  try {
    const state = await request<{status: string; satellite: SpectralScene | null; job_status?: string | null; message: string}>(`/parcels/${plotId}/satellite-status`)
    if (generationId !== satellitePollGeneration || analysis.value?.id !== analysisId) return
    satelliteProgress.value = state.message
    if (state.satellite && !agentsRunning.value && !busy.value && !satelliteUpdating) {
      satelliteUpdating = true
      try {
        const result = await request<{updated: boolean; analysis: ParcelAnalysis}>(`/parcels/analyses/${analysisId}/satellite/sync`, {method: 'POST'})
        if (generationId === satellitePollGeneration && analysis.value?.id === analysisId && result.updated) {
          analysis.value = result.analysis
          satelliteAutomaticUpdate.value = true
          notice.value = 'Llegaron nuevos datos de la imagen de su parcela. Actualizando las recomendaciones de la IA…'
          await interpret('RAG_CROP')
          if (generationId === satellitePollGeneration && analysis.value?.id === analysisId) await interpret('SATELLITE_ANALYSIS')
          if (generationId === satellitePollGeneration && analysis.value?.id === analysisId) await interpret('ORCHESTRATOR')
          if (generationId === satellitePollGeneration) notice.value = 'Índices satelitales incorporados a los widgets y al chat de esta parcela.'
        }
      } finally { satelliteUpdating = false }
    }
    if (state.status === 'PROCESSING' || (state.satellite && (agentsRunning.value || !!busy.value))) {
      satelliteTimer = setTimeout(() => { void followSatellite(plotId, analysisId, generationId, attempt + 1) }, 5000)
    }
  } catch {
    // Temporary failures should not erase the weather context or interrupt the chat.
    satelliteProgress.value = 'No se pudo comprobar el estado satelital. Se reintentará automáticamente.'
    satelliteTimer = setTimeout(() => { void followSatellite(plotId, analysisId, generationId, attempt + 1) }, 8000)
  }
}
function beginSatelliteTracking() {
  stopSatelliteTracking()
  satelliteAutomaticUpdate.value = false
  satelliteProgress.value = ''
  if (!analysis.value || !selection.plotId) return
  const token = satellitePollGeneration
  void followSatellite(selection.plotId, analysis.value.id, token)
}
type CoveragePreview = {
  coverage_pct: number
  area_ha?: number
  eligible: boolean
  station_influences: Array<{ station_id: string; name: string; coverage_pct: number }>
}
const coveragePreview = ref<CoveragePreview | null>(null)
const coverageLoading = ref(false)
const agentsRunning = ref(false)
const analysisStage = ref(0)
const analysisDetail = ref('')
const mapParcelName = ref('')
const mapParcelColor = ref(parcelColors[0]!)
const producerName = ref('')
const producerDocument = ref('')
const sessionCount = ref(0)
const deleteConfirmation = ref(false)
const satelliteDisplay = computed(() => imageryStatus(previewEnabled.value ? imageryPreview.state.value?.status : undefined, !!spectralValues.value.length, imageryPreview.loading.value, imageryPreview.pollingPaused.value, imageryPreview.error.value))
const satelliteBusy = computed(() => !!mapGeometry.value && satelliteDisplay.value.busy)
const mapCropId = ref('')
const mapPlantingDate = ref('')
const todayForPlanting = ref('')
let generation = 0
let coverageTimer: ReturnType<typeof setTimeout> | undefined
let coverageRequest = 0
let suppressSelectionReload = false

const eligibleMapCrops = computed(() => cropOptions.value)
const mapCanAnalyze = computed(
  () =>
    !!mapGeometry.value &&
    !!mapParcelName.value.trim() && !!producerName.value.trim() && producerDocument.value.trim().length >= 4 &&
    !!coveragePreview.value?.eligible &&
    !!mapCropId.value &&
    !!mapPlantingDate.value &&
    !coverageLoading.value &&
    !busy.value &&
    !agentsRunning.value
)

const diseaseNames = computed(() => [
  ...new Set((window.value?.stations || []).flatMap((row) => (row.alert.diseases || []).map((d) => d.name)))
])
const currentSnapshot = computed(
  () =>
    !!selected.value &&
    !!context.value &&
    analysisHours.value === Number(hours.value) &&
    context.value.plot.name === selected.value.name &&
    context.value.plot.crop_id === selected.value.crop_id &&
    context.value.plot.planting_date === selected.value.planting_date &&
    JSON.stringify(context.value.plot.geojson) === JSON.stringify(selected.value.geojson)
)
const levelLabels: Record<string, string> = {
  NINGUNA: 'Normal',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
  DATOS_INSUFICIENTES: 'Sin clasificación: faltan datos'
}
const tone = computed(
  () => ({ GRAVE: 'severe', MODERADA: 'moderate', NINGUNA: 'good' })[window.value?.level || ''] || 'unknown'
)
const reportedConditions = computed(() => (window.value?.stations || []).flatMap(station =>
  (station.alert.conditions || []).map(condition => ({
    ...condition,
    station: context.value?.station_influences?.find(row => row.station_id === station.station_id)?.name || 'Estación'
  }))
))
const soilCriterionAdaptations = computed(() => (window.value?.stations || []).flatMap(station => (station.condition_adaptations || []).map(item => ({ ...item, station: context.value?.station_influences.find(row => row.station_id === station.station_id)?.name || 'Estación' }))))
const matchedConditions = computed(() => reportedConditions.value.filter(row => row.status === 'met'))
const missingConditions = computed(() => reportedConditions.value.filter(row => row.status === 'missing'))
const evaluatedConditions = computed(() => reportedConditions.value.filter(row => row.status === 'not_met'))
const severityExplanation = computed(() => {
  if (!window.value) return 'Analice la parcela para consultar sus condiciones.'
  if (window.value.level === 'DATOS_INSUFICIENTES') return 'Hay señales observadas, pero faltan datos indispensables para decidir si el riesgo es normal, moderado o grave. El sistema no debe suponer que las condiciones sin medir son seguras.'
  if (window.value.level === 'NINGUNA') return 'Las condiciones evaluadas no alcanzan el umbral de alerta configurado. Continúe con el seguimiento.'
  if (window.value.level === 'MODERADA') return 'Varias condiciones de riesgo se cumplieron. Revise las zonas vulnerables del cultivo y continúe vigilando el pronóstico.'
  return 'Se cumplieron suficientes condiciones para requerir revisión prioritaria. Verifique el cultivo en campo; la alerta no confirma una enfermedad.'
})
const prioritizedInfluence = computed(() => context.value?.station_influences?.[0] || null)
const orderedReadings = computed(() => {
  const influences = context.value?.station_influences || []
  return [...(context.value?.raw_readings || [])].sort((a, b) =>
    influences.findIndex(row => row.station_id === a.station_id) - influences.findIndex(row => row.station_id === b.station_id)
  )
})
const windowHasGaps = computed(() => window.value?.stations?.some(station => station.data_issues?.length))
const coverageIssue = computed(() =>
  !!window.value && window.value.level === 'DATOS_INSUFICIENTES' &&
  window.value.usable_coverage_pct != null && window.value.usable_coverage_pct < 99
)
const prioritizedReason = computed(() => {
  const row = prioritizedInfluence.value
  if (!row) return 'No hay una estación con cobertura geográfica para este terreno.'
  const distance = row.distance_m < 1000 ? `${Math.round(row.distance_m)} m` : `${(row.distance_m / 1000).toLocaleString('es-PY', { maximumFractionDigits: 1 })} km`
  return `Se eligió por la cobertura del polígono (${row.coverage_pct.toLocaleString('es-PY', { maximumFractionDigits: 1 })}%) y, en caso de empate, la cercanía (${distance}). La fuente puede cambiar si cambia el polígono.`
})
const missingDataExplanation = computed(() => {
  const diagnosed = window.value?.stations?.flatMap(station => station.data_issues || [])[0]
  if (diagnosed) return diagnosed.message
  const explicit = window.value?.representative_alert?.missing_reasons?.[0]
  if (explicit) return widgetSummary(explicit)
  for(const station of window.value?.stations || []) {
    const missing=(station.alert.conditions || []).filter(condition=>condition.status==='missing')
    const sensor=context.value?.raw_readings.find(row=>row.station_id===station.station_id)?.sensor_units?.soil_moisture_pct
    if(sensor && sensor!=='%' && missing.some(condition=>condition.label.toLowerCase().includes('suelo') && condition.unit==='%')) return `La estación mide tensión del suelo en ${sensor}, pero la regla exige porcentaje. Esa condición necesita una regla compatible; no equivale a que el suelo esté seco o húmedo.`
    if(missing.length)return widgetSummary(`No se pudo evaluar: ${missing.map(item=>item.label).join(', ')}. Revise las mediciones y unidades de la regla.`)
  }
  return widgetSummary(window.value?.representative_alert?.simple_explanation || 'Revise la actualización de las lecturas, la cobertura de la parcela y el calendario del cultivo.')
})
function messageOf(e: unknown): string {
  const d = (e as { data?: { detail?: unknown } }).data?.detail
  return typeof d === 'string' ? d : 'No se pudo completar la operación. Intente nuevamente.'
}

function showParcelOnMap(parcel: Parcel) {
  mapGeometry.value=parcel.geojson
  mapParcelName.value=parcel.name
  mapParcelColor.value=parcelDisplayColor(parcel)
  producerName.value=parcel.producer_name || ''
  producerDocument.value=parcel.producer_document || ''
  mapCropId.value=parcel.crop_id
  mapPlantingDate.value=parcel.planting_date
}
function selectMapParcel(id: string) {
  if(busy.value || agentsRunning.value || !parcels.value.some(parcel=>parcel.id===id))return
  selection.plotId=id
}
async function saveParcelColor() {
  const parcel=selected.value
  if(!parcel || busy.value || agentsRunning.value)return
  const previous=parcelDisplayColor(parcel)
  busy.value='color'
  try{
    const updated=await request<Parcel>(`/parcels/${parcel.id}`,{method:'PUT',body:{...parcel,map_color:mapParcelColor.value}})
    parcels.value=parcels.value.map(row=>row.id===updated.id ? updated : row)
    notice.value='Color de la parcela guardado.'
  }catch(e){mapParcelColor.value=previous;error.value=messageOf(e)}
  finally{busy.value=''}
}

function openForm(parcel?: Parcel) {
  if(!parcel && sessionCount.value>=3){notice.value='Tiene tres parcelas guardadas en esta sesión. Elimine una para crear otra.';return}
  editing.value = parcel
  formOpen.value = true
}

async function loadParcels() {
  const result = await request<{ items: Parcel[]; session_quota?: {count: number; limit: number} }>('/parcels')
  const previousId = selection.plotId
  parcels.value = result.items
  if (import.meta.client) {
    const currentIds = result.items.filter(parcel => parcel.browser_session_id === parcelSessionId()).map(parcel => parcel.id)
    syncSessionParcels(currentIds)
    sessionCount.value = result.session_quota?.count ?? currentIds.length
  }
  if (!result.items.some(p => p.id === previousId)) {
    if (previousId) {
      mapGeometry.value = null
      resetAnalysisForRun()
      selection.plotId = ''
      sessionStorage.setItem('fecoclima-map-cleared', '1')
    } else {
      const cleared = import.meta.client && sessionStorage.getItem('fecoclima-map-cleared') === '1'
      selection.plotId = cleared || mapGeometry.value ? '' : result.items[0]?.id || ''
    }
  }
}

/** Both map deletion and header deletion await the API before clearing evidence. */
async function deleteSelectedParcel(): Promise<boolean> {
  if (busy.value === 'delete') return false
  const parcel = selected.value
  if (!parcel) return true
  // Cancel late analysis responses while retaining the visible evidence if deletion fails.
  generation++
  stopSatelliteTracking()
  busy.value = 'delete'
  error.value = ''
  try {
    try { await request(`/parcels/${parcel.id}`, { method: 'DELETE' }) }
    catch (exception: any) { if (exception?.response?.status !== 404) throw exception }
    parcels.value = parcels.value.filter(row => row.id !== parcel.id)
    resetAnalysisForRun()
    imageryPreview.stop(true)
    selection.plotId = ''
    mapGeometry.value = null
    mapParcelName.value = ''
    sessionStorage.setItem('fecoclima-map-cleared', '1')
    sessionCount.value = Math.max(0, sessionCount.value - (parcel.browser_session_id === parcelSessionId() ? 1 : 0))
    await loadParcels().catch(() => { /* The deletion succeeded; refresh the list when connectivity returns. */ })
    notice.value = 'Parcela eliminada. Tiene espacio para crear una nueva.'
    return true
  } catch (exception) {
    error.value = messageOf(exception)
    return false
  } finally { busy.value = ''; deleteConfirmation.value = false }
}

function prepareParcel(draft: ParcelDraft) {
  resetAnalysisForRun()
  selection.plotId = ''
  mapGeometry.value = draft.geojson
  mapParcelName.value = draft.name
  mapParcelColor.value = parcelDisplayColor(draft)
  producerName.value = draft.producer_name || ''
  producerDocument.value = draft.producer_document || ''
  mapCropId.value = draft.crop_id
  mapPlantingDate.value = draft.planting_date
  formOpen.value = false
  editing.value = undefined
  saveMapDraft()
  notice.value = 'Polígono preparado. Su parcela se guardará al analizar por primera vez.'
}
async function loadSelected() {
  const id = selection.plotId,
    token = ++generation
  const cached = cacheReady ? browserCache.analyses[id] : null
  analysis.value = cached || null
  messages.value = cached && cacheReady ? browserCache.chats[cached.id] || [] : []
  error.value = ''
  notice.value = ''
  if (!id) { loading.value=false; return }
  loading.value = true
  try {
    const snapshot = await request<ParcelAnalysis | null>(`/parcels/${id}/analyses/latest`)
    if (token !== generation) return
    analysis.value = snapshot
    if (snapshot) hours.value = String(analysisHours.value)
    if (snapshot) {
      const history=await request<{messages:ChatMessage[]}>(`/parcels/analyses/${snapshot.id}/chat`)
      if(token===generation)messages.value=history.messages
    }
  } catch (e: unknown) {
    if (token === generation) {
      if (cached) notice.value = 'Mostrando el último análisis guardado en este navegador. No se pudo consultar una actualización.'
      else error.value = messageOf(e)
    }
  } finally {
    if (token === generation) loading.value = false
  }
}
function saveMapDraft() {
  if (!import.meta.client) return
  const value = {
    geojson: mapGeometry.value,
    name: mapParcelName.value,
    map_color: mapParcelColor.value,
    crop_id: mapCropId.value,
    planting_date: mapPlantingDate.value,
    window_hours: Number(hours.value),
    producer_name: producerName.value, producer_document: producerDocument.value,
  }
  if (mapGeometry.value) sessionStorage.setItem('fecoclima-parcel-draft', JSON.stringify(value))
  else sessionStorage.removeItem('fecoclima-parcel-draft')
}
function previewCoverage(geometry: Geometry | null) {
  if (coverageTimer) clearTimeout(coverageTimer)
  const requestId = ++coverageRequest
  coveragePreview.value = null
  if (!geometry) {
    coverageLoading.value = false
    return
  }
  coverageLoading.value = true
  coverageTimer = setTimeout(async () => {
    try {
      const result = await request<CoveragePreview>('/public/parcel-coverage', {
        method: 'POST',
        body: { geojson: geometry },
      })
      if (requestId === coverageRequest) {
        coveragePreview.value = result
        if (mapGeometry.value && !result.eligible) notice.value = 'Pronto estaremos en tu zona. Esta parcela aún no tiene cobertura meteorológica suficiente para el análisis IA.'
        else if (result.eligible && notice.value.startsWith('Pronto estaremos')) notice.value = ''
      }
    } catch (e: unknown) {
      if (requestId === coverageRequest) error.value = messageOf(e)
    } finally {
      if (requestId === coverageRequest) coverageLoading.value = false
    }
  }, 350)
}
async function fillWidgets(snapshot: ParcelAnalysis) {
  const purposes = ['RAG_CROP', 'WEATHER_ANALYSIS', 'SATELLITE_ANALYSIS']
  const selectedHours = analysisHours.value
  agentsRunning.value = true
  analysisStage.value = 2
  analysisDetail.value = ''
  const settled: PromiseSettledResult<string>[] = []
  for (const purpose of purposes) {
    if (analysis.value?.id !== snapshot.id || analysisHours.value !== selectedHours) break
    analysisDetail.value = ({ RAG_CROP: 'Consultando los documentos y riesgos del cultivo.', WEATHER_ANALYSIS: 'Revisando el clima observado y el pronóstico de los próximos tres días.', SATELLITE_ANALYSIS: 'Interpretando las imágenes y los índices disponibles del polígono.' } as Record<string, string>)[purpose] || ''
    try {
      const result = await request<Interpretation>(`/parcels/analyses/${snapshot.id}/interpret`, { method: 'POST', body: { purpose, view_mode: technical.value ? 'technical' : 'producer', window_hours: selectedHours } })
      if (analysis.value?.id === snapshot.id && analysisHours.value === selectedHours) analysis.value.agent_results[purpose] = result
      settled.push({ status: 'fulfilled', value: purpose })
    } catch (reason) { settled.push({ status: 'rejected', reason }) }
  }
  if (analysis.value?.id !== snapshot.id || analysisHours.value !== selectedHours) return
  analysisStage.value = 3
  analysisDetail.value = ''
  try {
    const result = await request<Interpretation>(`/parcels/analyses/${snapshot.id}/interpret`, {
      method: 'POST',
      body: { purpose: 'ORCHESTRATOR', view_mode: technical.value ? 'technical' : 'producer', window_hours: selectedHours },
    })
    if (analysis.value?.id === snapshot.id && analysisHours.value === selectedHours) analysis.value.agent_results.ORCHESTRATOR = result
  } catch {
    // Other completed widget interpretations remain available if synthesis fails.
  }
  if (analysis.value?.id !== snapshot.id) return
  agentsRunning.value = false
  const failed = settled.filter((item) => item.status === 'rejected').length + Object.values(analysis.value?.agent_results || {}).filter(result => result.status === 'fallback').length + (analysis.value?.agent_results.ORCHESTRATOR ? 0 : 1)
  if (failed) notice.value = `El análisis quedó guardado. ${failed} agente(s) no respondió(eron); puede reintentarlos desde cada módulo.`
}
type RefreshRequest = { status: string; job_ids: string[]; weather_job_ids?: string[]; satellite_job_ids?: string[] }
type RefreshStatus = { status: 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_FAILURE' | 'NO_JOBS'; jobs: { id: string; type: string; status: string }[] }

/** Wait for weather synchronization only. Copernicus runs independently and may take minutes. */
async function waitForWeatherRefresh(plotId: string, response: RefreshRequest): Promise<'ready' | 'failed' | 'pending' | 'skipped'> {
  const weatherIds = response.weather_job_ids || response.job_ids || []
  if (!weatherIds.length) return 'skipped'
  // Older APIs returned one mixed list. The status endpoint exposes the job type.
  // Accept any pending work in that case rather than assuming completion.
  const started = Date.now()
  while (Date.now() - started < 20000) {
    const batches = [] as RefreshStatus[]
    for (let index = 0; index < weatherIds.length; index += 20) {
      const subset = weatherIds.slice(index, index + 20)
      const query = new URLSearchParams()
      for (const id of subset) query.append('job_ids', id)
      batches.push(await request<RefreshStatus>(`/parcels/${plotId}/refresh-status?${query.toString()}`))
    }
    const weather = batches.flatMap(batch => batch.jobs).filter(job => job.type === 'STATION_SYNC')
    if (!weather.length || weather.every(job => job.status === 'COMPLETED')) return 'ready'
    if (weather.some(job => ['FAILED', 'CANCELLED'].includes(job.status)) && !weather.some(job => ['PENDING', 'RUNNING'].includes(job.status))) return 'failed'
    await new Promise<void>(resolve => setTimeout(resolve, 1400))
  }
  return 'pending'
}
function refreshNotice(status: 'ready' | 'failed' | 'pending' | 'skipped'): string {
  if (status === 'skipped') return 'No hay actualizaciones meteorológicas automáticas pendientes; se consultan las observaciones guardadas. Compruebe la configuración si esperaba datos recientes.'
  if (status === 'ready') return 'Estaciones sincronizadas. El análisis usa las lecturas disponibles; los índices satelitales pueden actualizarse después.'
  if (status === 'failed') return 'Una o más estaciones no pudieron sincronizarse. El análisis usa datos anteriores y muestra qué mediciones faltan.'
  return 'La actualización de estaciones sigue en proceso. Se usan las lecturas guardadas y se indican las posibles limitaciones; puede volver a analizar más tarde.'
}

/** A new analysis replaces visible evidence; previous saved analyses remain private history. */
function resetAnalysisForRun(): number {
  const ticket = ++generation
  analysisStage.value = 0
  analysisDetail.value = ''
  stopSatelliteTracking()
  analysis.value = null
  messages.value = []
  question.value = ''
  files.value = []
  attachments.value = []
  satelliteProgress.value = ''
  satelliteAutomaticUpdate.value = false
  agentsRunning.value = false
  return ticket
}

async function analyzeDrawnParcel() {
  if (!mapGeometry.value) return
  saveMapDraft()
  if (!coveragePreview.value?.eligible) {
    error.value = 'La parcela debe quedar cubierta al menos en un 99% por las áreas configuradas en el CMS.'
    return
  }
  const crop = eligibleMapCrops.value.find((item) => item.id === mapCropId.value)
  if (!crop || !mapPlantingDate.value) {
    error.value = 'Seleccione un cultivo e indique la fecha de siembra.'
    return
  }
  const token = resetAnalysisForRun()
  busy.value = 'analysis'
  error.value = ''
  notice.value = 'Preparando una nueva consulta con datos actualizados…'
  try {
    const existingId = selected.value?.id
    const parcel = await request<Parcel>(existingId ? `/parcels/${existingId}` : '/parcels', {
      method: existingId ? 'PUT' : 'POST',
      body: {
        name: mapParcelName.value.trim(),
        map_color: mapParcelColor.value,
        producer_name: producerName.value.trim(),
        producer_document: producerDocument.value.trim(),
        crop_id: crop.id,
        planting_date: mapPlantingDate.value,
        geojson: mapGeometry.value,
        active: true,
      },
    })
    if (token !== generation) return
    suppressSelectionReload = true
    selection.plotId = parcel.id
    parcels.value = [parcel, ...parcels.value.filter((item) => item.id !== parcel.id)]
    await loadParcels()
    if (token !== generation) return
    const refreshed = await request<RefreshRequest>(`/parcels/${parcel.id}/refresh`, { method: 'POST' })
    notice.value = 'Sincronizando las lecturas de las estaciones cercanas…'
    const syncResult = await waitForWeatherRefresh(parcel.id, refreshed).catch(() => 'pending' as const)
    if (token !== generation) return
    analysisStage.value = 1
    analysisDetail.value = ''
    const snapshot = await request<ParcelAnalysis>(`/parcels/${parcel.id}/analyses`, { method: 'POST', body: { window_hours: Number(hours.value) } })
    if (token !== generation) return
    analysis.value = snapshot
    messages.value = []
    mapGeometry.value = parcel.geojson
    imageryPreview.stop(true)
    saveMapDraft()
    notice.value = `Consulta creada. ${refreshNotice(syncResult)}`
    busy.value = ''
    await fillWidgets(snapshot)
  } catch (e: unknown) {
    if (token === generation) error.value = messageOf(e)
  } finally {
    if (token === generation) busy.value = ''
    suppressSelectionReload = false
  }
}
async function saved(parcel: Parcel) {
  formOpen.value = false
  editing.value = undefined
  await loadParcels()
  showParcelOnMap(parcel)
  if (selection.plotId !== parcel.id) selection.plotId = parcel.id
  else await loadSelected()
  notice.value = 'Parcela guardada. Analice para consultar su situación actual.'
}
async function analyze() {
  const id = selection.plotId
  if (!id) return
  const token = resetAnalysisForRun()
  busy.value = 'analysis'
  error.value = ''
  notice.value = 'Preparando una nueva consulta con datos actualizados…'
  try {
    const refreshed = await request<RefreshRequest>(`/parcels/${id}/refresh`, { method: 'POST' })
    const syncResult = await waitForWeatherRefresh(id, refreshed).catch(() => 'pending' as const)
    if (token !== generation) return
    notice.value = refreshNotice(syncResult)
    analysisStage.value = 1
    analysisDetail.value = ''
    const snapshot = await request<ParcelAnalysis>(`/parcels/${id}/analyses`, { method: 'POST', body: { window_hours: Number(hours.value) } })
    if (token !== generation) return
    analysis.value = snapshot
    messages.value = []
    busy.value = ''
    await fillWidgets(snapshot)
  } catch (e: unknown) {
    if (token === generation) error.value = messageOf(e)
  } finally {
    if (token === generation) busy.value = ''
  }
}
async function refreshSources() {
  busy.value = 'refresh'
  error.value = ''
  try {
    const plotId = selection.plotId
    const result = await request<RefreshRequest>(`/parcels/${plotId}/refresh`, { method: 'POST' })
    notice.value = 'Buscando las lecturas más recientes de las estaciones…'
    const syncResult = await waitForWeatherRefresh(plotId, result).catch(() => 'pending' as const)
    notice.value = refreshNotice(syncResult)
    beginSatelliteTracking()
    if (analysis.value && plotId === selection.plotId) {
      analysisStage.value = 1
      analysisDetail.value = ''
      const snapshot = await request<ParcelAnalysis>(`/parcels/${plotId}/analyses`, { method: 'POST', body: { window_hours: Number(hours.value) } })
      if (plotId === selection.plotId) {
        analysis.value = snapshot
        messages.value = []
        busy.value = ''
        await fillWidgets(snapshot)
      }
    }
  } catch (e: unknown) {
    error.value = messageOf(e)
  } finally {
    busy.value = ''
  }
}
async function interpret(purpose: string) {
  if (!analysis.value) return
  const id = analysis.value.id
  busy.value = purpose
  error.value = ''
  try {
    const result = await request<Interpretation>(`/parcels/analyses/${id}/interpret`, {
      method: 'POST',
      body: { purpose, force: !!analysis.value?.agent_results[purpose], view_mode: technical.value ? 'technical' : 'producer', window_hours: analysisHours.value }
    })
    if (analysis.value?.id === id) analysis.value.agent_results[purpose] = result
  } catch (e: unknown) {
    error.value = messageOf(e)
  } finally {
    busy.value = ''
  }
}
const pendingChatText = ref('')
const chatError = ref('')
const preparingChatImages = ref(false)

async function sendChat() {
  if (!analysis.value || !canSendChat.value || busy.value) return
  const id = analysis.value.id
  busy.value = 'chat'
  error.value = ''
  const body = new FormData()
  chatError.value = ''
  const sentQuestion = question.value
  const sentFiles = [...files.value]
  const sentAttachments = [...attachments.value]
  body.append('message', sentQuestion)
  body.append('view_mode', technical.value ? 'technical' : 'producer')
  body.append('window_hours', String(analysisHours.value))
  pendingChatText.value = sentQuestion.trim() || 'Adjunto enviado'
  question.value = ''
  scrollToLatest()
  try {
    preparingChatImages.value = sentFiles.length > 0
    const prepared = await prepareChatImages(sentFiles)
    preparingChatImages.value = false
    prepared.forEach(file => body.append('images', file))
    sentAttachments.forEach(file => body.append('attachments', file))
    const result = await request<{ messages: ChatMessage[]; images_processed: boolean }>(
      `/parcels/analyses/${id}/chat`,
      { method: 'POST', body }
    )
    if (analysis.value?.id === id) {
      messages.value = result.messages
      files.value = []
      attachments.value = []
      if (fileInput.value) fileInput.value.value = ''
      if (!result.images_processed && body.has('images'))
        notice.value =
          'Las imágenes se recibieron, pero el proveedor no pudo interpretarlas. La respuesta usa el contexto calculado.'
    }
  } catch (e: unknown) {
    if (analysis.value?.id === id) {
      chatError.value = messageOf(e)
      if (!question.value) question.value = sentQuestion
    }
  } finally {
    pendingChatText.value = ''
    preparingChatImages.value = false
    busy.value = ''
  }
}
watch(
  () => selection.plotId,
  () => {
    if (suppressSelectionReload) return
    {
      const parcel = parcels.value.find((item) => item.id === selection.plotId)
      if (parcel) showParcelOnMap(parcel)
      void loadSelected()
    }
  }
)
watch(technical, async () => {
  // Switching the reading level must also switch the language of AI explanations.
  const snapshot = analysis.value
  if (!snapshot || busy.value || agentsRunning.value) return
  for (const purpose of ['ORCHESTRATOR', 'SATELLITE_ANALYSIS']) {
    if (analysis.value?.id !== snapshot.id) break
    await interpret(purpose)
  }
})
watch(() => analysis.value?.id, (id) => { if (id) beginSatelliteTracking(); else stopSatelliteTracking() })
watch(mapGeometry, (geometry, previous) => {
  previewCoverage(geometry)
  if (geometry && import.meta.client) sessionStorage.removeItem('fecoclima-map-cleared')
  if (!geometry && previous) {
    resetAnalysisForRun()
    imageryPreview.stop(true)
    selection.plotId = ''
    if (import.meta.client) sessionStorage.setItem('fecoclima-map-cleared', '1')
    busy.value = ''
    error.value = ''
    notice.value = 'Polígono eliminado. Los widgets se limpiaron; puede dibujar una nueva parcela.'
  }
}, { deep: true })
watch([mapGeometry, mapParcelName, mapCropId, mapPlantingDate, producerName, producerDocument, hours, mapParcelColor], saveMapDraft, { deep: true })

let refreshingParcels = false
async function updateSessionQuota() {
  if (document.visibilityState === 'hidden' || refreshingParcels || busy.value || agentsRunning.value || formOpen.value) return
  refreshingParcels = true
  try { await loadParcels() } catch { /* Keep the last known list if offline. */ }
  finally { refreshingParcels = false }
}
let cacheReady = false
let browserCache: ParcelBrowserCache
function persistBrowserWorkspace() {
  if (!cacheReady || !import.meta.client) return
  const ids = new Set(parcels.value.map(parcel => parcel.id))
  browserCache.parcels = parcels.value
  browserCache.selected = selection.plotId
  browserCache.technical = technical.value
  browserCache.analyses = Object.fromEntries(Object.entries(browserCache.analyses).filter(([id]) => ids.has(id)))
  if (analysis.value && selection.plotId) {
    browserCache.analyses[selection.plotId] = analysis.value
    browserCache.chats[analysis.value.id] = messages.value
  }
  const analyses = new Set(Object.values(browserCache.analyses).map(row => row.id))
  browserCache.chats = Object.fromEntries(Object.entries(browserCache.chats).filter(([id]) => analyses.has(id)))
  writeParcelCache(browserCache)
}
watch([parcels, analysis, messages, technical, () => selection.plotId], persistBrowserWorkspace, {deep:true})
onMounted(async () => {
  globalThis.addEventListener('storage',updateSessionQuota)
  globalThis.addEventListener('focus',updateSessionQuota)
  document.addEventListener('visibilitychange',updateSessionQuota)
  try {
    try { await prepareBrowser() } catch { /* Cached results can still be shown offline. */ }
    browserCache = readParcelCache()
    parcels.value = browserCache.parcels
    technical.value = browserCache.technical
    selection.plotId = browserCache.selected
    const cached = browserCache.analyses[selection.plotId]
    if (cached) { analysis.value = cached; messages.value = browserCache.chats[cached.id] || [] }
    sessionCount.value = parcels.value.filter(parcel => parcel.browser_session_id === parcelSessionId()).length
    cacheReady = true
    // The browser draft belongs to the map session, independently of API
    // availability. Restore it before making any external request.
    todayForPlanting.value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const savedDraft = sessionStorage.getItem('fecoclima-parcel-draft')
    if (savedDraft) {
      const draft = JSON.parse(savedDraft) as {
        geojson?: Geometry | null
        name?: string
        map_color?: string
        crop_id?: string
        planting_date?: string
        window_hours?: number
        producer_name?: string
        producer_document?: string
      }
      mapGeometry.value = draft.geojson || null
      mapParcelName.value = draft.name || ''
      mapParcelColor.value = parcelDisplayColor({map_color:draft.map_color})
      producerName.value = draft.producer_name || ''
      producerDocument.value = draft.producer_document || ''
      mapCropId.value = draft.crop_id || ''
      mapPlantingDate.value = draft.planting_date || ''
      if ([60, 72, 96, 120].includes(Number(draft.window_hours))) hours.value = String(draft.window_hours)
    }
    const [stationsResult, cropsResult] = await Promise.allSettled([
      request<MapStation[]>('/public/stations'),
      request<Array<{ id: string; code: string; name: string }>>('/public/crops'),
    ])
    if (stationsResult.status === 'fulfilled') mapStations.value = stationsResult.value
    if (cropsResult.status === 'fulfilled') cropOptions.value = cropsResult.value
    if (stationsResult.status === 'rejected' || cropsResult.status === 'rejected') {
      error.value = 'No se pudieron cargar todas las estaciones o cultivos. Su parcela guardada sigue disponible en el mapa; reintente la consulta cuando se restablezca la conexión.'
    }
    {
      await loadParcels()
      if (selection.plotId) {
        const parcel = parcels.value.find((item) => item.id === selection.plotId)
        if (!mapGeometry.value && parcel) {
          mapGeometry.value = parcel.geojson
          mapParcelName.value = parcel.name
          mapParcelColor.value = parcelDisplayColor(parcel)
          producerName.value = parcel.producer_name || ''
          producerDocument.value = parcel.producer_document || ''
          mapCropId.value = parcel.crop_id
          mapPlantingDate.value = parcel.planting_date
        }
        await loadSelected()
      }
    }
  } catch (e: unknown) {
    error.value = messageOf(e)
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => {
  globalThis.removeEventListener('storage',updateSessionQuota)
  globalThis.removeEventListener('focus',updateSessionQuota)
  document.removeEventListener('visibilitychange',updateSessionQuota)
  stopSatelliteTracking()
  generation++
  coverageRequest++
  if (coverageTimer) clearTimeout(coverageTimer)
  if (recorder?.state === 'recording') recorder.stop()
  microphone?.getTracks().forEach(track => track.stop())
})
</script>

<template>
  <main class="container parcel-workspace">
    <header class="workspace-heading">
      <div>
        <span class="eyebrow"><Sprout /> INTELIGENCIA AGRONÓMICA</span>
        <h1>Mi parcela <span class="heading-bubble">Asistente de campo</span></h1>
      </div>
      <div class="workspace-top-controls">
        <div class="parcel-controls">
          <label class="parcel-selector"><span class="label">Mis parcelas <small>{{sessionCount}}/3 en esta sesión</small></span><select v-model="selection.plotId" class="select" :disabled="!!busy || agentsRunning" aria-label="Seleccionar parcela"><option value="">Seleccione una parcela</option><option v-for="parcel in parcels" :key="parcel.id" :value="parcel.id">{{parcel.name}}</option></select></label>
          <label class="parcel-color-control"><span class="sr-only">Color de la parcela seleccionada</span><input v-model="mapParcelColor" type="color" :disabled="!!busy || agentsRunning" aria-label="Color de la parcela seleccionada" title="Color de la parcela" @change="saveParcelColor" /></label>
          <button type="button" class="btn btn-light new-parcel-button" :disabled="loading || !!busy || agentsRunning || sessionCount>=3" @click="openForm()"><Plus/> Nueva parcela</button>
          <button v-if="selected" type="button" class="btn btn-light delete-parcel-button" :disabled="!!busy || agentsRunning" aria-label="Borrar parcela seleccionada" title="Borrar parcela" @click="deleteConfirmation = true"><Trash2 /></button>
          <button v-if="selected" type="button" class="btn btn-light configure-parcel-button" :disabled="!!busy || agentsRunning" @click="openForm(selected)"><Pencil/><span class="sr-only">Configurar parcela</span></button>
        </div>
      <div class="view-switch" role="group" aria-label="Vista del análisis">
        <button type="button" :aria-pressed="!technical" :class="{ active: !technical }" @click="technical = false">Productor</button
        ><button type="button" :aria-pressed="technical" :class="{ active: technical }" @click="technical = true">Técnico</button>
      </div></div>
    </header>
    <section class="map-query" aria-labelledby="map-query-title">
      <header class="map-query-heading panel">
        <div>
          <span class="eyebrow"><MapPinned /> CONSULTA POR PARCELA</span>
          <h2 id="map-query-title">Elija el terreno que quiere analizar</h2>
         </div>
        <p class="map-scroll-hint">Explore el mapa, dibuje el límite de la parcela y revise si está dentro de la cobertura de las estaciones.</p>
       
      </header>
      <div class="map-frame">
        <ClientOnly>
          <WorldParcelMap
            v-model="mapGeometry"
            confirm-clear
            :before-clear="deleteSelectedParcel"
            :clear-message="selected ? 'Se eliminará esta parcela guardada y se limpiarán sus widgets. Podrá crear otra en su lugar.' : 'Se borrará el polígono y se limpiarán sus widgets.'"
            :stations="mapStations"
            :parcels="parcels"
            :selected-parcel-id="selection.plotId"
            :parcel-color="mapParcelColor"
            :selection-disabled="!!busy || agentsRunning"
            @select-parcel="selectMapParcel"
            :coverage="coveragePreview?.coverage_pct"
            :imagery="mapImagery"
          />
          <template #fallback><div class="map-loading">Preparando mapa mundial…</div></template>
        </ClientOnly>
      </div>
      <div class="map-query-panel panel" aria-label="Configuración y análisis de parcela">
        <section v-if="mapGeometry" class="imagery-preview-status" :aria-busy="satelliteBusy" aria-live="polite">
          <header class="spectral-heading">
            <div><span class="widget-kicker">OBSERVACIÓN SATELITAL</span><h3>Su parcela vista desde el satélite</h3>
             </div>
            <span class="spectral-state" :class="{ ready: spectralValues.length }">{{ satelliteDisplay.label }}</span>
          </header>
          <div v-if="satelliteBusy" class="satellite-loading" role="status">
            <span class="satellite-loading-icon"><Satellite aria-hidden="true" /></span>
            <div><strong>{{ imageryPreview.loading.value ? 'Buscando una imagen de su parcela' : 'Preparando sus capas satelitales' }}</strong><p>{{ imageryPreview.loading.value ? 'Conectamos con Copernicus para encontrar escenas útiles del polígono.' : 'Revisamos las imágenes disponibles y calculamos los índices de su parcela.' }}</p><small>La primera consulta puede tardar unos minutos; los datos aparecerán aquí automáticamente.</small></div>
            <span class="satellite-loading-track" aria-hidden="true"><i /></span>
          </div>
          <p v-if="satelliteDisplay.message && satelliteBusy" class="spectral-progress">{{ satelliteDisplay.message }}</p>
          <p v-if="spectralValues.length" class="spectral-progress">{{ satelliteDisplay.message || 'Imagen e índices disponibles para la fecha indicada.' }}</p>
          <p v-else-if="satelliteProgress && analysis" class="spectral-progress">{{ satelliteProgress }}</p>
          <p v-else-if="previewEnabled && !satelliteBusy">{{ satelliteDisplay.message || imageryPreview.state.value?.message || 'Delimite la parcela para iniciar su consulta satelital.' }}</p>
          <p v-if="imageryPreview.error.value && previewEnabled" role="alert" class="spectral-warning">{{ imageryPreview.error.value }}</p>
          <div v-if="spectralValues.length" class="spectral-values">
            <div v-for="index in spectralValues" :key="index.key" class="spectral-value" :title="index.label + ': promedio válido de la parcela'">
              <small>{{ index.title }} <abbr :title="'Índice ' + index.label">{{ index.label }}</abbr></small>
              <strong>{{ formatSpectral(index.value) }}</strong>
            </div>
          </div>
          <p v-else-if="!satelliteBusy" class="spectral-empty">Todavía no hay índices confiables para mostrar. La disponibilidad depende de la fecha de paso del satélite, las nubes y el servicio Copernicus; no se mostrarán cifras inventadas.</p>
          <div v-if="spectralScene" class="spectral-meta"><span>Imagen: {{ dateLabel(spectralScene.captured_at) }}</span><span v-if="spectralScene.data_warning">{{ spectralScene.data_warning }}</span></div>
          <div class="spectral-actions">
            <label v-if="imageryPreview.state.value?.history?.length && previewEnabled"><span class="label">Fecha de la imagen</span><select v-model="imageryPreview.selected.value" class="select"><option v-for="scene in imageryPreview.state.value.history" :key="scene.id" :value="scene.id">{{ dateLabel(scene.captured_at) }}</option></select></label>
            <button v-if="previewEnabled" type="button" class="btn btn-light" :disabled="imageryPreview.loading.value" @click="imageryPreview.load()">{{ imageryPreview.loading.value ? 'Consultando…' : 'Actualizar imágenes' }}</button>
          </div>
          <SpectralHistory v-if="previewEnabled && imageryPreview.state.value?.history" :scenes="imageryPreview.state.value.history" />
          <small>Los índices son indicios obtenidos por satélite, no diagnósticos de enfermedades o de humedad del suelo. La estación Meteorológica se determina por la cobertura de la parcela.</small>
        </section>
        <p v-if="!mapGeometry" class="flow-hint">1. Dibuje el polígono de su parcela en el mapa para comenzar.</p>
        <div v-else class="parcel-setup-columns">
          <section class="parcel-setup-column" aria-labelledby="parcel-crop-heading">
            <h3 id="parcel-crop-heading">Su parcela y cultivo</h3>
            <div class="parcel-area-summary" role="status" aria-live="polite"><MapPinned aria-hidden="true" /><div><span>Superficie de su parcela</span><strong>{{ coveragePreview?.area_ha != null ? Number(coveragePreview.area_ha).toLocaleString('es-PY',{maximumFractionDigits:3}) + ' ha' : 'Calculando superficie…' }}</strong></div></div>
            <label><span class="label">Cultivo</span><select v-model="mapCropId" class="select"><option value="">Seleccione un cultivo</option><option v-for="crop in eligibleMapCrops" :key="crop.id" :value="crop.id">{{ crop.name }}</option></select></label>
            <label><span class="label">Fecha de siembra</span><input v-model="mapPlantingDate" class="input" type="date" :max="todayForPlanting || undefined" /></label>
            <label><span class="label">Período de análisis</span><select v-model="hours" class="select analysis-period" :disabled="!!busy || agentsRunning" aria-describedby="analysis-period-help"><option v-for="period in ['60', '72', '96', '120']" :key="period" :value="period">Últimas {{ period }} horas</option></select></label>
          </section>
          <section class="parcel-setup-column parcel-owner-column" aria-labelledby="parcel-owner-heading">
            <h3 id="parcel-owner-heading">Datos del productor</h3>
            <label><span class="label">Nombre de parcela</span><input v-model="mapParcelName" class="input" maxlength="180" placeholder="Ej. Lote Norte" /></label>
            <label><span class="label">Nombre del productor</span><input v-model.trim="producerName" class="input" required maxlength="180" autocomplete="name" /></label>
            <label><span class="label">Cédula de identidad (CI)</span><input v-model.trim="producerDocument" class="input" required minlength="4" maxlength="30" /></label>
          </section>
        </div>
        <div class="coverage-status" :class="coveragePreview?.eligible ? 'covered' : ''" aria-live="polite">
          <template v-if="coverageLoading">Calculando cobertura de estaciones…</template>
          <template v-else-if="!mapGeometry">Dibuje un polígono para comprobar cobertura.</template>
          <template v-else-if="!coveragePreview">Espere mientras se valida el polígono.</template>
          <template v-else-if="coveragePreview.eligible"><CheckCircle2 aria-hidden="true" /> Dentro de cobertura <span>{{ coveragePreview.coverage_pct.toLocaleString('es-PY', {maximumFractionDigits:1}) }}%</span></template>
          <template v-else>Área cubierta {{ coveragePreview.coverage_pct.toFixed(1) }}%. Pronto estaremos en tu zona; el análisis requiere al menos 99% de cobertura.</template>
        </div>
        <p v-if="coveragePreview?.station_influences.length" class="influences-list">
          Estaciones que cubren el polígono:
          <span v-for="station in coveragePreview.station_influences" :key="station.station_id">{{ station.name }} ({{ station.coverage_pct.toFixed(1) }}%)</span>
        </p>
        <p v-else-if="mapGeometry && coveragePreview" class="no-influence">Ninguna estación con área de influencia configurada alcanza esta parcela.</p>
        <button class="btn btn-primary analyze-map" :disabled="!mapCanAnalyze" @click="analyzeDrawnParcel">
          <RefreshCw :class="{ spin: busy === 'analysis' || agentsRunning }" />
          {{ busy === 'analysis' ? 'Calculando parcela…' : agentsRunning ? 'Agentes completando widgets…' : 'Analizar y completar widgets' }}
        </button>

      </div>
    </section>
    <ParcelAnalysisProgress v-if="busy === 'analysis' || agentsRunning" :stage="analysisStage" :hours="hours" :detail="analysisDetail" />
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>
    <p v-if="notice && busy !== 'analysis' && !agentsRunning" class="banner" role="status">{{ notice }}</p>
      <LoadingState v-if="loading && !analysis" />
      <EmptyState
        v-else-if="!selected"
        title="Comience por su parcela"
        message="Dibuje el terreno, elija un cultivo e indique cuándo sembró."
        ><button
          class="btn btn-primary"
          @click="openForm()"
        >
          Delimitar mi parcela
        </button></EmptyState
      >
      <template v-else>
        
        <EmptyState
          v-if="!analysis && busy !== 'analysis' && !agentsRunning"
          title="Su parcela está lista"
          message="Pulse Analizar y completar widgets para consultar las lecturas guardadas y completar los siete pasos de su consulta."
        />
        <template v-if="analysis && context && !agentsRunning">
          <p v-if="!currentSnapshot" class="banner">
            Este análisis corresponde a una configuración anterior. Pulse Analizar parcela para actualizarlo.
          </p>
          <div class="snapshot-line">
            <span>Situación al {{ dateLabel(analysis.reference_at) }} · {{ context.crop.name }}</span>
            <span class="analyzed-period">Período analizado: {{ analysisHours }} horas</span>
          </div>
          <p class="viewer-time-note">{{ viewerZoneLabel }} <InfoHint text="Las horas se convierten a la zona de su dispositivo. La lectura original, su antigüedad y las ventanas de análisis no cambian. La fecha de siembra y los días de pronóstico conservan su fecha de calendario." /></p>
          <div class="widget-grid steps-flow" aria-label="Resumen de la parcela">
            <section class="panel widget current-conditions">
              <span class="widget-kicker">1. Condiciones actuales</span>
              <h2>El clima que influye en su parcela</h2>
              <div v-if="prioritizedInfluence" class="station-attribution" role="status">
                <InfoHint class="station-source-info" :text="prioritizedReason" />
                <span class="source-symbol"><MapPinned aria-hidden="true" /></span>
                <div><strong>Tu parcela consultó datos de {{ prioritizedInfluence.name }}</strong></div>
              </div>
              <p v-else class="banner">Ninguna estación cubre todavía este terreno. Revise las áreas de influencia configuradas en el CMS.</p>
              <StationReadingsStrip
                v-for="row in orderedReadings" :key="row.station_id"
                :observation="row"
                :influence="context.station_influences.find(item => item.station_id === row.station_id)"
                :stale="window?.stations.find(item => item.station_id === row.station_id)?.stale"
                :technical="technical"
              />
              <template v-for="row in context.raw_readings" :key="`soil-${row.station_id}`"><div v-if="row.soil_tension || row.sensor_units?.soil_moisture_pct === 'cb'" class="soil-visible"><h3>Secado del suelo <InfoHint text="La tensión indica la fuerza que deben ejercer las raíces para extraer agua del suelo. No es lo mismo que humedad porcentual. Revise el rango calibrado para este sensor." /></h3><SoilTensionCard :tension="row.soil_tension" :station="row.name" :sampled-at="dateLabel(String(row.reading?.sampled_at || ''))" /></div></template>
            </section>
            <section class="panel widget alert-widget" :class="tone" aria-label="Estado y condiciones de la alerta">
              <span class="widget-kicker">2. Tipo de alerta · {{ analysisHours }} horas</span>
              <div class="alert-columns"><div class="alert-summary">
              <div class="severity-banner" :class="tone" role="status">
                <div class="severity-icon"><CheckCircle2 v-if="tone === 'good'" /><AlertTriangle v-else /></div>
                <div>
                  <small>Resultado de la evaluación</small>
                  <h2>{{ levelLabels[window?.level || ''] || 'Sin evaluación' }}</h2>
                  <p>{{ severityExplanation }}</p>
                  <p v-if="soilCriterionAdaptations.length" class="indicative-severity">La condición del suelo se evaluó con el criterio configurado para la unidad de su sensor.</p>
                </div>
              </div>
              <div class="condition-meter">
                <strong>{{ window?.representative_alert?.conditions_met ?? '—' }} de {{ window?.representative_alert?.conditions_total ?? 6 }}</strong>
                <span>condiciones cumplidas en la evaluación de referencia</span>
                <InfoHint text="Normal, moderada y grave dependen de los umbrales de la regla publicada en Administración. Si faltan mediciones indispensables, se muestra Sin clasificación en lugar de asumir una alerta normal." />
              </div>
              <div v-if="soilCriterionAdaptations.length" class="soil-criteria-explanation" role="note">
                <strong>Criterio del suelo según el sensor</strong>
                <p v-for="(item, i) in soilCriterionAdaptations" :key="i">{{ item.station }}: {{ item.message }}</p>
              </div>
              <div v-if="coverageIssue" class="coverage-diagnostic" role="status">
                Las estaciones con evaluaciones válidas cubren {{ window?.usable_coverage_pct?.toLocaleString('es-PY', {maximumFractionDigits: 1}) }}% de la parcela. Se requiere al menos 99% de cobertura evaluable.
              </div>
              </div><div class="alert-evaluation">
              <p class="condition-heading"><CheckCircle2 /> Condiciones que SÍ se cumplieron ({{ matchedConditions.length }})</p>
              <div class="condition-overview" v-if="matchedConditions.length">
                <div v-for="condition in matchedConditions" :key="`${condition.station}-${condition.key}`" class="condition-evidence met">
                  <CheckCircle2 aria-hidden="true" />
                  <div><strong>{{ condition.label }}</strong><small>{{ condition.station }}<template v-if="technical && condition.value != null"> · {{ condition.value }} {{ condition.unit }}</template></small></div>
                </div>
              </div>
              <p v-else class="condition-empty">No se registraron condiciones cumplidas con los valores que pudieron evaluarse.</p>
              <div v-if="missingConditions.length" class="missing-conditions">
                <p class="condition-heading"><CircleHelp /> Condiciones pendientes de medir ({{ missingConditions.length }})</p>
                <div v-for="condition in missingConditions" :key="`${condition.station}-${condition.key}`" class="condition-evidence missing">
                  <CircleHelp aria-hidden="true" /><div><strong>{{ condition.label }}</strong><small>{{ condition.station }} · Sin medición compatible</small></div>
                </div>
                <p class="condition-note">{{ missingDataExplanation }}</p>
              </div>
              <details class="condition-details" :open="technical || window?.level === 'DATOS_INSUFICIENTES'">
                <summary>Ver condiciones que no se cumplieron ({{ evaluatedConditions.length }}) y calidad de datos</summary>
                <div v-for="condition in evaluatedConditions" :key="`${condition.station}-${condition.key}`" class="condition-evidence not-met">
                  <CheckCircle2 aria-hidden="true" /><div><strong>{{ condition.label }}</strong><small>{{ condition.station }} · No se cumple<template v-if="technical && condition.value != null"> · {{ condition.value }} {{ condition.unit }}</template></small></div>
                </div>
                <div v-if="windowHasGaps" class="station-issues">
                  <DataIssueDetails v-for="station in window?.stations" :key="station.station_id"
                    :station="context.station_influences.find(item => item.station_id === station.station_id)?.name"
                    :issues="station.data_issues" :samples="station.samples" :expected-samples="station.expected_samples" :technical="technical" />
                </div>
                <div v-for="station in window?.stations" :key="`quality-${station.station_id}`"><h3>Calidad de datos · {{ context.station_influences.find(item => item.station_id === station.station_id)?.name }}</h3><DataQualityCard v-if="station.quality" :quality="station.quality" /></div>
              </details>
              </div></div>
            </section>
            <section class="panel widget">
              <span class="widget-kicker">3. Estado fenológico</span>
              <h2>{{ context.phenology.stage_name }}</h2>
              <p>{{ context.phenology.days_after_planting }} días desde la siembra</p>
              <p>{{ widgetSummary(context.phenology.description) }}</p>
              <progress v-if="context.phenology.stage_progress_pct != null" :value="context.phenology.stage_progress_pct" max="100" aria-label="Progreso estimado de la etapa fenológica" style="width:100%" /><small>Estimación por calendario. Confirme la etapa en campo.</small>
              <details v-if="technical">
                <summary>Calendario fenológico</summary>
                <p v-for="stage in context.phenology.timeline" :key="stage.code">
                  {{ stage.name }} · {{ dateLabel(stage.estimated_start_date) }} a
                  {{ dateLabel(stage.estimated_end_date) }}
                </p>
              </details>
            </section>
            <section class="panel widget diagnosis">
              <span class="widget-kicker">4. Análisis de la IA</span>
              <h2>Qué revisar hoy</h2>
              <div class="diagnosis-timeframes"><span>Observado: últimas {{ analysisHours }} horas</span><span>Pronóstico: próximos 3 días</span></div>
              <ParcelInterpretation v-if="chatVisibleResults('ORCHESTRATOR')" :result="chatVisibleResults('ORCHESTRATOR')!" />
              <p v-else>
                Interprete las alertas, la etapa y la evidencia de esta parcela para orientar su próxima
                revisión.
              </p>
              <button class="btn btn-primary" :disabled="!!busy" @click="interpret('ORCHESTRATOR')">
                <Bot /> {{ busy === 'ORCHESTRATOR' ? 'Interpretando…' : chatVisibleResults('ORCHESTRATOR') ? 'Actualizar recomendaciones' : 'Generar recomendaciones' }}
              </button>
              <details><summary>Posibles enfermedades y evidencia agronómica</summary><ul v-if="diseaseNames.length"><li v-for="name in diseaseNames" :key="name">{{ name }}</li></ul><p v-else>{{ window?.level === 'DATOS_INSUFICIENTES' ? 'La evaluación está limitada por las condiciones sin dato compatible.' : 'Las reglas no señalaron enfermedades posibles con los datos disponibles.' }} Estas señales requieren revisión en campo.</p><small>Se cruzan clima, etapa del cultivo, imágenes y documentos técnicos. Una señal de riesgo no confirma una enfermedad.</small></details>
            </section>
            <section class="panel widget">
              <span class="widget-kicker">5. Interpretación e imagen de su polígono</span>
              <h2>Explore su parcela y sus indicadores</h2>
              <ParcelSatelliteViewer public-access :plot-id="context.plot.id" :geometry="context.plot.geojson" :initial-satellite="context.satellite" />
              <p v-if="context.satellite?.data_warning" class="banner">
                {{ context.satellite.data_warning }}
              </p>
              <p>
                {{
                  context.inspection_point.method === 'lowest_valid_ndvi_pixel'
                    ? 'Punto de menor vigor observado en los píxeles válidos. Verifique qué ocurre en campo.'
                    : 'Punto de referencia dentro de la parcela; aún no hay una anomalía localizada verificable.'
                }}
              </p>
              <a
                :href="context.inspection_point.maps_url"
                target="_blank"
                rel="noopener"
                class="btn btn-light"
                ><MapPinned /> Abrir punto en Maps</a
              >
              <details v-if="technical">
                <summary>Datos técnicos: índices y radar</summary>
                <p>
                  NDVI {{ context.satellite?.ndvi ?? '—' }} · NDMI {{ context.satellite?.ndmi ?? '—' }} · NDWI
                  {{ context.satellite?.ndwi ?? '—' }}
                </p>
                <p v-if="context.radar">
                  Sentinel-1 · {{ dateLabel(context.radar.captured_at) }} · VV {{ context.radar.vv_mean }} /
                  VH {{ context.radar.vh_mean }} (gamma0 lineal)
                </p>
                <p v-else>Sin observación Sentinel-1 procesada.</p>
              </details>
              <button class="text-action" :disabled="!!busy" @click="interpret('SATELLITE_ANALYSIS')">
                Interpretar satélite</button
              ><ParcelInterpretation :result="chatVisibleResults('SATELLITE_ANALYSIS')" />
            </section>
            <section class="panel widget forecast">
              <span class="widget-kicker">6. Predicción</span>
              <h2>Prepárese para los próximos 3 días</h2>
              <div v-if="context.forecast.days.length" class="forecast-days">
                <article v-for="day in context.forecast.days" :key="day.date">
                  <b>{{ dateLabel(day.date) }}</b>
                  <p>{{ day.temperature_min_c ?? '—' }} a {{ day.temperature_max_c ?? '—' }} °C</p>
                  <span>{{ day.precipitation_mm ?? '—' }} mm de lluvia</span>
                </article>
              </div>
              <p v-else>El pronóstico no está disponible. Vuelva a analizar más tarde.</p>
              <small>Pronóstico Open-Meteo para los próximos 3 días, contrastado con la tendencia histórica disponible de las estaciones. La regresión se calcula en Python y no sustituye el pronóstico.</small>
              <details v-if="technical">
                <summary>Regresión sobre el historial de las estaciones</summary>
                <article v-for="trend in context.historical_regression" :key="trend.station_id">
                  <h3>{{ trend.name }}</h3>
                  <p v-if="trend.status !== 'COMPLETED'">
                    Se requieren al menos siete días con cobertura suficiente.
                  </p>
                  <pre v-else>{{ JSON.stringify(trend.days, null, 2) }}</pre>
                </article>
                <small
                  >La tendencia estadística se calcula en Python y se presenta separada del pronóstico.</small
                >
              </details>
              <button class="text-action" :disabled="!!busy" @click="interpret('WEATHER_ANALYSIS')">
                Interpretar pronóstico</button
              ><ParcelInterpretation :result="chatVisibleResults('WEATHER_ANALYSIS')" />
            </section>
            <section class="panel widget chat whatsapp-chat" aria-label="Chat de FECOCLIMA IA"><span class="widget-kicker sr-only">7. Chatbot</span>
              <div class="wa-header">
                <span class="wa-avatar"><MessageCircle aria-hidden="true" /></span>
                <div class="wa-contact"><strong>FECOCLIMA IA · Asistente de campo</strong><small>Conversación sobre su parcela · {{ analysisHours }} horas</small></div>
                <button type="button" class="wa-icon" title="Compartir conversación" aria-label="Compartir conversación" :disabled="!messages.length" @click="shareChat"><Share2 /></button>
              </div>
              <div ref="chatScroll" class="chat-history" role="log" aria-live="polite" aria-relevant="additions">
                <div v-if="!messages.length" class="wa-greeting"><MessageCircle /><b>¿En qué puedo ayudarle?</b><p>Puede escribir, enviar fotografías de su cultivo, documentos o grabar una nota de voz.</p></div>
                <article v-for="(message, i) in messages" :key="i" :class="message.role">
                  <b>{{ message.role === 'user' ? 'Usted' : 'FECOCLIMA IA' }}</b>
                  <MarkdownContent :content="message.content" />
                  <div v-if="message.images?.length" class="wa-media-grid">
                    <a v-for="image in message.images" :key="image.url || image.filename" :href="image.url ? apiUrl(image.url) : undefined" target="_blank" rel="noopener" :aria-label="`Abrir fotografía: ${image.filename}`">
                      <img v-if="image.url" :src="apiUrl(image.url)" :alt="image.filename" loading="lazy" />
                      <span v-else>{{ image.filename }}</span>
                    </a>
                  </div>
                  <div v-if="message.attachments?.length" class="wa-attachments">
                    <div v-for="file in message.attachments" :key="file.url || file.filename" class="wa-file">
                      <audio v-if="file.content_type?.startsWith('audio/') && file.url" controls preload="none" :src="apiUrl(file.url)" :aria-label="`Audio ${file.filename}`" />
                      <a v-else-if="file.url" :href="apiUrl(file.url)" target="_blank" rel="noopener"><Paperclip /> {{ file.filename }} <Download /></a>
                      <span v-else>{{ file.filename }}</span>
                    </div>
                  </div>
                  <small v-if="message.status === 'fallback'" class="wa-source">Respuesta basada en información disponible</small>
                </article>
                <article v-if="busy === 'chat' && pendingChatText" class="user"><b>Usted</b><p>{{ pendingChatText }}</p></article>
                <span v-if="busy === 'chat'" class="wa-typing" role="status"><span class="typing-dots" aria-hidden="true"><i /><i /><i /></span><span>{{ preparingChatImages ? 'Preparando fotografía…' : 'Preparando respuesta' }}</span></span>
              </div>
              <form class="wa-compose" @submit.prevent="sendChat">
                <div v-if="files.length || attachments.length" class="wa-selected" aria-label="Adjuntos para enviar">
                  <span v-for="(file, i) in files" :key="`photo-${i}`" class="wa-chip"><ImageIcon /> {{ file.name }} <button type="button" :aria-label="`Quitar ${file.name}`" @click="removeChatFile('images', i)"><X /></button></span>
                  <span v-for="(file, i) in attachments" :key="`file-${i}`" class="wa-chip"><Paperclip /> {{ file.name }} <button type="button" :aria-label="`Quitar ${file.name}`" @click="removeChatFile('attachments', i)"><X /></button></span>
                </div>
                <div class="wa-compose-row">
                  <label class="wa-icon wa-file-picker" title="Enviar fotografías"><ImageIcon /><input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" :disabled="!!busy" multiple @change="addChatFiles($event, 'images')" /><span class="sr-only">Adjuntar fotos</span></label>
                  <label class="wa-icon wa-file-picker" title="Adjuntar PDF, Word, texto o audio"><Paperclip /><input ref="attachmentInput" type="file" accept=".pdf,.txt,.docx,.webm,.ogg,.m4a,.mp3,.wav,audio/*" :disabled="!!busy" multiple @change="addChatFiles($event, 'attachments')" /><span class="sr-only">Adjuntar archivos</span></label>
                  <label class="sr-only" for="parcel-question">Escribir mensaje</label>
                  <textarea id="parcel-question" v-model="question" class="textarea" rows="1" maxlength="2500" placeholder="Escriba un mensaje…" @keydown="onChatKey" />
                  <button type="button" class="wa-icon" :class="{ 'wa-recording': recording }" :title="recording ? 'Detener grabación' : 'Grabar audio'" :aria-label="recording ? 'Detener grabación' : 'Grabar audio'" :disabled="!!busy" @click="recording ? stopVoice() : startVoice()"><Square v-if="recording" /><Mic v-else /></button>
                  <button class="wa-send" type="submit" :disabled="!!busy || !canSendChat" :aria-label="busy === 'chat' ? 'Enviando' : 'Enviar mensaje'"><Send /></button>
                </div>
                <small v-if="recording" class="wa-record-hint">Grabando… Pulse detener para adjuntar su audio.</small>
                <small v-if="chatError" class="wa-error" role="alert">{{ chatError }}</small>
                <small v-if="audioError" class="wa-error" role="alert">{{ audioError }}</small>
                <small class="wa-hint">Enter para enviar · Mayús + Enter para otra línea · Hasta 4 fotos (se optimizan al enviar) y 4 adjuntos (12 MB por archivo).</small>
              </form>
            </section>
          </div>
        </template>
      </template>

    <Teleport to="body"
      ><div v-if="formOpen" class="parcel-modal" @click.self="formOpen = false">
        <div role="dialog" aria-modal="true" aria-label="Configuración de parcela" class="modal-card">
          <ParcelForm
            :key="editing?.id || 'new'"
            :parcel="editing"
            defer-creation
            @prepared="prepareParcel"
            :stations="mapStations"
            :initial-color="parcelColors[parcels.length % parcelColors.length]"
            @saved="saved"
            @cancel="formOpen = false"
          />
        </div></div
    ></Teleport>
    <ConfirmationModal :open="deleteConfirmation" title="¿Eliminar esta parcela?" message="Se eliminará la parcela guardada y se limpiarán sus widgets. Podrá crear otra en su lugar." @cancel="deleteConfirmation = false" @confirm="deleteSelectedParcel" />
  </main>
</template>

<style scoped>
.delete-parcel-button{color:var(--fc-danger)}
.satellite-loading{position:relative;display:flex;gap:16px;align-items:center;overflow:hidden;padding:20px 18px 26px;border:1px solid #cce6e7;border-radius:16px;background:linear-gradient(120deg,#e9f8f2,#eaf3ff)}.satellite-loading-icon{display:grid;place-items:center;flex:0 0 52px;height:52px;background:#fff;border:1px solid #d5e9ef;border-radius:50%;color:var(--fc-primary);box-shadow:0 6px 18px #07598512}.satellite-loading-icon svg{width:27px;height:27px;animation:satellite-orbit 3s ease-in-out infinite}.satellite-loading strong{font-size:.92rem;color:var(--fc-primary)}.satellite-loading p{margin:5px 0!important;line-height:1.5}.satellite-loading-track{position:absolute;bottom:0;left:0;width:100%;height:4px;background:#d8e9f2}.satellite-loading-track i{display:block;width:35%;height:100%;background:linear-gradient(90deg,#22a680,#0072b5);animation:satellite-scan 2s ease-in-out infinite}@keyframes satellite-scan{from{transform:translateX(-100%)}to{transform:translateX(390%)}}@keyframes satellite-orbit{50%{transform:translateY(-3px) rotate(10deg)}}@media(prefers-reduced-motion:reduce){.satellite-loading-icon svg,.satellite-loading-track i{animation:none}}

.workspace-top-controls{display:flex;align-items:end;justify-content:flex-end;gap:14px;flex-wrap:wrap}.workspace-top-controls .parcel-controls{display:flex;align-items:end;flex-wrap:wrap;gap:8px;margin:0;padding:0;background:transparent;border:0}.workspace-top-controls .parcel-controls>.parcel-selector{flex:1;min-width:200px;max-width:270px}.parcel-selector .label{display:flex;justify-content:space-between;gap:12px;margin-bottom:5px;font-size:.74rem}.parcel-selector small{font-size:.67rem;font-weight:500;color:var(--fc-text-muted)}.parcel-selector select{min-height:42px;height:42px;padding-top:7px;padding-bottom:7px}.workspace-top-controls .parcel-controls>.parcel-color-control{flex:0 0 38px;min-width:38px;display:flex;align-items:center;height:42px}.parcel-color-control input{width:38px;height:38px;padding:3px;border:1px solid var(--fc-border);background:#fff;border-radius:9px;cursor:pointer}.workspace-top-controls .btn{min-height:42px;height:42px;font-size:.76rem;padding:8px 11px}.workspace-top-controls .btn svg{width:17px;height:17px}.workspace-top-controls .view-switch{align-self:flex-end;min-height:42px}.workspace-top-controls .view-switch button{min-height:40px}@media(max-width:900px){.workspace-heading{align-items:flex-start;flex-wrap:wrap}.workspace-top-controls{justify-content:flex-start;width:100%}}@media(max-width:540px){.workspace-top-controls{gap:10px}.workspace-top-controls .parcel-controls{width:100%}.workspace-top-controls .parcel-controls>.parcel-selector{flex:1;max-width:none;min-width:150px}.workspace-top-controls .view-switch{width:100%;justify-content:center}}

.analyzed-period{font-size:.8rem;font-weight:650;color:var(--fc-primary)}
#analysis-period-help{font-size:.75rem;color:var(--fc-text-muted)}
.parcel-setup-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;align-items:start}
.parcel-setup-column{display:grid;gap:15px;min-width:0}.parcel-setup-column h3{margin:0 0 2px;font-size:.84rem;color:var(--fc-primary);font-weight:750}.parcel-owner-column{border-left:1px solid #e1ebf2;padding-left:32px}.parcel-setup-column .parcel-area-summary{min-height:94px}.coverage-status.covered svg{width:15px;height:15px}.coverage-status.covered span{color:var(--fc-text-muted);font-size:.74rem;padding-left:4px}
@media(max-width:640px){.parcel-setup-columns{grid-template-columns:1fr;gap:23px}.parcel-owner-column{border-left:0;border-top:1px solid #e1ebf2;padding:20px 0 0}}
:global(.fc-mobile-simple) .parcel-setup-columns{grid-template-columns:1fr}:global(.fc-mobile-simple) .parcel-owner-column{border-left:0;border-top:1px solid #e1ebf2;padding:20px 0 0}



.parcel-area-summary{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #cee1ed;border-radius:15px;background:linear-gradient(115deg,#e6f2fb,#f5fafc);color:var(--fc-primary)}
.parcel-area-summary>svg{width:27px;height:27px;flex-shrink:0}.parcel-area-summary div{display:grid;gap:2px}.parcel-area-summary span{font-size:.78rem;font-weight:700}.parcel-area-summary strong{font-size:1.5rem;letter-spacing:-.025em}.parcel-area-summary small{color:var(--fc-text-muted);font-size:.73rem}
.imagery-preview-status{display:grid;gap:9px;padding:13px;border:1px solid #d6e6ef;border-radius:14px;background:#f2f8fc;font-size:.84rem}.imagery-preview-status p{margin:0}.imagery-preview-status small{color:var(--fc-text-muted);line-height:1.45}.imagery-preview-status .btn{min-height:40px;font-size:.8rem}

.parcel-workspace {
  padding-top: 32px;
  padding-bottom: 50px;
}
.map-query {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 22px;
}
.map-query-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 18px 22px;
  border-left: 4px solid var(--fc-primary);
}
.map-query-heading h2 {
  margin: 5px 0;
  color: var(--fc-primary-strong);
  font-size: clamp(1.15rem, 2vw, 1.5rem);
  line-height: 1.25;
}
.map-query-heading p { margin: 4px 0 0; line-height: 1.5; color: var(--fc-text-muted); }
.map-scroll-hint {
  flex: 0 0 min(280px, 31%);
  padding: 10px 12px;
  background: #edf5fb;
  border-radius: 11px;
  font-size: .78rem;
}
.map-frame :deep(.world-map-shell:not(:fullscreen)) {
  min-width: 0;
  min-height: 0;
  height: clamp(340px, 51vh, 500px);
}
.map-frame { min-width:0; height:auto; }
.map-query-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 18px;
  min-height: 0;
  max-height: none;
  overflow: visible;
}
.map-query-panel > label { min-width: 0; }
.map-query-panel > .flow-hint,
.map-query-panel > .coverage-status,
.map-query-panel > .imagery-note,
.map-query-panel > .influences-list,
.map-query-panel > .no-influence,
.map-query-panel > .portal-login-note,
.map-query-panel > small { grid-column: 1 / -1; }
.map-query-panel > p { margin: 0; line-height: 1.5; color: var(--fc-text-muted); }
.coverage-status {
  padding: 12px 13px;
  border: 1px solid #e4d1a0;
  border-radius: 10px;
  background: #fff8e7;
  color: #75510b;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.45;
}
.coverage-status.covered {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #557a69;
  font-size: .78rem;
  font-weight: 500;
}
.flow-hint {
  margin: 0;
  padding: 13px;
  border: 1px dashed #9bbbd0;
  border-radius: 10px;
  background: #f4f9fc;
  color: #31566f;
  font-weight: 700;
}
.imagery-note {
  padding-top: 10px;
  border-top: 1px solid #d8e4ed;
  font-size: 0.86rem;
}
.influences-list span {
  display: block;
  margin-top: 5px;
  color: var(--fc-primary);
  font-weight: 700;
}
.map-query-panel .no-influence {
  color: #9a3333;
}
.analyze-map {
  width: 100%;
  grid-column: 1 / -1;
  justify-self: stretch;
}
.portal-login-note {
  font-size: 0.82rem;
}
.portal-login-note a {
  display: inline-block;
  color: var(--fc-primary);
  font-weight: 800;
  text-decoration: underline;
}
.map-loading {
  display: grid;
  height: 100%;
  min-height: 0;
  place-items: center;
  border-radius: 18px;
  background: #dbeaf3;
  color: var(--fc-primary);
  font-weight: 700;
}
.public-signin {
  margin-top: 20px;
}
.workspace-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}
.workspace-heading h1 {
  font-size: 2rem;
  margin: 8px 0;
}
.workspace-heading p,
.widget p {
  line-height: 1.6;
}
.eyebrow,
.widget-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--fc-primary);
  text-transform: uppercase;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
}
.eyebrow svg {
  width: 18px;
}
.view-switch {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #edf3f6;
  border-radius: 10px;
}
.view-switch button {
  border: 0;
  background: none;
  padding: 9px 14px;
  border-radius: 8px;
  color: var(--fc-primary);
  font-weight: 700;
}
.view-switch .active {
  background: white;
  box-shadow: 0 2px 6px #15334a14;
}
.panel {
  padding: 24px;
  border: 1px solid var(--fc-border);
  border-radius: 16px;
  background: white;
}
.parcel-controls {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.parcel-controls > label {
  flex: 1;
  min-width: 170px;
}
.parcel-meta,
.snapshot-line {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 18px 0;
  color: var(--fc-text-muted);
  font-size: 0.85rem;
}
.snapshot-line {
  justify-content: space-between;
}
.text-action {
  background: none;
  border: 0;
  color: var(--fc-primary);
  font-weight: 700;
  padding: 10px 0;
  text-align: left;
}
.text-action:disabled,
button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.widget-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 1150px) { .widget-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.widget {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.widget h2 {
  font-size: 1.35rem;
  margin: 0;
}
.widget h3 {
  font-size: 0.95rem;
}
.widget p {
  margin: 0;
}
.widget small {
  color: var(--fc-text-muted);
  line-height: 1.5;
}
.widget details {
  width: 100%;
  border-top: 1px solid var(--fc-border);
  padding-top: 10px;
}
.widget details summary {
  font-size: 0.85rem;
  color: var(--fc-primary);
  cursor: pointer;
  font-weight: 700;
}
.widget details p {
  margin: 10px 0;
}
.alert-widget {
  border-top: 4px solid #8096a2;
}
.alert-widget.good {
  border-top-color: #30915a;
}
.alert-widget.moderate {
  border-top-color: #d6a32b;
}
.alert-widget.severe {
  border-top-color: #bd4040;
}
.diagnosis {
  background: #f2f8fb;
}
.condition-list {
  display: grid;
  gap: 7px;
}
.station-conditions {
  width: 100%;
}
.condition-list > span {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82rem;
  border: 1px solid var(--fc-border);
  border-radius: 8px;
  padding: 8px 10px;
}
.condition-list b {
  font-size: 0.7rem;
  white-space: nowrap;
  color: #68818d;
}
.condition-list .met b {
  color: #a06015;
}
.condition-list .missing b {
  color: #9a3333;
}
.reading {
  width: 100%;
  padding: 10px 0;
  border-bottom: 1px solid var(--fc-border);
}
.weather-numbers {
  font-size: 1.7rem;
  font-weight: 800;
  color: var(--fc-primary);
}
.weather-numbers span {
  font-size: 1.1rem;
  margin-left: 15px;
}
.satellite-image {
  width: 100%;
  max-height: 330px;
  object-fit: contain;
  border-radius: 10px;
  background: #edf3ed;
}
.forecast-days {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  width: 100%;
}
.forecast-days article {
  background: #f3f7fa;
  border-radius: 10px;
  padding: 14px;
  font-size: 0.85rem;
}
.forecast-days b {
  font-size: 0.78rem;
}
.forecast-days p {
  margin: 10px 0;
}
.chat-history {
  width: 100%;
  max-height: 380px;
  overflow: auto;
  display: grid;
  gap: 12px;
}
.chat-history article {
  padding: 12px;
  border-radius: 10px;
  background: #f0f5f8;
}
.chat-history .user {
  background: #e9f4eb;
}
.chat-history article > b {
  font-size: 0.75rem;
}
.chat form {
  display: grid;
  gap: 12px;
  width: 100%;
}
.upload-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.8rem;
  cursor: pointer;
}
.upload-label svg {
  width: 17px;
}
.upload-label input {
  max-width: 100%;
}
.coverage-panel {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.coverage-panel h2 {
  font-size: 1.2rem;
}
.coverage-panel p {
  margin-top: 10px;
  font-size: 0.85rem;
}
.alerts-config,
.report-panel {
  margin-top: 20px;
}
.alerts-config h2 {
  display: flex;
  gap: 10px;
  font-size: 1.3rem;
}
.alerts-config h2 svg {
  width: 23px;
}
.alerts-config > p {
  margin: 12px 0 18px;
  line-height: 1.6;
}
.rule-target {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-top: 12px;
}
.rule-target label:nth-child(2) {
  flex: 1;
}
.rule-preview {
  margin: 15px 0;
  padding: 15px;
  background: #f5f8fa;
  border-radius: 10px;
}
.saved-rule {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 15px 0;
  border-top: 1px solid var(--fc-border);
  padding-top: 15px;
  font-size: 0.85rem;
}
.saved-rule p {
  margin-top: 5px;
  color: var(--fc-text-muted);
}
.report-panel {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.report-panel > div {
  flex: 1;
}
.report-panel h2 {
  font-size: 1.2rem;
}
.report-panel p {
  font-size: 0.85rem;
  margin-top: 7px;
}
.banner {
  padding: 14px 18px;
  background: #edf6fa;
  border: 1px solid #b6d6e5;
  border-radius: 10px;
  margin: 15px 0;
  font-size: 0.85rem;
  line-height: 1.5;
}
.banner.error {
  background: #fff1f1;
  color: #922c2c;
  border-color: #edcccc;
}
.signin {
  text-align: center;
  max-width: 720px;
  margin: 30px auto;
}
.signin > svg {
  width: 48px;
  height: 48px;
  color: var(--fc-primary);
}
.signin h2,
.signin p {
  margin: 15px 0;
}
.signin p {
  line-height: 1.7;
}
.signin .btn {
  margin: 6px;
}
.btn svg {
  width: 17px;
  height: 17px;
}
.response-status {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--fc-text-muted);
}
.limitations {
  margin-top: 20px;
  font-size: 0.85rem;
  line-height: 1.7;
}
pre {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
}
dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  font-size: 0.72rem;
  margin-top: 10px;
}
dd {
  overflow-wrap: anywhere;
}
.parcel-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #102f4c88;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: auto;
  padding: 30px 15px;
}
.modal-card {
  background: white;
  border-radius: 18px;
  width: 1200px;
  max-width: 100%;
  padding: 28px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 800px) {
  .map-query-heading { flex-direction: column; align-items: flex-start; }
  .map-scroll-hint { flex-basis: auto; width: 100%; }
  .map-query-panel { grid-template-columns: minmax(0, 1fr); padding: 18px; }
  .widget-grid,
  .coverage-panel {
    grid-template-columns: 1fr;
  }
  .parcel-controls {
    flex-wrap: wrap;
  }
  .parcel-controls > label {
    flex-basis: 100%;
  }
  .workspace-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .forecast-days {
    grid-template-columns: 1fr;
  }
  .rule-target {
    flex-wrap: wrap;
  }
  .rule-target label {
    flex-basis: 100%;
  }
  .panel {
    padding: 18px;
  }
  .modal-card {
    padding: 18px;
  }
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: rotate 1.5s linear infinite;
}
</style>

<style scoped>.steps-flow>.widget:first-child,.steps-flow>.widget:nth-child(4),.steps-flow>.widget:last-child{grid-column:1/-1}.steps-flow>.widget>.widget-kicker{font-weight:850}.steps-flow .tension-card{width:100%}.steps-flow .widget details{width:100%}.steps-flow .widget details summary{cursor:pointer;color:var(--fc-primary);font-weight:700}.steps-flow .widget .condition-list span{gap:10px}.steps-flow .widget .condition-list b{white-space:nowrap}</style>

<style scoped>
/* Chat-inspired, without borrowing WhatsApp's green: FECOCLIMA colors remain sovereign. */
.workspace-heading{padding:5px 2px 0}.workspace-heading h1{color:var(--fc-primary-strong);font-size:clamp(1.7rem,3vw,2.1rem);letter-spacing:-.035em}.workspace-heading p{margin:7px 0 0;color:var(--fc-text-muted)}.heading-bubble{display:inline-block;vertical-align:middle;padding:6px 9px;margin-left:9px;border-radius:999px;background:#e7f2fb;color:#337ca8;font-size:.68rem;font-weight:800;letter-spacing:0}.view-switch{border:1px solid #d9e7f0;border-radius:15px;background:#e9f2f8}.view-switch button{border-radius:11px}.view-switch button.active{background:var(--fc-primary);color:#fff;box-shadow:0 3px 10px #00448124}
.map-query-panel{background:#fff;box-shadow:var(--fc-shadow)}.map-query-panel .flow-hint{border-radius:13px;background:#eaf4fc;border-color:#acd0e7}.map-query-panel label .label{color:#355b72;font-size:.81rem}.map-query-heading .eyebrow{letter-spacing:.09em}.analyze-map{box-shadow:0 5px 18px #00448120}
.snapshot-line{padding:12px 15px;border:1px solid #d8e7f1;border-radius:15px;background:#fff;box-shadow:0 3px 12px #15426209}.widget-grid{gap:16px}.steps-flow>.widget{position:relative;gap:14px;border:1px solid #dfeaf2;border-radius:20px;box-shadow:var(--fc-shadow);padding:22px;background:#fff}.steps-flow>.widget>.widget-kicker{display:inline-flex;align-items:center;padding:6px 10px;border-radius:8px;background:#edf5fb;color:#286e9f;letter-spacing:.03em;font-size:.69rem}.steps-flow>.widget h2{color:var(--fc-primary-strong);letter-spacing:-.02em}.steps-flow>.widget.diagnosis{background:linear-gradient(135deg,#eaf5fb,#fff 80%)}.steps-flow>.widget.alert-widget{border-top-width:4px}
.current-conditions{overflow:hidden}.station-attribution{width:100%;display:flex;align-items:flex-start;gap:12px;padding:15px 17px;border:1px solid #beddf1;border-radius:16px;background:linear-gradient(110deg,#e9f5ff,#f7fbff 80%)}.source-symbol{flex:0 0 39px;width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:#d3eaf9;color:var(--fc-primary)}.source-symbol svg{width:20px;height:20px}.station-attribution strong{display:block;font-size:.95rem;color:var(--fc-primary-strong)}.station-attribution p{margin:5px 0 0!important;color:#537589;font-size:.79rem;line-height:1.48}.station-issues{width:100%;display:grid;gap:8px}.coverage-diagnostic{padding:12px 14px;border-left:3px solid var(--fc-warning);background:#fff8e8;border-radius:8px;color:#80601c;font-size:.8rem;line-height:1.6}
.chat{overflow:hidden;background:linear-gradient(135deg,#f2f8fc,#fff)!important}.chat .chat-history{display:flex;flex-direction:column;gap:10px;min-height:190px;max-height:460px;padding:17px;border:1px solid #ddeaf2;border-radius:17px;background-color:#f5f9fc;background-image:radial-gradient(#cbdfea75 .7px,transparent .7px);background-size:17px 17px}.chat .chat-history article{width:fit-content;max-width:min(90%,720px);padding:12px 16px;border:1px solid #dce9f2;border-radius:5px 17px 17px 17px;background:#fff;box-shadow:0 2px 4px #143f5710}.chat .chat-history article.user{margin-left:auto;border-color:#c3dcef;border-radius:17px 5px 17px 17px;background:#e4f1fb}.chat .chat-history article>b{color:#2e6a91}.chat form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px;padding:9px;border:1px solid #d7e6ef;border-radius:16px;background:#fff}.chat form textarea{min-height:48px;resize:vertical;border-color:transparent;background:#f3f8fb;border-radius:12px}.chat form .upload-label,.chat form>small{grid-column:1/-1}.chat form .btn-primary{min-width:90px;min-height:48px;border-radius:12px}
@media(max-width:800px){.steps-flow>.widget{padding:17px}.widget-grid{gap:13px}.workspace-heading{gap:12px}.heading-bubble{margin-top:5px}.station-attribution{padding:12px}.chat .chat-history{padding:10px;max-height:420px}.chat form{grid-template-columns:1fr}.chat form .btn-primary{width:100%}}
@media(max-width:720px){.parcel-workspace{padding-top:17px;padding-bottom:26px}.map-query{gap:12px;margin-bottom:15px}.map-frame,.map-frame :deep(.world-map-shell:not(:fullscreen)){min-height:0}.steps-flow>.widget{border-radius:17px}.widget h2{font-size:1.18rem}.station-attribution strong{font-size:.87rem}.chat .chat-history article{max-width:94%}.fc-mobile-simple .map-frame :deep(.world-map-shell:not(:fullscreen)){height:clamp(275px,45vh,360px)}}
</style>

<style scoped>
/* The map sits below the selection header; neither it nor the form traps page scrolling. */
@media (max-width: 800px) {
  .map-frame :deep(.world-map-shell:not(:fullscreen)) { height: clamp(320px, 49vh, 430px); }
}
@media (max-width: 600px) {
  .map-query { gap: 11px; }
  .map-query-heading { padding: 15px; }
  .map-query-panel { grid-template-columns: 1fr; }
  .map-frame :deep(.world-map-shell:not(:fullscreen)) { height: clamp(295px, 47vh, 385px); }
}
/* Los widgets 2 y 3 ocupan toda la fila, para que sus indicadores sean legibles. */
.steps-flow > .widget:nth-child(2), .steps-flow > .widget:nth-child(3) { grid-column: 1 / -1; }
@media (min-width: 801px) {
  .steps-flow > .widget:nth-child(5), .steps-flow > .widget:nth-child(6) { grid-column: auto; }
}
@media (max-width: 800px) {
  .steps-flow > .widget:nth-child(5), .steps-flow > .widget:nth-child(6) { grid-column: 1 / -1; }
}
.current-conditions { overflow: visible; }
.steps-flow .widget :deep(details.info-hint) { width: auto; display: inline-flex; flex: 0 0 auto; border: 0; padding: 0; margin: 0; }
.soil-visible { width: 100%; padding-top: 12px; border-top: 1px solid var(--fc-border); }
.soil-visible h3 { display: flex; align-items: center; margin: 0 0 12px; font-size: .96rem; }
.severity-banner { width: 100%; display: flex; align-items: flex-start; gap: 13px; padding: 16px; background: #f1f5f8; border: 1px solid #d7e2eb; border-radius: 16px; }
.severity-banner.good { background: #e9f7ed; border-color: #b8dec3; }
.severity-banner.moderate { background: #fff5df; border-color: #f0d79b; }
.severity-banner.severe { background: #fff0ed; border-color: #edc1b9; }
.severity-banner.unknown { background: #f0f4f8; border-color: #cbd9e3; }
.severity-banner .severity-icon { display: grid; place-items: center; width: 41px; height: 41px; flex: 0 0 41px; border-radius: 13px; background: #fff; color: var(--fc-primary); }
.severity-banner.good .severity-icon { color: #20794d; }.severity-banner.moderate .severity-icon { color: #a37018; }.severity-banner.severe .severity-icon { color: #b93636; }
.severity-banner .severity-icon svg { width: 23px; height: 23px; }
.severity-banner h2 { font-size: clamp(1.25rem, 2vw, 1.7rem); margin: 3px 0 5px; }
.severity-banner small { font-size: .75rem; font-weight: 750; color: var(--fc-text-muted); }
.severity-banner p { line-height: 1.48; font-size: .86rem; }
.condition-meter { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding: 10px 0; }
.condition-meter strong { font-size: 1.28rem; color: var(--fc-primary-strong); }
.condition-meter span { color: var(--fc-text-muted); font-size: .81rem; }
.condition-heading { display: flex; align-items: center; gap: 8px; font-size: .86rem; font-weight: 800; color: var(--fc-primary-strong); }
.condition-heading svg { width: 18px; height: 18px; flex: 0 0 18px; }
.condition-overview, .missing-conditions { width: 100%; display: grid; gap: 8px; }
.condition-evidence { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border-radius: 12px; border: 1px solid #d8e7ed; background: #f7fafc; }
.condition-evidence > svg { width: 17px; height: 17px; margin-top: 2px; flex: 0 0 17px; }
.condition-evidence.met { background: #edf8f2; border-color: #c4e5d0; }.condition-evidence.met > svg { color: #20794d; }
.condition-evidence.missing { background: #fff7e9; border-color: #f1dcaf; }.condition-evidence.missing > svg { color: #a06b1a; }
.condition-evidence.not-met > svg { color: #7a96a6; }
.condition-evidence strong { display: block; font-size: .84rem; color: var(--fc-text); }
.condition-evidence small { display: block; color: var(--fc-text-muted); margin-top: 3px; font-size: .74rem; }
.condition-empty, .condition-note { font-size: .79rem; line-height: 1.5; color: var(--fc-text-muted); }
.condition-details { width: 100%; }.condition-details .condition-evidence { margin-top: 7px; }
</style>

<style scoped>
.soil-criteria-explanation{grid-column:1/-1;padding:12px 14px;border:1px solid #b8dfca;border-left:4px solid #297a55;background:#f0f8f4;border-radius:11px;color:#245c40;font-size:.82rem;line-height:1.55}
.soil-criteria-explanation strong{display:block;margin-bottom:3px}.soil-criteria-explanation p{margin:3px 0 0}
</style>

<style scoped>
.indicative-severity{margin-top:7px!important;font-size:.75rem;font-weight:650;color:#655226;line-height:1.4}
</style>

<style scoped>
/* Chat tipo mensajería. Se usan los colores propios de FECOCLIMA, no los de WhatsApp. */
.whatsapp-chat{padding:0!important;gap:0!important;overflow:hidden;border:1px solid #cadce9!important;background:#f1f7fb!important}
.wa-header{display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(110deg,#064976,#08669a);color:#fff}
.wa-avatar{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:50%;background:#ffffff28}.wa-avatar svg{width:24px;height:24px}
.wa-contact{min-width:0;display:flex;flex-direction:column;gap:3px;flex:1}.wa-contact strong{font-size:.97rem}.wa-contact small{font-size:.76rem;color:#daeffe}
.wa-icon{display:grid;place-items:center;flex:0 0 39px;width:39px;height:39px;border:0;background:transparent;color:inherit;border-radius:50%;cursor:pointer}
.wa-icon:hover{background:#d0e8fa55}.wa-icon:disabled{opacity:.5}.wa-icon svg{width:21px;height:21px}
.whatsapp-chat .chat-history{height:clamp(285px,47vh,570px);max-height:none;min-height:285px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px;padding:20px!important;border:0!important;border-radius:0!important;background-color:#ebf2f6!important;background-image:radial-gradient(#a5c6da48 .7px,transparent .7px)!important;background-size:18px 18px!important}
.whatsapp-chat .chat-history article{width:fit-content;max-width:min(88%,750px);padding:11px 15px;border-radius:5px 17px 17px 17px;overflow-wrap:anywhere;background:#fff;box-shadow:0 2px 7px #20465c18}
.whatsapp-chat .chat-history article.user{margin-left:auto;border-radius:17px 5px 17px 17px;background:#d9effe}.whatsapp-chat .chat-history article>b{display:block;color:#155f88;font-size:.77rem;margin-bottom:4px}
.wa-greeting{align-self:center;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:300px;margin:auto;text-align:center;color:#4a738a}.wa-greeting svg{width:40px;height:40px;color:#408ebd}.wa-greeting p{font-size:.85rem}
.wa-media-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.wa-media-grid img{display:block;width:140px;max-width:100%;height:116px;object-fit:cover;border-radius:9px}.wa-attachments{display:grid;gap:8px;margin-top:8px}.wa-file a{display:inline-flex;gap:7px;align-items:center;font-size:.82rem;color:#064f82}.wa-file svg{width:16px;height:16px}.wa-file audio{max-width:100%;height:38px}.wa-source{display:block;margin-top:7px;color:#537488}
.wa-typing{padding:9px 12px;align-self:flex-start;border-radius:12px;background:#fff;color:#446779;font-size:.8rem}
.whatsapp-chat .wa-compose{display:block;padding:11px 14px!important;margin:0;background:#fff!important;border:0!important;border-radius:0!important}
.wa-compose-row{display:flex;align-items:flex-end;gap:5px;color:#376d8b}.wa-file-picker{position:relative;overflow:hidden}.wa-file-picker input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.wa-compose-row textarea{flex:1;min-width:0;min-height:40px;max-height:140px;padding:11px!important;border:1px solid #d8e6ee!important;border-radius:22px!important;background:#f6fafc!important;resize:vertical;line-height:1.4;font-family:inherit}
.wa-send{display:grid;place-items:center;flex:0 0 43px;height:43px;border:0;border-radius:50%;color:#fff;background:#086ea5;cursor:pointer}.wa-send:disabled{opacity:.5}.wa-send svg{width:20px;height:20px}.wa-recording{color:#c03737;animation:pulse 1.4s ease-in-out infinite}.wa-record-hint,.wa-error,.wa-hint{display:block;margin-top:5px;font-size:.72rem!important}.wa-record-hint{color:#b32e2e}.wa-error{color:#af2c2c}.wa-hint{color:#6b8597}.wa-selected{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.wa-chip{display:flex;align-items:center;gap:5px;max-width:100%;font-size:.7rem;padding:5px 8px;border-radius:20px;background:#e7f2fa;color:#256282}.wa-chip svg{width:14px;height:14px;flex-shrink:0}.wa-chip button{border:0;background:transparent;padding:0;display:grid;place-items:center;cursor:pointer}
@media(max-width:720px){.wa-header{padding:10px}.wa-avatar{flex-basis:35px;width:35px;height:35px}.wa-contact strong{font-size:.84rem}.wa-contact small{font-size:.67rem}.whatsapp-chat .chat-history{padding:12px!important;height:clamp(300px,49vh,510px)}.whatsapp-chat .chat-history article{max-width:94%}.whatsapp-chat .wa-compose{padding:9px!important}.wa-compose-row{gap:1px}.wa-icon{flex-basis:34px;width:34px;height:38px}.wa-compose-row textarea{font-size:16px;padding:10px!important}.wa-send{flex-basis:39px;height:39px}.wa-hint{display:none}}
</style>

<style scoped>
.imagery-preview-status{grid-column:1/-1;display:flex;flex-direction:column;align-items:stretch;gap:12px;border-radius:18px;border:1px solid #cae2df;background:linear-gradient(130deg,#f7fffc 0%,#eef6ff 100%);padding:18px}
.spectral-heading{display:flex;align-items:start;justify-content:space-between;gap:16px}
.spectral-heading h3{margin:4px 0 5px;font-size:1.12rem;color:#133e55}
.spectral-heading p{margin:0;color:#517083;max-width:680px;line-height:1.5}
.spectral-state{white-space:nowrap;border-radius:999px;padding:6px 12px;background:#f3ecda;color:#806323;font-size:.74rem;font-weight:800}
.spectral-state.ready{background:#e1f5e8;color:#16613a}
.spectral-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:10px}
.spectral-value{border-radius:13px;background:#fff;border:1px solid #deebf0;padding:13px;box-shadow:0 3px 11px #1540550e;display:flex;flex-direction:column;gap:6px}
.spectral-value small{color:#537183;font-weight:650}.spectral-value abbr{border:0;color:#587c91;font-size:.65rem}.spectral-value strong{font-size:1.46rem;font-weight:850;color:#0b5d63;font-variant-numeric:tabular-nums}
.spectral-meta{display:flex;flex-wrap:wrap;gap:10px;color:#4f6978;font-size:.77rem}.spectral-actions{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.spectral-actions label{min-width:170px}.spectral-empty{margin:0;color:#536f79}.spectral-progress{margin:0;color:#17586a;font-weight:650}.spectral-warning{color:#a53b2b}
@media(max-width:640px){.spectral-heading{flex-direction:column}.spectral-values{grid-template-columns:repeat(2,minmax(0,1fr))}.imagery-preview-status{padding:12px}}
</style>

<style scoped>
.map-frame :deep(.world-map-component .world-map-shell.compatibility-mode){height:auto;min-height:0}
</style>

<style scoped>
.alert-columns{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:26px;align-items:start}.alert-summary,.alert-evaluation{display:grid;gap:15px;min-width:0}.alert-evaluation{border-left:1px solid #e2ebf1;padding-left:26px}.alert-evaluation .condition-heading{margin:0}.alert-columns .severity-banner{margin:0}.diagnosis-timeframes{display:flex;flex-wrap:wrap;gap:8px}.diagnosis-timeframes span{padding:7px 10px;border:1px solid #d7e6f1;border-radius:9px;background:#ffffffb5;font-size:.75rem;font-weight:650;color:var(--fc-primary)}@media(max-width:900px){.alert-columns{grid-template-columns:1fr;gap:20px}.alert-evaluation{padding:20px 0 0;border-left:0;border-top:1px solid #e2ebf1}}:global(.fc-mobile-simple) .alert-columns{grid-template-columns:1fr}:global(.fc-mobile-simple) .alert-evaluation{padding:20px 0 0;border-left:0;border-top:1px solid #e2ebf1}
</style>

<style scoped>
@media(max-width:700px){.map-frame :deep(.world-map-shell:not(.compatibility-mode):not(:fullscreen)){height:clamp(420px,62dvh,580px);min-height:420px}.parcel-workspace{width:calc(100% - 20px);max-width:100%;padding-bottom:90px}.map-query-panel{min-width:0}.parcel-setup-columns{grid-template-columns:1fr}.parcel-owner-column{border-left:0;border-top:1px solid #e1ebf2;padding:18px 0 0}.workspace-top-controls .parcel-controls>.parcel-selector{min-width:0;flex-basis:100%;max-width:none}.workspace-top-controls .btn{min-height:44px;height:auto}.widget,.spectral-value,.parcel-satellite-viewer{min-width:0}.steps-flow{grid-template-columns:minmax(0,1fr)}}
:global(.fc-mobile-simple) .map-frame :deep(.world-map-shell:not(.compatibility-mode):not(:fullscreen)){min-height:420px;height:clamp(420px,62dvh,580px)}
</style>

<style scoped>
.map-frame :deep(.world-map-shell.compatibility-mode){height:auto!important;min-height:0}.parcel-modal :deep(.world-map-shell.compatibility-mode){height:auto!important;min-height:0}
</style>

<style scoped>
.current-conditions{position:relative;overflow:visible}
.station-attribution{position:relative;padding-right:52px}
.station-attribution>.station-source-info{position:absolute;top:12px;right:12px;margin:0;z-index:5}
.current-conditions :deep(.station-source-info .info-text){left:auto;right:0;text-align:left}
</style>

<style scoped>
.viewer-time-note{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:6px 0 12px;color:var(--fc-text-muted);font-size:.75rem}
</style>

<style scoped>
.wa-typing{display:flex;align-items:center;gap:10px}.typing-dots{display:flex;gap:4px}.typing-dots i{width:6px;height:6px;border-radius:50%;background:#408ebd;animation:chat-pulse 1.2s ease-in-out infinite}.typing-dots i:nth-child(2){animation-delay:.15s}.typing-dots i:nth-child(3){animation-delay:.3s}@keyframes chat-pulse{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@media(prefers-reduced-motion:reduce){.typing-dots i{animation:none}}
</style>
