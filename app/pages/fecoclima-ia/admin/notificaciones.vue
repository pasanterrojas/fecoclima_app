<script setup lang="ts">
import {
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
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
const telegramSubscribers = ref<any[]>([])
const recipientsText = ref('')
const telegramBotToken = ref('')
const hasTelegramToken = ref(false)
const telegramTokenMasked = ref('')
const telegramBotUsername = ref('')
const telegramBotName = ref('')
const telegramSubscribeUrl = ref('')
const telegramLastSyncAt = ref<string | null>(null)
const lastRunAt = ref<string | null>(null)
const lastResult = ref<string | null>(null)

const form = reactive<any>({
  active: false,
  timezone: 'America/Asuncion',
  send_hour: 6,
  email_enabled: false,
  telegram_enabled: false,
  telegram_minimum_level: 'MODERADA',
  contexts: [],
})

function apiError(exception: any): string {
  const detail = exception?.data?.detail
  const errors = exception?.data?.errors
  if (Array.isArray(errors) && errors.length) {
    return errors.map((item: any) => String(item?.msg || 'Dato inválido').replace(/^Value error,\s*/i, '')).join(' · ')
  }
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

function normalizeTelegramToken(value: string): string | null {
  const token = value.trim()
  if (!token) return null
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error('Pegue el token completo de BotFather: ID numérico, dos puntos y clave secreta.')
  }
  return token
}

function recipients(): string[] {
  const values = recipientsText.value
    .split(/[\n,;]+/)
    .map((value: string) => value.trim().toLowerCase())
    .filter((value: string) => Boolean(value))
  return Array.from(new Set<string>(values))
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
      telegram_minimum_level: settings.telegram_minimum_level || 'MODERADA',
      contexts: Array.isArray(settings.contexts) ? settings.contexts.map((item: any) => ({ ...item })) : [],
    })
    recipientsText.value = (settings.recipients || []).join('\n')
    hasTelegramToken.value = Boolean(settings.has_telegram_token)
    telegramTokenMasked.value = settings.telegram_token_masked || ''
    telegramBotUsername.value = settings.telegram_bot_username || ''
    telegramBotName.value = settings.telegram_bot_name || ''
    telegramSubscribeUrl.value = settings.telegram_subscribe_url || ''
    telegramLastSyncAt.value = settings.telegram_last_sync_at || null
    lastRunAt.value = settings.last_run_at || null
    lastResult.value = settings.last_result || null
    logs.value = logResult.items || []
    telegramSubscribers.value = result.telegram_subscribers || []
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
      telegram_bot_token: normalizeTelegramToken(telegramBotToken.value),
      telegram_minimum_level: form.telegram_minimum_level === 'GRAVE' ? 'GRAVE' : 'MODERADA',
      contexts: form.contexts.map((item: any) => ({
        station_id: item.station_id,
        crop_code: item.crop_code,
        planting_date: item.planting_date,
        label: String(item.label || '').trim() || null,
      })),
    }
    await request('/notifications/settings', { method: 'PUT', body })
    telegramBotToken.value = ''
    message.value = 'Configuración guardada. Telegram trabaja por sincronización automática; no necesita webhook ni Chat ID.'
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
    message.value = result?.queued === false ? 'Ya existe un boletín pendiente o en ejecución.' : success
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

