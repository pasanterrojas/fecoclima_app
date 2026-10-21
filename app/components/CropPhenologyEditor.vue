<script setup lang="ts">
import { CalendarDays, Pencil, Plus, RefreshCw, Sprout, Trash2 } from 'lucide-vue-next'

interface PhenologyStage {
  id: string
  crop_id: string
  code: string
  name: string
  description: string | null
  order_index: number
  duration_days: number
  start_day: number
  end_day: number
  cycle_type: string
  active: boolean
}

const props = defineProps<{ cropId: string }>()
const { request } = useApi()
const stages = ref<PhenologyStage[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const deleteTarget = ref<PhenologyStage | null>(null)
const nameInput = ref<HTMLInputElement>()
const form = reactive({ code: '', name: '', description: '', order_index: 0, duration_days: 0, start_day: 0, end_day: 0, cycle_type: 'normal', active: true })

function errorMessage(exception: any, fallback: string): string {
  const detail = exception?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => item.msg || 'Revise los datos del formulario.').join(' · ')
  return fallback
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await request<{ items: PhenologyStage[] }>('/phenology/stages', { query: { crop_id: props.cropId, cycle_type: 'normal' } })
    stages.value = response.items
  } catch (exception) { error.value = errorMessage(exception, 'No se pudo cargar el calendario fenológico.') }
  finally { loading.value = false }
}

function open(stage?: PhenologyStage) {
  editingId.value = stage?.id || null
  Object.assign(form, stage ? {
    code: stage.code, name: stage.name, description: stage.description || '', order_index: stage.order_index,
    duration_days: stage.duration_days, start_day: stage.start_day, end_day: stage.end_day,
    cycle_type: stage.cycle_type, active: stage.active,
  } : { code: '', name: '', description: '', order_index: 0, duration_days: 0, start_day: 0, end_day: 0, cycle_type: 'normal', active: true })
  error.value = ''
  notice.value = ''
  showForm.value = true
  void nextTick(() => nameInput.value?.focus())
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (form.end_day < form.start_day) throw new Error('El día final debe ser igual o posterior al día inicial.')
    await request(editingId.value ? `/phenology/stages/${editingId.value}` : '/phenology/stages', {
      method: editingId.value ? 'PUT' : 'POST',
      body: { ...form, crop_id: props.cropId, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null },
    })
    showForm.value = false
    editingId.value = null
    await load()
    notice.value = 'Etapa guardada. Las próximas consultas utilizarán este calendario.'
  } catch (exception: any) { error.value = errorMessage(exception, exception?.message || 'No se pudo guardar la etapa.') }
  finally { saving.value = false }
}

async function remove() {
  if (!deleteTarget.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await request(`/phenology/stages/${deleteTarget.value.id}`, { method: 'DELETE' })
    if (editingId.value === deleteTarget.value.id) showForm.value = false
    deleteTarget.value = null
    await load()
    notice.value = 'La etapa se eliminó del calendario.'
  } catch (exception) { error.value = errorMessage(exception, 'No se pudo eliminar la etapa.') }
  finally { saving.value = false }
}

watch(() => props.cropId, () => { showForm.value = false; notice.value = ''; void load() }, { immediate: true })
</script>

