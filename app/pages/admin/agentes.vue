<script setup lang="ts">
import { BookOpen, FilePlus2, FileText, Link2, RefreshCw, Trash2, UploadCloud } from 'lucide-vue-next'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface KnowledgeDocumentRow {
  id: string
  title: string
  filename?: string | null
  index_status?: string
  index_error?: string | null
  institution?: string | null
  year?: number | null
  crop_id?: string | null
  crop_name?: string | null
  linked_agent_ids?: string[]
}

const { request } = useApi()
const crudRef = ref<{ load: () => Promise<void> } | null>(null)
const crops = ref<Record<string, any>[]>([])
const modelOptions = ref<Array<{ label: string; value: string }>>([])
const modelWarning = ref('')
const modelSource = ref('')
const currentAgentId = ref<string | null>(null)
const currentAgentCropId = ref<string | null>(null)
const currentDocuments = ref<KnowledgeDocumentRow[]>([])
const libraryDocuments = ref<KnowledgeDocumentRow[]>([])
const pendingFiles = ref<File[]>([])
const existingDocumentId = ref('')
const documentInstitution = ref('')
const documentYear = ref<number | null>(null)
const documentVersion = ref('')
const documentMessage = ref('')
const documentError = ref('')
const documentBusy = ref(false)

const purposes = [
  { label: 'Criterio general para productores', value: 'CROP_ANALYSIS' },
  { label: 'Comparación con el mismo periodo del año anterior', value: 'YEAR_COMPARISON' },
  { label: 'Análisis de Copernicus y geozona', value: 'SATELLITE_ANALYSIS' },
  { label: 'Análisis ambiental desde la siembra', value: 'PHENOLOGY_ANALYSIS' },
  { label: 'Boletín automático de 72 horas', value: 'DAILY_DIGEST' }
]

const fields = computed(() => [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'code', label: 'Código', required: true },
  {
    key: 'crop_id',
    label: 'Cultivo',
    type: 'select',
    options: [
      { label: 'General / todos los cultivos (solo boletín)', value: '' },
      ...crops.value.map(crop => ({ label: crop.name, value: crop.id }))
    ],
    hint: 'Los agentes general, comparativo, satelital y fenológico requieren cultivo. El boletín puede ser general.'
  },
  { key: 'purpose', label: 'Rol del agente', type: 'select', required: true, options: purposes },
  { key: 'description', label: 'Descripción', type: 'textarea' },
  {
    key: 'system_prompt',
    label: 'Conocimiento y criterio del agente',
    type: 'textarea',
    hint: 'Defina el enfoque agronómico. La forma de hablar, la longitud y los temas visibles se controlan abajo sin editar JSON.'
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
  { key: 'response_max_words', label: 'Máximo de palabras', type: 'number', numericMode: 'integer', min: 100, max: 1200, defaultValue: 260, hint: 'Para productores se recomiendan entre 180 y 300 palabras.' },
  { key: 'response_max_sections', label: 'Máximo de secciones', type: 'number', numericMode: 'integer', min: 2, max: 8, defaultValue: 4 },
  { key: 'response_include_observed', label: 'Hablar de datos observados', type: 'checkbox', defaultValue: true },
  { key: 'response_include_forecast', label: 'Hablar del pronóstico', type: 'checkbox', defaultValue: true },
  { key: 'response_include_satellite', label: 'Hablar de imagen e índices satelitales', type: 'checkbox', defaultValue: true },
  { key: 'response_include_year_comparison', label: 'Incluir comparación con el año anterior', type: 'checkbox', defaultValue: true },
  { key: 'response_include_sources', label: 'Mostrar fuentes documentales al productor', type: 'checkbox', defaultValue: false },
  { key: 'response_show_technical_values', label: 'Mostrar cifras técnicas', type: 'checkbox', defaultValue: false, hint: 'Desactivado: el agente traduce las cifras a condiciones prácticas y conserva solo las decisivas.' },
  { key: 'response_show_system_details', label: 'Mostrar detalles internos del cálculo', type: 'checkbox', defaultValue: false, hint: 'Manténgalo desactivado para ocultar confianza, condiciones X de Y, motor, modelo y otros términos internos.' },
  { key: 'response_use_emojis', label: 'Usar emojis moderados', type: 'checkbox', defaultValue: true },
  { key: 'response_custom_instructions', label: 'Instrucciones adicionales de comunicación', type: 'textarea', placeholder: 'Ejemplo: priorice acciones de campo y mencione solo el día más crítico del pronóstico.' },
  { key: 'model', label: 'Modelo de IA', type: 'select', required: true, options: modelOptions.value },
  { key: 'temperature', label: 'Temperatura', type: 'number', numericMode: 'decimal', step: 0.1, min: 0, max: 2, defaultValue: 0.2, placeholder: '0.2' },
  { key: 'max_tokens', label: 'Límite técnico de tokens', type: 'number', numericMode: 'integer', step: 1, min: 100, max: 20000, defaultValue: 1500, hint: 'La longitud visible se controla con “Máximo de palabras”. Este límite evita respuestas cortadas por el proveedor.' },
  { key: 'rag_collection', label: 'Colección RAG', hint: 'Normalmente coincide con SOJA, TRIGO o MAIZ.' },
  { key: 'active', label: 'Activo', type: 'checkbox' }
])

