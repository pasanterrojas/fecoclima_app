<script setup lang="ts">
import { CloudSun, Sprout, MapPinned, RadioTower, FileText, ShieldCheck } from 'lucide-vue-next'
defineProps<{ open?: boolean }>()
defineEmits<{ navigate: [] }>()
const links = [
  { to: '/fecoclima-ia', label: 'Clima', icon: CloudSun },
  { to: '/fecoclima-ia/mapas', label: 'Mapas', icon: MapPinned },
  { to: '/fecoclima-ia/fenologia', label: 'Fenología', icon: Sprout },
  { to: '/fecoclima-ia/reportes', label: 'Reportes', icon: FileText }
]
</script>
<template>
  <nav class="public-nav" :class="{ open }"><div class="container nav-list"><NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="nav-item" @click="$emit('navigate')"><component :is="item.icon"/><span>{{ item.label }}</span></NuxtLink></div></nav>
</template>
<style scoped>
.public-nav{background:var(--fc-primary);color:#fff}.nav-list{min-height:132px;display:flex;align-items:center;justify-content:center;gap:clamp(18px,4vw,60px)}.nav-item{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:82px;font-size:.9rem;text-transform:uppercase}.nav-item svg{width:40px;height:40px;stroke-width:2.4}.nav-item:hover,.router-link-active{color:#bde8ff}@media(max-width:820px){.public-nav{display:none}.public-nav.open{display:block}.nav-list{min-height:auto;padding:18px 0;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.nav-item{padding:12px;flex-direction:row;justify-content:flex-start;background:rgba(255,255,255,.07);border-radius:10px;text-transform:none}.nav-item svg{width:24px;height:24px}}
</style>
