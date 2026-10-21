<script setup lang="ts">
const props = defineProps<{ open:boolean; title:string; message:string }>()
const emit = defineEmits<{ confirm:[]; cancel:[] }>()
const dialog = ref<HTMLElement | null>(null)
const titleId = useId()
const teleportTarget = ref<string | Element>('body')
let previousFocus: HTMLElement | null = null
watch(() => props.open, async open => {
  if (!import.meta.client) return
  if (open) { previousFocus = document.activeElement as HTMLElement; teleportTarget.value = document.fullscreenElement || 'body'; await nextTick(); dialog.value?.querySelector('button')?.focus() }
  else previousFocus?.focus()
})
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('cancel') }
  if (event.key !== 'Tab') return
  const buttons = dialog.value?.querySelectorAll('button')
  const first = buttons?.[0], last = buttons?.[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
</script>
<template><Teleport :to="teleportTarget"><div v-if="open" class="overlay" @click.self="emit('cancel')"><div ref="dialog" class="modal card" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown="keyboard"><h3 :id="titleId">{{ title }}</h3><p>{{ message }}</p><div class="row actions"><button class="btn btn-light" @click="emit('cancel')">Cancelar</button><button class="btn btn-danger" @click="emit('confirm')">Confirmar</button></div></div></div></Teleport></template>
<style scoped>.overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(0,35,65,.58)}.modal{width:min(100%,460px);padding:24px}.modal h3{margin-top:0;color:var(--fc-primary)}.actions{justify-content:flex-end;margin-top:22px}</style>
