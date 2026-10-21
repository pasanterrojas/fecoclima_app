<script setup lang="ts">
import { BellRing, BookUser, Bot, CloudSun, Gauge, History, LayoutDashboard, MapPinned, ShieldCheck, Sprout, X } from 'lucide-vue-next'
defineProps<{ open: boolean; mobileMode?: boolean }>()
defineEmits<{ close: [] }>()
const route = useRoute()
const groups = [
  { label: '', items: [{ to: '/fecoclima-ia/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Funciones', items: [
    { to: '/fecoclima-ia/admin/estaciones', label: 'Estaciones', icon: CloudSun },
    { to: '/fecoclima-ia/admin/cultivos', label: 'Cultivos', icon: Sprout },
    { to: '/fecoclima-ia/admin/agentes', label: 'Agentes', icon: Bot },
    { to: '/fecoclima-ia/admin/integraciones', label: 'Integraciones', icon: Gauge },
    { to: '/fecoclima-ia/admin/notificaciones', label: 'Aviso a productores', icon: BellRing },
    { to: '/fecoclima-ia/admin/eventos', label: 'Eventos programados', icon: BellRing },
    { to: '/fecoclima-ia/admin/libretadedirecciones', label: 'Libreta de direcciones', icon: BookUser },
  ] },
  { label: 'Monitoreo', items: [
    { to: '/fecoclima-ia/admin/parcelas', label: 'Parcelas', icon: MapPinned },
    { to: '/fecoclima-ia/admin/auditoria', label: 'Auditoría', icon: History },
  ] },
]
function active(path: string) {
  const current = route.path.replace(/^\/admin(?=\/|$)/, '/fecoclima-ia/admin').replace('/estacionesmeteorologicas', '/estaciones')
  return current === path || (path !== '/fecoclima-ia/admin' && current.startsWith(`${path}/`))
}
</script>
<template>
  <aside id="admin-navigation" class="sidebar" :class="{ open, 'mobile-sidebar': mobileMode }" :inert="mobileMode && !open" @keydown.esc="$emit('close')">
    <div class="side-brand"><NuxtLink to="/fecoclima-ia/admin"><ShieldCheck /><span>FECOCLIMA IA<small>Administración</small></span></NuxtLink><button aria-label="Cerrar menú" @click="$emit('close')"><X /></button></div>
    <nav aria-label="Administración"><section v-for="group in groups" :key="group.label"><p v-if="group.label" class="nav-group-label">{{ group.label }}</p><NuxtLink v-for="item in group.items" :key="item.to" :to="item.to" :class="{ selected: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined" @click="$emit('close')"><component :is="item.icon" /><span>{{ item.label }}</span><i v-if="active(item.to)" class="active-dot" aria-hidden="true" /></NuxtLink></section></nav>
    <div class="sidebar-footer"><span class="footer-icon"><Sprout /></span><div><b>Todo comienza en la parcela</b><small>Inteligencia agronómica</small></div></div>
  </aside>
</template>
<style scoped>
.sidebar{position:fixed;inset:0 auto 0 0;width:250px;z-index:50;display:flex;flex-direction:column;overflow:auto;background:#fff;color:#244d6a;border-right:1px solid #dbe7ef}.side-brand{min-height:86px;padding:20px 23px;border-bottom:1px solid #edf3f7;display:flex;align-items:center;justify-content:space-between}.side-brand a{display:flex;align-items:center;gap:11px;font-weight:850;letter-spacing:-.01em;font-size:.94rem;color:#004481}.side-brand svg{width:31px;height:31px;padding:5px;border-radius:10px;background:#e4f1fb;color:#116daa}.side-brand small{display:block;font-size:.63rem;font-weight:600;color:#7191a7;margin-top:3px;letter-spacing:.05em}.side-brand button{display:none;background:#edf5fb;border:0;border-radius:10px;padding:6px;color:#145a8b}.side-brand button svg{background:none;padding:0;width:20px;height:20px}nav{padding:17px 13px;flex:1}.nav-group-label{text-transform:uppercase;font-size:.6rem;letter-spacing:.13em;font-weight:800;color:#7f98aa;margin:25px 15px 11px}nav a{display:flex;align-items:center;gap:11px;padding:12px 14px;margin:4px 0;border-radius:14px;font-size:.8rem;font-weight:600;color:#5f7a90;transition:background .15s,color .15s}nav a:hover{background:#f1f7fb;color:#07578f}nav a.selected{background:#e2f0fb;color:#004481;font-weight:800}nav svg{width:19px;height:19px;flex:0 0 19px;stroke-width:1.8}.active-dot{width:6px;height:6px;flex:0 0 6px;margin-left:auto;border-radius:50%;background:#2a8bc1}.sidebar-footer{display:flex;align-items:center;gap:9px;padding:18px 17px;margin:12px 13px;border:1px solid #dcebf4;border-radius:14px;background:#f3f9fd;color:#3a6788;font-size:.65rem}.sidebar-footer b{font-weight:700}.sidebar-footer small{display:block;font-size:.61rem;color:#7b95a8;margin-top:3px}.footer-icon{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;background:#e0eef9;flex:0 0 29px}.footer-icon svg{width:16px;height:16px}.mobile-sidebar{width:min(290px,calc(100vw - 34px));transform:translateX(-100%);transition:transform .2s}.mobile-sidebar.open{transform:translateX(0);box-shadow:20px 0 40px #001a3a30}.mobile-sidebar .side-brand button{display:block}@media(max-width:900px){.sidebar{width:min(290px,calc(100vw - 34px));transform:translateX(-100%);transition:transform .2s}.sidebar.open{transform:translateX(0);box-shadow:20px 0 40px #001a3a30}.side-brand button{display:block}}
</style>
