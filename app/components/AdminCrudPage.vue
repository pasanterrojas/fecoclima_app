<script setup lang="ts">
import { FlaskConical, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'

interface Field {
  key: string
  label: string
  type?: 'text' | 'email' | 'number' | 'select' | 'date' | 'textarea' | 'checkbox' | 'password' | 'geojson-map'
  options?: Array<{ label: string; value: string }>
  required?: boolean
  placeholder?: string
  json?: boolean
  numericMode?: 'decimal' | 'integer'
  step?: number | string
  min?: number
  max?: number
  hint?: string
  defaultValue?: any
}

const props = defineProps<{
  title: string
  description?: string
  endpoint: string
  fields: Field[]
  columns?: Array<{ key: string; label: string }>
  createLabel?: string
  allowCreate?: boolean
  allowDelete?: boolean
  allowTest?: boolean
  testQuery?: Record<string, any>
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
const filtered = computed(() => !search.value
  ? rows.value
  : rows.value.filter(row => JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())))

function isJsonField(field: Field): boolean {
  return field.json === true || field.type === 'geojson-map' || ['non_sensitive_config', 'geojson', 'influence_geojson', 'configuration', 'output_schema', 'value'].includes(field.key)
}

function initialValue(field: Field): any {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'checkbox') return true
  if (field.type === 'geojson-map') return null
  if (isJsonField(field)) return '{}'
  return ''
}

function reset() {
  for (const field of props.fields) form[field.key] = initialValue(field)
  editingId.value = null
  error.value = ''
}

function openCreate() {
  reset()
  emit('creating')
  showForm.value = true
}