<template>
  <section class="crop-phenology" :aria-busy="loading || saving">
    <AdminPageHeader title="Calendario fenológico" description="Defina las etapas de este cultivo y los días desde la siembra en los que se estiman. Use un calendario técnico validado para su zona.">
      <button type="button" class="btn btn-primary" :disabled="saving" @click="open()"><Plus />Agregar etapa</button>
    </AdminPageHeader>
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <form v-if="showForm" class="card stage-editor" @submit.prevent="save">
      <div class="stage-editor-heading"><span class="stage-symbol"><Sprout /></span><div><h2>{{ editingId ? 'Editar etapa' : 'Nueva etapa del cultivo' }}</h2><p>Las etapas se estiman desde la fecha real de siembra de cada parcela.</p></div></div>
      <div class="stage-fields">
        <section><h3>1. Identifique la etapa</h3><div class="form-grid"><label><span class="label">Nombre de la etapa *</span><input ref="nameInput" v-model="form.name" class="input" maxlength="180" minlength="2" required placeholder="Nombre de la etapa del cultivo" /></label><label><span class="label">Código *</span><input v-model="form.code" class="input" maxlength="50" required placeholder="Ej. V1" /><small>Use el código del manual técnico del cultivo.</small></label><label><span class="label">Orden en el calendario *</span><input v-model.number="form.order_index" class="input" type="number" min="0" step="1" required /><small>Un valor menor aparece primero.</small></label><label><span class="label">Estado</span><select v-model="form.active" class="select"><option :value="true">Activa</option><option :value="false">Inactiva</option></select></label></div></section>
        <section><h3><CalendarDays />2. Días desde la siembra</h3><div class="form-grid days-grid"><label><span class="label">Día inicial *</span><input v-model.number="form.start_day" class="input" type="number" min="0" max="1000" step="1" required /><small>El día de siembra es el día 0.</small></label><label><span class="label">Día final *</span><input v-model.number="form.end_day" class="input" type="number" :min="form.start_day" max="1500" step="1" required /><small>Debe ser igual o posterior al día inicial.</small></label><label><span class="label">Duración de referencia (días) *</span><input v-model.number="form.duration_days" class="input" type="number" min="0" max="500" step="1" required /><small>Ingrese la duración validada en el calendario técnico; no se calcula automáticamente.</small></label></div></section>
        <label><span class="label">Descripción y observaciones</span><textarea v-model="form.description" class="textarea" placeholder="Qué observar en campo y qué fuentes respaldan esta etapa." /></label>
      </div>
      <footer class="stage-editor-actions"><button type="button" class="btn btn-light" :disabled="saving" @click="showForm = false">Cancelar</button><button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar etapa' }}</button></footer>
    </form>
    <article class="card"><div class="card-body">
      <div class="calendar-toolbar"><div><h2>Etapas del cultivo</h2><p>Calendario normal · {{ stages.length }} {{ stages.length === 1 ? 'etapa registrada' : 'etapas registradas' }}</p></div><button type="button" class="btn btn-light" :disabled="loading || saving" @click="load"><RefreshCw />Actualizar</button></div>
      <LoadingState v-if="loading" />
      <div v-else-if="stages.length" class="table-wrap"><table><thead><tr><th>Orden</th><th>Etapa</th><th>Días desde siembra</th><th>Duración</th><th>Estado</th><th>Acciones</th></tr></thead><tbody><tr v-for="stage in stages" :key="stage.id"><td>{{ stage.order_index }}</td><td><button class="stage-link" type="button" :disabled="saving" @click="open(stage)">{{ stage.name }}</button><small class="stage-code">{{ stage.code }}</small></td><td>Día {{ stage.start_day }} al {{ stage.end_day }}</td><td>{{ stage.duration_days }} días</td><td><span class="badge" :class="stage.active ? 'badge-success' : 'badge-warning'">{{ stage.active ? 'Activa' : 'Inactiva' }}</span></td><td><div class="row"><button type="button" class="btn btn-light" :disabled="saving" @click="open(stage)"><Pencil />Editar</button><button type="button" class="btn btn-danger" :disabled="saving" @click="deleteTarget = stage"><Trash2 />Eliminar</button></div></td></tr></tbody></table></div>
      <EmptyState v-else title="Este cultivo aún no tiene calendario" message="Agregue etapas respaldadas por sus documentos técnicos. Mientras no haya un calendario, el sistema indicará que no puede estimar la etapa." />
      <p class="calendar-note">La estimación por calendario orienta al productor. La observación de la planta en campo permite confirmar su etapa.</p>
    </div></article>
    <ConfirmationModal :open="!!deleteTarget" title="Eliminar etapa fenológica" :message="`Se eliminará ${deleteTarget?.name || 'esta etapa'} del calendario de este cultivo. Las próximas consultas ya no la utilizarán.`" @confirm="remove" @cancel="deleteTarget = null" />
  </section>
</template>

<style scoped>
.crop-phenology{display:grid;gap:20px}.crop-phenology>.admin-page-head{margin-bottom:0}.crop-phenology>.notice{margin:0}.stage-editor{overflow:hidden}.stage-editor-heading{display:flex;align-items:center;gap:13px;padding:24px;border-bottom:1px solid #e1ecf4;background:#f9fcfe}.stage-symbol{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:14px;background:#e5f2fb;color:#2775a5}.stage-symbol svg{width:22px;height:22px}.stage-editor-heading h2,.calendar-toolbar h2{margin:0;color:#2b5c7f;font-size:1.02rem}.stage-editor-heading p,.calendar-toolbar p{margin:6px 0 0;color:#7893a7;font-size:.77rem;line-height:1.6}.stage-fields{display:grid;gap:24px;padding:24px}.stage-fields h3{display:flex;align-items:center;gap:8px;margin:0 0 17px;color:#527c98;font-size:.78rem}.stage-fields h3 svg{width:17px;height:17px}.stage-fields section+section{padding-top:23px;border-top:1px solid #e8f0f5}.stage-fields small{display:block;margin-top:7px;font-size:.73rem;line-height:1.6;color:#7794a9}.days-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.stage-editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 24px;border-top:1px solid #e2edf4;background:#f7fbfd}.calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:20px}.crop-phenology .btn svg{width:16px;height:16px}.stage-link{padding:0;border:0;background:none;color:#176395;text-align:left;font-weight:750}.stage-link:hover{text-decoration:underline;text-underline-offset:4px}.stage-code{display:block;color:#829db0;font-size:.69rem;margin-top:4px}.crop-phenology td .row{gap:7px;flex-wrap:wrap}.crop-phenology td .btn{min-height:35px;padding:7px 10px;font-size:.72rem}.calendar-note{margin:18px 0 0;font-size:.74rem;color:#7c96a9;line-height:1.7}@media(max-width:800px){.days-grid{grid-template-columns:1fr}}@media(max-width:600px){.stage-fields,.stage-editor-heading{padding:19px}.stage-editor-heading{align-items:flex-start}.stage-editor-actions{padding:17px}.stage-editor-actions>.btn{flex:1}.calendar-toolbar{align-items:flex-start;flex-direction:column}.calendar-toolbar>.btn{width:100%}}
</style>
