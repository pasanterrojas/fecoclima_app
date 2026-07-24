<script setup lang="ts">
import { CheckCircle2, ChevronRight, ClipboardCheck, Plus, Save, Send, Sparkles, Trash2, X } from 'lucide-vue-next'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const { request } = useApi()

const crops = ref<any[]>([])
const stations = ref<any[]>([])
const rules = ref<any[]>([])
const metadata = ref<any>({ variables: [], operators: [], default_alert_configuration: {} })
const selectedId = ref('')
const detail = ref<any>(null)
const loading = ref(true)
const saving = ref(false)
const simulating = ref(false)
const error = ref('')
const message = ref('')
const showRuleForm = ref(false)
const showConditionForm = ref(false)
const showDiseaseForm = ref(false)
const editingRuleId = ref('')
const editingConditionId = ref('')
const editingDiseaseId = ref('')
const simulation = ref<any>(null)

const defaultAlert = () => JSON.parse(JSON.stringify(metadata.value.default_alert_configuration || {
  levels: {
    NINGUNA: { label: 'Sin alerta', color: 'green', min_conditions: 0, max_conditions: 2 },
    MODERADA: { label: 'Alerta moderada', color: 'yellow', min_conditions: 3, max_conditions: 5 },
    GRAVE: { label: 'Alerta grave', color: 'red', min_conditions: 6, max_conditions: 6 },
    DATOS_INSUFICIENTES: { label: 'Datos insuficientes', color: 'gray' }
  },
  missing_required_policy: 'DATOS_INSUFICIENTES',
  minimum_completion_pct: 100
}))

const ruleForm = reactive<any>({ crop_id: '', name: '', description: '', version: '1.0.0', effective_from: '', status: 'DRAFT', alert: {} })
const conditionForm = reactive<any>({ key: '', label: '', variable: 'temperature_avg_c', operator: 'between', threshold_min: '', threshold_max: '', threshold_value: '', unit: '°C', aggregation: 'daily', required: true, order_index: 1, active: true })
const diseaseForm = reactive<any>({ name: '', causal_agent: '', risk: 'moderado', valid_stages_text: '', validation_status: 'PENDING_TECHNICAL', source_reference: '', enabled_for_evaluation: false, active: true, conditions: [] as any[] })

function isoDate(value: Date): string { return value.toISOString().slice(0, 10) }
const simulationForm = reactive({
  station_id: '',
  date_from: isoDate(new Date(Date.now() - 6 * 86400000)),
  date_to: isoDate(new Date()),
  planting_date: isoDate(new Date(Date.now() - 45 * 86400000))
})

const selectedRule = computed(() => rules.value.find(item => item.id === selectedId.value))
const isPublished = computed(() => selectedRule.value?.status === 'PUBLISHED')
const editingPublished = computed(() => Boolean(editingRuleId.value && selectedRule.value?.status === 'PUBLISHED'))
const selectedAlertConfig = computed(() => normalizeAlert(selectedRule.value?.configuration))

function apiError(exception: any): string {
  const detailValue = exception?.data?.detail
  if (typeof detailValue === 'string') return detailValue
  if (detailValue?.message) return [detailValue.message, ...(detailValue.errors || [])].join(' · ')
  if (Array.isArray(detailValue)) return detailValue.map((item: any) => item.msg).join(' · ')
  return exception?.message || 'No fue posible completar la operación.'
}
function numberValue(value: any, label: string, nullable = true): number | null {
  if ((value === '' || value === null || value === undefined) && nullable) return null
  const parsed = Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error(`${label} debe ser numérico.`)
  return parsed
}
function integerValue(value: any, label: string): number {
  const parsed = numberValue(value, label, false)
  if (parsed === null || !Number.isInteger(parsed)) throw new Error(`${label} debe ser un número entero.`)
  return parsed
}
function normalizeAlert(configuration: any) {
  const source = configuration?.alert || configuration || {}
  const result = defaultAlert()
  if (source.levels) {
    for (const code of Object.keys(result.levels)) result.levels[code] = { ...result.levels[code], ...(source.levels[code] || {}) }
  }
  if (source.minimum_completion_pct !== undefined) result.minimum_completion_pct = source.minimum_completion_pct
  if (source.missing_required_policy) result.missing_required_policy = source.missing_required_policy
  return result
}

