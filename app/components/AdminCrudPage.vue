<script setup lang="ts">
import { Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'

interface Field {
  key: string
  label: string
  type?: 'text' | 'email' | 'number' | 'select' | 'date' | 'textarea' | 'checkbox'
  options?: Array<{ label: string; value: string }>
  required?: boolean
  placeholder?: string
  json?: boolean
}

const props = defineProps<{
  title: string
  description?: string
  endpoint: string
  fields: Field[]
  columns?: Array<{ key: string; label: string }>
  createLabel?: string
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

const displayColumns = computed(() => props.columns || props.fields.slice(0, 5).map(field => ({ key: field.key, label: field.label })))
const filtered = computed(() => !search.value
  ? rows.value
  : rows.value.filter(row => JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())))

function isJsonField(field: Field): boolean {
  return field.json === true || ['non_sensitive_config', 'geojson', 'configuration', 'output_schema', 'value'].includes(field.key)
}

function initialValue(field: Field): any {
  if (field.type === 'checkbox') return true
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
  showForm.value = true
}

function normalizePayload(): Record<string, any> {
  const payload: Record<string, any> = {}
  for (const field of props.fields) {
    const value = form[field.key]

    if (isJsonField(field)) {
      if (value === '' || value === null || value === undefined) {
        payload[field.key] = {}
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
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) throw new Error(`El campo “${field.label}” debe ser numérico.`)
        payload[field.key] = parsed
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
    await request(path, {
      method: editingId.value ? 'PUT' : 'POST',
      body: normalizePayload()
    })
    showForm.value = false
    await load()
  } catch (exception: any) {
    error.value = apiErrorMessage(exception)
  } finally {
    saving.value = false
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

onMounted(load)
</script>

<template>
  <section>
    <AdminPageHeader :title="title" :description="description">
      <button v-if="fields.length" class="btn btn-primary" @click="openCreate">
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
        <div v-else-if="filtered.length" class="table-wrap">
          <table>
            <thead><tr><th v-for="column in displayColumns" :key="column.key">{{ column.label }}</th><th v-if="fields.length">Acciones</th></tr></thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id">
                <td v-for="column in displayColumns" :key="column.key">
                  <span v-if="typeof row[column.key] === 'boolean'" class="badge" :class="row[column.key] ? 'badge-success' : 'badge-warning'">{{ row[column.key] ? 'Sí' : 'No' }}</span>
                  <span v-else-if="row[column.key] && typeof row[column.key] === 'object'">Configurado</span>
                  <span v-else>{{ row[column.key] ?? '—' }}</span>
                </td>
                <td v-if="fields.length"><div class="row"><button class="icon-btn" title="Editar" @click="openEdit(row)"><Pencil /></button><button class="icon-btn danger" title="Eliminar" @click="deleteTarget = row"><Trash2 /></button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-else title="Aún no hay registros"><button v-if="fields.length" class="btn btn-primary" @click="openCreate">Crear el primero</button></EmptyState>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showForm" class="drawer-overlay" @click.self="showForm = false">
        <form class="drawer" @submit.prevent="save">
          <div class="drawer-head"><h2>{{ editingId ? 'Editar' : 'Crear' }} · {{ title }}</h2><button type="button" @click="showForm = false"><X /></button></div>
          <div class="drawer-body">
            <label v-for="field in fields" :key="field.key">
              <span class="label">{{ field.label }}</span>
              <textarea v-if="field.type === 'textarea'" v-model="form[field.key]" class="textarea" :required="field.required" :placeholder="field.placeholder" />
              <select v-else-if="field.type === 'select'" v-model="form[field.key]" class="select" :required="field.required">
                <option value="">Seleccione</option>
                <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <input v-else-if="field.type === 'checkbox'" v-model="form[field.key]" type="checkbox">
              <input v-else v-model="form[field.key]" class="input" :type="field.type || 'text'" :placeholder="field.placeholder" :required="field.required">
            </label>
          </div>
          <div class="drawer-actions"><button type="button" class="btn btn-light" @click="showForm = false">Cancelar</button><button class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button></div>
        </form>
      </div>
    </Teleport>

    <ConfirmationModal :open="!!deleteTarget" title="Eliminar registro" message="Esta acción aplicará eliminación lógica cuando el recurso lo permita." @cancel="deleteTarget = null" @confirm="remove" />
  </section>
</template>

<style scoped>
.crud-toolbar{display:flex;justify-content:space-between;gap:15px;margin-bottom:18px}.search{min-width:min(100%,420px);display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid var(--fc-border);border-radius:10px;background:#fff}.search svg{width:18px;color:var(--fc-text-muted)}.search input{width:100%;height:42px;border:0;outline:0}.btn svg,.icon-btn svg{width:18px}.icon-btn{width:37px;height:37px;display:grid;place-items:center;border:0;border-radius:9px;background:#e8f2f8;color:var(--fc-primary)}.icon-btn.danger{background:#ffeded;color:var(--fc-danger)}.drawer-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,30,55,.45)}.drawer{position:absolute;inset:0 0 0 auto;width:min(100%,520px);display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 50px rgba(0,0,0,.2)}.drawer-head,.drawer-actions{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--fc-border)}.drawer-head h2{margin:0;color:var(--fc-primary);font-size:1.25rem}.drawer-head button{border:0;background:transparent;color:var(--fc-primary)}.drawer-body{padding:22px;overflow:auto;display:flex;flex-direction:column;gap:16px;flex:1}.drawer-actions{justify-content:flex-end;border-top:1px solid var(--fc-border);border-bottom:0}@media(max-width:600px){.crud-toolbar{align-items:stretch;flex-direction:column}.search{min-width:0}}
</style>
