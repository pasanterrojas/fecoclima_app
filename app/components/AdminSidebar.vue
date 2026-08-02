<script setup lang="ts">
import { BellRing, Bot, ClipboardList, CloudDownload, CloudSun, FileText, Gauge, History, LayoutDashboard, MapPinned, Settings, ShieldCheck, Sprout, Users, X } from 'lucide-vue-next'
defineProps<{ open:boolean }>()
defineEmits<{ close:[] }>()
const links=[
 {to:'/fecoclima-ia/admin',label:'Dashboard',icon:LayoutDashboard},
 {to:'/fecoclima-ia/admin/usuarios',label:'Usuarios',icon:Users},
 {to:'/fecoclima-ia/admin/estaciones',label:'Estaciones',icon:CloudSun},
 {to:'/fecoclima-ia/admin/importaciones',label:'Datos y sincronización',icon:CloudDownload},
 {to:'/fecoclima-ia/admin/parcelas',label:'Parcelas',icon:MapPinned},
 {to:'/fecoclima-ia/admin/cultivos',label:'Cultivos',icon:Sprout},
 {to:'/fecoclima-ia/admin/reglas',label:'Reglas',icon:ClipboardList},
 {to:'/fecoclima-ia/admin/agentes',label:'Agentes IA',icon:Bot},
 {to:'/fecoclima-ia/admin/notificaciones',label:'Avisos a productores',icon:BellRing},
 {to:'/fecoclima-ia/admin/integraciones',label:'Integraciones',icon:Gauge},
 {to:'/fecoclima-ia/admin/reportes',label:'Reportes',icon:FileText},
 {to:'/fecoclima-ia/admin/auditoria',label:'Auditoría',icon:History},
 {to:'/fecoclima-ia/admin/configuracion',label:'Configuración',icon:Settings}
]
</script>
<template><aside class="sidebar" :class="{open}"><div class="side-brand"><NuxtLink to="/fecoclima-ia"><ShieldCheck/> FECOCLIMA IA</NuxtLink><button @click="$emit('close')"><X/></button></div><nav><NuxtLink v-for="item in links" :key="item.to" :to="item.to" @click="$emit('close')"><component :is="item.icon"/><span>{{item.label}}</span></NuxtLink></nav></aside></template>
<style scoped>.sidebar{position:fixed;inset:0 auto 0 0;width:270px;z-index:50;background:var(--fc-primary-strong);color:#fff;overflow:auto}.side-brand{height:70px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.12)}.side-brand a{display:flex;align-items:center;gap:9px;font-weight:900}.side-brand button{display:none;background:transparent;border:0;color:#fff}.side-brand svg{width:23px}nav{padding:15px}nav a{display:flex;align-items:center;gap:11px;padding:11px 13px;margin-bottom:4px;border-radius:9px;color:#eaf6fc;font-size:.92rem}nav a:hover,nav a.router-link-exact-active{background:rgba(255,255,255,.13);color:#fff}nav svg{width:19px;height:19px}@media(max-width:900px){.sidebar{transform:translateX(-100%);transition:.2s ease}.sidebar.open{transform:translateX(0);box-shadow:20px 0 40px rgba(0,0,0,.25)}.side-brand button{display:inline-flex}}
</style>