async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const [cropResult, stationResult, ruleResult, metadataResult]: any[] = await Promise.all([
      request('/crops', { query: { limit: 250 } }),
      request('/stations', { query: { limit: 250 } }),
      request('/rules', { query: { limit: 250 } }),
      request('/rules/metadata/options')
    ])
    crops.value = cropResult.items || []
    stations.value = stationResult.items || []
    if (!simulationForm.station_id && stations.value[0]) simulationForm.station_id = stations.value[0].id
    rules.value = ruleResult.items || []
    metadata.value = metadataResult
    if (!selectedId.value && rules.value[0]) selectedId.value = rules.value[0].id
    if (selectedId.value) await loadDetail()
  } catch (exception: any) { error.value = apiError(exception) } finally { loading.value = false }
}
async function loadDetail() {
  if (!selectedId.value) { detail.value = null; return }
  try { detail.value = await request(`/rules/${selectedId.value}/detail`) } catch (exception: any) { error.value = apiError(exception) }
}
watch(selectedId, () => {
  simulation.value = null
  void loadDetail()
})

function openCreateRule() {
  editingRuleId.value = ''
  Object.assign(ruleForm, { crop_id: crops.value[0]?.id || '', name: '', description: '', version: '1.0.0', effective_from: new Date().toISOString().slice(0, 10), status: 'DRAFT', alert: defaultAlert() })
  showRuleForm.value = true
}
function openEditRule() {
  const row = selectedRule.value
  if (!row) return
  editingRuleId.value = row.id
  Object.assign(ruleForm, { crop_id: row.crop_id, name: row.name, description: row.description || '', version: row.version, effective_from: row.effective_from || '', status: row.status, alert: normalizeAlert(row.configuration) })
  showRuleForm.value = true
}
async function saveRule() {
  saving.value = true; error.value = ''
  const directApply = editingPublished.value
  try {
    const alert = JSON.parse(JSON.stringify(ruleForm.alert))
    for (const code of ['NINGUNA', 'MODERADA', 'GRAVE']) {
      alert.levels[code].min_conditions = integerValue(alert.levels[code].min_conditions, `Mínimo ${code}`)
      alert.levels[code].max_conditions = integerValue(alert.levels[code].max_conditions, `Máximo ${code}`)
    }
    alert.minimum_completion_pct = numberValue(alert.minimum_completion_pct, 'Completitud mínima', false)
    const body = { crop_id: ruleForm.crop_id, name: ruleForm.name, description: ruleForm.description || null, version: ruleForm.version, effective_from: ruleForm.effective_from || null, status: directApply ? 'PUBLISHED' : 'DRAFT', configuration: { alert } }
    const editing = Boolean(editingRuleId.value)
    const result: any = await request(editing ? `/rules/${editingRuleId.value}` : '/rules', { method: editing ? 'PUT' : 'POST', body })
    selectedId.value = result.id
    showRuleForm.value = false
    editingRuleId.value = ''
    message.value = directApply ? 'Cambios aplicados. El dashboard, los reportes y el agente usarán estos valores en el próximo análisis.' : 'Versión de regla guardada como borrador.'
    await loadAll()
  } catch (exception: any) { error.value = apiError(exception) } finally { saving.value = false }
}

function openCondition(row?: any) {
  editingConditionId.value = row?.id || ''
  Object.assign(conditionForm, row ? { ...row, threshold_min: row.threshold_min ?? '', threshold_max: row.threshold_max ?? '', threshold_value: row.threshold_value ?? '' } : { key: '', label: '', variable: 'temperature_avg_c', operator: 'between', threshold_min: '', threshold_max: '', threshold_value: '', unit: '°C', aggregation: 'daily', required: true, order_index: (detail.value?.conditions?.length || 0) + 1, active: true })
  showConditionForm.value = true
}
function onVariableChanged() {
  const option = metadata.value.variables.find((item: any) => item.value === conditionForm.variable)
  if (option) { conditionForm.unit = option.unit; if (!conditionForm.label) conditionForm.label = option.label }
}
async function saveCondition() {
  saving.value = true; error.value = ''
  try {
    const body = {
      key: conditionForm.key, label: conditionForm.label, variable: conditionForm.variable, operator: conditionForm.operator,
      threshold_min: conditionForm.operator === 'between' ? numberValue(conditionForm.threshold_min, 'Mínimo', false) : null,
      threshold_max: conditionForm.operator === 'between' ? numberValue(conditionForm.threshold_max, 'Máximo', false) : null,
      threshold_value: conditionForm.operator !== 'between' ? numberValue(conditionForm.threshold_value, 'Umbral', false) : null,
      unit: conditionForm.unit || null, aggregation: conditionForm.aggregation || 'daily', required: Boolean(conditionForm.required), order_index: Number(conditionForm.order_index), active: Boolean(conditionForm.active)
    }
    const path = editingConditionId.value ? `/rules/${selectedId.value}/conditions/${editingConditionId.value}` : `/rules/${selectedId.value}/conditions`
    await request(path, { method: editingConditionId.value ? 'PUT' : 'POST', body })
    showConditionForm.value = false; message.value = isPublished.value ? 'Condición actualizada y aplicada al cultivo.' : 'Condición guardada.'; await loadDetail()
  } catch (exception: any) { error.value = apiError(exception) } finally { saving.value = false }
}
async function deleteCondition(row: any) {
  if (!confirm(`¿Eliminar la condición “${row.label}”?`)) return
  try { await request(`/rules/${selectedId.value}/conditions/${row.id}`, { method: 'DELETE' }); await loadDetail() } catch (exception: any) { error.value = apiError(exception) }
}

