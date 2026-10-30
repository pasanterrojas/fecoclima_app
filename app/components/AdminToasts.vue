<script setup lang="ts">
import { CheckCircle2, CircleAlert, X } from 'lucide-vue-next'
const { toasts, dismiss } = useAdminToast()
</script>
<template>
  <Teleport to="body"><div class="admin-toasts" aria-label="Notificaciones del panel">
    <TransitionGroup name="toast"><div v-for="toast in toasts" :key="toast.id" class="admin-toast" :class="toast.tone" :role="toast.tone==='error'?'alert':'status'" :aria-live="toast.tone==='error'?'assertive':'polite'">
      <component :is="toast.tone==='error'?CircleAlert:CheckCircle2" :size="22" aria-hidden="true"/>
      <div><strong>{{toast.tone==='error'?'No se pudo completar la acción':'Operación completada'}}</strong><p>{{toast.message}}</p></div>
      <button type="button" aria-label="Cerrar notificación" @click="dismiss(toast.id)"><X :size="18"/></button>
    </div></TransitionGroup>
  </div></Teleport>
</template>
<style scoped>
.admin-toasts{position:fixed;right:24px;top:24px;z-index:10000;display:grid;gap:12px;width:min(440px,calc(100vw - 32px));pointer-events:none}.admin-toast{display:flex;align-items:flex-start;gap:12px;padding:18px;background:#fff;border:1px solid #bbdfcf;border-left:5px solid #16825d;border-radius:14px;box-shadow:0 12px 36px #102e4933;color:#185b44;pointer-events:auto;overflow-wrap:anywhere}.admin-toast.error{border-color:#efc3c3;border-left-color:#c33c3c;color:#942f2f}.admin-toast svg{flex-shrink:0}.admin-toast div{flex:1;min-width:0}.admin-toast strong{font-size:.95rem}.admin-toast p{margin:5px 0 0;font-size:.9rem;line-height:1.5}.admin-toast button{display:grid;place-items:center;background:transparent;border:0;color:inherit;padding:3px;cursor:pointer}.toast-enter-active,.toast-leave-active{transition:opacity .2s,transform .2s}.toast-enter-from,.toast-leave-to{opacity:0;transform:translateY(-12px)}@media(max-width:600px){.admin-toasts{top:12px;right:16px}}@media(prefers-reduced-motion:reduce){.toast-enter-active,.toast-leave-active{transition:none}}
</style>
