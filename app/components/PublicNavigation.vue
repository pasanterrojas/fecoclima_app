<script setup lang="ts">
import { Sprout, BellRing } from 'lucide-vue-next'
const props = defineProps<{ open?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()
const links = [
  { to: '/fecoclima-ia', label: 'Mi parcela', icon: Sprout },
  { to: '/fecoclima-ia/suscripciones', label: 'Suscribirse', icon: BellRing },
]
const isActive = (url: string) => url === '/fecoclima-ia' ? route.path === url : route.path.startsWith(url)
watch(() => route.fullPath, () => emit('navigate'))
</script>
<template>
  <nav id="public-navigation" class="public-nav" :class="{ open: props.open }" aria-label="Secciones de FECOCLIMA IA">
    <div class="nav-list">
      <NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="nav-item" :class="{ selected: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined" @click="emit('navigate')">
        <component :is="item.icon" aria-hidden="true"/><span>{{ item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
  <nav class="mobile-dock" aria-label="Navegación móvil">
    <NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="dock-item" :class="{ selected: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined" @click="emit('navigate')">
      <component :is="item.icon" aria-hidden="true"/><span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>
<style scoped>
.public-nav{min-width:0}.nav-list{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.nav-item{display:inline-flex;align-items:center;gap:8px;padding:11px 14px;min-height:44px;color:#d7eaf9;font-size:.86rem;font-weight:650;border-radius:13px;transition:background .15s ease,color .15s ease}.nav-item svg{width:18px;height:18px;flex:0 0 18px}.nav-item:hover{background:#ffffff15;color:#fff}.nav-item.selected{background:#ffffff25;color:#fff;box-shadow:inset 0 0 0 1px #ffffff1c}.mobile-dock{display:none}
@media(max-width:1020px){.public-nav{display:none;position:absolute;top:100%;left:0;right:0;background:var(--fc-primary-strong);box-shadow:0 15px 24px #123b5740;z-index:9}.public-nav.open{display:block}.nav-list{width:min(calc(100% - 24px),var(--fc-max));margin:auto;padding:12px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.nav-item{justify-content:center;text-align:center}}
@media(max-width:720px){.nav-list{grid-template-columns:repeat(2,minmax(0,1fr))}.mobile-dock{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));position:fixed;bottom:0;left:0;right:0;z-index:95;min-height:70px;padding:6px 4px max(7px,env(safe-area-inset-bottom));border-top:1px solid #d7e5ef;background:#fffefaee;backdrop-filter:blur(18px);box-shadow:0 -7px 25px #13426418}.dock-item{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;min-width:0;min-height:51px;padding:6px 1px;border:0;border-radius:12px;background:transparent;color:var(--fc-text-muted);font-size:.62rem;font-weight:750;text-align:center}.dock-item svg{width:21px;height:21px}.dock-item.selected{color:var(--fc-primary);background:#e8f2fa}}
</style>