function emptyDiseaseCondition() { return { variable: 'temperature_avg_c', label: '', operator: 'between', min: '', max: '', value: '', unit: '°C', required: true } }
function openDisease(row?: any) {
  editingDiseaseId.value = row?.id || ''
  const sourceConditions = row?.conditions?.all || []
  Object.assign(diseaseForm, row ? {
    name: row.name, causal_agent: row.causal_agent || '', risk: row.conditions?.risk || 'moderado', valid_stages_text: (row.valid_stages || []).join(', '), validation_status: row.validation_status, source_reference: row.source_reference || '', enabled_for_evaluation: row.enabled_for_evaluation, active: row.active,
    conditions: sourceConditions.map((item: any) => ({ ...emptyDiseaseCondition(), ...item, min: item.min ?? item.threshold_min ?? '', max: item.max ?? item.threshold_max ?? '', value: item.value ?? item.threshold_value ?? '' }))
  } : { name: '', causal_agent: '', risk: 'moderado', valid_stages_text: '', validation_status: 'PENDING_TECHNICAL', source_reference: '', enabled_for_evaluation: false, active: true, conditions: [emptyDiseaseCondition()] })
  showDiseaseForm.value = true
}
function addDiseaseCondition() { diseaseForm.conditions.push(emptyDiseaseCondition()) }
function diseaseVariableChanged(item: any) { const option = metadata.value.variables.find((row: any) => row.value === item.variable); if (option) { item.unit = option.unit; if (!item.label) item.label = option.label } }
async function saveDisease() {
  saving.value = true; error.value = ''
  try {
    const all = diseaseForm.conditions.map((item: any) => ({
      variable: item.variable, label: item.label || metadata.value.variables.find((row: any) => row.value === item.variable)?.label || item.variable, operator: item.operator,
      ...(item.operator === 'between' ? { min: numberValue(item.min, 'Mínimo', false), max: numberValue(item.max, 'Máximo', false) } : { value: numberValue(item.value, 'Umbral', false) }),
      unit: item.unit || null, required: true
    }))
    const body = {
      name: diseaseForm.name, causal_agent: diseaseForm.causal_agent || null, conditions: { risk: diseaseForm.risk, all },
      valid_stages: diseaseForm.valid_stages_text.split(',').map((value: string) => value.trim().toUpperCase()).filter(Boolean),
      validation_status: diseaseForm.validation_status, source_reference: diseaseForm.source_reference || null,
      enabled_for_evaluation: Boolean(diseaseForm.enabled_for_evaluation), active: Boolean(diseaseForm.active)
    }
    const path = editingDiseaseId.value ? `/rules/${selectedId.value}/diseases/${editingDiseaseId.value}` : `/rules/${selectedId.value}/diseases`
    await request(path, { method: editingDiseaseId.value ? 'PUT' : 'POST', body })
    showDiseaseForm.value = false; message.value = isPublished.value ? 'Parámetros de la enfermedad actualizados y aplicados.' : 'Regla de enfermedad guardada.'; await loadDetail()
  } catch (exception: any) { error.value = apiError(exception) } finally { saving.value = false }
}
async function deleteDisease(row: any) {
  if (!confirm(`¿Eliminar la regla de “${row.name}”?`)) return
  try { await request(`/rules/${selectedId.value}/diseases/${row.id}`, { method: 'DELETE' }); await loadDetail() } catch (exception: any) { error.value = apiError(exception) }
}
async function deleteSelectedRule() {
  const row = selectedRule.value
  if (!row) return
  const warning = row.status === 'PUBLISHED'
    ? `Esta configuración publicada dejará de usarse inmediatamente. ¿Eliminar “${row.crop_name} · ${row.name}” y todas sus condiciones y enfermedades?`
    : `¿Eliminar “${row.crop_name} · ${row.name}” y todo su contenido?`
  if (!confirm(warning)) return
  try {
    await request(`/rules/${row.id}`, { method: 'DELETE' })
    message.value = 'La configuración de reglas fue eliminada.'
    selectedId.value = ''
    detail.value = null
    await loadAll()
  } catch (exception: any) { error.value = apiError(exception) }
}
async function validateRule() {
  try { const result: any = await request(`/rules/${selectedId.value}/validate`, { method: 'POST' }); detail.value.validation = result; message.value = result.valid ? 'La versión es válida y puede publicarse.' : 'La versión todavía tiene errores.' } catch (exception: any) { error.value = apiError(exception) }
}
async function publishRule() {
  if (!confirm('Al publicar, la versión activa anterior quedará inactiva y esta versión será inmutable. ¿Continuar?')) return
  try { await request(`/rules/${selectedId.value}/publish`, { method: 'POST' }); message.value = 'Versión publicada. El motor de alertas ya utiliza estos criterios.'; await loadAll() } catch (exception: any) { error.value = apiError(exception) }
}
async function simulateSelectedRule() {
  if (!selectedId.value || !simulationForm.station_id) return
  simulating.value = true
  error.value = ''
  try {
    simulation.value = await request(`/rules/${selectedId.value}/simulate`, {
      method: 'POST',
      body: {
        station_id: simulationForm.station_id,
        date_from: simulationForm.date_from,
        date_to: simulationForm.date_to,
        planting_date: simulationForm.planting_date || null,
        persist: false
      }
    })
  } catch (exception: any) { error.value = apiError(exception) } finally { simulating.value = false }
}

