<script setup lang="ts">
import { Bot, ImagePlus, Send, Sparkles, X } from 'lucide-vue-next'

interface ChatMessage { role: 'user' | 'assistant'; content: string; imageName?: string }

const props = defineProps<{
  alertId?: string | null
  period: string
  cropName: string
  disabled?: boolean
}>()
const { request } = useApi()
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const imageFile = ref<File | null>(null)
const imagePreview = ref('')
const loading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const suggestions = computed(() => [
  `¿Qué debería revisar hoy en el ${props.cropName.toLowerCase()}?`,
  'Explícame la alerta en palabras sencillas.',
  '¿Qué enfermedades debo vigilar según el pronóstico?'
])

function chooseImage() { fileInput.value?.click() }
function removeImage() {
  imageFile.value = null
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
function onImage(event: Event) {
  error.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = 'Solo se admiten imágenes JPG, PNG o WebP.'
    input.value = ''
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    error.value = 'La imagen supera el límite de 8 MB.'
    input.value = ''
    return
  }
  removeImage()
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

async function send(question = draft.value) {
  const text = question.trim() || (imageFile.value ? 'Analiza esta imagen del cultivo junto con todo el contexto de la consulta. Señala observaciones visibles, limitaciones y qué debería verificarse en campo.' : '')
  if (!text || !props.alertId || loading.value || props.disabled) return
  error.value = ''
  const history = messages.value.slice(-8).map(item => ({ role: item.role, content: item.content }))
  messages.value.push({ role: 'user', content: text, imageName: imageFile.value?.name })
  draft.value = ''
  loading.value = true
  try {
    const body = new FormData()
    body.append('alert_id', props.alertId)
    body.append('period', props.period)
    body.append('message', text)
    body.append('history_json', JSON.stringify(history))
    if (imageFile.value) body.append('image', imageFile.value)
    const response: any = await request('/public/agent/chat', { method: 'POST', body })
    messages.value.push({ role: 'assistant', content: response.markdown || 'El agente no devolvió texto.' })
    removeImage()
  } catch (exception: any) {
    error.value = exception?.data?.detail || exception?.message || 'No se pudo consultar al agente.'
  } finally {
    loading.value = false
  }
}

watch(() => props.alertId, () => {
  messages.value = []
  removeImage()
})
onBeforeUnmount(removeImage)
</script>

<template>
  <article class="chat-card card">
    <header class="chat-head">
      <div class="chat-avatar"><Bot /></div>
      <div><div class="eyebrow"><Sparkles /> Consulta contextual</div><h2>Conversar con el agente de {{ cropName }}</h2><p>Usa toda la consulta como contexto y puede revisar una fotografía del cultivo.</p></div>
    </header>

    <div v-if="!alertId" class="notice">Ejecute primero “Analizar con IA” para crear el contexto de la consulta.</div>
    <template v-else>
      <div v-if="!messages.length" class="suggestions">
        <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="send(suggestion)">{{ suggestion }}</button>
      </div>
      <div v-else class="messages" aria-live="polite">
        <article v-for="(message,index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-label">{{ message.role === 'assistant' ? 'Agente IA' : 'Usted' }}</div>
          <MarkdownContent v-if="message.role === 'assistant'" :content="message.content" />
          <p v-else>{{ message.content }}</p>
          <small v-if="message.imageName">📷 {{ message.imageName }}</small>
        </article>
        <div v-if="loading" class="message assistant thinking"><span/><span/><span/></div>
      </div>

      <div v-if="imagePreview" class="image-preview"><img :src="imagePreview" alt="Vista previa del cultivo"><div><b>{{ imageFile?.name }}</b><small>La imagen se analizará junto con los datos meteorológicos y fenológicos.</small></div><button type="button" title="Quitar imagen" @click="removeImage"><X /></button></div>
      <div v-if="error" class="notice notice-warning chat-error">{{ error }}</div>
      <form class="composer" @submit.prevent="send()">
        <textarea v-model="draft" class="textarea" maxlength="2500" rows="3" placeholder="Escriba una pregunta sobre el cultivo, la alerta, el pronóstico o la imagen…" :disabled="disabled || loading" @keydown.ctrl.enter.prevent="send()" />
        <div class="composer-actions">
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onImage">
          <button class="btn btn-light" type="button" :disabled="disabled || loading" @click="chooseImage"><ImagePlus /> Adjuntar imagen</button>
          <span>Ctrl + Enter para enviar</span>
          <button class="btn btn-primary" type="submit" :disabled="disabled || loading || (!draft.trim() && !imageFile)"><Send /> Consultar</button>
        </div>
      </form>
    </template>
  </article>
</template>

<style scoped>
.chat-card{overflow:hidden}.chat-head{display:flex;gap:15px;padding:24px;border-bottom:1px solid var(--fc-border);background:linear-gradient(135deg,#f3faff,#fff)}.chat-avatar{flex:0 0 auto;display:grid;place-items:center;width:48px;height:48px;border-radius:15px;color:#fff;background:linear-gradient(135deg,var(--fc-primary),var(--fc-secondary))}.chat-avatar svg{width:26px}.eyebrow{display:flex;align-items:center;gap:6px;color:var(--fc-secondary);font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.eyebrow svg{width:14px}.chat-head h2{margin:4px 0;color:var(--fc-primary);font-size:1.35rem}.chat-head p{margin:0;color:var(--fc-text-muted)}.chat-card>.notice{margin:20px}.suggestions{display:flex;flex-wrap:wrap;gap:9px;padding:20px}.suggestions button{padding:9px 12px;border:1px solid var(--fc-border);border-radius:999px;color:var(--fc-primary);background:#fff}.suggestions button:hover{border-color:var(--fc-secondary);background:#eef7fc}.messages{display:flex;flex-direction:column;gap:12px;max-height:560px;overflow-y:auto;padding:20px;background:#f7fafc}.message{max-width:min(88%,860px);padding:13px 15px;border-radius:14px}.message.user{align-self:flex-end;color:#fff;background:var(--fc-primary);border-bottom-right-radius:4px}.message.assistant{align-self:flex-start;background:#fff;border:1px solid var(--fc-border);border-bottom-left-radius:4px}.message-label{margin-bottom:5px;font-size:.72rem;font-weight:900;opacity:.72;text-transform:uppercase}.message p{margin:0;white-space:pre-wrap}.message small{display:block;margin-top:7px;opacity:.78}.thinking{display:flex;gap:5px;padding:16px 18px}.thinking span{width:7px;height:7px;border-radius:50%;background:var(--fc-secondary);animation:pulse 1.1s infinite}.thinking span:nth-child(2){animation-delay:.15s}.thinking span:nth-child(3){animation-delay:.3s}.image-preview{display:grid;grid-template-columns:72px 1fr auto;align-items:center;gap:12px;margin:16px 20px 0;padding:10px;background:#eef7fc;border-radius:12px}.image-preview img{width:72px;height:58px;object-fit:cover;border-radius:8px}.image-preview small{display:block;color:var(--fc-text-muted);margin-top:3px}.image-preview button{border:0;background:transparent;color:var(--fc-text-muted)}.image-preview svg{width:20px}.chat-error{margin:14px 20px 0}.composer{padding:20px;border-top:1px solid var(--fc-border)}.composer .textarea{min-height:82px}.composer-actions{display:flex;align-items:center;gap:10px;margin-top:10px}.composer-actions span{flex:1;color:var(--fc-text-muted);font-size:.78rem}.composer-actions svg{width:17px}@keyframes pulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}@media(max-width:620px){.chat-head{padding:18px}.messages{padding:14px}.message{max-width:96%}.composer{padding:14px}.composer-actions{flex-wrap:wrap}.composer-actions span{display:none}.composer-actions .btn{flex:1}.image-preview{margin:14px 14px 0}}
</style>