const attachableDocuments = computed(() => {
  const linked = new Set(currentDocuments.value.map(document => document.id))
  return libraryDocuments.value.filter(document => {
    if (linked.has(document.id)) return false
    const documentCropId = document.crop_id || null
    return documentCropId === null || documentCropId === currentAgentCropId.value
  })
})

function apiErrorMessage(exception: any): string {
  const detail = exception?.data?.detail
  if (Array.isArray(detail)) return detail.map((item: any) => item?.msg || 'Dato inválido').join(' · ')
  return detail || exception?.message || 'No se pudo completar la operación.'
}

async function loadKnowledgeLibrary() {
  try {
    const result: any = await request('/knowledge/documents', { query: { limit: 250 } })
    libraryDocuments.value = result.items || []
  } catch (exception: any) {
    documentError.value = apiErrorMessage(exception)
  }
}

function resetKnowledgePanel() {
  currentAgentId.value = null
  currentAgentCropId.value = null
  currentDocuments.value = []
  pendingFiles.value = []
  existingDocumentId.value = ''
  documentInstitution.value = ''
  documentYear.value = null
  documentVersion.value = ''
  documentMessage.value = ''
  documentError.value = ''
}

function onCreating() {
  resetKnowledgePanel()
}

function onEditing(row: Record<string, any>) {
  resetKnowledgePanel()
  currentAgentId.value = row.id
  currentAgentCropId.value = row.crop_id || null
  currentDocuments.value = [...(row.knowledge_documents || [])]
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  pendingFiles.value = Array.from(input.files || [])
  documentMessage.value = pendingFiles.value.length
    ? `${pendingFiles.value.length} archivo(s) se cargarán al guardar el agente.`
    : ''
}

async function uploadFile(file: File, agent: Record<string, any>) {
  const body = new FormData()
  body.append('file', file)
  body.append('title', file.name.replace(/\.[^.]+$/, ''))
  body.append('agent_id', agent.id)
  if (agent.crop_id) body.append('crop_id', agent.crop_id)
  if (documentInstitution.value.trim()) body.append('institution', documentInstitution.value.trim())
  if (documentYear.value) body.append('year', String(documentYear.value))
  if (documentVersion.value.trim()) body.append('version', documentVersion.value.trim())
  await request('/knowledge/upload', { method: 'POST', body })
}

async function afterAgentSave(agent: Record<string, any>) {
  currentAgentId.value = agent.id
  currentAgentCropId.value = agent.crop_id || null
  documentError.value = ''
  if (!pendingFiles.value.length) return
  documentBusy.value = true
  try {
    for (const file of pendingFiles.value) await uploadFile(file, agent)
    documentMessage.value = `${pendingFiles.value.length} documento(s) se guardaron y quedaron en cola de indexación.`
    pendingFiles.value = []
    await loadKnowledgeLibrary()
  } catch (exception: any) {
    documentError.value = apiErrorMessage(exception)
    throw new Error(documentError.value)
  } finally {
    documentBusy.value = false
  }
}

async function attachExistingDocument() {
  if (!currentAgentId.value || !existingDocumentId.value) return
  documentBusy.value = true
  documentError.value = ''
  try {
    const document = await request<KnowledgeDocumentRow>(`/knowledge/agents/${currentAgentId.value}/documents/${existingDocumentId.value}`, { method: 'POST' })
    if (!currentDocuments.value.some(item => item.id === document.id)) currentDocuments.value.push(document)
    existingDocumentId.value = ''
    documentMessage.value = 'Documento vinculado al agente.'
    await crudRef.value?.load()
  } catch (exception: any) {
    documentError.value = apiErrorMessage(exception)
  } finally {
    documentBusy.value = false
  }
}

