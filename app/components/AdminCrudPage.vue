<script setup lang="ts">
import { FlaskConical, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'

interface Field {
  key: string
  label: string
  type?: 'text' | 'email' | 'number' | 'select' | 'date' | 'textarea' | 'checkbox' | 'checkbox-group' | 'boolean-select' | 'combobox' | 'password' | 'geojson-map'
  options?: Array<{ label: string; value: string | number }>
  defaultValue?: unknown
  required?: boolean
  placeholder?: string
  json?: boolean
  numericMode?: 'decimal' | 'integer'
  step?: number | string
  min?: number
  max?: number
  hint?: string
  advanced?: boolean
  section?: string
  configKey?: string
  showWhen?: { key: string; values: string[] }
}

const props = defineProps<{
  title: string
  basePath?: string
  detailId?: string
  filters?: Array<{ key: string; label: string; options: Array<{ label: string; value: string }> }>
  description?: string
  endpoint: string
  fields: Field[]
  columns?: Array<{ key: string; label: string }>
  createLabel?: string
  allowCreate?: boolean
  allowDelete?: boolean
  allowTest?: boolean
  testQuery?: Record<string, any> | (() => Record<string, any>)
  preparePayload?: (payload: Record<string, any>) => Record<string, any>
  afterSave?: (row: Record<string, any>, context: { editing: boolean }) => Promise<void> | void
}>()

const emit = defineEmits<{
  creating: []
  editing: [row: Record<string, any>]
  saved: [row: Record<string, any>]
}>()

const { request } = useApi()
const rows = ref<Record<string, any>[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const form = reactive<Record<string, any>>({})
const deleteTarget = ref<Record<string, any> | null>(null)
const testingId = ref<string | null>(null)
const testMessage = ref('')
const testDetails = ref<Record<string, any> | null>(null)
const testTone = ref<'success' | 'warning' | 'danger'>('success')

const displayColumns = computed(() => props.columns || props.fields.slice(0, 5).map(field => ({ key: field.key, label: field.label })))
const canCreate = computed(() => props.allowCreate !== false)
const canDelete = computed(() => props.allowDelete !== false)
const route = useRoute()
const router = useRouter()
const filterValues = reactive<Record<string, string>>(Object.fromEntries((props.filters || []).map(filter => [filter.key, String(route.query[filter.key] || '')])))
watch(filterValues, values => {
  const query = { ...route.query }
  for (const [key,value] of Object.entries(values)) { if (value) query[key] = value; else delete query[key] }
  void router.replace({ query })
})
const filtered = computed(() => rows.value.filter(row =>
  (!search.value || JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())) &&
  (props.filters || []).every(filter => !filterValues[filter.key] || String(row[filter.key] ?? '') === filterValues[filter.key])
))
const notice = ref('')
const record = computed(() => rows.value[0])
const recordTitle = computed(() => props.detailId === 'nuevo' ? `Nuevo registro · ${props.title}` : record.value?.name || record.value?.title || props.title)
const fieldVisible = (field: Field) => !field.showWhen || field.showWhen.values.includes(form[field.showWhen.key])
const basicFields = computed(() => props.fields.filter(field => !field.advanced && fieldVisible(field)))
const advancedFields = computed(() => props.fields.filter(field => field.advanced && fieldVisible(field)))
function closeForm() {
  if (props.detailId && props.basePath) return navigateTo(props.basePath)
  showForm.value = false
}

function isJsonField(field: Field): boolean {
  return field.json === true || field.type === 'geojson-map' || ['non_sensitive_config', 'geojson', 'influence_geojson', 'configuration', 'output_schema', 'value'].includes(field.key)
}

function initialValue(field: Field): any {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue)
  if (field.type === 'checkbox-group') return []
  const stationDefaults: Record<string, string | number> = {
    country: 'Paraguay', timezone: 'America/Asuncion', source_type: 'MANUAL',
    expected_interval_minutes: 10, influence_radius_m: 750
  }
  if (field.key in stationDefaults) return stationDefaults[field.key]
  if (['checkbox', 'boolean-select'].includes(field.type || '')) return true
  if (field.type === 'geojson-map') return null
  if (isJsonField(field)) return field.key === 'available_variables' ? '[]' : '{}'
  return ''
}

