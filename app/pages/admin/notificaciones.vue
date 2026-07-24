<script setup lang="ts">
import {
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-vue-next'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const { request } = useApi()
const loading = ref(true)
const saving = ref(false)
const actionLoading = ref('')
const error = ref('')
const message = ref('')
const stations = ref<any[]>([])
const crops = ref<any[]>([])
const logs = ref<any[]>([])
const detectedChats = ref<any[]>([])
const recipientsText = ref('')
const telegramBotToken = ref('')
const hasTelegramToken = ref(false)
const telegramTokenMasked = ref('')
const lastRunAt = ref<string | null>(null)
const lastResult = ref<string | null>(null)

const form = reactive<any>({
  active: false,
  timezone: 'America/Asuncion',
  send_hour: 6,
  email_enabled: false,
  telegram_enabled: false,
  telegram_chat_id: '',
  contexts: [],
})

function apiError(exception: any): string {
  const detail = exception?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item: any) => item.msg).join(' · ')
  return detail?.message || exception?.message || 'No fue posible completar la operación.'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-PY')
}

function normalizeHour(value: any): number {
  const parsed = Number(String(value).replace(',', '.'))
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) throw new Error('La hora de envío debe estar entre 0 y 23.')
  return parsed
}

function recipients(): string[] {
  return [...new Set(
    recipientsText.value
      .split(/[\n,;]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )]
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [result, logResult]: any[] = await Promise.all([
      request('/notifications/settings'),
      request('/notifications/logs', { query: { limit: 40 } }),
    ])
    stations.value = result.stations || []
    crops.value = result.crops || []
    const settings = result.settings || {}
    Object.assign(form, {
      active: Boolean(settings.active),
      timezone: settings.timezone || 'America/Asuncion',
      send_hour: Number(settings.send_hour ?? 6),
      email_enabled: Boolean(settings.email_enabled),
      telegram_enabled: Boolean(settings.telegram_enabled),
      telegram_chat_id: settings.telegram_chat_id || '',
      contexts: Array.isArray(settings.contexts) ? settings.contexts.map((item: any) => ({ ...item })) : [],
    })
    recipientsText.value = (settings.recipients || []).join('\n')
    hasTelegramToken.value = Boolean(settings.has_telegram_token)
    telegramTokenMasked.value = settings.telegram_token_masked || ''
    lastRunAt.value = settings.last_run_at || null
    lastResult.value = settings.last_result || null
    logs.value = logResult.items || []
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    loading.value = false
  }
}

function addContext() {
  form.contexts.push({
    station_id: stations.value[0]?.id || '',
    crop_code: crops.value[0]?.code || '',
    planting_date: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
    label: '',
  })
}

function removeContext(index: number) {
  form.contexts.splice(index, 1)
}

function cropName(code: string): string {
  return crops.value.find(item => item.code === code)?.name || code
}

function stationName(id: string): string {
  return stations.value.find(item => item.id === id)?.name || id
}

async function save() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const body: any = {
      active: Boolean(form.active),
      timezone: String(form.timezone || '').trim(),
      send_hour: normalizeHour(form.send_hour),
      email_enabled: Boolean(form.email_enabled),
      recipients: recipients(),
      telegram_enabled: Boolean(form.telegram_enabled),
      telegram_chat_id: String(form.telegram_chat_id || '').trim() || null,
      telegram_bot_token: telegramBotToken.value.trim() || null,
      contexts: form.contexts.map((item: any) => ({
        station_id: item.station_id,
        crop_code: item.crop_code,
        planting_date: item.planting_date,
        label: String(item.label || '').trim() || null,
      })),
    }
    const result: any = await request('/notifications/settings', { method: 'PUT', body })
    telegramBotToken.value = ''
    hasTelegramToken.value = Boolean(result.has_telegram_token)
    telegramTokenMasked.value = result.telegram_token_masked || ''
    lastRunAt.value = result.last_run_at || null
    lastResult.value = result.last_result || null
    message.value = 'Configuración guardada. El scheduler comprobará la hora configurada cada 30 minutos.'
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    saving.value = false
  }
}

