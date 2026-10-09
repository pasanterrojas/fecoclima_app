<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
import { useId } from 'vue'
import type { Recommendation } from '~/types/api'

const props = defineProps<{
  alertId?: string | null
  period: string
  widget: string
  itemKey?: string
  disabled?: boolean
}>()
const { request } = useApi()
const explanation = ref<Recommendation | null>(null)
const loading = ref(false)
const error = ref('')
const dialog = ref<HTMLDialogElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const titleId = useId()

watch(() => [props.alertId, props.period, props.widget, props.itemKey], () => {
  explanation.value = null
  error.value = ''
  dialog.value?.close()
})

function openExplanation() {
  if (!props.alertId || props.disabled) return
  dialog.value?.showModal()
  if (!explanation.value && !loading.value) void explain()
}

function closeExplanation(event?: MouseEvent) {
  if (event && event.target !== dialog.value) return
  dialog.value?.close()
  trigger.value?.focus()
}

async function explain() {
  if (!props.alertId || props.disabled || loading.value) return
  const alertId = props.alertId
  const period = props.period
  const itemKey = props.itemKey
  const widget = props.widget
  loading.value = true
  error.value = ''
  try {
    const result = await request<Recommendation>('/public/agent/explain-widget', {
      method: 'POST',
      body: { alert_id: alertId, period, widget, item_key: itemKey || null }
    })
    if (props.alertId === alertId && props.period === period && props.widget === widget && props.itemKey === itemKey && !props.disabled) explanation.value = result
  } catch (exception: any) {
    error.value = exception?.data?.detail || 'No pudimos explicar este dato. Intente de nuevo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="widget-explanation">
    <button ref="trigger" type="button" class="explain-button" :disabled="!alertId || disabled" aria-label="Ver explicación con IA" title="Ver explicación con IA" @click="openExplanation">
      <Sparkles aria-hidden="true" />
    </button>
    <ClientOnly>
      <Teleport to="body">
        <dialog ref="dialog" class="explanation-dialog" :aria-labelledby="titleId" @click="closeExplanation($event)">
          <div class="dialog-head">
            <span class="dialog-icon"><Sparkles aria-hidden="true" /></span>
            <h2 :id="titleId">¿Qué significa este dato?</h2>
            <button type="button" class="dialog-close" aria-label="Cerrar explicación" @click="closeExplanation()"><X aria-hidden="true" /></button>
          </div>
          <div class="dialog-body" aria-live="polite">
            <p v-if="loading" class="loading-message" role="status">Estamos revisando la información de su consulta…</p>
            <template v-else-if="explanation">
              <AiStatusNotice :status="explanation._agent_status" :reason="explanation._fallback_reason" />
              <MarkdownContent :content="explanation.markdown || ''" />
            </template>
            <div v-if="error" class="notice notice-warning" role="alert">{{ error }}</div>
          </div>
          <div class="dialog-actions">
            <button v-if="error || explanation" type="button" class="btn btn-light" :disabled="loading" @click="explain">{{ loading ? 'Consultando…' : 'Consultar de nuevo' }}</button>
            <button type="button" class="btn btn-primary" @click="closeExplanation()">Cerrar</button>
          </div>
        </dialog>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.widget-explanation{display:inline-flex;vertical-align:middle}.explain-button{display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--fc-border);border-radius:12px;background:#eaf5fb;color:var(--fc-primary);cursor:pointer}.explain-button:hover:not(:disabled){background:#d5edf9}.explain-button:focus-visible{outline:3px solid var(--fc-secondary);outline-offset:2px}.explain-button:disabled{opacity:.6;cursor:not-allowed}.explain-button svg{width:21px;height:21px}
.explanation-dialog{width:min(560px,calc(100% - 28px));max-height:min(85dvh,780px);padding:0;border:0;border-radius:20px;background:#fff;color:var(--fc-text);box-shadow:0 25px 70px #001b3666;overflow:auto}.explanation-dialog::backdrop{background:#09273fc2;backdrop-filter:blur(4px)}.dialog-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:19px 22px;border-bottom:1px solid var(--fc-border);background:#f0f8fc}.dialog-head h2{flex:1;margin:0;color:var(--fc-primary);font-size:1.26rem;line-height:1.25}.dialog-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--fc-primary);color:#fff}.dialog-icon svg{width:23px}.dialog-close{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:12px;background:#fff;color:var(--fc-primary)}.dialog-close svg{width:23px}.dialog-body{padding:18px 22px;line-height:1.6}.dialog-body :deep(h1),.dialog-body :deep(h2),.dialog-body :deep(h3){font-size:1.06rem}.loading-message{margin:0;color:var(--fc-primary)}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 22px 22px}
@media(max-width:620px){.explanation-dialog{width:100%;max-width:100%;max-height:85dvh;margin:auto 0 0;border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom)}.dialog-head,.dialog-body{padding:16px}.dialog-actions{padding:0 16px 20px}.dialog-actions .btn{flex:1}}
</style>
