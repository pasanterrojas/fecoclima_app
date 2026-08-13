<script setup lang="ts">
import { Bot, FileDown, ImagePlus, RotateCcw, Send, Sparkles, X } from 'lucide-vue-next'

interface PendingImage { id: string; file: File; preview: string }
interface ChatAttachment { id: string; name: string; preview: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string; attachments?: ChatAttachment[] }

const props = defineProps<{
  alertId?: string | null
  period: string
  cropName: string
  disabled?: boolean
}>()
const { request } = useApi()
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const pendingImages = ref<PendingImage[]>([])
const reportImages = ref<Array<{ id: string; file: File }>>([])
const loading = ref(false)
const reportLoading = ref(false)
const error = ref('')
const reportNotice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const messageList = ref<HTMLElement | null>(null)

const suggestions = computed(() => [
  `¿Qué debería revisar hoy en el ${props.cropName.toLowerCase()}?`,
  'Tengo una duda.',
  'Subiré una foto de mi cultivo'
])

function imageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function chooseImages() { fileInput.value?.click() }

function removePending(id: string) {
  const index = pendingImages.value.findIndex(item => item.id === id)
  if (index < 0) return
  URL.revokeObjectURL(pendingImages.value[index]!.preview)
  pendingImages.value.splice(index, 1)
}

function onImages(event: Event) {
  error.value = ''
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || [])
  const available = Math.max(0, 4 - pendingImages.value.length)
  if (selected.length > available) error.value = 'Puede enviar hasta 4 imágenes en cada mensaje.'
  for (const file of selected.slice(0, available)) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      error.value = 'Solo se admiten imágenes JPG, PNG o WebP.'
      continue
    }
    if (file.size > 8 * 1024 * 1024) {
      error.value = `“${file.name}” supera el límite de 8 MB.`
      continue
    }
    pendingImages.value.push({ id: imageId(), file, preview: URL.createObjectURL(file) })
  }
  input.value = ''
}

async function scrollToLatest() {
  await nextTick()
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}

async function send(question = draft.value) {
  const attached = [...pendingImages.value]
  const text = question.trim() || (attached.length
    ? 'Analiza estas imágenes del cultivo junto con toda la consulta. Describe solo lo visible, contrástalo con las lecturas, la etapa, las reglas, los documentos y Copernicus, y dime qué verificar en campo.'
    : '')
  if (!text || !props.alertId || loading.value || props.disabled) return
  error.value = ''
  reportNotice.value = ''
  const history = messages.value.slice(-12).map(item => ({ role: item.role, content: item.content }))
  messages.value.push({
    role: 'user',
    content: text,
    attachments: attached.map(item => ({ id: item.id, name: item.file.name, preview: item.preview })),
  })
  for (const item of attached) {
    if (!reportImages.value.some(existing => existing.id === item.id)) {
      reportImages.value.push({ id: item.id, file: item.file })
    }
  }
  pendingImages.value = []
  draft.value = ''
  loading.value = true
  await scrollToLatest()
  try {
    const body = new FormData()
    body.append('alert_id', props.alertId)
    body.append('period', props.period)
    body.append('message', text)
    body.append('history_json', JSON.stringify(history))
    attached.forEach(item => body.append('images', item.file, item.file.name))
    const response: any = await request('/public/agent/chat', { method: 'POST', body })
    messages.value.push({ role: 'assistant', content: response.markdown || 'El agente no devolvió texto.' })
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No se pudo consultar al agente.'
  } finally {
    loading.value = false
    await scrollToLatest()
  }
}