async function unlinkDocument(document: KnowledgeDocumentRow) {
  if (!currentAgentId.value) return
  documentBusy.value = true
  documentError.value = ''
  try {
    await request(`/knowledge/agents/${currentAgentId.value}/documents/${document.id}`, { method: 'DELETE' })
    currentDocuments.value = currentDocuments.value.filter(item => item.id !== document.id)
    documentMessage.value = 'Documento desvinculado. El archivo permanece disponible en la biblioteca para otros agentes.'
    await crudRef.value?.load()
  } catch (exception: any) {
    documentError.value = apiErrorMessage(exception)
  } finally {
    documentBusy.value = false
  }
}

async function reindexDocument(document: KnowledgeDocumentRow) {
  documentBusy.value = true
  documentError.value = ''
  try {
    await request(`/knowledge/documents/${document.id}/reindex`, { method: 'POST' })
    document.index_status = 'PENDING'
    document.index_error = null
    documentMessage.value = 'Reindexación enviada a la cola de trabajos.'
  } catch (exception: any) {
    documentError.value = apiErrorMessage(exception)
  } finally {
    documentBusy.value = false
  }
}

onMounted(async () => {
  const [cropResult, modelResult]: any[] = await Promise.all([
    request('/crops', { query: { limit: 250 } }),
    request('/agents/model-options'),
    loadKnowledgeLibrary()
  ])
  crops.value = cropResult.items || []
  modelSource.value = modelResult.source || ''
  modelWarning.value = modelResult.warning || ''
  modelOptions.value = (modelResult.items || []).map((item: any) => ({ label: item.label || item.id, value: item.id }))
})
</script>

<template>
  <section>
    <div class="notice agent-guide">
      <b>Agentes fundamentados por cultivo, rol y documentos propios.</b>
      <span>Cada respuesta cruza datos de estación, reglas determinísticas, fenología, pronóstico, Copernicus y los documentos vinculados al agente. Si el proveedor IA falla, el portal entrega un criterio determinístico de respaldo y registra el incidente.</span>
    </div>
    <div v-if="modelWarning" class="notice notice-warning model-notice"><b>Selector de modelos en modo de respaldo.</b><span>{{ modelWarning }}</span></div>
    <div v-else-if="modelSource === 'provider'" class="notice model-notice"><b>Modelos consultados desde el proveedor.</b><span>El selector muestra los modelos disponibles para la llave configurada.</span></div>

    <AdminCrudPage
      ref="crudRef"
      title="Agentes de IA y conocimiento"
      description="Configure qué sabe el agente, de qué temas puede hablar y cuán breve debe ser. Cargue sus PDF, DOCX o TXT en el mismo formulario."
      endpoint="/agents"
      :allow-create="true"
      :allow-delete="true"
      :allow-test="true"
      :fields="fields as any"
      :after-save="afterAgentSave"
      :columns="[
        { key: 'name', label: 'Nombre' },
        { key: 'crop_name', label: 'Cultivo' },
        { key: 'purpose_label', label: 'Rol' },
        { key: 'documents_count', label: 'Documentos' },
        { key: 'model', label: 'Modelo' },
        { key: 'active', label: 'Activo' }
      ]"
      @creating="onCreating"
      @editing="onEditing"
    >
      <template #drawer-extra="{ editingId }">
        <section class="knowledge-panel">
          <div class="knowledge-head">
            <BookOpen />
            <div>
              <h3>Base de conocimiento del agente</h3>
              <p>Los fragmentos indexados se recuperan por similitud y se incluyen como evidencia documental en cada respuesta.</p>
            </div>
          </div>

          <div v-if="documentMessage" class="notice knowledge-message">{{ documentMessage }}</div>
          <div v-if="documentError" class="notice notice-warning knowledge-message">{{ documentError }}</div>

          <label class="file-drop">
            <FilePlus2 />
            <span><b>Agregar documentos</b><small>PDF, DOCX o TXT. Puede seleccionar varios.</small></span>
            <input type="file" multiple accept=".pdf,.docx,.txt,application/pdf" @change="onFilesSelected">
          </label>
          <ul v-if="pendingFiles.length" class="pending-list">
            <li v-for="file in pendingFiles" :key="`${file.name}-${file.size}`"><FileText /> {{ file.name }} <small>{{ Math.ceil(file.size / 1024) }} KB</small></li>
          </ul>

          <div class="metadata-grid">
            <label><span class="label">Institución (opcional)</span><input v-model="documentInstitution" class="input"></label>
            <label><span class="label">Año (opcional)</span><input v-model.number="documentYear" class="input" type="number" min="1800" max="2200"></label>
            <label><span class="label">Versión (opcional)</span><input v-model="documentVersion" class="input"></label>
          </div>

          <p v-if="!editingId" class="create-note"><UploadCloud /> Los documentos seleccionados se cargarán inmediatamente después de crear el agente.</p>

          <template v-else>
            <div class="existing-link">
              <select v-model="existingDocumentId" class="select">
                <option value="">Vincular un documento ya cargado…</option>
                <option v-for="document in attachableDocuments" :key="document.id" :value="document.id">{{ document.title }} · {{ document.crop_name || 'General' }}</option>
              </select>
              <button type="button" class="btn btn-light" :disabled="!existingDocumentId || documentBusy" @click="attachExistingDocument"><Link2 /> Vincular</button>
            </div>

            <div class="document-list">
              <article v-for="document in currentDocuments" :key="document.id" class="document-row">
                <FileText />
                <div>
                  <b>{{ document.title }}</b>
                  <small>{{ document.filename || 'Documento interno' }} · {{ document.institution || 'Sin institución' }}</small>
                  <span class="badge" :class="document.index_status === 'INDEXED' ? 'badge-success' : document.index_status === 'FAILED' ? 'badge-danger' : 'badge-warning'">{{ document.index_status || 'PENDING' }}</span>
                  <small v-if="document.index_error" class="document-error">{{ document.index_error }}</small>
                </div>
                <div class="document-actions">
                  <button type="button" title="Reindexar" :disabled="documentBusy" @click="reindexDocument(document)"><RefreshCw /></button>
                  <button type="button" class="danger" title="Desvincular" :disabled="documentBusy" @click="unlinkDocument(document)"><Trash2 /></button>
                </div>
              </article>
              <p v-if="!currentDocuments.length" class="no-documents">Este agente todavía no tiene documentos vinculados.</p>
            </div>
          </template>
        </section>
      </template>
    </AdminCrudPage>
  </section>