async function runAction(name: string, path: string, success: string) {
  actionLoading.value = name
  error.value = ''
  message.value = ''
  try {
    const result: any = await request(path, { method: 'POST' })
    message.value = result?.queued === false
      ? 'Ya existe un boletín pendiente o en ejecución.'
      : success
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

async function detectChats() {
  actionLoading.value = 'detect'
  error.value = ''
  message.value = ''
  try {
    const result: any = await request('/notifications/telegram/chats', { method: 'POST' })
    detectedChats.value = result.items || []
    message.value = detectedChats.value.length
      ? 'Chats detectados. Seleccione el grupo o canal que recibirá los avisos.'
      : 'No se detectaron chats. Envíe primero un mensaje al bot desde el grupo y vuelva a intentar.'
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

function chooseChat(chat: any) {
  form.telegram_chat_id = String(chat.id)
  message.value = `Chat seleccionado: ${chat.title}`
}

onMounted(load)
</script>

<template>
  <section>
    <AdminPageHeader
      title="Avisos diarios a productores"
      description="Configure un análisis automático de las últimas 72 horas, generado por los agentes de cada cultivo y distribuido por correo y Telegram."
    >
      <button class="btn btn-light" :disabled="loading" @click="load"><RefreshCw /> Actualizar</button>
    </AdminPageHeader>

    <div class="role-grid">
      <NuxtLink class="role-card" to="/admin/agentes"><Bot /><div><b>Agente del boletín</b><span>Configure el propósito “Boletín automático de 72 horas” por cultivo.</span></div></NuxtLink>
      <NuxtLink class="role-card" to="/admin/conocimiento"><FileText /><div><b>Fuentes documentales</b><span>Los PDF indexados por cultivo también respaldan el boletín.</span></div></NuxtLink>
    </div>

    <div v-if="message" class="notice success-message"><CheckCircle2 /> {{ message }}</div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingState v-if="loading" />

    <form v-else class="stack" @submit.prevent="save">
      <article class="card">
        <div class="card-body">
          <div class="row-between section-head">
            <div><h2>Programación diaria</h2><p>El scheduler usa la zona horaria indicada y evita enviar dos veces el mismo día.</p></div>
            <label class="switch-row"><input v-model="form.active" type="checkbox"><span>Servicio automático activo</span></label>
          </div>
          <div class="form-grid">
            <label><span class="label">Zona horaria</span><input v-model="form.timezone" class="input" placeholder="America/Asuncion"><small>Use una zona IANA válida.</small></label>
            <label><span class="label">Hora local de envío</span><input v-model="form.send_hour" class="input" type="number" min="0" max="23" step="1"><small>0–23. Ejemplo: 6 corresponde a las 06:00.</small></label>
          </div>
          <div class="status-strip"><span><Clock3 /> Última ejecución: <b>{{ formatDate(lastRunAt) }}</b></span><span>Resultado: <b>{{ lastResult || 'Sin ejecutar' }}</b></span></div>
        </div>
      </article>

      <article class="card">
        <div class="card-body">
          <div class="row-between section-head"><div><h2>Estaciones y cultivos que se evaluarán</h2><p>Cada contexto genera un criterio independiente usando estación, fecha de siembra, reglas, pronóstico, Copernicus y documentos del cultivo.</p></div><button type="button" class="btn btn-light" @click="addContext"><Plus /> Agregar contexto</button></div>
          <div class="contexts">
            <div v-for="(item, index) in form.contexts" :key="index" class="context-row">
              <label><span class="label">Nombre para el productor</span><input v-model="item.label" class="input" :placeholder="`${cropName(item.crop_code)} · ${stationName(item.station_id)}`"></label>
              <label><span class="label">Estación</span><select v-model="item.station_id" class="select" required><option value="">Seleccione</option><option v-for="station in stations" :key="station.id" :value="station.id">{{ station.name }}</option></select></label>
              <label><span class="label">Cultivo</span><select v-model="item.crop_code" class="select" required><option value="">Seleccione</option><option v-for="crop in crops" :key="crop.id" :value="crop.code">{{ crop.name }}</option></select></label>
              <label><span class="label">Fecha de siembra</span><input v-model="item.planting_date" class="input" type="date" required></label>
              <button type="button" class="icon-btn danger" title="Eliminar contexto" @click="removeContext(index)"><Trash2 /></button>
            </div>
            <div v-if="!form.contexts.length" class="empty-inline">Agregue al menos un contexto para activar el envío automático.</div>
          </div>
        </div>
      </article>

      <div class="channel-grid">
        <article class="card channel-card">
          <div class="card-body">
            <div class="channel-title"><Mail /><div><h2>Correo electrónico</h2><p>Se envía una versión HTML y otra en texto simple.</p></div><label class="switch-row"><input v-model="form.email_enabled" type="checkbox"><span>Activo</span></label></div>
            <label><span class="label">Destinatarios</span><textarea v-model="recipientsText" class="textarea" rows="7" placeholder="productor1@correo.com&#10;productor2@correo.com"></textarea><small>Separe direcciones por línea, coma o punto y coma. SMTP se configura en el archivo .env del backend.</small></label>
            <button type="button" class="btn btn-light" :disabled="actionLoading !== ''" @click="runAction('email', '/notifications/test-email', 'Prueba de correo procesada.')"><Send /> {{ actionLoading === 'email' ? 'Enviando…' : 'Probar correo' }}</button>
          </div>
        </article>

        <article class="card channel-card telegram-card">
          <div class="card-body">
            <div class="channel-title"><MessageCircle /><div><h2>Telegram</h2><p>Envía el mismo boletín al grupo o canal configurado.</p></div><label class="switch-row"><input v-model="form.telegram_enabled" type="checkbox"><span>Activo</span></label></div>
            <label><span class="label">Token del bot</span><input v-model="telegramBotToken" class="input" type="password" autocomplete="new-password" :placeholder="hasTelegramToken ? `Configurado: ${telegramTokenMasked}` : 'Pegue el token entregado por BotFather'"><small>El token se cifra en el backend y nunca vuelve a mostrarse completo.</small></label>
            <label><span class="label">Chat ID del grupo o canal</span><input v-model="form.telegram_chat_id" class="input" placeholder="Ej. -1001234567890"></label>
            <div class="telegram-actions"><button type="button" class="btn btn-light" :disabled="actionLoading !== ''" @click="detectChats"><RefreshCw /> {{ actionLoading === 'detect' ? 'Buscando…' : 'Detectar chats' }}</button><button type="button" class="btn btn-light" :disabled="actionLoading !== ''" @click="runAction('telegram', '/notifications/test-telegram', 'Mensaje de prueba enviado a Telegram.')"><Send /> {{ actionLoading === 'telegram' ? 'Enviando…' : 'Probar Telegram' }}</button></div>
            <div v-if="detectedChats.length" class="chat-list"><button v-for="chat in detectedChats" :key="chat.id" type="button" @click="chooseChat(chat)"><b>{{ chat.title }}</b><span>{{ chat.type }} · {{ chat.id }}</span></button></div>
          </div>
        </article>
      </div>

      <article class="card telegram-guide">
        <div class="card-body"><div class="guide-title"><Bot /><div><h2>Pasos para conectar Telegram</h2><p>El bot solo necesita enviar mensajes al destino seleccionado.</p></div></div><ol><li>Abra <b>@BotFather</b>, ejecute <code>/newbot</code> y copie el token.</li><li>Agregue el bot al grupo. En un canal, agréguelo como administrador con permiso para publicar.</li><li>Envíe un mensaje dentro del grupo mencionando al bot, por ejemplo <code>/start@NombreDelBot</code>.</li><li>Guarde el token aquí y pulse <b>Detectar chats</b>.</li><li>Seleccione el chat detectado, guarde y ejecute <b>Probar Telegram</b>.</li></ol></div>
      </article>

      <div class="bottom-actions"><button class="btn btn-primary" :disabled="saving"><Save /> {{ saving ? 'Guardando…' : 'Guardar configuración' }}</button><button type="button" class="btn ai-send" :disabled="actionLoading !== '' || saving" @click="runAction('digest', '/notifications/run-now', 'Boletín agregado a la cola del worker.')"><BellRing /> {{ actionLoading === 'digest' ? 'Preparando…' : 'Generar y enviar ahora' }}</button></div>
    </form>

    <article v-if="!loading" class="card logs-card">
      <div class="card-body"><div class="row-between section-head"><div><h2>Historial de envíos</h2><p>Resultados del boletín automático y de las pruebas reales.</p></div></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Estado</th><th>Duración</th><th>Resultado</th></tr></thead><tbody><tr v-for="row in logs" :key="row.id"><td>{{ formatDate(row.created_at || row.started_at) }}</td><td>{{ row.operation }}</td><td><span class="badge" :class="row.status === 'COMPLETED' ? 'badge-success' : row.status === 'FAILED' ? 'badge-danger' : 'badge-warning'">{{ row.status }}</span></td><td>{{ row.duration_ms != null ? `${row.duration_ms} ms` : '—' }}</td><td><span v-if="row.error_message" class="error-text">{{ row.error_message }}</span><span v-else>{{ row.records_created || 0 }} contextos</span></td></tr><tr v-if="!logs.length"><td colspan="5">Aún no hay ejecuciones registradas.</td></tr></tbody></table></div></div>
    </article>
  </section>
</template>

<style scoped>
.role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}.role-card{display:flex;align-items:center;gap:13px;padding:16px;border:1px solid #c5dfed;border-radius:14px;background:#eef8fd;color:var(--fc-primary)}.role-card>svg{width:28px;flex:0 0 28px}.role-card b,.role-card span{display:block}.role-card span{margin-top:3px;color:var(--fc-text-muted);font-size:.85rem}.success-message{display:flex;align-items:center;gap:8px;margin-bottom:16px;background:#ebf8ef;border-left-color:var(--fc-success)}.section-head h2,.channel-title h2,.guide-title h2{margin:0;color:var(--fc-primary)}.section-head p,.channel-title p,.guide-title p{margin:4px 0 0;color:var(--fc-text-muted)}label small{display:block;margin-top:5px;color:var(--fc-text-muted);font-size:.78rem}.switch-row{display:flex;align-items:center;gap:8px;font-weight:800}.switch-row input{width:19px;height:19px}.status-strip{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:16px;padding:12px 14px;border-radius:10px;background:var(--fc-surface-muted);color:var(--fc-text-muted)}.status-strip span{display:flex;align-items:center;gap:6px}.status-strip svg{width:16px}.contexts{display:flex;flex-direction:column;gap:12px}.context-row{display:grid;grid-template-columns:1.35fr 1fr .8fr .9fr auto;gap:10px;align-items:end;padding:14px;border:1px solid var(--fc-border);border-radius:12px;background:var(--fc-surface-muted)}.icon-btn{display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:9px}.icon-btn.danger{background:#ffeded;color:var(--fc-danger)}.icon-btn svg{width:18px}.empty-inline{padding:22px;text-align:center;color:var(--fc-text-muted);border:1px dashed var(--fc-border);border-radius:12px}.channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.channel-card .card-body{display:flex;flex-direction:column;gap:15px;height:100%}.channel-title{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start}.channel-title>svg{width:29px;color:var(--fc-primary)}.telegram-card{background:linear-gradient(145deg,#fff,#f0f9fd)}.telegram-actions{display:flex;flex-wrap:wrap;gap:8px}.chat-list{display:flex;flex-direction:column;gap:7px}.chat-list button{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;text-align:left;border:1px solid #bfddeb;border-radius:9px;background:#fff;color:var(--fc-text)}.chat-list span{color:var(--fc-text-muted);font-size:.8rem}.guide-title{display:flex;gap:12px;align-items:center}.guide-title>svg{width:30px;color:var(--fc-primary)}.telegram-guide ol{margin:18px 0 0;padding-left:24px}.telegram-guide li{margin:9px 0;line-height:1.5}.telegram-guide code{padding:2px 6px;background:#eaf3f8;border-radius:5px}.bottom-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.ai-send{color:#fff;background:linear-gradient(135deg,#5b45d8,#168dcc);box-shadow:0 10px 24px rgba(53,91,190,.22)}.logs-card{margin-top:18px}.error-text{color:var(--fc-danger);font-size:.82rem}@media(max-width:1100px){.context-row{grid-template-columns:1fr 1fr}.context-row .icon-btn{align-self:end}.channel-grid{grid-template-columns:1fr}}@media(max-width:720px){.role-grid{grid-template-columns:1fr}.context-row{grid-template-columns:1fr}.channel-title{grid-template-columns:auto 1fr}.channel-title .switch-row{grid-column:1/-1}.bottom-actions .btn{width:100%}}
</style>