async function verifyTelegram() {
  actionLoading.value = 'verify'
  error.value = ''
  message.value = ''
  try {
    const result: any = await request('/notifications/telegram/verify', { method: 'POST' })
    telegramSubscribeUrl.value = result.subscribe_url || ''
    message.value = `Bot verificado: @${result?.bot?.username || 'sin usuario'}. El modo de recepción es sincronización automática.`
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

async function syncSubscribers() {
  actionLoading.value = 'sync'
  error.value = ''
  message.value = ''
  try {
    const result: any = await request('/notifications/telegram/sync', { method: 'POST' })
    telegramSubscribers.value = result.items || []
    const active = telegramSubscribers.value.filter(item => item.active).length
    message.value = result.processed
      ? `Se procesaron ${result.processed} actualización(es). Hay ${active} suscriptor(es) activo(s).`
      : `No había comandos pendientes. Hay ${active} suscriptor(es) activo(s).`
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

async function deactivateSubscriber(item: any) {
  actionLoading.value = `remove-${item.id}`
  error.value = ''
  try {
    await request(`/notifications/telegram/subscribers/${item.id}`, { method: 'DELETE' })
    message.value = `Suscripción desactivada: ${item.title || item.chat_id}`
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

async function resetTelegram() {
  if (!confirm('Esto eliminará el token y todos los suscriptores de Telegram. ¿Continuar?')) return
  actionLoading.value = 'reset'
  error.value = ''
  message.value = ''
  try {
    const result: any = await request('/notifications/telegram/reset', { method: 'POST' })
    telegramBotToken.value = ''
    message.value = result.message || 'Telegram reiniciado.'
    await load()
  } catch (exception: any) {
    error.value = apiError(exception)
  } finally {
    actionLoading.value = ''
  }
}

onMounted(load)
</script>

<template>
  <section>
    <AdminPageHeader
      title="Avisos diarios a productores"
      description="Configure un análisis automático de las últimas 72 horas y distribúyalo por correo o Telegram cuando exista una alerta moderada o grave."
    >
      <button class="btn btn-light" :disabled="loading" @click="load"><RefreshCw /> Actualizar</button>
    </AdminPageHeader>

    <div class="role-grid">
      <NuxtLink class="role-card" to="/fecoclima-ia/admin/agentes"><Bot /><div><b>Agente del boletín</b><span>Configure el propósito “Boletín automático de 72 horas” por cultivo.</span></div></NuxtLink>
      <NuxtLink class="role-card" to="/fecoclima-ia/admin/conocimiento"><FileText /><div><b>Fuentes documentales</b><span>Los PDF indexados por cultivo también respaldan el boletín.</span></div></NuxtLink>
    </div>

    <div v-if="message" class="notice success-message"><CheckCircle2 /> {{ message }}</div>
    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingState v-if="loading" />

    <form v-else class="stack" @submit.prevent="save">
      <article class="card">
        <div class="card-body">
          <div class="row-between section-head">
            <div><h2>Programación diaria</h2><p>El scheduler revisa la hora configurada y envía una sola vez al día cuando el riesgo alcanza el umbral.</p></div>
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
          <div class="row-between section-head"><div><h2>Estaciones y cultivos evaluados</h2><p>Cada contexto usa estación, fecha de siembra, reglas, pronóstico, Copernicus y documentos del cultivo.</p></div><button type="button" class="btn btn-light" @click="addContext"><Plus /> Agregar contexto</button></div>
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
            <label><span class="label">Destinatarios</span><textarea v-model="recipientsText" class="textarea" rows="7" placeholder="productor1@correo.com&#10;productor2@correo.com"></textarea><small>Separe direcciones por línea, coma o punto y coma.</small></label>
            <button type="button" class="btn btn-light" :disabled="actionLoading !== ''" @click="runAction('email', '/notifications/test-email', 'Prueba de correo procesada.')"><Send /> {{ actionLoading === 'email' ? 'Enviando…' : 'Probar correo' }}</button>
          </div>
        </article>

        <article class="card channel-card telegram-card">
          <div class="card-body">
            <div class="channel-title"><MessageCircle /><div><h2>Telegram</h2><p>Integración simple por suscripción. No utiliza webhook ni Chat ID manual.</p></div><label class="switch-row"><input v-model="form.telegram_enabled" type="checkbox"><span>Activo</span></label></div>

            <label><span class="label">Token del bot</span><input v-model="telegramBotToken" class="input" type="password" autocomplete="new-password" :placeholder="hasTelegramToken ? `Configurado: ${telegramTokenMasked}` : '123456789:AA...' "><small>Créelo en @BotFather, copie el token completo y guarde. Si cambia el token, se eliminan las suscripciones del bot anterior.</small></label>

            <div v-if="hasTelegramToken" class="bot-status">
              <div><b>{{ telegramBotName || 'Bot FECOCLIMA' }}</b><span>{{ telegramBotUsername ? `@${telegramBotUsername}` : 'Token guardado' }}</span><small>Modo: sincronización automática cada minuto · Última: {{ formatDate(telegramLastSyncAt) }}</small></div>
              <a v-if="telegramSubscribeUrl" class="btn btn-light" :href="telegramSubscribeUrl" target="_blank" rel="noopener"><ExternalLink /> Abrir bot</a>
            </div>

            <label><span class="label">Umbral mínimo</span><select v-model="form.telegram_minimum_level" class="select"><option value="MODERADA">Moderada o grave</option><option value="GRAVE">Solo grave</option></select><small>No se envía cuando todos los contextos están en NINGUNA o DATOS_INSUFICIENTES.</small></label>

            <div class="telegram-actions">
              <button type="button" class="btn btn-light" :disabled="actionLoading !== '' || !hasTelegramToken" @click="verifyTelegram"><Bot /> {{ actionLoading === 'verify' ? 'Verificando…' : 'Verificar bot' }}</button>
              <button type="button" class="btn btn-light" :disabled="actionLoading !== '' || !hasTelegramToken" @click="syncSubscribers"><RefreshCw /> {{ actionLoading === 'sync' ? 'Sincronizando…' : 'Sincronizar suscriptores' }}</button>
              <button type="button" class="btn btn-light" :disabled="actionLoading !== '' || !hasTelegramToken" @click="runAction('telegram', '/notifications/test-telegram', 'Mensaje de prueba enviado a todos los suscriptores activos.')"><Send /> {{ actionLoading === 'telegram' ? 'Enviando…' : 'Probar Telegram' }}</button>
            </div>

            <div class="subscriber-summary"><b>{{ telegramSubscribers.filter(item => item.active).length }}</b><span>suscriptores activos</span></div>
            <div v-if="telegramSubscribers.length" class="subscriber-list">
              <article v-for="item in telegramSubscribers" :key="item.id" :class="{ inactive: !item.active }"><div><b>{{ item.title || item.chat_id }}</b><span>{{ item.chat_type || 'chat' }} · {{ item.chat_id }}</span><small>{{ item.active ? `Activo desde ${formatDate(item.subscribed_at)}` : `Inactivo desde ${formatDate(item.unsubscribed_at)}` }}</small><small v-if="item.last_error" class="error-text">{{ item.last_error }}</small></div><button v-if="item.active" type="button" class="icon-btn danger" title="Desactivar suscripción" :disabled="actionLoading !== ''" @click="deactivateSubscriber(item)"><Trash2 /></button></article>
            </div>

            <button type="button" class="reset-link" :disabled="actionLoading !== ''" @click="resetTelegram"><RotateCcw /> {{ actionLoading === 'reset' ? 'Reiniciando…' : 'Reiniciar Telegram desde cero' }}</button>
          </div>
        </article>
      </div>

      <article class="card telegram-guide">
        <div class="card-body">
          <div class="guide-title"><Bot /><div><h2>Conexión desde cero</h2><p>El flujo completo tiene cinco pasos y funciona tanto en localhost como en producción.</p></div></div>
          <ol>
            <li>En Telegram, abra <b>@BotFather</b>, ejecute <code>/newbot</code> y copie el token.</li>
            <li>Pegue el token aquí y pulse <b>Guardar configuración</b>. El backend valida el bot y elimina cualquier webhook anterior.</li>
            <li>Pulse <b>Abrir bot</b>. En Telegram, pulse <b>Iniciar</b> o envíe <code>/start</code>.</li>
            <li>Regrese y pulse <b>Sincronizar suscriptores</b>. El scheduler también lo hará automáticamente cada minuto.</li>
            <li>Pulse <b>Probar Telegram</b>. Después active Telegram y el servicio automático.</li>
          </ol>
          <p class="guide-note">Cada persona puede cancelar con <code>/stop</code> y consultar su estado con <code>/status</code>.</p>
        </div>
      </article>

      <div class="bottom-actions"><button class="btn btn-primary" :disabled="saving"><Save /> {{ saving ? 'Guardando…' : 'Guardar configuración' }}</button><button type="button" class="btn ai-send" :disabled="actionLoading !== '' || saving" @click="runAction('digest', '/notifications/run-now', 'Boletín agregado a la cola del worker.')"><BellRing /> {{ actionLoading === 'digest' ? 'Preparando…' : 'Generar y enviar ahora' }}</button></div>
    </form>

    <article v-if="!loading" class="card logs-card">
      <div class="card-body"><div class="row-between section-head"><div><h2>Historial de envíos</h2><p>Resultados del boletín automático y de las pruebas reales.</p></div></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Estado</th><th>Duración</th><th>Resultado</th></tr></thead><tbody><tr v-for="row in logs" :key="row.id"><td>{{ formatDate(row.created_at || row.started_at) }}</td><td>{{ row.operation }}</td><td><span class="badge" :class="row.status === 'COMPLETED' ? 'badge-success' : row.status === 'FAILED' ? 'badge-danger' : 'badge-warning'">{{ row.status }}</span></td><td>{{ row.duration_ms != null ? `${row.duration_ms} ms` : '—' }}</td><td><span v-if="row.error_message" class="error-text">{{ row.error_message }}</span><span v-else>{{ row.records_created || 0 }} contextos</span></td></tr><tr v-if="!logs.length"><td colspan="5">Aún no hay ejecuciones registradas.</td></tr></tbody></table></div></div>
    </article>
  </section>
</template>

<style scoped>
.role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}.role-card{display:flex;align-items:center;gap:13px;padding:16px;border:1px solid #c5dfed;border-radius:14px;background:#eef8fd;color:var(--fc-primary)}.role-card>svg{width:28px;flex:0 0 28px}.role-card b,.role-card span{display:block}.role-card span{margin-top:3px;color:var(--fc-text-muted);font-size:.85rem}.success-message{display:flex;align-items:center;gap:8px;margin-bottom:16px;background:#ebf8ef;border-left-color:var(--fc-success)}.section-head h2,.channel-title h2,.guide-title h2{margin:0;color:var(--fc-primary)}.section-head p,.channel-title p,.guide-title p{margin:4px 0 0;color:var(--fc-text-muted)}label small{display:block;margin-top:5px;color:var(--fc-text-muted);font-size:.78rem}.switch-row{display:flex;align-items:center;gap:8px;font-weight:800}.switch-row input{width:19px;height:19px}.status-strip{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:16px;padding:12px 14px;border-radius:10px;background:var(--fc-surface-muted);color:var(--fc-text-muted)}.status-strip span{display:flex;align-items:center;gap:6px}.status-strip svg{width:16px}.contexts{display:flex;flex-direction:column;gap:12px}.context-row{display:grid;grid-template-columns:1.35fr 1fr .8fr .9fr auto;gap:10px;align-items:end;padding:14px;border:1px solid var(--fc-border);border-radius:12px;background:var(--fc-surface-muted)}.icon-btn{display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:9px}.icon-btn.danger{background:#ffeded;color:var(--fc-danger)}.icon-btn svg{width:18px}.empty-inline{padding:22px;text-align:center;color:var(--fc-text-muted);border:1px dashed var(--fc-border);border-radius:12px}.channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.channel-card .card-body{display:flex;flex-direction:column;gap:15px;height:100%}.channel-title{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start}.channel-title>svg{width:29px;color:var(--fc-primary)}.telegram-card{background:linear-gradient(145deg,#fff,#f0f9fd)}.telegram-actions{display:flex;flex-wrap:wrap;gap:8px}.bot-status{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #b9dceb;border-radius:11px;background:#fff}.bot-status b,.bot-status span,.bot-status small{display:block}.bot-status span{margin-top:3px;color:var(--fc-primary)}.bot-status small{margin-top:3px;color:var(--fc-text-muted);font-size:.74rem}.subscriber-summary{display:flex;align-items:baseline;gap:7px;padding:10px 12px;border-radius:9px;background:#edf8fd}.subscriber-summary b{font-size:1.35rem;color:var(--fc-primary)}.subscriber-summary span{color:var(--fc-text-muted)}.subscriber-list{display:flex;flex-direction:column;gap:7px}.subscriber-list article{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #bfddeb;border-radius:9px;background:#fff}.subscriber-list article.inactive{opacity:.55;background:#f4f5f6}.subscriber-list article b,.subscriber-list article span,.subscriber-list article small{display:block}.subscriber-list article span,.subscriber-list article small{margin-top:2px;color:var(--fc-text-muted);font-size:.76rem}.reset-link{display:flex;align-items:center;justify-content:center;gap:7px;padding:8px;border:0;background:transparent;color:var(--fc-danger);font-weight:700;cursor:pointer}.reset-link:disabled{opacity:.5;cursor:not-allowed}.reset-link svg{width:17px}.guide-title{display:flex;gap:12px;align-items:center}.guide-title>svg{width:30px;color:var(--fc-primary)}.telegram-guide ol{margin:18px 0 0;padding-left:24px}.telegram-guide li{margin:9px 0;line-height:1.5}.telegram-guide code{padding:2px 6px;background:#eaf3f8;border-radius:5px}.guide-note{margin:14px 0 0;color:var(--fc-text-muted)}.bottom-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.ai-send{color:#fff;background:linear-gradient(135deg,#5b45d8,#168dcc);box-shadow:0 10px 24px rgba(53,91,190,.22)}.logs-card{margin-top:18px}.error-text{color:var(--fc-danger);font-size:.82rem}@media(max-width:1100px){.context-row{grid-template-columns:1fr 1fr}.context-row .icon-btn{align-self:end}.channel-grid{grid-template-columns:1fr}}@media(max-width:720px){.role-grid{grid-template-columns:1fr}.context-row{grid-template-columns:1fr}.channel-title{grid-template-columns:auto 1fr}.channel-title .switch-row{grid-column:1/-1}.bot-status{align-items:flex-start;flex-direction:column}.bottom-actions .btn{width:100%}}
</style>