function reset() {
  for (const field of props.fields) form[field.key] = initialValue(field)
  editingId.value = null
  error.value = ''
}

function openCreate() {
  if (props.basePath && !props.detailId) { void navigateTo(`${props.basePath}/nuevo`); return }
  reset()
  emit('creating')
  showForm.value = true
}

function openEdit(row: Record<string, any>) {
  if (props.basePath && !props.detailId) { void navigateTo(`${props.basePath}/${row.id}`); return }
  reset()
  editingId.value = row.id
  for (const field of props.fields) {
    const value = field.configKey ? row.non_sensitive_config?.[field.configKey] : row[field.key]
    if (isJsonField(field) && value !== null && value !== undefined && typeof value === 'object') {
      form[field.key] = JSON.stringify(value, null, 2)
    } else if (value === null || value === undefined) {
      form[field.key] = initialValue(field)
      if (['checkbox', 'boolean-select'].includes(field.type || '')) form[field.key] = false
    } else {
      if (field.type === 'checkbox-group') {
        const options = new Set((field.options || []).map(option => String(option.value)))
        form[field.key] = Array.isArray(value)
          ? [...new Set(value.map((item: unknown) => Number(item)).filter((item: number) => Number.isInteger(item) && options.has(String(item))))]
          : []
      } else {
        form[field.key] = value
      }
    }
  }
  emit('editing', row)
  showForm.value = true
}

function canonicalNumericText(value: unknown): string {
  let text = String(value ?? '').trim().replace(/[\s\u00a0]/g, '')
  if (!text) return ''

  const commaCount = (text.match(/,/g) || []).length
  const dotCount = (text.match(/\./g) || []).length
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')

  // Admite formatos habituales en español y en APIs: 1234,56 / 1234.56.
  // Si aparecen ambos separadores, el último se interpreta como decimal.
  if (commaCount && dotCount) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  } else if (commaCount === 1) {
    text = text.replace(',', '.')
  } else if (commaCount > 1 || dotCount > 1) {
    return text
  }

  return text
}

function parseNumericField(value: unknown, field: Field): number {
  const canonical = canonicalNumericText(value)
  if (!canonical || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(canonical)) {
    throw new Error(`El campo “${field.label}” debe ser numérico. Puede usar punto o coma decimal.`)
  }

  const parsed = Number(canonical)
  if (!Number.isFinite(parsed)) {
    throw new Error(`El campo “${field.label}” debe ser numérico.`)
  }
  if (field.numericMode === 'integer' && !Number.isInteger(parsed)) {
    throw new Error(`El campo “${field.label}” debe ser un número entero.`)
  }
  if (field.min !== undefined && parsed < field.min) {
    throw new Error(`El campo “${field.label}” no puede ser menor que ${field.min}.`)
  }
  if (field.max !== undefined && parsed > field.max) {
    throw new Error(`El campo “${field.label}” no puede ser mayor que ${field.max}.`)
  }
  return parsed
}

function normalizeNumericField(field: Field) {
  const value = form[field.key]
  if (value === '' || value === null || value === undefined) return
  try {
    form[field.key] = parseNumericField(value, field)
  } catch {
    // La validación detallada se presenta al guardar; no se borra lo digitado.
  }
}

function normalizePayload(): Record<string, any> {
  const payload: Record<string, any> = {}
  const configUpdates: Record<string, any> = {}
  for (const field of props.fields) {
    const value = form[field.key]

    if (field.configKey) {
      if (fieldVisible(field)) configUpdates[field.configKey] = value === '' ? null : field.type === 'number' ? parseNumericField(value, field) : value
      continue
    }
    if (field.type === 'checkbox-group') { payload[field.key] = Array.isArray(value) ? value : []; continue }
    if (isJsonField(field)) {
      if (value === '' || value === null || value === undefined) {
        payload[field.key] = field.type === 'geojson-map' ? null : {}
        continue
      }
      if (typeof value === 'object') {
        payload[field.key] = value
        continue
      }
      try {
        payload[field.key] = JSON.parse(String(value))
      } catch {
        throw new Error(`El campo “${field.label}” debe contener un JSON válido.`)
      }
      continue
    }

    if (field.type === 'number') {
      if (value === '' || value === null || value === undefined) {
        payload[field.key] = null
      } else {
        payload[field.key] = parseNumericField(value, field)
      }
      continue
    }

    if (field.type === 'date' && value === '') {
      payload[field.key] = null
      continue
    }

    if (!field.required && value === '') {
      payload[field.key] = null
      continue
    }

    payload[field.key] = value
  }
  if (Object.keys(configUpdates).length) {
    const config = { ...(payload.non_sensitive_config || record.value?.non_sensitive_config || {}), ...configUpdates }
    for (const key of Object.keys(config)) if (config[key] === null || config[key] === '') delete config[key]
    payload.non_sensitive_config = config
  }
  return props.preparePayload ? props.preparePayload(payload) : payload
}