onMounted(loadAll)
</script>

<template>
  <section>
    <AdminPageHeader title="Reglas determinísticas" description="Seleccione la regla de cada cultivo y edite directamente sus temperaturas, humedades, lluvias, mojado foliar, niveles y parámetros de enfermedad. Los cambios publicados se aplican en el próximo análisis."><button class="btn btn-light" @click="openCreateRule"><Plus /> Nueva configuración</button></AdminPageHeader>
    <div v-if="message" class="notice success-message"><CheckCircle2 />{{ message }}</div>
    <ErrorState v-if="error" :message="error" @retry="loadAll" />
    <LoadingState v-else-if="loading" />
    <div v-else class="rules-layout">
      <aside class="card rule-list"><div class="card-body"><h3>Versiones</h3><button v-for="rule in rules" :key="rule.id" class="rule-item" :class="{ active: selectedId === rule.id }" @click="selectedId = rule.id"><span><b>{{ rule.crop_name }} · {{ rule.version }}</b><small>{{ rule.name }}</small></span><span class="badge" :class="rule.status === 'PUBLISHED' ? 'badge-success' : rule.status === 'DRAFT' ? 'badge-warning' : 'badge-info'">{{ rule.status }}</span><ChevronRight /></button></div></aside>
      <main v-if="selectedRule && detail" class="rule-main stack">
        <article class="card"><div class="card-body"><div class="row-between"><div><span class="badge" :class="selectedRule.status === 'PUBLISHED' ? 'badge-success' : 'badge-warning'">{{ selectedRule.status }}</span><h2>{{ selectedRule.crop_name }} · {{ selectedRule.name }}</h2><p class="muted">Versión {{ selectedRule.version }} · Vigente desde {{ selectedRule.effective_from || 'sin fecha' }}</p></div><div class="row rule-actions"><button class="btn btn-light" @click="openEditRule"><Save /> Editar niveles y colores</button><button class="btn btn-light" @click="validateRule"><ClipboardCheck /> Validar</button><button v-if="!isPublished" class="btn btn-primary" :disabled="!detail.validation?.valid" @click="publishRule"><Send /> Publicar</button><button class="btn btn-danger" @click="deleteSelectedRule"><Trash2 /> Eliminar regla</button></div></div><div v-if="isPublished" class="direct-edit-note"><b>Edición directa activa</b><span>Cambie un valor y guárdelo. No necesita crear otra versión para ajustar un umbral.</span></div><div class="validation" :class="detail.validation?.valid ? 'valid' : 'invalid'"><b>{{ detail.validation?.valid ? 'Configuración válida' : 'Configuración incompleta' }}</b><span>{{ detail.conditions?.length || 0 }} condiciones base · {{ detail.validation?.published_diseases_count || 0 }} enfermedades evaluables</span><ul v-if="detail.validation?.errors?.length"><li v-for="item in detail.validation.errors" :key="item">{{ item }}</li></ul><ul v-if="detail.validation?.warnings?.length"><li v-for="item in detail.validation.warnings" :key="item">{{ item }}</li></ul></div></div></article>
        <article class="card"><div class="card-body"><div class="row-between"><div><h2>Niveles de alerta</h2><p class="muted">El color se calcula por la cantidad de condiciones cumplidas, usando esta versión publicada.</p></div></div><div class="level-grid"><div v-for="code in ['NINGUNA','MODERADA','GRAVE','DATOS_INSUFICIENTES']" :key="code" class="level-box" :class="String(selectedAlertConfig.levels[code].color)"><b>{{ selectedAlertConfig.levels[code].label }}</b><span v-if="code !== 'DATOS_INSUFICIENTES'">{{ selectedAlertConfig.levels[code].min_conditions }} a {{ selectedAlertConfig.levels[code].max_conditions }} condiciones</span><span v-else>Faltan datos obligatorios o completitud mínima</span></div></div></div></article>
        <article class="card"><div class="card-body"><div class="row-between"><div><h2>Simulación histórica</h2><p class="muted">Pruebe la versión con datos reales antes de publicarla. La simulación no cambia alertas almacenadas.</p></div><button class="btn btn-light" :disabled="simulating || !simulationForm.station_id" @click="simulateSelectedRule"><Sparkles v-if="simulating" /><ClipboardCheck v-else /> {{ simulating ? 'Simulando…' : 'Ejecutar simulación' }}</button></div><div class="simulation-form"><label><span class="label">Estación</span><select v-model="simulationForm.station_id" class="select"><option v-for="station in stations" :key="station.id" :value="station.id">{{ station.name }}</option></select></label><label><span class="label">Desde</span><input v-model="simulationForm.date_from" type="date" class="input"></label><label><span class="label">Hasta</span><input v-model="simulationForm.date_to" type="date" class="input"></label><label><span class="label">Fecha de siembra</span><input v-model="simulationForm.planting_date" type="date" class="input"></label></div><div v-if="simulation" class="simulation-result"><div class="simulation-summary"><span v-for="(count,level) in simulation.summary" :key="String(level)" class="badge" :class="level === 'GRAVE' ? 'badge-danger' : level === 'MODERADA' ? 'badge-warning' : level === 'NINGUNA' ? 'badge-success' : 'badge-info'">{{ level }}: {{ count }}</span></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Etapa</th><th>Condiciones</th><th>Nivel</th><th>Color</th></tr></thead><tbody><tr v-for="day in simulation.days" :key="day.date"><td>{{ day.date }}</td><td>{{ day.stage_code || '—' }}</td><td>{{ day.conditions_met }}/{{ day.conditions_total }}</td><td>{{ day.level_label || day.level }}</td><td>{{ day.level_color || '—' }}</td></tr></tbody></table></div></div></div></article>
        <article class="card"><div class="card-body"><div class="row-between"><div><h2>Condiciones base</h2><p class="muted">Variables diarias procesadas con Pandas y NumPy.</p></div><button v-if="!isPublished" class="btn btn-light" @click="openCondition()"><Plus /> Condición</button></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Condición</th><th>Variable</th><th>Operador</th><th>Umbral</th><th>Obligatoria</th><th>Acciones</th></tr></thead><tbody><tr v-for="row in detail.conditions" :key="row.id"><td>{{ row.order_index }}</td><td><b>{{ row.label }}</b><small>{{ row.key }}</small></td><td>{{ row.variable }}</td><td>{{ row.operator }}</td><td>{{ row.operator === 'between' ? `${row.threshold_min} – ${row.threshold_max}` : row.threshold_value }} {{ row.unit }}</td><td>{{ row.required ? 'Sí' : 'No' }}</td><td><button class="icon-btn" @click="openCondition(row)">Editar valores</button><button v-if="!isPublished" class="icon-btn danger" @click="deleteCondition(row)"><Trash2 /></button></td></tr></tbody></table></div></div></article>
        <article class="card"><div class="card-body"><div class="row-between"><div><h2>Reglas por enfermedad</h2><p class="muted">Cada enfermedad define etapa, nivel de riesgo y todos sus parámetros medibles.</p></div><button v-if="!isPublished" class="btn btn-light" @click="openDisease()"><Plus /> Enfermedad</button></div><div class="table-wrap"><table><thead><tr><th>Enfermedad</th><th>Etapas</th><th>Parámetros</th><th>Estado</th><th>Evaluar</th><th>Acciones</th></tr></thead><tbody><tr v-for="row in detail.diseases" :key="row.id"><td><b>{{ row.name }}</b><small>{{ row.causal_agent || 'Agente causal no indicado' }}</small></td><td>{{ row.valid_stages?.join(', ') || 'Todas' }}</td><td>{{ row.conditions?.all?.length || 0 }}</td><td>{{ row.validation_status }}</td><td>{{ row.enabled_for_evaluation ? 'Sí' : 'No' }}</td><td><button class="icon-btn" @click="openDisease(row)">Editar parámetros</button><button v-if="!isPublished" class="icon-btn danger" @click="deleteDisease(row)"><Trash2 /></button></td></tr></tbody></table></div></div></article>
      </main>
      <div v-else class="card"><EmptyState title="Seleccione una versión" message="Cree o seleccione una versión para administrar sus criterios." /></div>
    </div>

    <Teleport to="body"><div v-if="showRuleForm" class="modal-overlay"><form class="modal-card" @submit.prevent="saveRule"><header><div><h2>{{ editingPublished ? 'Editar niveles y colores' : 'Niveles y versión' }}</h2><p v-if="editingPublished" class="muted modal-subtitle">Los cambios se aplican directamente a {{ selectedRule?.crop_name }}.</p></div><button type="button" @click="showRuleForm=false"><X /></button></header><div class="modal-body form-grid"><label><span class="label">Cultivo</span><select v-model="ruleForm.crop_id" class="select" :disabled="editingPublished" required><option v-for="crop in crops" :key="crop.id" :value="crop.id">{{ crop.name }}</option></select></label><label><span class="label">Versión</span><input v-model="ruleForm.version" class="input" :disabled="editingPublished" required></label><label><span class="label">Nombre</span><input v-model="ruleForm.name" class="input" required></label><label><span class="label">Vigente desde</span><input v-model="ruleForm.effective_from" type="date" class="input" :disabled="editingPublished"></label><label class="full"><span class="label">Descripción</span><textarea v-model="ruleForm.description" class="textarea" /></label><div class="full level-editor"><h3>Clasificación por condiciones cumplidas</h3><div v-for="code in ['NINGUNA','MODERADA','GRAVE']" :key="code" class="level-row"><b>{{ code }}</b><label>Nombre visible<input v-model="ruleForm.alert.levels[code].label" class="input" required></label><label>Desde<input v-model="ruleForm.alert.levels[code].min_conditions" class="input" inputmode="numeric"></label><label>Hasta<input v-model="ruleForm.alert.levels[code].max_conditions" class="input" inputmode="numeric"></label><label>Color<select v-model="ruleForm.alert.levels[code].color" class="select"><option value="green">Verde</option><option value="yellow">Amarillo</option><option value="orange">Naranja</option><option value="red">Rojo</option><option value="gray">Gris</option><option value="blue">Azul</option></select></label></div><div class="level-row insufficient-row"><b>DATOS_INSUFICIENTES</b><label>Nombre visible<input v-model="ruleForm.alert.levels.DATOS_INSUFICIENTES.label" class="input" required></label><label>Completitud mínima %<input v-model="ruleForm.alert.minimum_completion_pct" class="input" inputmode="decimal"></label><label>Si falta variable obligatoria<select v-model="ruleForm.alert.missing_required_policy" class="select"><option value="DATOS_INSUFICIENTES">Datos insuficientes</option><option value="CONTINUE">Continuar con las disponibles</option></select></label><label>Color<select v-model="ruleForm.alert.levels.DATOS_INSUFICIENTES.color" class="select"><option value="gray">Gris</option><option value="blue">Azul</option><option value="yellow">Amarillo</option></select></label></div></div></div><footer><button type="button" class="btn btn-light" @click="showRuleForm=false">Cancelar</button><button class="btn btn-primary" :disabled="saving"><Save /> {{ editingPublished ? 'Guardar y aplicar' : 'Guardar borrador' }}</button></footer></form></div></Teleport>

    <Teleport to="body"><div v-if="showConditionForm" class="modal-overlay"><form class="modal-card compact" @submit.prevent="saveCondition"><header><h2>Condición base</h2><button type="button" @click="showConditionForm=false"><X /></button></header><div class="modal-body form-grid"><label><span class="label">Clave</span><input v-model="conditionForm.key" class="input" required></label><label><span class="label">Posición</span><input v-model="conditionForm.order_index" type="number" min="1" class="input" required></label><label><span class="label">Variable</span><select v-model="conditionForm.variable" class="select" @change="onVariableChanged"><option v-for="item in metadata.variables" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label><span class="label">Etiqueta</span><input v-model="conditionForm.label" class="input" required></label><label><span class="label">Operador</span><select v-model="conditionForm.operator" class="select"><option v-for="item in metadata.operators" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label><span class="label">Unidad</span><input v-model="conditionForm.unit" class="input"></label><label><span class="label">Agregación</span><select v-model="conditionForm.aggregation" class="select"><option value="daily">Resumen diario</option></select></label><template v-if="conditionForm.operator === 'between'"><label><span class="label">Mínimo</span><input v-model="conditionForm.threshold_min" class="input" inputmode="decimal" required></label><label><span class="label">Máximo</span><input v-model="conditionForm.threshold_max" class="input" inputmode="decimal" required></label></template><label v-else><span class="label">Umbral</span><input v-model="conditionForm.threshold_value" class="input" inputmode="decimal" required></label><label class="checkbox-row"><input v-model="conditionForm.required" type="checkbox"> Variable obligatoria</label></div><footer><button type="button" class="btn btn-light" @click="showConditionForm=false">Cancelar</button><button class="btn btn-primary" :disabled="saving"><Save /> Guardar</button></footer></form></div></Teleport>

    <Teleport to="body"><div v-if="showDiseaseForm" class="modal-overlay"><form class="modal-card disease-modal" @submit.prevent="saveDisease"><header><h2>Regla de enfermedad</h2><button type="button" @click="showDiseaseForm=false"><X /></button></header><div class="modal-body form-grid"><label><span class="label">Enfermedad</span><input v-model="diseaseForm.name" class="input" required></label><label><span class="label">Agente causal</span><input v-model="diseaseForm.causal_agent" class="input"></label><label><span class="label">Nivel de riesgo</span><select v-model="diseaseForm.risk" class="select"><option value="bajo">Bajo</option><option value="moderado">Moderado</option><option value="alto">Alto</option></select></label><label><span class="label">Etapas válidas</span><input v-model="diseaseForm.valid_stages_text" class="input" placeholder="R1, R2, R3"></label><label><span class="label">Validación técnica</span><select v-model="diseaseForm.validation_status" class="select"><option value="DRAFT">Borrador</option><option value="PENDING_TECHNICAL">Pendiente técnica</option><option value="PUBLISHED">Publicada</option><option value="INACTIVE">Inactiva</option></select></label><label class="checkbox-row"><input v-model="diseaseForm.enabled_for_evaluation" type="checkbox"> Incluir en cálculo</label><label class="checkbox-row"><input v-model="diseaseForm.active" type="checkbox"> Regla activa</label><label class="full"><span class="label">Fuente o referencia</span><textarea v-model="diseaseForm.source_reference" class="textarea" /></label><div class="full disease-conditions"><div class="row-between"><h3>Parámetros medibles</h3><button type="button" class="btn btn-light" @click="addDiseaseCondition"><Plus /> Parámetro</button></div><div v-for="(item,index) in diseaseForm.conditions" :key="index" class="disease-condition"><select v-model="item.variable" class="select" @change="diseaseVariableChanged(item)"><option v-for="option in metadata.variables" :key="option.value" :value="option.value">{{ option.label }}</option></select><select v-model="item.operator" class="select"><option v-for="option in metadata.operators" :key="option.value" :value="option.value">{{ option.label }}</option></select><template v-if="item.operator === 'between'"><input v-model="item.min" class="input" inputmode="decimal" placeholder="Mínimo"><input v-model="item.max" class="input" inputmode="decimal" placeholder="Máximo"></template><input v-else v-model="item.value" class="input" inputmode="decimal" placeholder="Umbral"><button type="button" class="icon-btn danger" @click="diseaseForm.conditions.splice(index,1)"><Trash2 /></button></div></div></div><footer><button type="button" class="btn btn-light" @click="showDiseaseForm=false">Cancelar</button><button class="btn btn-primary" :disabled="saving"><Save /> Guardar enfermedad</button></footer></form></div></Teleport>
  </section>