</template>

<style scoped>
.agent-guide,.model-notice{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}.notice-warning{background:#fff7df;border-color:#f2d37b}.knowledge-panel{margin-top:4px;padding-top:18px;border-top:1px solid var(--fc-border)}.knowledge-head{display:flex;align-items:flex-start;gap:10px}.knowledge-head>svg{flex:0 0 25px;color:var(--fc-primary)}.knowledge-head h3{margin:0;color:var(--fc-primary)}.knowledge-head p{margin:4px 0 0;color:var(--fc-text-muted);font-size:.8rem;line-height:1.4}.knowledge-message{margin-top:12px}.file-drop{position:relative;display:flex;align-items:center;gap:12px;margin-top:14px;padding:16px;border:1px dashed var(--fc-secondary);border-radius:12px;background:#f1f8fc;cursor:pointer}.file-drop>svg{width:28px;color:var(--fc-primary)}.file-drop span,.file-drop small{display:block}.file-drop small{margin-top:3px;color:var(--fc-text-muted)}.file-drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.pending-list{margin:8px 0 0;padding:0;list-style:none}.pending-list li{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:7px;background:var(--fc-surface-muted);font-size:.78rem}.pending-list svg{width:16px;color:var(--fc-primary)}.pending-list small{margin-left:auto;color:var(--fc-text-muted)}.metadata-grid{display:grid;grid-template-columns:1.4fr .7fr .9fr;gap:9px;margin-top:12px}.create-note{display:flex;align-items:center;gap:7px;margin:12px 0 0;padding:10px;border-radius:8px;background:#edf7fb;color:var(--fc-primary);font-size:.78rem}.create-note svg{width:17px}.existing-link{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}.existing-link .btn svg{width:16px}.document-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}.document-row{display:grid;grid-template-columns:auto 1fr auto;gap:9px;padding:11px;border:1px solid var(--fc-border);border-radius:10px;background:#fff}.document-row>svg{width:21px;color:var(--fc-primary)}.document-row b,.document-row small{display:block}.document-row small{margin-top:3px;color:var(--fc-text-muted);font-size:.72rem}.document-row .badge{display:inline-flex;margin-top:6px}.document-error{color:var(--fc-danger)!important}.document-actions{display:flex;gap:5px}.document-actions button{display:grid;place-items:center;width:31px;height:31px;border:0;border-radius:7px;background:#eaf3f8;color:var(--fc-primary)}.document-actions button.danger{background:#ffeded;color:var(--fc-danger)}.document-actions svg{width:15px}.no-documents{margin:0;padding:12px;border:1px dashed var(--fc-border);border-radius:9px;color:var(--fc-text-muted);text-align:center;font-size:.78rem}@media(max-width:650px){.metadata-grid{grid-template-columns:1fr}.existing-link{grid-template-columns:1fr}.document-row{grid-template-columns:auto 1fr}.document-actions{grid-column:2}}
</style>