function openEdit(row: Record<string, any>) {
  reset()
  editingId.value = row.id
  for (const field of props.fields) {
    const value = row[field.key]
    if (isJsonField(field) && value !== null && value !== undefined && typeof value === 'object') {
      form[field.key] = JSON.stringify(value, null, 2)
    } else if (value === null || value === undefined) {
      form[field.key] = initialValue(field)
      if (field.type === 'checkbox') form[field.key] = false
    } else {
      form[field.key] = value
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
  for (const field of props.fields) {
    const value = form[field.key]

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
  return payload
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
    const data: any = await request(props.endpoint, { query: { limit: 100 } })
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
    showForm.value = false
    await load()
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
    const result: any = await request(`${props.endpoint}/${row.id}/test`, {
      method: 'POST',
      query: props.testQuery
    })
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
</script>

<template>
  <section>
    <AdminPageHeader :title="title" :description="description">
      <button v-if="fields.length && canCreate" class="btn btn-primary" @click="openCreate">
        <Plus /> {{ createLabel || 'Nuevo registro' }}
      </button>
    </AdminPageHeader>

    <div class="card">
      <div class="card-body">
        <div class="crud-toolbar">
          <label class="search"><Search /><input v-model="search" placeholder="Buscar en la tabla"></label>
          <button class="btn btn-light" @click="load"><RefreshCw />Actualizar</button>
        </div>
        <ErrorState v-if="error" :message="error" @retry="load" />
        <LoadingState v-else-if="loading" />
        <template v-else>
          <div v-if="testMessage" class="notice test-result" :class="`test-${testTone}`">
            <b>{{ testMessage }}</b>
            <pre v-if="testDetails" class="test-json">{{ JSON.stringify(testDetails, null, 2) }}</pre>
          </div>
          <div v-if="filtered.length" class="table-wrap">
          <table>
            <thead><tr><th v-for="column in displayColumns" :key="column.key">{{ column.label }}</th><th v-if="fields.length">Acciones</th></tr></thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id">
                <td v-for="column in displayColumns" :key="column.key">
                  <span v-if="typeof row[column.key] === 'boolean'" class="badge" :class="row[column.key] ? 'badge-success' : 'badge-warning'">{{ row[column.key] ? 'Sí' : 'No' }}</span>
                  <span v-else-if="row[column.key] && typeof row[column.key] === 'object'">Configurado</span>
                  <span v-else>{{ row[column.key] ?? '—' }}</span>
                </td>
                <td v-if="fields.length"><div class="row"><button v-if="allowTest" class="icon-btn test" :disabled="testingId===row.id" title="Probar conexión real" @click="testRow(row)"><FlaskConical /></button><button class="icon-btn" title="Editar" @click="openEdit(row)"><Pencil /></button><button v-if="canDelete" class="icon-btn danger" title="Eliminar" @click="deleteTarget = row"><Trash2 /></button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
          <EmptyState v-else title="Aún no hay registros"><button v-if="fields.length && canCreate" class="btn btn-primary" @click="openCreate">Crear el primero</button></EmptyState>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showForm" class="drawer-overlay" @click.self="showForm = false">
        <form class="drawer" @submit.prevent="save">
          <div class="drawer-head"><h2>{{ editingId ? 'Editar' : 'Crear' }} · {{ title }}</h2><button type="button" @click="showForm = false"><X /></button></div>
          <div class="drawer-body">
            <label v-for="field in fields" :key="field.key">
              <span class="label">{{ field.label }}</span>
              <StationPolygonEditor
                v-if="field.type === 'geojson-map'"
                v-model="form[field.key]"
                v-model:latitude="form.latitude"
                v-model:longitude="form.longitude"
                :radius="form.influence_radius_m"
              />
              <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" class="textarea" :required="field.required" :placeholder="field.placeholder" />
              <select v-else-if="field.type === 'select'" v-model="form[field.key]" class="select" :required="field.required">
                <option value="">Seleccione</option>
                <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <input v-else-if="field.type === 'checkbox'" v-model="form[field.key]" type="checkbox">
              <input
                v-else-if="field.type === 'number'"
                v-model="form[field.key]"
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
              <input v-else v-model="form[field.key]" class="input" :type="field.type || 'text'" :placeholder="field.placeholder" :required="field.required">
              <small v-if="field.hint" class="field-hint">{{ field.hint }}</small>
            </label>
            <slot name="drawer-extra" :form="form" :editing-id="editingId" />
          </div>
          <div class="drawer-actions"><button type="button" class="btn btn-light" @click="showForm = false">Cancelar</button><button class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button></div>
        </form>
      </div>
    </Teleport>

    <ConfirmationModal :open="!!deleteTarget" title="Eliminar registro" message="Esta acción aplicará eliminación lógica cuando el recurso lo permita." @cancel="deleteTarget = null" @confirm="remove" />
  </section>
</template>

<style scoped>
.crud-toolbar{display:flex;justify-content:space-between;gap:15px;margin-bottom:18px}.search{min-width:min(100%,420px);display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid var(--fc-border);border-radius:10px;background:#fff}.search svg{width:18px;color:var(--fc-text-muted)}.search input{width:100%;height:42px;border:0;outline:0}.btn svg,.icon-btn svg{width:18px}.icon-btn{width:37px;height:37px;display:grid;place-items:center;border:0;border-radius:9px;background:#e8f2f8;color:var(--fc-primary)}.icon-btn.danger{background:#ffeded;color:var(--fc-danger)}.icon-btn.test{background:#e8f7ef;color:var(--fc-success)}.test-result{margin:0 0 16px}.test-result b{display:block}.test-json{max-height:300px;overflow:auto;margin:10px 0 0;padding:10px;border-radius:8px;background:rgba(255,255,255,.72);white-space:pre-wrap;font-size:.76rem;line-height:1.45}.test-warning{background:#fff7df;border-color:#f2d37b}.test-danger{background:#fff0f0;border-color:#efb0b0}.drawer-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,30,55,.45)}.drawer{position:absolute;inset:0 0 0 auto;width:min(100%,760px);display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 50px rgba(0,0,0,.2)}.drawer-head,.drawer-actions{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--fc-border)}.drawer-head h2{margin:0;color:var(--fc-primary);font-size:1.25rem}.drawer-head button{border:0;background:transparent;color:var(--fc-primary)}.drawer-body{padding:22px;overflow:auto;display:flex;flex-direction:column;gap:16px;flex:1}.field-hint{display:block;margin-top:6px;color:var(--fc-text-muted);font-size:.78rem;line-height:1.35}.drawer-actions{justify-content:flex-end;border-top:1px solid var(--fc-border);border-bottom:0}@media(max-width:600px){.crud-toolbar{align-items:stretch;flex-direction:column}.search{min-width:0}}
</style>