function apiErrorMessage(exception: any): string {
  const detail = exception?.data?.detail
  if (Array.isArray(detail)) {
    return detail.map((item: any) => {
      const location = Array.isArray(item?.loc) ? item.loc.filter((part: string) => part !== 'body').join('.') : ''
      return `${location ? `${location}: ` : ''}${item?.msg || 'Dato inválido'}`
    }).join(' · ')
  }
  return detail || exception?.message || 'No se pudo guardar'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (props.detailId === 'nuevo') { rows.value = []; openCreate(); return }
    if (props.detailId) {
      const data = await request<Record<string, any>>(`${props.endpoint}/${props.detailId}`)
      rows.value = [data]
      if (props.fields.length) openEdit(data)
      return
    }
    const data: any = await request(props.endpoint, { query: { limit: 250 } })
    rows.value = Array.isArray(data) ? data : (data.items || [])
  } catch (exception: any) {
    error.value = apiErrorMessage(exception)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const path = editingId.value ? `${props.endpoint}/${editingId.value}` : props.endpoint
    const wasEditing = Boolean(editingId.value)
    const saved = await request<Record<string, any>>(path, {
      method: editingId.value ? 'PUT' : 'POST',
      body: normalizePayload()
    })
    // Si el registro se creó pero una acción complementaria (por ejemplo,
    // cargar documentos) falla, el siguiente intento debe actualizarlo y no
    // crear un duplicado.
    if (!wasEditing && saved?.id) editingId.value = saved.id
    if (props.afterSave) await props.afterSave(saved, { editing: wasEditing })
    emit('saved', saved)
    if (props.detailId) {
      notice.value = 'Cambios guardados correctamente.'
      if (!wasEditing && saved?.id && props.basePath) { await navigateTo(`${props.basePath}/${saved.id}`); return }
      await load()
    } else { showForm.value = false; await load() }
  } catch (exception: any) {
    error.value = apiErrorMessage(exception)
  } finally {
    saving.value = false
  }
}


async function testRow(row: Record<string, any>) {
  testingId.value = row.id
  testMessage.value = ''
  testDetails.value = null
  try {
    const query = typeof props.testQuery === 'function' ? props.testQuery() : (props.testQuery || {})
    const result: any = await request(`${props.endpoint}/${row.id}/test`, { method: 'POST', query })
    testTone.value = result.status === 'FAILED' ? 'danger' : result.status === 'PARTIAL' ? 'warning' : 'success'
    testMessage.value = result.detail || 'Prueba completada correctamente.'
    testDetails.value = result.data || null
    await load()
  } catch (exception: any) {
    testTone.value = 'danger'
    testMessage.value = apiErrorMessage(exception)
    testDetails.value = exception?.data || null
    await load()
  } finally {
    testingId.value = null
  }
}