</template>

<style scoped>
.success-message{display:flex;align-items:center;gap:8px;margin-bottom:16px}.success-message svg{width:20px}.rules-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px}.rule-list{align-self:start;position:sticky;top:18px}.rule-list h3{margin-top:0;color:var(--fc-primary)}.rule-item{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;width:100%;padding:12px 8px;border:0;border-bottom:1px solid var(--fc-border);text-align:left;background:transparent}.rule-item.active{background:#edf7fc;border-radius:10px}.rule-item b,.rule-item small{display:block}.rule-item small{margin-top:3px;color:var(--fc-text-muted)}.rule-item svg{width:16px}.rule-main h2{margin:5px 0;color:var(--fc-primary)}.direct-edit-note{display:flex;flex-direction:column;gap:4px;margin-top:16px;padding:13px 15px;border:1px solid #a8d8ba;border-radius:12px;background:#edf9f1;color:#175f35}.direct-edit-note span{font-size:.88rem}.validation{margin-top:18px;padding:14px;border-radius:12px}.validation.valid{background:#e6f7eb}.validation.invalid{background:#fff5dc}.validation span{display:block;margin-top:4px}.validation ul{margin:8px 0 0}.level-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.level-box{padding:14px;border-radius:12px;background:#eef3f6;border-left:6px solid var(--fc-info)}.level-box.green{border-left-color:var(--fc-success)}.level-box.yellow{border-left-color:var(--fc-warning)}.level-box.red{border-left-color:var(--fc-danger)}.level-box.gray,.level-box.blue{border-left-color:var(--fc-info)}.level-box b,.level-box span,td small{display:block}.level-box span,td small{margin-top:4px;color:var(--fc-text-muted);font-size:.8rem}.icon-btn{padding:6px 8px;border:0;border-radius:8px;color:var(--fc-primary);background:#eaf3f8}.icon-btn svg{width:17px}.icon-btn.danger{color:var(--fc-danger);background:#ffeded}.modal-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(7,31,49,.58)}.modal-card{width:min(960px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.25)}.modal-card.compact{width:min(720px,100%)}.modal-card header,.modal-card footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid var(--fc-border)}.modal-card footer{justify-content:flex-end;border-top:1px solid var(--fc-border);border-bottom:0}.modal-card header h2{margin:0;color:var(--fc-primary)}.modal-card header button{border:0;background:transparent}.modal-card header svg{width:22px}.modal-body{padding:22px}.full{grid-column:1/-1}.level-editor,.disease-conditions{padding:16px;background:#f5f9fb;border-radius:12px}.level-editor h3,.disease-conditions h3{margin:0 0 12px;color:var(--fc-primary)}.level-row{display:grid;grid-template-columns:170px 1.4fr repeat(3,1fr);gap:10px;align-items:end;margin-top:10px}.level-row label{font-size:.78rem}.level-row .input,.level-row .select{margin-top:4px}.simulation-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}.simulation-result{margin-top:16px}.simulation-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.checkbox-row{display:flex;align-items:center;gap:8px;padding-top:28px}.disease-condition{display:grid;grid-template-columns:1.5fr 1.2fr repeat(2,1fr) auto;gap:8px;margin-top:9px}.disease-condition .icon-btn{align-self:center}@media(max-width:1100px){.rules-layout{grid-template-columns:1fr}.rule-list{position:static}.level-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.simulation-form{grid-template-columns:1fr}.level-grid{grid-template-columns:1fr}.level-row,.disease-condition{grid-template-columns:1fr}.rules-layout .row-between{align-items:flex-start}.modal-body{padding:16px}}
.rule-actions{flex-wrap:wrap}
</style>
