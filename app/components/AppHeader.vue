<script setup lang="ts">
import { Menu, X, Sprout, Smartphone } from 'lucide-vue-next'
const open = ref(false)
const mobileSimple = ref(false)
const route = useRoute()
function updateSimple(value: boolean) {
  mobileSimple.value = value
  if (import.meta.client) {
    document.documentElement.classList.toggle('fc-mobile-simple', value)
    try { localStorage.setItem('fecoclima-mobile-simple', value ? '1' : '0') } catch { /* El navegador podría bloquear el almacenamiento */ }
  }
}
onMounted(() => {
  try { updateSimple(localStorage.getItem('fecoclima-mobile-simple') === '1') }
  catch { updateSimple(false) }
})
watch(() => route.fullPath, () => { open.value = false })
</script>
<template>
  <header class="app-header">
    <div class="container header-inner">
      <NuxtLink to="/fecoclima-ia" class="brand" aria-label="FECOCLIMA IA · inicio">
        <span class="brand-avatar"><Sprout aria-hidden="true"/></span>
        <span class="brand-copy"><strong>FECOCLIMA <span>IA</span></strong><small><i/> Inteligencia para tu parcela</small></span>
      </NuxtLink>
      <PublicNavigation :open="open" @navigate="open = false" />
      <div class="header-actions">
        <label class="mobile-simple-toggle" :title="mobileSimple ? 'Desactivar vista móvil' : 'Activar vista móvil'">
          <Smartphone aria-hidden="true"/><span>Vista móvil · {{ mobileSimple ? 'Activada' : 'Desactivada' }}</span>
          <input type="checkbox" role="switch" aria-label="Vista móvil" :aria-checked="mobileSimple" :checked="mobileSimple" @change="updateSimple(($event.target as HTMLInputElement).checked)" />
          <span class="toggle-track" aria-hidden="true"/>
        </label>
        <button class="mobile-toggle" type="button" :aria-label="open ? 'Cerrar menú' : 'Abrir menú'" :aria-expanded="open" aria-controls="public-navigation" @click="open = !open"><X v-if="open"/><Menu v-else/></button>
      </div>
    </div>
  </header>
</template>
<style scoped>
.app-header{position:sticky;top:0;z-index:90;box-shadow:0 5px 22px #00294a18;background:linear-gradient(115deg,var(--fc-primary-strong),var(--fc-primary) 70%,#155f99)}.header-inner{min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:inline-flex;align-items:center;gap:11px;color:#fff;flex-shrink:0}.brand-avatar{width:43px;height:43px;display:grid;place-items:center;border-radius:14px;background:#ffffff24;border:1px solid #ffffff35}.brand-avatar svg{width:24px;height:24px}.brand-copy{display:flex;flex-direction:column;gap:2px;line-height:1.15}.brand-copy strong{font-size:1.05rem;letter-spacing:-.02em}.brand-copy strong span{color:#a8ddff}.brand-copy small{display:flex;align-items:center;gap:7px;color:#d5eefa;font-size:.7rem;font-weight:550}.brand-copy i{width:7px;height:7px;border-radius:50%;background:#80d6a6;box-shadow:0 0 0 3px #ffffff14}.header-actions{display:flex;align-items:center;gap:9px}.mobile-simple-toggle{display:flex;align-items:center;gap:7px;color:#eaf7ff;font-size:.76rem;font-weight:650;cursor:pointer;white-space:nowrap}.mobile-simple-toggle svg{width:17px;height:17px}.mobile-simple-toggle input{position:absolute;width:1px;height:1px;opacity:0}.toggle-track{width:36px;height:21px;display:inline-block;border-radius:30px;background:#ffffff50;position:relative;transition:background .2s}.toggle-track:before{content:'';position:absolute;top:3px;left:3px;width:15px;height:15px;border-radius:50%;background:white;transition:transform .2s}.mobile-simple-toggle input:checked+.toggle-track{background:#63b8e8}.mobile-simple-toggle input:checked+.toggle-track:before{transform:translateX(15px)}.mobile-simple-toggle input:focus-visible+.toggle-track{outline:3px solid #fff}.mobile-toggle{display:none;place-items:center;width:40px;height:40px;border:1px solid #ffffff33;border-radius:11px;color:#fff;background:#ffffff18}.mobile-toggle svg{width:21px;height:21px}
@media(max-width:1200px){.header-inner{gap:10px}.brand-copy small{font-size:.65rem}}
@media(max-width:1020px){.mobile-toggle{display:grid}}
@media(max-width:720px){.header-inner{min-height:64px;gap:9px}.brand-avatar{width:38px;height:38px;border-radius:12px}.brand-copy strong{font-size:.91rem}.brand-copy small{font-size:.58rem}.mobile-simple-toggle{display:flex}.mobile-simple-toggle>span:not(.toggle-track){display:none}.mobile-toggle{width:35px;height:35px}}
</style>