async function remove() {
  if (!deleteTarget.value) return
  try {
    await request(`${props.endpoint}/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await load()
  } catch (exception: any) {
    error.value = apiErrorMessage(exception)
  }
}

defineExpose({ load })

onMounted(load)
watch(() => [props.detailId, props.endpoint], () => { notice.value = ''; void load() })
</script>

<template>
  <section class="admin-resource">
    <NuxtLink v-if="detailId && basePath" :to="basePath" class="back-link">← Volver a {{ title.toLowerCase() }}</NuxtLink>
    <AdminPageHeader :title="detailId ? recordTitle : title" :description="description">
      <button v-if="!detailId && fields.length && canCreate" class="btn btn-primary" @click="openCreate"><Plus />{{ createLabel || 'Agregar registro' }}</button>
      <button v-if="detailId && detailId !== 'nuevo' && allowTest && record" class="btn btn-light" :disabled="!!testingId" @click="testRow(record)"><FlaskConical />Probar conexión</button>
    </AdminPageHeader>
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <div v-if="testMessage" class="notice" :class="`test-${testTone}`"><b>{{ testMessage }}</b><details v-if="testDetails"><summary>Ver diagnóstico técnico</summary><pre class="test-json">{{ JSON.stringify(testDetails,null,2) }}</pre></details></div>
    <div v-if="!detailId" class="card"><div class="card-body">
      <div class="crud-toolbar">
        <label class="search"><Search /><input v-model="search" placeholder="Buscar" aria-label="Buscar registros" /></label>
        <label v-for="filter in filters" :key="filter.key" class="table-filter"><span>{{ filter.label }}</span><select v-model="filterValues[filter.key]" class="select" :aria-label="filter.label"><option value="">Todos</option><option v-for="option in filter.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <button class="btn btn-light" @click="load"><RefreshCw />Actualizar</button>
      </div>
      <LoadingState v-if="loading" />
      <div v-else-if="filtered.length" class="table-wrap"><table><thead><tr><th v-for="column in displayColumns" :key="column.key">{{ column.label }}</th><th v-if="fields.length || basePath">Acciones</th></tr></thead><tbody>
        <tr v-for="row in filtered" :key="row.id"><td v-for="(column,index) in displayColumns" :key="column.key">
          <NuxtLink v-if="basePath && (column.key === 'name' || column.key === 'actor_email' || (index === 0 && !displayColumns.some(c => c.key === 'name' || c.key === 'actor_email')))" class="record-link" :to="`${basePath}/${row.id}`">{{ row[column.key] || 'Ver detalle' }}</NuxtLink>
          <span v-else-if="typeof row[column.key] === 'boolean'" class="badge" :class="row[column.key] ? 'badge-success' : 'badge-warning'">{{ row[column.key] ? 'Activo' : 'Inactivo' }}</span>
          <span v-else-if="row[column.key] && typeof row[column.key] === 'object'">Configurado</span><span v-else>{{ row[column.key] ?? '—' }}</span>
        </td><td v-if="fields.length || basePath"><div class="row"><button v-if="allowTest" class="icon-btn test" :disabled="testingId === row.id" title="Probar conexión" @click="testRow(row)"><FlaskConical /></button><NuxtLink v-if="basePath" class="btn btn-light" :to="`${basePath}/${row.id}`">Ver detalle</NuxtLink><button v-else-if="fields.length" class="icon-btn" title="Editar" @click="openEdit(row)"><Pencil /></button><button v-if="fields.length && canDelete" class="icon-btn danger" title="Eliminar" @click="deleteTarget = row"><Trash2 /></button></div></td></tr>
      </tbody></table></div>
      <EmptyState v-else title="Sin resultados" description="Pruebe otros filtros o agregue un registro." />
      <small class="result-count">{{ filtered.length }} de {{ rows.length }} registros</small>
    </div></div>
    <LoadingState v-if="detailId && loading" />
    <article v-if="detailId && record && !fields.length" class="card card-body"><dl class="record-data"><template v-for="column in displayColumns" :key="column.key"><dt>{{ column.label }}</dt><dd>{{ record[column.key] ?? '—' }}</dd></template></dl><slot name="record-detail" :record="record" /></article>
    <form v-if="showForm && !loading" class="card resource-editor" @submit.prevent="save">
      <div class="editor-heading"><span class="editor-step">{{ editingId ? 'TU CONFIGURACIÓN' : 'COMENCEMOS' }}</span><h2>{{ editingId ? 'Información del registro' : 'Complete los datos' }}</h2><p>Lo esencial primero. Las opciones adicionales están al final. Los campos con * son obligatorios.</p></div>
      <template v-for="group in [{title:'Datos principales',fields:basicFields,advanced:false},{title:'Opciones avanzadas',fields:advancedFields,advanced:true}]" :key="group.title">
        <component :is="group.advanced ? 'details' : 'section'" v-if="group.fields.length" class="editor-section">
          <summary v-if="group.advanced">{{ group.title }}</summary>
          <div class="editor-grid">
            <template v-for="(field, fieldIndex) in group.fields" :key="field.key">
            <div v-if="field.section && (fieldIndex === 0 || field.section !== group.fields[fieldIndex - 1]?.section)" class="field-section-heading"><h3>{{ field.section }}</h3></div>
            <div :class="{ 'full-field': ['textarea', 'geojson-map', 'checkbox-group'].includes(field.type || '') }">
              <label class="label" :for="`field-${field.key}`">{{ field.label }}<span v-if="field.required" aria-hidden="true"> *</span></label>
              <LeafletParcelEditor
                v-if="field.type === 'geojson-map'"
                v-model="form[field.key]"
                v-model:latitude="form.latitude"
                v-model:longitude="form.longitude"
                :radius="form.influence_radius_m"
              />
              <template v-else-if="field.type === 'combobox'"><input v-model="form[field.key]" :id="`field-${field.key}`" class="input" :list="`choices-${field.key}`" :required="field.required" placeholder="Elija o escriba un modelo" /><datalist :id="`choices-${field.key}`"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></datalist></template>
              <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" :id="`field-${field.key}`" class="textarea" :required="field.required" :placeholder="field.placeholder" />
              <select v-else-if="field.type === 'select'" v-model="form[field.key]" :id="`field-${field.key}`" class="select" :required="field.required">
<option value="">Seleccione</option>
                <option v-if="form[field.key] && !field.options?.some(option => option.value === form[field.key])" :value="form[field.key]">{{ form[field.key] }}</option>
                <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-else-if="field.type === 'boolean-select'" v-model="form[field.key]" :id="`field-${field.key}`" class="select"><option :value="true">{{ field.key === 'active' ? 'Activo' : 'Sí' }}</option><option :value="false">{{ field.key === 'active' ? 'Inactivo' : 'No' }}</option></select>
              <div v-else-if="field.type === 'checkbox-group'" class="checkbox-options"><label v-for="option in field.options" :key="option.value"><input v-model="form[field.key]" type="checkbox" :value="option.value" /> {{ option.label }}</label></div>
              <input v-else-if="field.type === 'checkbox'" v-model="form[field.key]" :id="`field-${field.key}`" type="checkbox">
              <input
                v-else-if="field.type === 'number'"
                v-model="form[field.key]"
                :id="`field-${field.key}`"
                class="input"
                :type="field.numericMode === 'integer' ? 'number' : 'text'"
                :inputmode="field.numericMode === 'integer' ? 'numeric' : 'decimal'"
                :step="field.numericMode === 'integer' ? (field.step ?? 1) : undefined"
                :min="field.numericMode === 'integer' ? field.min : undefined"
                :max="field.numericMode === 'integer' ? field.max : undefined"
                :placeholder="field.placeholder"
                :required="field.required"
                autocomplete="off"
                @blur="normalizeNumericField(field)"
              >
              <input v-else v-model="form[field.key]" :id="`field-${field.key}`" class="input" :type="field.type || 'text'" :placeholder="field.placeholder" :required="field.required">
              <small v-if="field.hint" class="field-hint">{{ field.hint }}</small>
            </div>
            </template>

          </div>
        </component>
      </template>
      <section class="editor-section"><slot name="drawer-extra" :form="form" :editing-id="editingId" /></section>
      <footer class="editor-actions"><span class="save-helper">{{ editingId ? 'Revise los datos antes de guardar.' : 'Puede volver y editar estos datos cuando lo necesite.' }}</span><button type="button" class="btn btn-light" @click="closeForm">Volver</button><button class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button></footer>
    </form>
    <ConfirmationModal :open="!!deleteTarget" title="Eliminar registro" message="El registro se dará de baja. Se conserva su historial cuando corresponde." @cancel="deleteTarget = null" @confirm="remove" />
  </section>
</template>

<style scoped>
.crud-toolbar{display:flex;justify-content:space-between;gap:15px;margin-bottom:18px}.search{min-width:min(100%,420px);display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid var(--fc-border);border-radius:10px;background:#fff}.search svg{width:18px;color:var(--fc-text-muted)}.search input{width:100%;height:42px;border:0;outline:0}.btn svg,.icon-btn svg{width:18px}.icon-btn{width:37px;height:37px;display:grid;place-items:center;border:0;border-radius:9px;background:#e8f2f8;color:var(--fc-primary)}.icon-btn.danger{background:#ffeded;color:var(--fc-danger)}.icon-btn.test{background:#e8f7ef;color:var(--fc-success)}.test-result{margin:0 0 16px}.test-result b{display:block}.test-json{max-height:300px;overflow:auto;margin:10px 0 0;padding:10px;border-radius:8px;background:rgba(255,255,255,.72);white-space:pre-wrap;font-size:.76rem;line-height:1.45}.test-warning{background:#fff7df;border-color:#f2d37b}.test-danger{background:#fff0f0;border-color:#efb0b0}.drawer-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,30,55,.45)}.drawer{position:absolute;inset:0 0 0 auto;width:min(100%,760px);display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 50px rgba(0,0,0,.2)}.drawer-head,.drawer-actions{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--fc-border)}.drawer-head h2{margin:0;color:var(--fc-primary);font-size:1.25rem}.drawer-head button{border:0;background:transparent;color:var(--fc-primary)}.drawer-body{padding:22px;overflow:auto;display:flex;flex-direction:column;gap:16px;flex:1}.field-hint{display:block;margin-top:6px;color:var(--fc-text-muted);font-size:.78rem;line-height:1.35}.drawer-actions{justify-content:flex-end;border-top:1px solid var(--fc-border);border-bottom:0}@media(max-width:600px){.crud-toolbar{align-items:stretch;flex-direction:column}.search{min-width:0}}
</style>

<style scoped>
.editor-step{display:block;margin-bottom:7px;color:#6f94ad;font-size:.61rem;font-weight:850;letter-spacing:.12em}.field-section-heading{grid-column:1/-1;padding:5px 0 9px;border-bottom:1px solid #edf3f7}.field-section-heading h3{margin:0;color:#336684;font-size:.79rem;font-weight:800}.save-helper{margin-right:auto;max-width:340px;color:#7590a5;font-size:.73rem}.editor-section[open]>summary{margin-bottom:16px}.resource-editor .checkbox-options>label{min-height:44px;padding:10px 13px;font-size:.8rem}.resource-editor .checkbox-options input{width:16px;height:16px}.editor-heading{background:#fbfdfe}.editor-actions{background:#f6fafdeb;backdrop-filter:blur(12px)}@media(max-width:700px){.save-helper{display:none}.editor-actions>.btn{flex:1}.editor-step{font-size:.58rem}}
</style>

<style scoped>
.back-link{display:inline-flex;margin-bottom:18px;color:var(--fc-primary);font-weight:700}.record-link{font-weight:750;color:var(--fc-primary);text-decoration:underline;text-underline-offset:4px}.crud-toolbar{align-items:end;flex-wrap:wrap}.table-filter{min-width:170px;display:grid;gap:6px}.table-filter>span{font-size:.78rem;font-weight:700;color:var(--fc-text-muted)}.result-count{display:block;padding-top:16px;color:var(--fc-text-muted)}.resource-editor{overflow:hidden;margin-top:20px}.editor-heading,.editor-section,.editor-actions{padding:24px}.editor-heading{border-bottom:1px solid var(--fc-border)}.editor-heading h2{margin:0;font-size:1.15rem;color:var(--fc-primary)}.editor-heading p{margin:6px 0 0;color:var(--fc-text-muted);font-size:.85rem}.editor-section+.editor-section{border-top:1px solid var(--fc-border)}.editor-section:empty{display:none}.editor-section summary{cursor:pointer;font-weight:750;color:var(--fc-primary);padding-bottom:14px}.editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.editor-grid>div{min-width:0}.full-field{grid-column:1/-1}.checkbox-options{display:flex;gap:12px;flex-wrap:wrap}.checkbox-options>label{display:flex;align-items:center;gap:7px;padding:10px;background:var(--fc-bg);border:1px solid var(--fc-border);border-radius:9px}.editor-actions{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--fc-border);background:#f8fafc}.record-data{display:grid;grid-template-columns:160px 1fr;gap:15px}.record-data dt{color:var(--fc-text-muted)}.record-data dd{margin:0;overflow-wrap:anywhere}@media(max-width:700px){.editor-grid{grid-template-columns:1fr}.editor-heading,.editor-section,.editor-actions{padding:18px}.table-filter{min-width:0;width:100%}.record-data{grid-template-columns:1fr;gap:6px}.record-data dd{margin-bottom:12px}}
</style>