async function downloadReport() {
  if (!props.alertId || !messages.value.length || reportLoading.value) return
  error.value = ''
  reportNotice.value = ''
  reportLoading.value = true
  try {
    const body = new FormData()
    body.append('alert_id', props.alertId)
    body.append('period', props.period)
    body.append('conversation_json', JSON.stringify(messages.value.map(item => ({
      role: item.role,
      content: item.content,
      image_names: (item.attachments || []).map(attachment => attachment.name),
    }))))
    reportImages.value.slice(0, 8).forEach(item => body.append('images', item.file, item.file.name))
    const pdf = await request<Blob>('/public/agent/chat/report', {
      method: 'POST',
      body,
      responseType: 'blob',
    } as any)
    const url = URL.createObjectURL(pdf)
    const link = document.createElement('a')
    const cropSlug = props.cropName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    link.href = url
    link.download = `reporte-consulta-${cropSlug || 'cultivo'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    reportNotice.value = reportImages.value.length > 8
      ? 'Reporte generado con la conversación y las primeras 8 imágenes adjuntas.'
      : 'Reporte PDF generado con la conversación y sus imágenes de apoyo.'
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No se pudo generar el reporte PDF.'
  } finally {
    reportLoading.value = false
  }
}

function clearConversation() {
  const urls = new Set<string>()
  pendingImages.value.forEach(item => urls.add(item.preview))
  messages.value.forEach(message => message.attachments?.forEach(item => urls.add(item.preview)))
  urls.forEach(url => URL.revokeObjectURL(url))
  messages.value = []
  pendingImages.value = []
  reportImages.value = []
  draft.value = ''
  error.value = ''
  reportNotice.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

watch(() => [props.alertId, props.period], clearConversation)
onBeforeUnmount(clearConversation)
</script>

<template>
  <article class="chat-card card">
    <header class="chat-head">
      <div class="chat-avatar"><Bot /></div>
      <div class="chat-title">
        <div class="eyebrow"><Sparkles /> Consulta contextual</div>
        <h2>Conversar con el agente de {{ cropName }}</h2>
      </div>
      <div v-if="messages.length" class="chat-tools">
        <button class="btn btn-light" type="button" :disabled="loading || reportLoading" @click="clearConversation"><RotateCcw /> Nueva conversación</button>
        <button class="btn btn-primary" type="button" :disabled="loading || reportLoading" @click="downloadReport"><FileDown /> {{ reportLoading ? 'Preparando PDF…' : 'Generar reporte PDF' }}</button>
      </div>
    </header>

    <div v-if="!alertId" class="notice">Ejecute primero “Analizar con IA” para crear el contexto de la consulta.</div>
    <template v-else>
      <div v-if="!messages.length" class="suggestions">
        <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="send(suggestion)">{{ suggestion }}</button>
      </div>
      <div v-else ref="messageList" class="messages" aria-live="polite">
        <article v-for="(message,index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-label">{{ message.role === 'assistant' ? 'Agente IA' : 'Usted' }}</div>
          <div v-if="message.attachments?.length" class="message-images">
            <figure v-for="attachment in message.attachments" :key="attachment.id">
              <img :src="attachment.preview" :alt="`Imagen adjunta: ${attachment.name}`">
              <figcaption>{{ attachment.name }}</figcaption>
            </figure>
          </div>
          <MarkdownContent v-if="message.role === 'assistant'" :content="message.content" />
          <p v-else>{{ message.content }}</p>
        </article>
        <div v-if="loading" class="message assistant thinking"><span/><span/><span/></div>
      </div>

      <div v-if="pendingImages.length" class="image-previews">
        <article v-for="item in pendingImages" :key="item.id">
          <img :src="item.preview" :alt="`Vista previa de ${item.file.name}`">
          <span>{{ item.file.name }}</span>
          <button type="button" title="Quitar imagen" @click="removePending(item.id)"><X /></button>
        </article>
        <small>Se analizarán en conjunto con la consulta completa. {{ pendingImages.length }} de 4 imágenes.</small>
      </div>
      <div v-if="error" class="notice notice-warning chat-error">{{ error }}</div>
      <div v-if="reportNotice" class="notice report-notice">{{ reportNotice }}</div>
      <form class="composer" @submit.prevent="send()">
        <textarea v-model="draft" class="textarea" maxlength="2500" rows="3" placeholder="Pregunte por síntomas, condiciones de la finca, riesgos o imágenes…" :disabled="disabled || loading" @keydown.ctrl.enter.prevent="send()" />
        <div class="composer-actions">
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="onImages">
          <button class="btn btn-light" type="button" :disabled="disabled || loading || pendingImages.length >= 4" @click="chooseImages"><ImagePlus /> Adjuntar imágenes</button>
          <span>Ctrl + Enter para enviar · JPG, PNG o WebP · 8 MB cada una</span>
          <button class="btn btn-primary" type="submit" :disabled="disabled || loading || (!draft.trim() && !pendingImages.length)"><Send /> Consultar</button>
        </div>
      </form>
    </template>
  </article>
</template>

<style scoped>
.chat-card{overflow:hidden}.chat-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:15px;align-items:start;padding:24px;border-bottom:1px solid var(--fc-border);background:linear-gradient(135deg,#f3faff,#fff)}.chat-avatar{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;color:#fff;background:linear-gradient(135deg,var(--fc-primary),var(--fc-secondary))}.chat-avatar svg{width:26px}.eyebrow{display:flex;align-items:center;gap:6px;color:var(--fc-secondary);font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.eyebrow svg{width:14px}.chat-title h2{margin:4px 0;color:var(--fc-primary);font-size:1.35rem}.chat-title p{max-width:790px;margin:0;color:var(--fc-text-muted)}.chat-tools{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.chat-tools svg{width:16px}.chat-card>.notice{margin:20px}.suggestions{display:flex;flex-wrap:wrap;gap:9px;padding:20px}.suggestions button{padding:9px 12px;border:1px solid var(--fc-border);border-radius:999px;color:var(--fc-primary);background:#fff}.suggestions button:hover{border-color:var(--fc-secondary);background:#eef7fc}.messages{display:flex;flex-direction:column;gap:12px;max-height:650px;overflow-y:auto;padding:20px;background:#f7fafc;scroll-behavior:smooth}.message{max-width:min(88%,860px);padding:13px 15px;border-radius:14px}.message.user{align-self:flex-end;color:#fff;background:var(--fc-primary);border-bottom-right-radius:4px}.message.assistant{align-self:flex-start;background:#fff;border:1px solid var(--fc-border);border-bottom-left-radius:4px}.message-label{margin-bottom:5px;font-size:.72rem;font-weight:900;opacity:.72;text-transform:uppercase}.message p{margin:0;white-space:pre-wrap}.message-images{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}.message-images figure{max-width:170px;margin:0}.message-images img{display:block;width:150px;height:105px;object-fit:cover;border-radius:8px}.message-images figcaption{max-width:150px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.68rem;opacity:.8}.thinking{display:flex;gap:5px;padding:16px 18px}.thinking span{width:7px;height:7px;border-radius:50%;background:var(--fc-secondary);animation:pulse 1.1s infinite}.thinking span:nth-child(2){animation-delay:.15s}.thinking span:nth-child(3){animation-delay:.3s}.image-previews{display:flex;align-items:stretch;gap:9px;flex-wrap:wrap;margin:16px 20px 0;padding:11px;background:#eef7fc;border-radius:12px}.image-previews article{position:relative;width:110px;padding:5px;background:#fff;border:1px solid var(--fc-border);border-radius:9px}.image-previews img{display:block;width:98px;height:72px;object-fit:cover;border-radius:6px}.image-previews article span{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.66rem}.image-previews article button{position:absolute;right:1px;top:1px;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:50%;color:#fff;background:rgba(20,42,58,.82)}.image-previews article svg{width:14px}.image-previews>small{align-self:center;flex:1;min-width:220px;color:var(--fc-text-muted)}.chat-error,.report-notice{margin:14px 20px 0!important}.report-notice{background:#edf8f0;color:#21643a}.composer{padding:20px;border-top:1px solid var(--fc-border)}.composer .textarea{min-height:82px}.composer-actions{display:flex;align-items:center;gap:10px;margin-top:10px}.composer-actions span{flex:1;color:var(--fc-text-muted);font-size:.78rem}.composer-actions svg{width:17px}@keyframes pulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}@media(max-width:980px){.chat-head{grid-template-columns:auto 1fr}.chat-tools{grid-column:1/-1;justify-content:stretch}.chat-tools .btn{flex:1}}@media(max-width:620px){.chat-head{padding:18px}.messages{padding:14px}.message{max-width:96%}.composer{padding:14px}.composer-actions{flex-wrap:wrap}.composer-actions span{display:none}.composer-actions .btn{flex:1}.image-previews{margin:14px 14px 0}.message-images img{width:120px;height:90px}.message-images figcaption{max-width:120px}}
</style>
